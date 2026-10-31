import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, mockFetch, setupTempRoot } from './helpers';

let root: string;
beforeEach(() => {
  root = setupTempRoot();
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup(root);
});

const version = (id: string, projectId: string, deps: { project_id: string; dependency_type: string }[] = [], loaders = ['fabric']) => ({
  id,
  project_id: projectId,
  name: id,
  version_number: '1.0.0',
  version_type: 'release',
  game_versions: ['1.21.1'],
  loaders,
  downloads: 0,
  date_published: '2026-01-01T00:00:00Z',
  files: [{ url: `https://cdn.modrinth.com/data/${projectId}/${id}.jar`, filename: `${id}.jar`, primary: true, size: 10, hashes: { sha1: 'x', sha512: 'y' } }],
  dependencies: deps.map((d) => ({ ...d, version_id: null, file_name: null })),
});

describe('Modrinth dependency resolution', () => {
  it('adds required dependencies and detects incompatibilities', async () => {
    mockFetch({
      '/project/AAA/version': [version('va', 'AAA', [{ project_id: 'DEP', dependency_type: 'required' }, { project_id: 'BAD', dependency_type: 'incompatible' }])],
      '/project/DEP/version': [version('vd', 'DEP')],
      '/project/AAA': { title: 'Mod A' },
      '/project/DEP': { title: 'Dépendance' },
    });
    const m = await import('../electron/services/modrinth');
    const p = await import('../electron/services/profiles');
    let plan = await m.planInstall('pvp', 'AAA', null, 'mod');
    expect(plan.toInstall.map((t) => t.title)).toEqual(['Mod A', 'Dépendance']);
    expect(plan.conflicts).toEqual([]);

    await p.updateProfile('pvp', { mods: [{ projectId: 'BAD', versionId: null, title: 'Mauvais', fileName: 'bad.jar', installedAt: '' }] });
    plan = await m.planInstall('pvp', 'AAA', null, 'mod');
    expect(plan.conflicts.join()).toMatch(/incompatible avec Mauvais/);
    await expect(m.executeInstall('pvp', plan, 'mod', null)).rejects.toThrow(/incompatible/);
  });

  it('refuses mods for another loader and files from unverified hosts', async () => {
    mockFetch({});
    const m = await import('../electron/services/modrinth');
    const forgeOnly = version('vf', 'FFF', [], ['forge']);
    await expect(m.executeInstall('pvp', { toInstall: [{ title: 'Forge mod', version: forgeOnly as never }], alreadyInstalled: [], conflicts: [], warnings: [] }, 'mod', null)).rejects.toThrow(/ne fonctionne pas avec fabric/);
    const evil = version('ve', 'EEE');
    evil.files[0].url = 'https://evil.example/ve.jar';
    await expect(m.executeInstall('pvp', { toInstall: [{ title: 'Evil', version: evil as never }], alreadyInstalled: [], conflicts: [], warnings: [] }, 'mod', null)).rejects.toThrow(/non vérifiée/);
  });

  it('refuses installing mods into a Vanilla profile', async () => {
    mockFetch({});
    const m = await import('../electron/services/modrinth');
    await expect(m.planInstall('vanilla', 'AAA', null, 'mod')).rejects.toThrow(/Vanilla/);
  });
});

describe('modpack import', () => {
  const mrpack = (files: unknown[], deps: Record<string, string> = { minecraft: '1.21.1', 'fabric-loader': '0.20.1' }) => {
    const zip = new AdmZip();
    zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify({ formatVersion: 1, game: 'minecraft', name: 'Pack', versionId: '1', files, dependencies: deps })));
    const file = path.join(root, `pack-${Math.random()}.mrpack`);
    zip.writeZip(file);
    return file;
  };
  const entry = (p: string, url = 'https://cdn.modrinth.com/data/x/y.jar') => ({ path: p, hashes: { sha1: 'a', sha512: 'b' }, downloads: [url], fileSize: 1 });

  it('rejects path traversal, unverified hosts and unsupported loaders without creating a profile', async () => {
    const { importMrpackFile } = await import('../electron/services/modpack');
    const p = await import('../electron/services/profiles');
    const before = (await p.listProfiles()).length;
    await expect(importMrpackFile(mrpack([entry('../../evil.jar')]))).rejects.toThrow(/refusé/);
    await expect(importMrpackFile(mrpack([entry('mods/a.jar', 'https://evil.example/a.jar')]))).rejects.toThrow(/non vérifiée/);
    await expect(importMrpackFile(mrpack([], { minecraft: '1.21.1', 'quilt-loader': '0.26' }))).rejects.toThrow(/Quilt/);
    const bad = new AdmZip();
    bad.addFile('readme.txt', Buffer.from('hi'));
    bad.writeZip(path.join(root, 'bad.mrpack'));
    await expect(importMrpackFile(path.join(root, 'bad.mrpack'))).rejects.toThrow(/invalide/);
    expect((await p.listProfiles()).length).toBe(before);
  });
});

