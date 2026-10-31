import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { vi } from 'vitest';

/** Fresh temporary root + fresh module instances (settings/profile caches are module-level). */
export function setupTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenthra-test-'));
  process.env.ZTEST_ROOT = dir;
  vi.resetModules();
  return dir;
}

export function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Local HTTP server on 127.0.0.1 (the only plain-HTTP host the launcher accepts). */
export async function startServer(handler: http.RequestListener): Promise<{ url: string; close(): Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

/** Replaces global fetch with a router: url substring → JSON body (or [status, body]). */
export function mockFetch(routes: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: string | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response('not found', { status: 404 });
    const value = routes[key];
    const [status, body] = Array.isArray(value) && typeof value[0] === 'number' ? (value as [number, unknown]) : [200, value];
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
