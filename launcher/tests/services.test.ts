import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, mockFetch, setupTempRoot } from './helpers';
// @ts-expect-error plain JavaScript module without types
import { createCommunityServer } from '../../server/community/server.mjs';

let root: string;
beforeEach(() => {
  root = setupTempRoot();
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup(root);
});

describe('updates', () => {
  it('compares versions', async () => {
    const { compareVersions } = await import('../electron/services/updater');
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
  });

  it('reports a verified update and refuses unsafe manifests', async () => {
    const s = await import('../electron/services/settings');
    await s.updateSettings({ updateUrl: 'https://updates.zenthra.test/manifest.json' });
    const manifest = (url: string, sha = 'a'.repeat(64)) => ({ formatVersion: 1, version: '9.0.0', notes: 'Nouveautés', downloads: { 'win-x64': { url, sha256: sha } } });
    mockFetch({ 'manifest.json': manifest('https://updates.zenthra.test/z.zip') });
    const u = await import('../electron/services/updater');
    expect(await u.checkForUpdate()).toMatchObject({ status: 'available', latest: '9.0.0', notes: 'Nouveautés' });
    mockFetch({ 'manifest.json': manifest('https://evil.example/z.zip') });
    await expect(u.checkForUpdate()).rejects.toThrow(/non vérifiée/);
    mockFetch({ 'manifest.json': manifest('https://updates.zenthra.test/z.zip', 'short') });
    await expect(u.checkForUpdate()).rejects.toThrow(/vérifiable/);
    await s.updateSettings({ updateUrl: 'http://insecure.test/m.json' });
    expect((await u.checkForUpdate()).status).toBe('not-configured');
  });
});

describe('community server', () => {
  const A = { uuid: 'a'.repeat(32), name: 'Alice' };
  const B = { uuid: 'b'.repeat(32), name: 'Bob' };

  async function start(clock = { t: Date.now() }) {
    const dataFile = path.join(root, 'community.json');
    // Fake Mojang check: the serverId must be the one handed out for that name.
    const issued = new Map<string, string>();
    const server = createCommunityServer({
      dataFile,
      now: () => clock.t,
      verify: async (name: string, serverId: string) => (issued.get(name) === serverId ? [A, B].find((p) => p.name === name) ?? null : null),
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const call = async (method: string, p: string, body?: unknown, token?: string) => {
      const res = await fetch(base + p, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: await res.json() };
    };
    const login = async (who: typeof A) => {
      const { body } = await call('POST', '/v1/auth/challenge', { name: who.name });
      issued.set(who.name, body.serverId); // the launcher would call Mojang "join" here
      return (await call('POST', '/v1/auth/verify', { name: who.name })).body.token as string;
    };
    return { server, call, login, dataFile, clock };
  }

  it('handles identity, friend requests, opt-in presence, blocking and erasure', async () => {
    const { server, call, login, dataFile, clock } = await start();
    const ta = await login(A);
    const tb = await login(B);
    expect(ta).toBeTruthy();
    // A forged identity is refused.
    await call('POST', '/v1/auth/challenge', { name: 'Alice' });
    expect((await call('POST', '/v1/auth/verify', { name: 'Alice' })).status).toBe(403);
    expect((await call('GET', '/v1/friends', undefined, 'not-a-real-token-xxxxxxxx')).status).toBe(401);

    expect((await call('POST', '/v1/friends/requests', { name: 'Bob' }, ta)).body.status).toBe('sent');
    expect((await call('GET', '/v1/friends/requests', undefined, tb)).body.incoming[0]).toMatchObject({ name: 'Alice' });
    await call('POST', `/v1/friends/requests/${A.uuid}/accept`, {}, tb);

    // Alice is online but has not chosen to be visible: Bob sees her offline.
    await call('PUT', '/v1/presence', { online: true, visible: false, activity: 'En jeu' }, ta);
    expect((await call('GET', '/v1/friends', undefined, tb)).body.friends[0]).toMatchObject({ name: 'Alice', online: false, activity: null });
    await call('PUT', '/v1/presence', { online: true, visible: true, activity: 'En jeu · PvP' }, ta);
    expect((await call('GET', '/v1/friends', undefined, tb)).body.friends[0]).toMatchObject({ online: true, activity: 'En jeu · PvP' });
    clock.t += 5 * 60_000; // no heartbeat for 5 minutes
    expect((await call('GET', '/v1/friends', undefined, tb)).body.friends[0].online).toBe(false);

    // Blocking removes the friendship and hides Alice from Bob's requests.
    await call('POST', `/v1/blocks/${B.uuid}`, {}, ta);
    expect((await call('GET', '/v1/friends', undefined, ta)).body.friends).toEqual([]);
    expect((await call('POST', '/v1/friends/requests', { name: 'Alice' }, tb)).status).toBe(404);

    // Erasure.
    await call('DELETE', '/v1/me', undefined, ta);
    expect((await call('GET', '/v1/friends', undefined, ta)).status).toBe(401);
    await new Promise((r) => setTimeout(r, 300));
    expect(fs.readFileSync(dataFile, 'utf8')).not.toContain(A.uuid);
    server.close();
  });

  it('rejects oversized and malformed requests', async () => {
    const { server, call } = await start();
    expect((await call('POST', '/v1/auth/challenge', { name: 'x'.repeat(10_000) })).status).toBe(413);
    expect((await call('POST', '/v1/auth/challenge', { name: '../evil' })).status).toBe(400);
    expect((await call('GET', '/v1/nope')).status).toBe(404);
    server.close();
  });
});
