import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { shell } from 'electron';
import type {
  InstallPlan,
  InstalledContent,
  ModrinthProjectType,
  ModrinthSearchQuery,
  ModrinthSearchResult,
  ModrinthVersion,
  Profile,
} from '../../../shared/types';
import { UserError } from './errors';
import { Task } from './events';
import { download, fetchJson, HttpError } from './http';
import { instanceDir, safeJoin } from './paths';
import { getProfile, updateProfile } from './profiles';

const API = 'https://api.modrinth.com/v2';
/** Hosts Modrinth serves project files from. */
export const MODRINTH_CDN = ['cdn.modrinth.com'];
export const FABRIC_API_PROJECT = 'P7dR8mSH';

export interface ProjectDetails {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  icon_url: string | null;
  downloads: number;
  followers: number;
  license?: { id: string; name: string };
  source_url?: string | null;
  project_type: string;
  game_versions: string[];
  loaders: string[];
}

// ---- Response cache (in memory, bounded, with expiry) ----

const cache = new Map<string, { expires: number; data: unknown }>();
const CACHE_MAX = 300;
const MIN = 60_000;

/** GET a JSON document, reusing a recent response for the same URL. */
async function cachedJson<T>(url: string, ttlMs: number): Promise<T> {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.data as T;
  const data = await fetchJson<T>(url);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(url, { expires: Date.now() + ttlMs, data });
  return data;
}

/** A specific version never changes once published. */
export function getVersion(versionId: string): Promise<ModrinthVersion> {
  return cachedJson<ModrinthVersion>(`${API}/version/${encodeURIComponent(versionId)}`, 60 * MIN);
}

export async function search(q: ModrinthSearchQuery): Promise<ModrinthSearchResult> {
  const facets: string[][] = [[`project_type:${q.projectType}`]];
  if (q.gameVersion) facets.push([`versions:${q.gameVersion}`]);
  if (q.loader && q.projectType !== 'resourcepack') facets.push([`categories:${q.loader}`]);
  const params = new URLSearchParams({
    query: q.query,
    facets: JSON.stringify(facets),
    index: q.sort,
    offset: String(Math.max(0, q.offset)),
    limit: '20',
  });
  return cachedJson<ModrinthSearchResult>(`${API}/search?${params}`, 5 * MIN);
}

export async function getProject(idOrSlug: string): Promise<ProjectDetails> {
  return cachedJson<ProjectDetails>(`${API}/project/${encodeURIComponent(idOrSlug)}`, 10 * MIN);
}

export async function getVersions(projectId: string, loader: string | null, gameVersion: string | null): Promise<ModrinthVersion[]> {
  const params = new URLSearchParams();
  if (loader) params.set('loaders', JSON.stringify([loader]));
  if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]));
  try {
    return await cachedJson<ModrinthVersion[]>(`${API}/project/${encodeURIComponent(projectId)}/version?${params}`, 5 * MIN);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) throw new UserError('Projet introuvable sur Modrinth.');
    throw err;
  }
}

/** Loader facet to use when querying versions for a given profile & content type. */
function loaderFor(profile: Profile, type: ModrinthProjectType): string | null {
  if (type === 'resourcepack') return 'minecraft';
  return profile.loader === 'vanilla' ? null : profile.loader;
}

function bestVersion(versions: ModrinthVersion[]): ModrinthVersion | undefined {
  const rank = { release: 0, beta: 1, alpha: 2 } as const;
  return [...versions].sort(
    (a, b) => rank[a.version_type] - rank[b.version_type] || Date.parse(b.date_published) - Date.parse(a.date_published),
  )[0];
}

/**
 * Computes what installing `versionId` (or the best compatible version of
 * `projectId`) into a profile would do: required dependencies, conflicts.
 */
