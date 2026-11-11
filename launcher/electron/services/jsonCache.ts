import { readJson, writeJson } from './jsonStore';

/** One day: Mojang's runtime index and Fabric's loader list change rarely. */
export const DAY_MS = 24 * 60 * 60_000;

interface CacheEntry<T> {
  /** What was fetched (e.g. the URL): an entry for another key is ignored. */
  key: string;
  fetchedAt: number;
  data: T;
}

export interface CachedResult<T> {
  data: T;
  /** 'cache': fresh copy used without network; 'network': just fetched; 'stale': fetch failed, old copy used. */
  source: 'cache' | 'network' | 'stale';
}

export interface CachedJsonOptions<T> {
  /** File holding the cached copy. */
  file: string;
  /** Identifies the content (usually the URL). */
  key: string;
  ttlMs: number;
  /** Downloads a fresh copy. */
  load: () => Promise<T>;
  /** Copies that must not be cached (e.g. an empty list). Default: everything is cached. */
  accept?: (data: T) => boolean;
  /** Use an expired copy when `load` fails (offline). Default: true. */
  allowStale?: boolean;
  /** Clock, for tests. */
  now?: () => number;
}

/**
 * Small file cache with an expiry: returns the stored copy while it is fresh
 * (no network at all), otherwise downloads a new one and stores it. When the
 * download fails, an expired copy is used rather than failing (offline play).
 */
export async function cachedJson<T>(opts: CachedJsonOptions<T>): Promise<CachedResult<T>> {
  const now = opts.now ?? Date.now;
  const entry = await readJson<CacheEntry<T> | null>(opts.file, null);
  const valid = entry && entry.key === opts.key && typeof entry.fetchedAt === 'number' && entry.data !== undefined;
  const age = valid ? now() - entry.fetchedAt : Infinity;
  // A date in the future (clock changed) is treated as expired.
  if (valid && age >= 0 && age < opts.ttlMs) return { data: entry.data, source: 'cache' };
  try {
    const data = await opts.load();
    if (!opts.accept || opts.accept(data)) {
      await writeJson(opts.file, { key: opts.key, fetchedAt: now(), data } satisfies CacheEntry<T>).catch(() => undefined);
    }
    return { data, source: 'network' };
  } catch (err) {
    if (valid && opts.allowStale !== false) return { data: entry.data, source: 'stale' };
    throw err;
  }
}
