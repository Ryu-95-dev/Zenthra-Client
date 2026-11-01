import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { LOADER_LABELS, type InstalledContent, type LoaderType, type ModrinthVersion, type Profile } from '../../../shared/types';
import { UserError } from './errors';
import { Task } from './events';
import { cancelledError, download, pool } from './http';
import { cacheDir, instanceDir, safeJoin } from './paths';
import { createProfile, deleteProfile, listProfiles, uniqueName, updateProfile } from './profiles';
import { getVersion, MODRINTH_CDN } from './modrinth';
import { downloadConcurrency } from './settings';

/** Limit for the unpacked size of a modpack's override files. */
const MAX_OVERRIDES_BYTES = 2 * 1024 * 1024 * 1024;

// Hosts allowed by the Modrinth modpack format specification.
const MRPACK_HOSTS = ['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com'];

interface MrpackIndex {
  formatVersion: number;
  game: string;
  name: string;
  versionId: string;
  files: {
    path: string;
    hashes: { sha1: string; sha512: string };
    env?: { client?: 'required' | 'optional' | 'unsupported' };
    downloads: string[];
    fileSize: number;
  }[];
  dependencies: Record<string, string>;
}

/** Downloads a modpack version from Modrinth and imports it as a new profile. */
export async function importModrinthModpack(versionId: string): Promise<Profile> {
  const version: ModrinthVersion = await getVersion(versionId);
  const file = version.files.find((f) => f.primary && f.filename.endsWith('.mrpack')) ?? version.files.find((f) => f.filename.endsWith('.mrpack'));
  if (!file) throw new UserError("Cette version ne contient pas de fichier .mrpack.");
  const dest = safeJoin(path.join(cacheDir(), 'modpacks'), `${version.id}.mrpack`);
  await download({ url: file.url, dest, hash: { algo: 'sha512', value: file.hashes.sha512 }, allowedHosts: MODRINTH_CDN });
  return importMrpackFile(dest);
}

/** Imports a local .mrpack file as a new profile (never overwrites an existing one). */
export async function importMrpackFile(file: string): Promise<Profile> {
  if ((await fsp.stat(file)).size > 1024 * 1024 * 1024) throw new UserError('Fichier .mrpack trop volumineux.');
  const zip = new AdmZip(file);
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw new UserError("Fichier .mrpack invalide (modrinth.index.json manquant).");
  let index: MrpackIndex;
  try {
    index = JSON.parse(indexEntry.getData().toString('utf8'));
  } catch {
    throw new UserError('Fichier .mrpack illisible.');
  }
  if (index.game !== 'minecraft' || index.formatVersion !== 1) throw new UserError('Format de modpack non pris en charge.');

  const mc = index.dependencies.minecraft;
  if (!mc) throw new UserError('Le modpack ne précise pas sa version de Minecraft.');
  if (index.dependencies['quilt-loader']) {
    throw new UserError("Ce modpack utilise Quilt, qui n'est pas encore pris en charge par Zenthra.");
  }
  const deps = index.dependencies;
  // In .mrpack files the Forge version has no Minecraft prefix ("47.2.0"), unlike its Maven id ("1.20.1-47.2.0").
  const [loader, loaderVersion]: [LoaderType, string | null] = deps['fabric-loader']
    ? ['fabric', deps['fabric-loader']]
    : deps.neoforge
      ? ['neoforge', deps.neoforge]
      : deps.forge
        ? ['forge', deps.forge.startsWith(`${mc}-`) ? deps.forge : `${mc}-${deps.forge}`]
        : ['vanilla', null];

  // Validate every path, host and size before touching the disk.
  const probe = path.join(cacheDir(), 'mrpack-probe');
  for (const f of index.files) {
    if (f.env?.client === 'unsupported') continue;
    safeJoin(probe, f.path); // throws on "../" or absolute paths
    if (!f.downloads.some((u) => MRPACK_HOSTS.includes(new URL(u).host))) {
      throw new UserError(`Source non vérifiée dans le modpack : ${f.path}`);
    }
  }
  const overrides = zip.getEntries().filter((e) => !e.isDirectory && /^(client-)?overrides\//.test(e.entryName));
  let unpacked = 0;
  for (const e of overrides) {
    safeJoin(probe, e.entryName.replace(/^(client-)?overrides\//, ''));
    unpacked += e.header.size;
  }
  if (overrides.length > 20_000 || unpacked > MAX_OVERRIDES_BYTES) {
    throw new UserError('Modpack refusé : son contenu décompressé est anormalement volumineux.');
  }

  const profile = await createProfile({
    name: uniqueName(index.name.slice(0, 40), await listProfiles()),
    mcVersion: mc,
    loader,
    loaderVersion,
    icon: 'box',
    zenthraMod: false,
  });
  const root = instanceDir(profile.id);
  const task = new Task(`Import du modpack ${index.name}`, true);
  try {
    const files = index.files.filter((f) => f.env?.client !== 'unsupported');
    let done = 0;
    const mods: InstalledContent[] = [];
    const packs: InstalledContent[] = [];
    const shaders: InstalledContent[] = [];
    await pool(
      files,
      await downloadConcurrency(),
      async (f) => {
      const dest = safeJoin(root, f.path);
      const url = f.downloads.find((u) => MRPACK_HOSTS.includes(new URL(u).host))!;
      await download({ url, dest, hash: { algo: 'sha512', value: f.hashes.sha512 }, allowedHosts: MRPACK_HOSTS, signal: task.signal });
      const entry: InstalledContent = {
        projectId: null,
        versionId: null,
        title: path.basename(f.path).replace(/\.(jar|zip)$/i, ''),
        fileName: path.basename(f.path),
        sha1: f.hashes.sha1,
        installedAt: new Date().toISOString(),
      };
      if (f.path.startsWith('mods/')) mods.push(entry);
      else if (f.path.startsWith('resourcepacks/')) packs.push(entry);
      else if (f.path.startsWith('shaderpacks/')) shaders.push(entry);
      task.update(++done / files.length, `${done}/${files.length} fichiers`);
      },
      task.signal,
    );

    // overrides/ then client-overrides/ (the latter wins).
    for (const prefix of ['overrides/', 'client-overrides/']) {
      for (const entry of zip.getEntries()) {
        if (task.cancelled) throw cancelledError();
        if (entry.isDirectory || !entry.entryName.startsWith(prefix)) continue;
        const dest = safeJoin(root, entry.entryName.slice(prefix.length));
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.writeFile(dest, entry.getData());
      }
    }
    if (!fs.existsSync(root)) await fsp.mkdir(root, { recursive: true });
    const updated = await updateProfile(profile.id, { mods, resourcePacks: packs, shaderPacks: shaders });
    task.done(`${index.name} importé (Minecraft ${mc}${loaderVersion ? `, ${LOADER_LABELS[loader]} ${loaderVersion}` : ''})`);
    return updated;
  } catch (err) {
    task.fail((err as Error).message);
    // Do not leave a half-imported profile behind (its folder goes to the recycle bin).
    await deleteProfile(profile.id).catch(() => undefined);
    throw err;
  }
}
