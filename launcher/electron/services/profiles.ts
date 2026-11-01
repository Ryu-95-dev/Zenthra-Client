import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { shell } from 'electron';
import type { LoaderType, Profile, ProfileExport, ProfileIcon } from '../../../shared/types';
import { SUPPORTED_LOADERS } from '../../../shared/types';
import { UserError } from './errors';
import { bus } from './events';
import { readJson, writeJson } from './jsonStore';
import { listHistory, recordChange } from './profileHistory';
import { configDir, instanceDir } from './paths';
import { bundledJar } from './zenthraMod';

/** Default Minecraft version of new profiles (the Zenthra mod also ships for others, see zenthraMod.supportedVersions). */
export const ZENTHRA_MC_VERSION = '1.21.1';

const file = () => path.join(configDir(), 'profiles.json');

function makeProfile(id: string, name: string, icon: ProfileIcon, loader: LoaderType, zenthraMod: boolean): Profile {
  return {
    id,
    name,
    icon,
    mcVersion: ZENTHRA_MC_VERSION,
    loader,
    loaderVersion: null,
    zenthraMod,
    memoryMb: null,
    jvmArgs: '',
    resolution: null,
    mods: [],
    resourcePacks: [],
    shaderPacks: [],
    createdAt: new Date().toISOString(),
    lastPlayed: null,
    builtin: true,
  };
}

function defaultProfiles(): Profile[] {
  return [
    makeProfile('pvp', 'PvP', 'sword', 'fabric', true),
    makeProfile('survie', 'Survie', 'tree', 'fabric', true),
    makeProfile('build', 'Build', 'hammer', 'fabric', true),
    makeProfile('vanilla', 'Vanilla', 'grass', 'vanilla', false),
    makeProfile('performance', 'Performance', 'gauge', 'fabric', true),
  ];
}

let cache: Profile[] | null = null;

/** Profiles saved before the rename to Zenthra stored the mod flag as "amethystMod". */
function upgradeLegacyFields(p: Profile): void {
  const legacy = p as Profile & { amethystMod?: boolean };
  if (legacy.zenthraMod === undefined && legacy.amethystMod !== undefined) legacy.zenthraMod = legacy.amethystMod;
  delete legacy.amethystMod;
}

export async function listProfiles(): Promise<Profile[]> {
  if (!cache) {
    cache = await readJson<Profile[] | null>(file(), null);
    if (!cache) {
      cache = defaultProfiles();
      await save();
    } else {
      cache.forEach(upgradeLegacyFields);
    }
  }
  return cache;
}

async function save(): Promise<void> {
  await writeJson(file(), cache);
  bus.emit('profiles');
}

export async function getProfile(id: string): Promise<Profile> {
  const p = (await listProfiles()).find((x) => x.id === id);
  if (!p) throw new UserError('Profil introuvable.');
  return p;
}

/** Profile pictures are small PNG data URLs produced by the launcher itself. */
function isValidImage(s: string): boolean {
  return s.startsWith('data:image/png;base64,') && s.length < 300_000;
}

function validate(p: Partial<Profile>): void {
  if (p.name !== undefined && (!p.name.trim() || p.name.length > 40)) throw new UserError('Le nom du profil doit contenir 1 à 40 caractères.');
  if (p.loader !== undefined && !SUPPORTED_LOADERS.includes(p.loader)) {
    throw new UserError(`Le chargeur ${p.loader} n'est pas encore pris en charge par Zenthra.`);
  }
  if (p.mcVersion !== undefined && !/^[\w.\-]+$/.test(p.mcVersion)) throw new UserError('Version Minecraft invalide.');
  if (p.iconImage && !isValidImage(p.iconImage)) throw new UserError('Image de profil invalide.');
  if (p.memoryMb !== undefined && p.memoryMb !== null && (p.memoryMb < 1024 || p.memoryMb > 32768)) {
    throw new UserError('La mémoire doit être comprise entre 1 et 32 Go.');
  }
}

export async function createProfile(input: Pick<Profile, 'name' | 'mcVersion' | 'loader'> & Partial<Profile>): Promise<Profile> {
  validate(input);
  const list = await listProfiles();
  const profile: Profile = {
    ...makeProfile(crypto.randomUUID().slice(0, 8), input.name.trim(), input.icon ?? 'box', input.loader, false),
    ...input,
    name: input.name.trim(),
    builtin: false,
    mods: input.mods ?? [],
    resourcePacks: input.resourcePacks ?? [],
    shaderPacks: input.shaderPacks ?? [],
    createdAt: new Date().toISOString(),
    lastPlayed: null,
  };
  profile.zenthraMod = input.zenthraMod ?? (profile.loader === 'fabric' && bundledJar(profile.mcVersion) !== null);
  list.push(profile);
  await save();
  return profile;
}

