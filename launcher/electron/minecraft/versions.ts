import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { InstalledVersion, VersionSummary } from '../../../shared/types';
import { UserError } from '../services/errors';
import { Task } from '../services/events';
import { download, fetchJson, pool } from '../services/http';
import { readJson, writeJson } from '../services/jsonStore';
import { downloadConcurrency } from '../services/settings';
import { assetsDir, cacheDir, librariesDir, nativesDir, safeJoin, versionsDir } from '../services/paths';
import { mavenPath, rulesAllow, type Library, type VersionJson } from './versionJson';

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const MOJANG_HOSTS = ['piston-meta.mojang.com', 'piston-data.mojang.com', 'launchermeta.mojang.com', 'launcher.mojang.com', 'libraries.minecraft.net', 'resources.download.minecraft.net'];

interface Manifest {
  latest: { release: string; snapshot: string };
  versions: { id: string; type: VersionSummary['type']; url: string; sha1: string; releaseTime: string }[];
}

let manifestCache: { at: number; data: Manifest } | null = null;

export async function getManifest(): Promise<Manifest> {
  if (manifestCache && Date.now() - manifestCache.at < 10 * 60_000) return manifestCache.data;
  const cacheFile = path.join(cacheDir(), 'version_manifest_v2.json');
  try {
    const data = await fetchJson<Manifest>(MANIFEST_URL);
    manifestCache = { at: Date.now(), data };
    await writeJson(cacheFile, data);
    return data;
  } catch (err) {
    // Offline: fall back to the last manifest we saw.
    const cached = await readJson<Manifest | null>(cacheFile, null);
    if (cached) return cached;
    throw err;
  }
}

export async function listAvailableVersions(includeSnapshots: boolean): Promise<{ latest: Manifest['latest']; versions: VersionSummary[] }> {
  const manifest = await getManifest();
  const installed = new Set((await listInstalledVersions()).map((v) => v.id));
  return {
    latest: manifest.latest,
    versions: manifest.versions
      .filter((v) => includeSnapshots || v.type === 'release')
      .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime, installed: installed.has(v.id) })),
  };
}

const versionJsonPath = (id: string) => path.join(versionsDir(), id, `${id}.json`);
const clientJarPath = (id: string) => path.join(versionsDir(), id, `${id}.jar`);
const markerPath = (id: string) => path.join(versionsDir(), id, '.zenthra-verified');

export async function readVersionJson(id: string): Promise<VersionJson | null> {
  return readJson<VersionJson | null>(versionJsonPath(id), null);
}

export async function listInstalledVersions(): Promise<InstalledVersion[]> {
  const dir = versionsDir();
  if (!fs.existsSync(dir)) return [];
  const out: InstalledVersion[] = [];
  for (const id of await fsp.readdir(dir)) {
    const json = await readVersionJson(id);
    if (!json) continue;
    let size = 0;
    for (const f of [versionJsonPath(id), clientJarPath(id)]) {
      try {
        size += (await fsp.stat(f)).size;
      } catch {
        /* jar missing for inheriting versions */
      }
    }
    out.push({ id, size, inheritsFrom: json.inheritsFrom });
  }
  return out;
}

export async function deleteVersion(id: string): Promise<void> {
  const dir = safeJoin(versionsDir(), id);
  const dependents = (await listInstalledVersions()).filter((v) => v.inheritsFrom === id);
  if (dependents.length) {
    throw new UserError(`Cette version est utilisée par ${dependents.map((d) => d.id).join(', ')}. Supprime-les d'abord.`);
  }
  await fsp.rm(dir, { recursive: true, force: true });
}

/** Libraries applicable to Windows, with resolved download info. */
export function resolveLibraries(libs: Library[]): { path: string; url?: string; sha1?: string; native?: boolean; exclude?: string[] }[] {
  const out: { path: string; url?: string; sha1?: string; native?: boolean; exclude?: string[] }[] = [];
  for (const lib of libs) {
    if (!rulesAllow(lib.rules)) continue;
    if (lib.downloads?.artifact) {
      const a = lib.downloads.artifact;
      out.push({ path: a.path || mavenPath(lib.name), url: a.url || undefined, sha1: a.sha1 });
    } else if (!lib.downloads) {
      // Fabric-style maven library.
      const p = mavenPath(lib.name);
      const base = (lib.url ?? 'https://libraries.minecraft.net/').replace(/\/?$/, '/');
      out.push({ path: p, url: base + p, sha1: lib.sha1 });
    }
    // Legacy natives (pre-1.19) are shipped as classifier jars that must be extracted.
    const nativeKey = lib.natives?.windows?.replace('${arch}', process.arch === 'ia32' ? '32' : '64');
    const classifier = nativeKey ? lib.downloads?.classifiers?.[nativeKey] : undefined;
    if (classifier) out.push({ path: classifier.path, url: classifier.url, sha1: classifier.sha1, native: true, exclude: lib.extract?.exclude });
  }
  return out;
}

export function libraryFile(relPath: string): string {
  return safeJoin(librariesDir(), relPath);
}

/**
 * Installs a vanilla version: version JSON, client jar, libraries, natives and assets.
 * Returns the parsed version JSON.
 */
