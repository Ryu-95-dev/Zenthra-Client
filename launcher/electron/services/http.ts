import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { UserError } from './errors';

export const USER_AGENT = 'ZenthraClient/0.1.0 (Minecraft launcher)';

/** Hard cap for any single download (largest legitimate files are modpacks / Java runtimes). */
const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024;

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  /** Cancels the request (and its retries) when aborted. */
  signal?: AbortSignal;
}

export const cancelledError = () => new UserError('Opération annulée.');

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelledError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(cancelledError())), { once: true });
  });
}

/** fetch() with timeout, cancellation, retries on network errors / 5xx, and 429 back-off. */
export async function request(url: string, opts: RequestOptions = {}): Promise<Response> {
  if (!url.startsWith('https://') && !url.startsWith('http://127.0.0.1')) {
    throw new UserError(`Connexion non sécurisée refusée : ${new URL(url).host}`);
  }
  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) throw cancelledError();
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? 30_000);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: { 'User-Agent': USER_AGENT, ...opts.headers },
        body: opts.body,
        signal,
      });
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset') ?? 5);
        if (attempt < retries) {
          await sleep(Math.min(wait, 60) * 1000, opts.signal);
          continue;
        }
        throw new UserError('Limite de requêtes atteinte. Réessaie dans quelques instants.');
      }
      if (res.status >= 500 && attempt < retries) {
        await sleep(500 * 2 ** attempt, opts.signal);
        continue;
      }
      return res;
    } catch (err) {
      if (opts.signal?.aborted) throw cancelledError();
      lastErr = err;
      if (err instanceof UserError) throw err;
      if (attempt < retries) await sleep(500 * 2 ** attempt, opts.signal);
    }
  }
  const host = new URL(url).host;
  throw new UserError(`Impossible de joindre ${host}. Vérifie ta connexion Internet.`, String(lastErr));
}

export async function fetchJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(url, opts);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(res.status, `${new URL(url).host} a répondu ${res.status}`, body);
  }
  return (await res.json()) as T;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly body: string) {
    super(message);
  }
}

export type HashAlgo = 'sha1' | 'sha256' | 'sha512';

export async function hashFile(file: string, algo: HashAlgo): Promise<string> {
  const hash = crypto.createHash(algo);
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

export interface DownloadSpec {
  url: string;
  dest: string;
  hash?: { algo: HashAlgo; value: string };
  size?: number;
  /** If set, the URL host must be one of these. */
  allowedHosts?: string[];
  /** Skip re-hashing files that already exist (used after a verified install). */
  trustExisting?: boolean;
  signal?: AbortSignal;
  /** Refuse files larger than this (defaults to 1 GiB). */
  maxBytes?: number;
}

/** Stops a stream that grows beyond `max` bytes. */
function sizeGuard(max: number, already: number): Transform {
  let total = already;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      total += chunk.length;
      if (total > max) cb(new UserError('Fichier trop volumineux, téléchargement refusé.'));
      else cb(null, chunk);
    },
  });
}

/**
 * Downloads a file atomically and verifies its hash. Skips the download when
 * the destination already exists with the expected hash. An interrupted
 * download leaves a ".part" file that is resumed with an HTTP Range request.
 */
export async function download(spec: DownloadSpec): Promise<'downloaded' | 'cached'> {
  const host = new URL(spec.url).host;
  if (spec.allowedHosts && !spec.allowedHosts.includes(host)) {
    throw new UserError(`Source non vérifiée refusée : ${host}`);
  }
  if (fs.existsSync(spec.dest)) {
    if (!spec.hash || spec.trustExisting) return 'cached';
    if ((await hashFile(spec.dest, spec.hash.algo)) === spec.hash.value.toLowerCase()) return 'cached';
  }
  await fsp.mkdir(path.dirname(spec.dest), { recursive: true });
  const tmp = `${spec.dest}.part`;
  const max = spec.maxBytes ?? DEFAULT_MAX_BYTES;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (spec.signal?.aborted) throw cancelledError();
    let offset = fs.existsSync(tmp) ? (await fsp.stat(tmp)).size : 0;
    const res = await request(spec.url, {
      timeoutMs: 120_000,
      signal: spec.signal,
      headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined,
    });
    if (res.status === 416) {
      // Our partial file is already complete or invalid: start over.
      await fsp.rm(tmp, { force: true });
      continue;
    }
    if (!res.ok || !res.body) throw new UserError(`Téléchargement échoué (${res.status}) : ${path.basename(spec.dest)}`);
    const resumed = res.status === 206 && offset > 0;
    if (!resumed) offset = 0;
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared && offset + declared > max) throw new UserError('Fichier trop volumineux, téléchargement refusé.');
    try {
      await pipeline(
        Readable.fromWeb(res.body as never),
        sizeGuard(max, offset),
        fs.createWriteStream(tmp, { flags: resumed ? 'a' : 'w' }),
        { signal: spec.signal },
      );
    } catch (err) {
      // Keep the .part file so the next attempt (or launch) can resume it.
      if (spec.signal?.aborted) throw cancelledError();
      if (err instanceof UserError) {
        await fsp.rm(tmp, { force: true });
        throw err;
      }
      if (attempt < 2) continue;
      throw new UserError(`Téléchargement interrompu : ${path.basename(spec.dest)}`, String(err));
    }
    if (spec.hash) {
      const actual = await hashFile(tmp, spec.hash.algo);
      if (actual !== spec.hash.value.toLowerCase()) {
        await fsp.rm(tmp, { force: true });
        if (attempt < 2) continue;
        throw new UserError(`Fichier corrompu (empreinte invalide) : ${path.basename(spec.dest)}`);
      }
    }
    await fsp.rename(tmp, spec.dest);
    return 'downloaded';
  }
  throw new UserError(`Téléchargement échoué : ${path.basename(spec.dest)}`);
}

/**
 * Runs `worker` over `items` with at most `limit` concurrent executions.
 * Stops scheduling new items once `signal` is aborted.
 */
export async function pool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>, signal?: AbortSignal): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      if (signal?.aborted) throw cancelledError();
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}