export async function planInstall(profileId: string, projectId: string, versionId: string | null, type: ModrinthProjectType): Promise<InstallPlan> {
  const profile = await getProfile(profileId);
  if (type === 'mod' && profile.loader === 'vanilla') {
    throw new UserError('Ce profil est Vanilla : choisis un profil Fabric pour installer des mods.');
  }
  const installed = type === 'mod' ? profile.mods : profile.resourcePacks;
  const installedIds = new Set(installed.map((m) => m.projectId).filter(Boolean) as string[]);
  const plan: InstallPlan = { toInstall: [], alreadyInstalled: [], conflicts: [], warnings: [] };
  const visited = new Set<string>();
  const titles = new Map<string, string>();

  const resolve = async (pid: string, vid: string | null, depth: number) => {
    if (visited.has(pid) || depth > 6) return;
    visited.add(pid);
    let version: ModrinthVersion | undefined;
    if (vid) {
      version = await getVersion(vid);
    } else {
      version = bestVersion(await getVersions(pid, loaderFor(profile, type), profile.mcVersion));
    }
    const title = titles.get(pid) ?? (await getProject(pid)).title;
    titles.set(pid, title);
    if (!version) {
      plan.conflicts.push(`${title} : aucune version compatible avec Minecraft ${profile.mcVersion}${profile.loader !== 'vanilla' ? ` (${profile.loader})` : ''}.`);
      return;
    }
    if (!version.game_versions.includes(profile.mcVersion)) {
      plan.warnings.push(`${title} ${version.version_number} n'indique pas la compatibilité avec ${profile.mcVersion}.`);
    }
    if (depth > 0 && installedIds.has(pid)) {
      plan.alreadyInstalled.push(title);
      return;
    }
    plan.toInstall.push({ title, version });
    for (const dep of version.dependencies) {
      const depPid = dep.project_id;
      if (dep.dependency_type === 'incompatible' && depPid && installedIds.has(depPid)) {
        const name = installed.find((m) => m.projectId === depPid)?.title ?? depPid;
        plan.conflicts.push(`${title} est incompatible avec ${name}, déjà installé.`);
      }
      if (dep.dependency_type === 'required') {
        if (depPid) await resolve(depPid, dep.version_id, depth + 1);
        else if (dep.version_id) {
          const v = await getVersion(dep.version_id);
          await resolve(v.project_id, v.id, depth + 1);
        }
      }
    }
  };

  await resolve(projectId, versionId, 0);

  // Installed mods that declare the new ones incompatible.
  const newIds = new Set(plan.toInstall.map((t) => t.version.project_id));
  for (const m of installed) {
    if (!m.versionId) continue;
    try {
      const v = await getVersion(m.versionId);
      for (const d of v.dependencies) {
        if (d.dependency_type === 'incompatible' && d.project_id && newIds.has(d.project_id)) {
          plan.conflicts.push(`${m.title} (installé) est incompatible avec ${titles.get(d.project_id) ?? d.project_id}.`);
        }
      }
    } catch {
      /* best effort */
    }
  }
  return plan;
}

const contentDir = (profileId: string, type: ModrinthProjectType) =>
  path.join(instanceDir(profileId), type === 'resourcepack' ? 'resourcepacks' : 'mods');

