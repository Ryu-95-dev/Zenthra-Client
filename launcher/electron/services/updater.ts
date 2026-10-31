import path from 'node:path';
import { app, shell } from 'electron';
import type { UpdateStatus } from '../../../shared/types';
import { UserError } from './errors';
import { Task } from './events';
import { download, fetchJson } from './http';
import { getSettings } from './settings';

// Update manifest published by the developer (see docs/UPDATES.md):
// { "formatVersion": 1, "version": "0.2.0", "notes": "…", "publishedAt": "…",
//   "downloads": { "win-x64": { "url": "https://…/Zenthra-Client-0.2.0-win64.zip", "sha256": "…", "size": 123 } } }
// The running launcher is never overwritten: the verified archive is saved and
// shown to the player, and the current version stays usable (rollback).

interface Manifest {
  formatVersion: number;
  version: string;
  notes?: string;
  publishedAt?: string;
  downloads?: Record<string, { url: string; sha256: string; size?: number }>;
}

/** Compares "1.2.10" and "1.2.9" numerically; pre-release suffixes sort before the release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [main, pre] = v.replace(/^v/, '').split('-', 2);
    return { nums: main.split('.').map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return Math.sign(d);
  }
  if (x.pre && !y.pre) return -1;
  if (!x.pre && y.pre) return 1;
  return (x.pre ?? '').localeCompare(y.pre ?? '');
}

function validate(m: Manifest, manifestUrl: string): { version: string; notes: string; asset: { url: string; sha256: string; size?: number } } {
  if (m?.formatVersion !== 1 || typeof m.version !== 'string' || !/^v?\d+\.\d+\.\d+([-+][\w.]+)?$/.test(m.version)) {
    throw new UserError('Manifeste de mise à jour invalide.');
  }
  const asset = m.downloads?.['win-x64'];
  if (!asset || typeof asset.url !== 'string' || !/^[0-9a-f]{64}$/i.test(asset.sha256 ?? '')) {
    throw new UserError('Le manifeste ne contient pas de téléchargement Windows vérifiable.');
  }
  const assetHost = new URL(asset.url).host;
  const allowed = [new URL(manifestUrl).host, 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];
  if (!asset.url.startsWith('https://') || !allowed.includes(assetHost)) throw new UserError(`Source de mise à jour non vérifiée : ${assetHost}`);
  return { version: m.version.replace(/^v/, ''), notes: String(m.notes ?? '').slice(0, 5000), asset };
}

export async function checkForUpdate(): Promise<UpdateStatus> {
  const { updateUrl } = await getSettings();
  const current = app.getVersion();
  if (!updateUrl) return { status: 'not-configured', current };
  const m = validate(await fetchJson<Manifest>(updateUrl, { retries: 1, timeoutMs: 10_000 }), updateUrl);
  return compareVersions(m.version, current) > 0
    ? { status: 'available', current, latest: m.version, notes: m.notes }
    : { status: 'up-to-date', current, latest: m.version };
}

/** Downloads the new version (hash-checked) to the Downloads folder and reveals it. */
export async function downloadUpdate(): Promise<string> {
  const { updateUrl } = await getSettings();
  if (!updateUrl) throw new UserError('Aucune adresse de mise à jour configurée.');
  const m = validate(await fetchJson<Manifest>(updateUrl), updateUrl);
  if (compareVersions(m.version, app.getVersion()) <= 0) throw new UserError('Zenthra est déjà à jour.');
  const dest = path.join(app.getPath('downloads'), `Zenthra-Client-${m.version.replace(/[^\w.-]/g, '')}-win64.zip`);
  const task = new Task(`Mise à jour ${m.version}`, true);
  try {
    await download({ url: m.asset.url, dest, hash: { algo: 'sha256', value: m.asset.sha256 }, signal: task.signal, maxBytes: 600 * 1024 * 1024 });
    task.done('Archive vérifiée');
  } catch (err) {
    task.fail((err as Error).message);
    throw err;
  }
  shell.showItemInFolder(dest);
  return dest;
}