export async function updateProfile(id: string, patch: Partial<Profile>): Promise<Profile> {
  const { id: _ignored, builtin: _b, createdAt: _c, ...rest } = patch;
  validate(rest);
  const list = await listProfiles();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) throw new UserError('Profil introuvable.');
  const before = list[idx];
  const next = { ...before, ...rest };
  if (rest.name) next.name = rest.name.trim();
  // Keep the previous settings so an important change can be undone.
  await recordChange(before, next);
  list[idx] = next;
  await save();
  return next;
}

/** Restores the settings saved in a history entry (content and files are left untouched). */
export async function restoreProfileSettings(id: string, at: string): Promise<Profile> {
  const entry = (await listHistory(id)).find((e) => e.at === at);
  if (!entry) throw new UserError('Sauvegarde introuvable.');
  const { id: _i, createdAt: _c, builtin: _b, lastPlayed: _l, ...settings } = entry.before;
  return updateProfile(id, settings);
}

export async function duplicateProfile(id: string): Promise<Profile> {
  const src = await getProfile(id);
  const copy = await createProfile({
    ...structuredClone(src),
    name: uniqueName(`${src.name} (copie)`, await listProfiles()),
  });
  const from = instanceDir(src.id);
  if (fs.existsSync(from)) {
    // Copy configuration and content, but not worlds, logs or screenshots.
    for (const sub of ['mods', 'resourcepacks', 'shaderpacks', 'config', 'options.txt', 'servers.dat']) {
      const s = path.join(from, sub);
      if (fs.existsSync(s)) await fsp.cp(s, path.join(instanceDir(copy.id), sub), { recursive: true });
    }
  }
  return copy;
}

export async function deleteProfile(id: string): Promise<void> {
  const list = await listProfiles();
  if (list.length <= 1) throw new UserError('Impossible de supprimer le dernier profil.');
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) throw new UserError('Profil introuvable.');
  const dir = instanceDir(id);
  // Move to the recycle bin rather than deleting, so worlds can be recovered.
  if (fs.existsSync(dir)) await shell.trashItem(dir);
  list.splice(idx, 1);
  await save();
}

export async function markPlayed(id: string): Promise<void> {
  const list = await listProfiles();
  const p = list.find((x) => x.id === id);
  if (p) {
    p.lastPlayed = new Date().toISOString();
    await save();
  }
}

export function exportProfile(p: Profile): ProfileExport {
  const { id: _i, createdAt: _c, lastPlayed: _l, builtin: _b, ...profile } = p;
  return { format: 'zenthra-profile', formatVersion: 1, profile };
}

export async function importProfile(raw: string): Promise<Profile> {
  let data: ProfileExport;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new UserError("Ce fichier n'est pas un profil Zenthra valide.");
  }
  // Profiles exported before the rename use the "amethyst-profile" format.
  const format = (data as { format?: string })?.format;
  if ((format !== 'zenthra-profile' && format !== 'amethyst-profile') || data.formatVersion !== 1 || !data.profile?.name) {
    throw new UserError("Ce fichier n'est pas un profil Zenthra valide.");
  }
  const p = data.profile;
  upgradeLegacyFields(p as Profile);
  // A new id is always generated, so an import never overwrites an existing profile.
  return createProfile({
    name: uniqueName(p.name, await listProfiles()),
    mcVersion: p.mcVersion,
    loader: p.loader,
    loaderVersion: p.loaderVersion ?? null,
    icon: p.icon,
    iconImage: typeof p.iconImage === 'string' && isValidImage(p.iconImage) ? p.iconImage : null,
    zenthraMod: p.zenthraMod,
    memoryMb: p.memoryMb ?? null,
    jvmArgs: typeof p.jvmArgs === 'string' ? p.jvmArgs : '',
    resolution: p.resolution ?? null,
    // Content entries are kept for reference; files are re-synchronised from Modrinth.
    mods: Array.isArray(p.mods) ? p.mods : [],
    resourcePacks: Array.isArray(p.resourcePacks) ? p.resourcePacks : [],
    shaderPacks: Array.isArray(p.shaderPacks) ? p.shaderPacks : [],
  });
}

export function uniqueName(base: string, list: Profile[]): string {
  const names = new Set(list.map((p) => p.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base.slice(0, 40);
  for (let i = 2; ; i++) {
    const n = `${base} ${i}`.slice(0, 40);
    if (!names.has(n.toLowerCase())) return n;
  }
}