/** Executes an install plan: downloads and verifies every file from the Modrinth CDN. */
export async function executeInstall(profileId: string, plan: InstallPlan, type: ModrinthProjectType, iconUrl: string | null): Promise<Profile> {
  if (plan.conflicts.length) throw new UserError(plan.conflicts.join('\n'));
  const task = new Task(`Installation : ${plan.toInstall[0]?.title ?? 'contenu'}`, true);
  try {
    const profile = await getProfile(profileId);
    const list = [...(type === 'resourcepack' ? profile.resourcePacks : profile.mods)];
    const dir = contentDir(profileId, type);
    // The plan comes from the interface: check compatibility again before downloading anything.
    for (const { title, version } of plan.toInstall) {
      if (type === 'mod' && !version.loaders.includes(profile.loader)) {
        throw new UserError(`${title} ${version.version_number} ne fonctionne pas avec ${profile.loader}.`);
      }
    }
    let i = 0;
    for (const { title, version } of plan.toInstall) {
      const file = version.files.find((f) => f.primary) ?? version.files[0];
      if (!file) throw new UserError(`${title} : aucun fichier téléchargeable.`);
      if (!/^[^\\/:*?"<>|]+\.(jar|zip)$/i.test(file.filename)) throw new UserError(`${title} : nom de fichier refusé (${file.filename}).`);
      task.update(i / plan.toInstall.length, title, true);
      await download({
        url: file.url,
        dest: safeJoin(dir, file.filename),
        hash: { algo: 'sha512', value: file.hashes.sha512 },
        allowedHosts: MODRINTH_CDN,
        signal: task.signal,
        maxBytes: 300 * 1024 * 1024,
      });

      // Replace a previous version of the same project.
      const prev = list.findIndex((c) => c.projectId === version.project_id);
      if (prev >= 0) {
        if (list[prev].fileName !== file.filename) await removeFile(dir, list[prev].fileName);
        list.splice(prev, 1);
      }
      list.push({
        projectId: version.project_id,
        versionId: version.id,
        title,
        fileName: file.filename,
        sha1: file.hashes.sha1,
        iconUrl: i === 0 ? iconUrl : null,
        installedAt: new Date().toISOString(),
      });
      i++;
    }
    const updated = await updateProfile(profileId, type === 'resourcepack' ? { resourcePacks: list } : { mods: list });
    task.done(`${plan.toInstall.length} fichier(s) installé(s)`);
    return updated;
  } catch (err) {
    task.fail(err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function removeFile(dir: string, fileName: string): Promise<void> {
  const p = safeJoin(dir, fileName);
  if (fs.existsSync(p)) await shell.trashItem(p);
}

export async function uninstall(profileId: string, type: ModrinthProjectType, fileName: string): Promise<Profile> {
  const profile = await getProfile(profileId);
  const key = type === 'resourcepack' ? 'resourcePacks' : 'mods';
  await removeFile(contentDir(profileId, type), fileName);
  return updateProfile(profileId, { [key]: profile[key].filter((c) => c.fileName !== fileName) });
}

/** Checks tracked Modrinth content for newer compatible versions. */
export async function checkUpdates(profileId: string, type: ModrinthProjectType): Promise<{ fileName: string; title: string; current: string | null; latest: ModrinthVersion }[]> {
  const profile = await getProfile(profileId);
  const items = (type === 'resourcepack' ? profile.resourcePacks : profile.mods).filter((c) => c.projectId);
  const out: { fileName: string; title: string; current: string | null; latest: ModrinthVersion }[] = [];
  for (const c of items) {
    const latest = bestVersion(await getVersions(c.projectId!, loaderFor(profile, type), profile.mcVersion));
    if (latest && latest.id !== c.versionId) out.push({ fileName: c.fileName, title: c.title, current: c.versionId, latest });
  }
  return out;
}

/** Lists files present on disk that are not tracked (added manually). */
export async function scanLocal(profileId: string, type: ModrinthProjectType): Promise<InstalledContent[]> {
  const profile = await getProfile(profileId);
  const dir = contentDir(profileId, type);
  if (!fs.existsSync(dir)) return [];
  const tracked = new Set((type === 'resourcepack' ? profile.resourcePacks : profile.mods).map((c) => c.fileName));
  const files = await fsp.readdir(dir);
  return files
    .filter((f) => !tracked.has(f) && /\.(jar|zip)$/i.test(f) && f !== 'zenthra-client.jar')
    .map((f) => ({ projectId: null, versionId: null, title: f.replace(/\.(jar|zip)$/i, ''), fileName: f, installedAt: '' }));
}

/** Copies a local .jar / .zip chosen by the user into the profile. */
export async function addLocalFile(profileId: string, type: ModrinthProjectType, source: string): Promise<Profile> {
  const name = path.basename(source);
  const ext = type === 'resourcepack' ? /\.zip$/i : /\.jar$/i;
  if (!ext.test(name)) throw new UserError(type === 'resourcepack' ? 'Un resource pack doit être un fichier .zip.' : 'Un mod doit être un fichier .jar.');
  const dir = contentDir(profileId, type);
  await fsp.mkdir(dir, { recursive: true });
  const dest = safeJoin(dir, name);
  if (fs.existsSync(dest)) throw new UserError(`${name} existe déjà dans ce profil.`);
  await fsp.copyFile(source, dest);
  const profile = await getProfile(profileId);
  const entry: InstalledContent = { projectId: null, versionId: null, title: name.replace(/\.(jar|zip)$/i, ''), fileName: name, installedAt: new Date().toISOString() };
  return updateProfile(profileId, type === 'resourcepack' ? { resourcePacks: [...profile.resourcePacks, entry] } : { mods: [...profile.mods, entry] });
}

/**
 * Re-downloads tracked Modrinth files missing from disk (e.g. after an import).
 */
export async function syncProfile(profileId: string): Promise<{ restored: number; failed: string[] }> {
  const profile = await getProfile(profileId);
  const task = new Task(`Synchronisation : ${profile.name}`);
  let restored = 0;
  const failed: string[] = [];
  const all: [ModrinthProjectType, InstalledContent][] = [
    ...profile.mods.map((m) => ['mod', m] as [ModrinthProjectType, InstalledContent]),
    ...profile.resourcePacks.map((r) => ['resourcepack', r] as [ModrinthProjectType, InstalledContent]),
  ];
  for (const [type, c] of all) {
    const dest = safeJoin(contentDir(profileId, type), c.fileName);
    if (fs.existsSync(dest)) continue;
    if (!c.versionId) {
      failed.push(`${c.title} (fichier local manquant)`);
      continue;
    }
    try {
      const v = await getVersion(c.versionId);
      const f = v.files.find((x) => x.filename === c.fileName) ?? v.files.find((x) => x.primary) ?? v.files[0];
      await download({ url: f.url, dest, hash: { algo: 'sha512', value: f.hashes.sha512 }, allowedHosts: MODRINTH_CDN });
      restored++;
    } catch (err) {
      failed.push(`${c.title} : ${(err as Error).message}`);
    }
  }
  task.done(`${restored} fichier(s) restauré(s)`);
  return { restored, failed };
}
