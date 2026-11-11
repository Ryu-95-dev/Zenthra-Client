import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { UserError } from '../services/errors';
import { Task } from '../services/events';
import { download, fetchJson, pool } from '../services/http';
import { cachedJson, DAY_MS } from '../services/jsonCache';
import { cacheDir, runtimesDir, safeJoin } from '../services/paths';
import { downloadConcurrency } from '../services/settings';
import { parseJavaRelease } from './jvmFlags';
import { MOJANG_HOSTS } from './versions';

// Official Mojang Java runtime index (same source as the vanilla launcher).
const RUNTIME_INDEX =
  'https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';

type RuntimeIndex = Record<string, Record<string, { manifest: { sha1: string; url: string }; version: { name: string } }[]>>;

interface RuntimeManifest {
  files: Record<
    string,
    | { type: 'file'; executable?: boolean; downloads: { raw: { sha1: string; size: number; url: string } } }
    | { type: 'directory' }
    | { type: 'link'; target: string }
  >;
}

const platform = () => (process.arch === 'arm64' ? 'windows-arm64' : process.arch === 'ia32' ? 'windows-x86' : 'windows-x64');

/**
 * Ensures the Java runtime `component` (e.g. "java-runtime-delta") is installed
 * and returns the path to javaw.exe.
 */
export async function ensureJavaRuntime(component: string, task: Task): Promise<string> {
  const root = path.join(runtimesDir(), component);
  const javaw = path.join(root, 'bin', 'javaw.exe');
  const marker = path.join(root, '.zenthra-manifest');

  const installed = fs.existsSync(javaw) && fs.existsSync(marker);
  // The runtime index is kept for a day: an installed, up-to-date runtime then needs no network at all.
  const cached = await cachedJson<RuntimeIndex>({
    file: path.join(cacheDir(), 'java-runtime-index.json'),
    key: RUNTIME_INDEX,
    ttlMs: DAY_MS,
    load: () => fetchJson<RuntimeIndex>(RUNTIME_INDEX, { signal: task.signal }),
  }).catch((err) => {
    // Offline but already installed: use what we have.
    if (installed) return null;
    throw err;
  });
  if (!cached) return javaw;
  const index = cached.data;

  const entry = index[platform()]?.[component]?.[0];
  if (!entry) throw new UserError(`Le runtime Java « ${component} » n'est pas disponible pour Windows ${process.arch}.`);

  if (installed && (await fsp.readFile(marker, 'utf8')) === entry.manifest.sha1) {
    return javaw;
  }
  // Offline with an old copy of the index: keep the installed runtime rather than fail.
  if (installed && cached.source === 'stale') return javaw;

  task.update(-1, `Java ${entry.version.name}`);
  const manifest = await fetchJson<RuntimeManifest>(entry.manifest.url, { signal: task.signal });
  const files = Object.entries(manifest.files);
  for (const [name, f] of files) if (f.type === 'directory') await fsp.mkdir(safeJoin(root, name), { recursive: true });

  const toDownload = files.filter(([, f]) => f.type === 'file') as [string, Extract<RuntimeManifest['files'][string], { type: 'file' }>][];
  let done = 0;
  await pool(
    toDownload,
    await downloadConcurrency(),
    async ([name, f]) => {
      await download({
        url: f.downloads.raw.url,
        dest: safeJoin(root, name),
        hash: { algo: 'sha1', value: f.downloads.raw.sha1 },
        allowedHosts: MOJANG_HOSTS,
        signal: task.signal,
      });
      task.update(++done / toDownload.length, `Java ${entry.version.name} — ${done}/${toDownload.length}`);
    },
    task.signal,
  );

  if (!fs.existsSync(javaw)) throw new UserError('Installation de Java incomplète (javaw.exe introuvable).');
  await fsp.writeFile(marker, entry.manifest.sha1);
  return javaw;
}

/** Major Java version of an installed runtime, from its "release" file (null when unknown). */
export async function javaMajorVersion(javaw: string): Promise<number | null> {
  try {
    return parseJavaRelease(await fsp.readFile(path.join(path.dirname(path.dirname(javaw)), 'release'), 'utf8'));
  } catch {
    return null;
  }
}
