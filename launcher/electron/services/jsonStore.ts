import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/** Reads a JSON file, returning `fallback` if it is missing or unreadable. */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    // Strip a UTF-8 BOM: editors such as Notepad or PowerShell may add one.
    return JSON.parse((await fsp.readFile(file, 'utf8')).replace(/^﻿/, '')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[store] Fichier illisible ${file}, valeurs par défaut utilisées :`, (err as Error).message);
    }
    return fallback;
  }
}

/** Atomic write: write to a temp file then rename over the target. */
export async function writeJson(file: string, data: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, file);
}

export function existsSync(p: string): boolean {
  return fs.existsSync(p);
}
