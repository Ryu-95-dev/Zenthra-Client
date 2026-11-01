import path from 'node:path';
import type { Profile, ProfileHistoryEntry } from '../../../shared/types';
import { readJson, writeJson } from './jsonStore';
import { configDir } from './paths';

// Settings snapshots taken before important profile changes, so they can be
// undone. Content lists (mods, packs) are not part of a snapshot: restoring
// never touches files on disk.

const MAX_ENTRIES = 20;

/** Profile fields whose change is worth a snapshot, with a French label. */
export const TRACKED_FIELDS: Partial<Record<keyof Profile, string>> = {
  name: 'nom',
  mcVersion: 'version de Minecraft',
  loader: 'chargeur',
  loaderVersion: 'version du chargeur',
  zenthraMod: 'mod Zenthra',
  memoryMb: 'mémoire',
  jvmArgs: 'arguments JVM',
  resolution: 'résolution',
};

export type ProfileSettings = Omit<Profile, 'mods' | 'resourcePacks' | 'shaderPacks' | 'iconImage'>;

const file = (profileId: string) => path.join(configDir(), 'history', `${profileId.replace(/[^\w-]/g, '')}.json`);

export function changedFields(before: Profile, after: Profile): string[] {
  return (Object.keys(TRACKED_FIELDS) as (keyof Profile)[])
    .filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
    .map((k) => TRACKED_FIELDS[k]!);
}

export async function recordChange(before: Profile, after: Profile): Promise<void> {
  const fields = changedFields(before, after);
  if (!fields.length) return;
  const { mods: _m, resourcePacks: _r, shaderPacks: _s, iconImage: _i, ...settings } = before;
  const list = await readJson<ProfileHistoryEntry[]>(file(before.id), []);
  list.unshift({ at: new Date().toISOString(), fields, before: settings });
  await writeJson(file(before.id), list.slice(0, MAX_ENTRIES));
}

export async function listHistory(profileId: string): Promise<ProfileHistoryEntry[]> {
  return readJson<ProfileHistoryEntry[]>(file(profileId), []);
}
