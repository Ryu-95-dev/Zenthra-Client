import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { UserError } from './errors';
import { instanceDir } from './paths';

// Minecraft's options.txt: one "key:value" per line. Lists such as
// resourcePacks are JSON arrays. Unknown keys and their order are preserved.

const BACKUPS_KEPT = 5;

export class GameOptions {
  constructor(readonly values = new Map<string, string>()) {}

  get(key: string): string | undefined {
    return this.values.get(key);
  }

  set(key: string, value: string | number | boolean): void {
    if (!/^[\w.]+$/.test(key) || /[\r\n]/.test(String(value))) throw new UserError(`Option invalide : ${key}`);
    this.values.set(key, String(value));
  }

  private list(key: string): string[] | undefined {
    const v = this.values.get(key);
    if (v === undefined) return undefined;
    try {
      const arr = JSON.parse(v);
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  get resourcePacks(): string[] | undefined {
    return this.list('resourcePacks');
  }

  set resourcePacks(v: string[] | undefined) {
    if (v) this.values.set('resourcePacks', JSON.stringify(v));
  }

  get incompatibleResourcePacks(): string[] | undefined {
    return this.list('incompatibleResourcePacks');
  }

  set incompatibleResourcePacks(v: string[] | undefined) {
    if (v) this.values.set('incompatibleResourcePacks', JSON.stringify(v));
  }

  static parse(text: string): GameOptions {
    const values = new Map<string, string>();
    for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) values.set(line.slice(0, i), line.slice(i + 1));
    }
    return new GameOptions(values);
  }

  serialize(): string {
    return [...this.values].map(([k, v]) => `${k}:${v}`).join('\n') + '\n';
  }
}

export const optionsPath = (profileId: string) => path.join(instanceDir(profileId), 'options.txt');

export async function readOptions(profileId: string): Promise<GameOptions> {
  const file = optionsPath(profileId);
  return fs.existsSync(file) ? GameOptions.parse(await fsp.readFile(file, 'utf8')) : new GameOptions();
}

/** Writes options.txt after keeping a timestamped copy of the previous one. */
export async function writeOptions(profileId: string, options: GameOptions): Promise<void> {
  const file = optionsPath(profileId);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const dir = path.join(instanceDir(profileId), 'zenthra', 'options-backups');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.copyFile(file, path.join(dir, `options-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`));
    const old = (await fsp.readdir(dir)).sort().slice(0, -BACKUPS_KEPT);
    await Promise.all(old.map((f) => fsp.rm(path.join(dir, f), { force: true })));
  }
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, options.serialize(), 'utf8');
  await fsp.rename(tmp, file);
}

/** Most recent options.txt backup, if any. */
export async function latestOptionsBackup(profileId: string): Promise<string | null> {
  const dir = path.join(instanceDir(profileId), 'zenthra', 'options-backups');
  if (!fs.existsSync(dir)) return null;
  const files = (await fsp.readdir(dir)).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

/** Puts back the most recent backup (the current file becomes a backup itself). */
export async function restoreOptionsBackup(profileId: string): Promise<boolean> {
  const backup = await latestOptionsBackup(profileId);
  if (!backup) return false;
  const restored = GameOptions.parse(await fsp.readFile(backup, 'utf8'));
  await fsp.rm(backup);
  await writeOptions(profileId, restored);
  return true;
}
