import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { shell } from 'electron';
import type { ResourcePackInfo } from '../../../shared/types';
import { getGameState } from '../minecraft/launch';
import { clientJarPath } from '../minecraft/versions';
import { UserError } from './errors';
import { instanceDir, safeJoin } from './paths';
import { getProfile, updateProfile } from './profiles';
import { readOptions, writeOptions } from './gameOptions';

const MAX_ICON_BYTES = 512 * 1024;

const packsDir = (profileId: string) => path.join(instanceDir(profileId), 'resourcepacks');

/** Resource pack format expected by an installed Minecraft version (read from its client jar). */
export function gamePackFormat(mcVersion: string): number | null {
  try {
    const entry = new AdmZip(clientJarPath(mcVersion)).getEntry('version.json');
    const v = entry && JSON.parse(entry.getData().toString('utf8'));
    const f = v?.pack_version?.resource ?? v?.pack_version;
    return typeof f === 'number' ? f : null;
  } catch {
    return null;
  }
}

interface PackMeta {
  description: string;
  format: number | null;
  /** [min, max] when the pack declares "supported_formats". */
  supported: [number, number] | null;
}

function parseMeta(raw: string): PackMeta {
  try {
    const pack = JSON.parse(raw.replace(/^﻿/, '')).pack ?? {};
    const desc = typeof pack.description === 'string' ? pack.description : Array.isArray(pack.description) ? pack.description.map((d: { text?: string } | string) => (typeof d === 'string' ? d : (d.text ?? ''))).join('') : (pack.description?.text ?? '');
    let supported: [number, number] | null = null;
    const s = pack.supported_formats;
    if (typeof s === 'number') supported = [s, s];
    else if (Array.isArray(s) && s.length === 2) supported = [Number(s[0]), Number(s[1])];
    else if (s && typeof s === 'object') supported = [Number(s.min_inclusive), Number(s.max_inclusive)];
    return { description: String(desc).replace(/§./g, '').slice(0, 300), format: typeof pack.pack_format === 'number' ? pack.pack_format : null, supported };
  } catch {
    return { description: '', format: null, supported: null };
  }
}

function readPack(file: string): { meta: PackMeta; icon: string | null } {
  const stat = fs.statSync(file);
  if (stat.isDirectory()) {
    const metaFile = path.join(file, 'pack.mcmeta');
    const iconFile = path.join(file, 'pack.png');
    const meta = fs.existsSync(metaFile) ? parseMeta(fs.readFileSync(metaFile, 'utf8')) : parseMeta('{}');
    const icon = fs.existsSync(iconFile) && fs.statSync(iconFile).size <= MAX_ICON_BYTES ? `data:image/png;base64,${fs.readFileSync(iconFile).toString('base64')}` : null;
    return { meta, icon };
  }
  const zip = new AdmZip(file);
  const metaEntry = zip.getEntry('pack.mcmeta');
  const iconEntry = zip.getEntry('pack.png');
  const meta = parseMeta(metaEntry ? metaEntry.getData().toString('utf8') : '{}');
  const icon = iconEntry && iconEntry.header.size <= MAX_ICON_BYTES ? `data:image/png;base64,${iconEntry.getData().toString('base64')}` : null;
  return { meta, icon };
}

function compatibility(meta: PackMeta, game: number | null): ResourcePackInfo['compatibility'] {
  if (game === null || (meta.format === null && !meta.supported)) return 'unknown';
  const [min, max] = meta.supported ?? [meta.format!, meta.format!];
  if (game < min) return 'newer';
  if (game > max) return 'older';
  return 'ok';
}

/** Packs present in the profile, with their state in options.txt. Highest priority first. */
export async function listPacks(profileId: string): Promise<ResourcePackInfo[]> {
  const profile = await getProfile(profileId);
  const dir = packsDir(profileId);
  if (!fs.existsSync(dir)) return [];
  const options = await readOptions(profileId);
  const enabled = (options.resourcePacks ?? []).filter((p) => p.startsWith('file/')).map((p) => p.slice(5));
  const game = gamePackFormat(profile.mcVersion);
  const out: ResourcePackInfo[] = [];
  for (const name of await fsp.readdir(dir)) {
    const file = path.join(dir, name);
    const isDir = fs.statSync(file).isDirectory();
    if (!isDir && !/\.zip$/i.test(name)) continue;
    if (isDir && !fs.existsSync(path.join(file, 'pack.mcmeta'))) continue;
    let info: { meta: PackMeta; icon: string | null };
    try {
      info = readPack(file);
    } catch {
      info = { meta: { description: 'Archive illisible ou corrompue.', format: null, supported: null }, icon: null };
    }
    const idx = enabled.indexOf(name);
    out.push({
      fileName: name,
      title: profile.resourcePacks.find((r) => r.fileName === name)?.title ?? name.replace(/\.zip$/i, ''),
      description: info.meta.description,
      icon: info.icon,
      packFormat: info.meta.format,
      gamePackFormat: game,
      compatibility: compatibility(info.meta, game),
      enabled: idx >= 0,
      priority: idx,
      isFolder: isDir,
    });
  }
  // Enabled packs first, highest priority (last in options.txt) on top.
  return out.sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0) || b.priority - a.priority || a.title.localeCompare(b.title));
}

function assertGameClosed(profileId: string): void {
  const g = getGameState();
  if ((g.status === 'running' || g.status === 'preparing') && g.profileId === profileId) {
    throw new UserError('Ferme Minecraft avant de modifier les packs : le jeu réécrit ses options en quittant.');
  }
}

/**
 * Sets the enabled packs, in priority order (first = highest priority, as shown
 * in the interface). Built-in packs ("vanilla", "fabric"…) keep their place.
 */
export async function setEnabledPacks(profileId: string, highestFirst: string[]): Promise<ResourcePackInfo[]> {
  assertGameClosed(profileId);
  const dir = packsDir(profileId);
  for (const n of highestFirst) {
    if (!fs.existsSync(safeJoin(dir, n))) throw new UserError(`Pack introuvable : ${n}`);
  }
  const options = await readOptions(profileId);
  const builtins = (options.resourcePacks ?? ['vanilla']).filter((p) => !p.startsWith('file/'));
  if (!builtins.includes('vanilla')) builtins.unshift('vanilla');
  // options.txt lists the lowest priority first.
  options.resourcePacks = [...builtins, ...[...highestFirst].reverse().map((n) => `file/${n}`)];
  options.incompatibleResourcePacks = (options.incompatibleResourcePacks ?? []).filter((p) => !p.startsWith('file/') || highestFirst.includes(p.slice(5)));
  await writeOptions(profileId, options);
  return listPacks(profileId);
}

export async function deletePack(profileId: string, fileName: string): Promise<ResourcePackInfo[]> {
  assertGameClosed(profileId);
  const file = safeJoin(packsDir(profileId), fileName);
  if (fs.existsSync(file)) await shell.trashItem(file);
  const options = await readOptions(profileId);
  if (options.resourcePacks) {
    options.resourcePacks = options.resourcePacks.filter((p) => p !== `file/${fileName}`);
    await writeOptions(profileId, options);
  }
  const profile = await getProfile(profileId);
  await updateProfile(profileId, { resourcePacks: profile.resourcePacks.filter((r) => r.fileName !== fileName) });
  return listPacks(profileId);
}

export async function openPacksFolder(profileId: string): Promise<void> {
  const dir = packsDir(profileId);
  await fsp.mkdir(dir, { recursive: true });
  await shell.openPath(dir);
}
