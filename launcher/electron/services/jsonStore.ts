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

const queues = new Map<string, Promise<void>>();
let tmpCounter = 0;

/**
 * Atomic write: write to a temp file then rename over the target. Writes to the
 * same file run one after another (and each uses its own temp file), so rapid
 * saves — e.g. dragging the colour picker — can never collide.
 */
export function writeJson(file: string, data: unknown): Promise<void> {
  const text = JSON.stringify(data, null, 2);
  const run = async () => {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${++tmpCounter}.tmp`;
    await fsp.writeFile(tmp, text, 'utf8');
    await fsp.rename(tmp, file);
  };
  const next = (queues.get(file) ?? Promise.resolve()).catch(() => undefined).then(run);
  queues.set(file, next);
  void next.finally(() => {
    if (queues.get(file) === next) queues.delete(file);
  }).catch(() => undefined);
  return next;
}

export function existsSync(p: string): boolean {
  return fs.existsSync(p);
}
