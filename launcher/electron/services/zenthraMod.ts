import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ModuleInfo, ModuleStates, Profile } from '../../../shared/types';
import modulesCatalog from '../../../shared/modules.json';
import { Task } from './events';
import { readJson, writeJson } from './jsonStore';
import { bundledModDir, instanceDir } from './paths';
import { getProfile } from './profiles';
import { executeInstall, FABRIC_API_PROJECT, planInstall } from './modrinth';
import { getCommunity } from './community';

export const MODULES = modulesCatalog as ModuleInfo[];
const MOD_FILE = 'zenthra-client.jar';
export const LEGACY_MOD_FILE = 'amethyst-client.jar';

interface ConfigFile {
  formatVersion: number;
  modules: Record<string, { enabled?: boolean; [k: string]: unknown }>;
  [k: string]: unknown;
}

const configPath = (profileId: string) => path.join(instanceDir(profileId), 'config', 'zenthra', 'zenthra.json');

interface ModIndex {
  formatVersion: number;
  /** Exact Minecraft version → jar file name in resources/zenthra-mod. */
  versions: Record<string, string>;
}

function readIndex(): ModIndex | null {
  try {
    const raw = fs.readFileSync(path.join(bundledModDir(), 'index.json'), 'utf8').replace(/^\uFEFF/, '');
    const index = JSON.parse(raw) as ModIndex;
    return index && typeof index.versions === 'object' ? index : null;
  } catch {
    return null;
  }
}

/** Minecraft versions for which a Zenthra mod jar ships with the launcher, newest first. */
export function supportedVersions(): string[] {
  const parts = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);
  return Object.keys(readIndex()?.versions ?? {})
    .filter((v) => bundledJar(v) !== null)
    .sort((a, b) => {
      const pa = parts(a), pb = parts(b);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
      return 0;
    });
}

/** Path of the Zenthra mod jar built for this Minecraft version, if it ships with the launcher. */
export function bundledJar(mcVersion: string): string | null {
  const file = readIndex()?.versions[mcVersion];
  if (!file || path.basename(file) !== file) return null;
  const jar = path.join(bundledModDir(), file);
  return fs.existsSync(jar) ? jar : null;
}

export function unavailableReason(p: Profile): string | null {
  if (!p.zenthraMod) return 'Le mod Zenthra est désactivé pour ce profil.';
  if (p.loader !== 'fabric') return 'Le mod Zenthra nécessite un profil Fabric.';
  if (!bundledJar(p.mcVersion)) {
    const list = supportedVersions();
    return list.length
      ? `Le mod Zenthra n'existe pas encore pour Minecraft ${p.mcVersion} (versions prises en charge : ${list.join(', ')}).`
      : "Le mod Zenthra n'a pas été compilé (voir README : npm run build:mod).";
  }
  return null;
}

export async function getModuleStates(profileId: string): Promise<ModuleStates> {
  const profile = await getProfile(profileId);
  const reason = unavailableReason(profile);
  const cfg = await readJson<ConfigFile | null>(configPath(profileId), null);
  const enabled: Record<string, boolean> = {};
  for (const m of MODULES) enabled[m.id] = cfg?.modules?.[m.id]?.enabled ?? m.defaultEnabled;
  return { available: !reason, reason: reason ?? undefined, enabled };
}

/** Toggles a module, preserving every other setting written by the mod. */
export async function setModuleEnabled(profileId: string, moduleId: string, value: boolean): Promise<ModuleStates> {
  if (!MODULES.some((m) => m.id === moduleId)) throw new Error(`Module inconnu : ${moduleId}`);
  const file = configPath(profileId);
  const cfg = await readJson<ConfigFile>(file, { formatVersion: 1, modules: {} });
  cfg.modules ??= {};
  cfg.modules[moduleId] = { ...(cfg.modules[moduleId] ?? {}), enabled: value };
  await writeJson(file, cfg);
  return getModuleStates(profileId);
}

/**
 * Before launch: copies the Zenthra mod into the profile (or removes it) and
 * makes sure Fabric API, its only dependency, is installed.
 */
export async function prepareZenthraMod(profile: Profile, task: Task): Promise<void> {
  const modsDir = path.join(instanceDir(profile.id), 'mods');
  const target = path.join(modsDir, MOD_FILE);
  // The mod used to be called "Amethyst": never load both copies.
  await fsp.rm(path.join(modsDir, LEGACY_MOD_FILE), { force: true });
  const jar = bundledJar(profile.mcVersion);
  if (unavailableReason(profile) || !jar) {
    if (fs.existsSync(target)) await fsp.rm(target);
    return;
  }
  await fsp.mkdir(modsDir, { recursive: true });
  await fsp.copyFile(jar, target);

  const hasFabricApi = profile.mods.some((m) => m.projectId === FABRIC_API_PROJECT && fs.existsSync(path.join(modsDir, m.fileName)));
  if (!hasFabricApi) {
    task.update(-1, 'Fabric API (requis par Zenthra)', true);
    const plan = await planInstall(profile.id, FABRIC_API_PROJECT, null, 'mod');
    await executeInstall(profile.id, plan, 'mod', null);
  }
}

/**
 * While the game runs, hands the friend list to the in-game "Amis" screen through
 * <instance>/zenthra/friends.json (refreshed every minute). Only names, online
 * status and the activity friends chose to share are written; the file is
 * removed when the game stops. Returns the function that stops the refresh.
 */
export function startFriendsBridge(profile: Profile): () => void {
  if (unavailableReason(profile)) return () => undefined;
  const file = path.join(instanceDir(profile.id), 'zenthra', 'friends.json');
  const write = async () => {
    const c = await getCommunity().catch((err: unknown) => ({ status: 'error' as const, message: String(err) }));
    await writeJson(file, {
      formatVersion: 1,
      writtenAt: Date.now(),
      status: c.status,
      message: c.status === 'error' ? c.message : undefined,
      friends: c.status === 'ok' ? c.friends.map((f) => ({ name: f.name, online: f.online, activity: f.activity })) : [],
    }).catch(() => undefined);
  };
  void write();
  const timer = setInterval(() => void write(), 60_000);
  return () => {
    clearInterval(timer);
    fs.rmSync(file, { force: true });
  };
}