export async function installVanilla(id: string, task: Task): Promise<VersionJson> {
  const verified = fs.existsSync(markerPath(id));
  let json = await readVersionJson(id);
  if (!json || !verified) {
    const entry = (await getManifest()).versions.find((v) => v.id === id);
    if (!entry) throw new UserError(`La version ${id} n'existe pas dans le manifeste Mojang.`);
    task.update(-1, 'Description de la version');
    await download({ url: entry.url, dest: versionJsonPath(id), hash: { algo: 'sha1', value: entry.sha1 }, allowedHosts: MOJANG_HOSTS, signal: task.signal });
    json = (await readVersionJson(id))!;
  }

  const client = json.downloads?.client;
  if (!client) throw new UserError(`La version ${id} ne fournit pas de client téléchargeable.`);
  task.update(-1, 'Client Minecraft');
  await download({
    url: client.url,
    dest: clientJarPath(id),
    hash: { algo: 'sha1', value: client.sha1 },
    allowedHosts: MOJANG_HOSTS,
    trustExisting: verified,
    signal: task.signal,
  });

  await installLibraries(json.libraries, task, verified);
  await extractNatives(id, json.libraries);
  await installAssets(json, task, verified);

  await fsp.writeFile(markerPath(id), new Date().toISOString());
  return json;
}

export async function installLibraries(libs: Library[], task: Task, trustExisting: boolean): Promise<void> {
  // The same library can be listed twice (e.g. by a loader and by vanilla): download it once.
  const resolved = [...new Map(resolveLibraries(libs).filter((l) => l.url).map((l) => [l.path, l])).values()];
  let done = 0;
  await pool(
    resolved,
    await downloadConcurrency(),
    async (lib) => {
      await download({
        url: lib.url!,
        dest: libraryFile(lib.path),
        hash: lib.sha1 ? { algo: 'sha1', value: lib.sha1 } : undefined,
        trustExisting,
        signal: task.signal,
      });
      task.update(++done / resolved.length, `Bibliothèques ${done}/${resolved.length}`);
    },
    task.signal,
  );
  const missing = resolveLibraries(libs).filter((l) => !l.url && !fs.existsSync(libraryFile(l.path)));
  if (missing.length) throw new UserError(`Bibliothèques introuvables : ${missing.map((m) => m.path).join(', ')}`);
}

async function extractNatives(id: string, libs: Library[]): Promise<void> {
  const natives = resolveLibraries(libs).filter((l) => l.native);
  if (!natives.length) return;
  const dir = nativesDir(id);
  await fsp.mkdir(dir, { recursive: true });
  for (const n of natives) {
    const zip = new AdmZip(libraryFile(n.path));
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      if ((n.exclude ?? ['META-INF/']).some((ex) => entry.entryName.startsWith(ex))) continue;
      const dest = safeJoin(dir, entry.entryName);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, entry.getData());
    }
  }
}

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>;
  virtual?: boolean;
  map_to_resources?: boolean;
}

async function installAssets(json: VersionJson, task: Task, trustExisting: boolean): Promise<void> {
  const idx = json.assetIndex;
  if (!idx) return;
  const indexFile = path.join(assetsDir(), 'indexes', `${idx.id}.json`);
  await download({ url: idx.url, dest: indexFile, hash: { algo: 'sha1', value: idx.sha1 }, allowedHosts: MOJANG_HOSTS, trustExisting, signal: task.signal });
  const index = await readJson<AssetIndex>(indexFile, { objects: {} });
  const objects = Object.entries(index.objects);
  // Several asset names can share the same content hash: download each object once.
  const unique = [...new Map(objects.map(([, obj]) => [obj.hash, obj])).values()];
  let done = 0;
  // Assets are tiny files: allow twice the configured parallelism.
  await pool(
    unique,
    (await downloadConcurrency()) * 2,
    async (obj) => {
      const sub = `${obj.hash.slice(0, 2)}/${obj.hash}`;
      await download({
        url: `https://resources.download.minecraft.net/${sub}`,
        dest: path.join(assetsDir(), 'objects', sub),
        hash: { algo: 'sha1', value: obj.hash },
        allowedHosts: MOJANG_HOSTS,
        trustExisting,
        signal: task.signal,
      });
      task.update(++done / unique.length, `Ressources ${done}/${unique.length}`);
    },
    task.signal,
  );
  if (index.virtual || index.map_to_resources) {
    // Very old versions read assets from a flat "virtual" folder.
    const virtualDir = path.join(assetsDir(), 'virtual', idx.id);
    for (const [name, obj] of objects) {
      const dest = safeJoin(virtualDir, name);
      if (fs.existsSync(dest)) continue;
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(path.join(assetsDir(), 'objects', obj.hash.slice(0, 2), obj.hash), dest);
    }
  }
}

/**
 * Forces a full verification of an installed version: every file is hashed
 * again and anything missing or corrupted is downloaded.
 */
export async function repairVersion(id: string, task: Task): Promise<void> {
  await fsp.rm(markerPath(id), { force: true });
  const json = await readVersionJson(id);
  if (json?.inheritsFrom) {
    await installVanilla(json.inheritsFrom, task);
    await installLibraries(json.libraries, task, false);
  } else {
    await installVanilla(id, task);
  }
}

export { clientJarPath, MOJANG_HOSTS };