describe('Microsoft sign-in (simulated, no real credentials)', () => {
  const userData = () => path.join(root, 'appData', 'Zenthra Client');

  async function seedExpiredSession() {
    const s = await import('../electron/services/settings');
    await s.updateSettings({ msClientId: 'test-client-id' });
    const store = await import('../electron/services/secureStore');
    await store.saveSecret('session', {
      msRefreshToken: 'old-refresh',
      mcAccessToken: 'old-access',
      mcExpiresAt: Date.now() - 1000,
      xuid: '1',
      profile: { uuid: '0123456789abcdef0123456789abcdef', name: 'Ancien', skinUrl: null },
    });
  }

  const happy = {
    'login.microsoftonline.com': { access_token: 'ms-token', refresh_token: 'new-refresh' },
    'user.auth.xboxlive.com': { Token: 'xbl', DisplayClaims: { xui: [{ uhs: 'hash' }] } },
    'xsts.auth.xboxlive.com': { Token: 'xsts', DisplayClaims: { xui: [{ uhs: 'hash', xid: '2535' }] } },
    login_with_xbox: { access_token: 'fresh-mc-token', expires_in: 86400 },
    entitlements: { items: [{ name: 'game_minecraft' }] },
    'minecraft/profile': { id: '0123456789abcdef0123456789abcdef', name: 'Steve', skins: [{ state: 'ACTIVE', url: 'https://textures.minecraft.net/texture/abc' }] },
  };

  it('refreshes an expired session and stores it encrypted', async () => {
    await seedExpiredSession();
    mockFetch(happy);
    const auth = await import('../electron/services/auth');
    await auth.initAuth();
    const id = await auth.getLaunchIdentity();
    expect(id).toMatchObject({ name: 'Steve', accessToken: 'fresh-mc-token', xuid: '2535', demo: false });
    const raw = fs.readFileSync(path.join(userData(), 'session.bin'), 'utf8');
    expect(raw.startsWith('ENC:')).toBe(true);
    expect(raw).not.toContain('fresh-mc-token');
  });

  it('explains Xbox errors and signs out instead of faking a session', async () => {
    await seedExpiredSession();
    mockFetch({ ...happy, 'xsts.auth.xboxlive.com': [401, { XErr: 2148916233 }] });
    const auth = await import('../electron/services/auth');
    await auth.initAuth();
    await expect(auth.getLaunchIdentity()).rejects.toThrow(/expiré/);
    const state = auth.getAuthState();
    expect(state.status).toBe('error');
    expect(state.status === 'error' && state.message).toMatch(/profil Xbox/);
    expect(fs.existsSync(path.join(userData(), 'session.bin'))).toBe(false);
  });

  it('reports an Azure application not yet approved by Mojang', async () => {
    await seedExpiredSession();
    mockFetch({ ...happy, login_with_xbox: [403, {}] });
    const auth = await import('../electron/services/auth');
    await auth.initAuth();
    await expect(auth.getLaunchIdentity()).rejects.toThrow();
    const state = auth.getAuthState();
    expect(state.status === 'error' && state.message).toMatch(/approuvé par Mojang/);
  });

  it('refuses to sign in without an application id', async () => {
    const auth = await import('../electron/services/auth');
    await auth.initAuth();
    const state = await auth.signIn();
    expect(state.status).toBe('error');
    expect(state.status === 'error' && state.configured).toBe(false);
  });
});
