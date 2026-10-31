import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, setupTempRoot } from './helpers';

let root: string;
beforeEach(() => {
  root = setupTempRoot();
});
afterEach(() => cleanup(root));

const userData = () => path.join(root, 'appData', 'Zenthra Client');

describe('profiles', () => {
  it('creates the five default profiles and persists changes', async () => {
    const p = await import('../electron/services/profiles');
    const list = await p.listProfiles();
    expect(list.map((x) => x.name)).toEqual(['PvP', 'Survie', 'Build', 'Vanilla', 'Performance']);
    await p.updateProfile('pvp', { memoryMb: 3072 });
    const saved = JSON.parse(fs.readFileSync(path.join(userData(), 'profiles.json'), 'utf8'));
    expect(saved.find((x: { id: string }) => x.id === 'pvp').memoryMb).toBe(3072);
  });

  it('validates input', async () => {
    const p = await import('../electron/services/profiles');
    await expect(p.createProfile({ name: '', mcVersion: '1.21.1', loader: 'fabric' })).rejects.toThrow();
    await expect(p.createProfile({ name: 'x', mcVersion: '../../evil', loader: 'fabric' })).rejects.toThrow(/invalide/);
    await expect(p.createProfile({ name: 'x', mcVersion: '1.21.1', loader: 'quilt' as never })).rejects.toThrow();
    await expect(p.updateProfile('pvp', { memoryMb: 999_999 })).rejects.toThrow();
  });

  it('duplicates, exports and imports without overwriting', async () => {
    const p = await import('../electron/services/profiles');
    const copy = await p.duplicateProfile('pvp');
    expect(copy.name).toBe('PvP (copie)');
    const exported = JSON.stringify(p.exportProfile(copy));
    const imported = await p.importProfile(exported);
    expect(imported.id).not.toBe(copy.id);
    expect(imported.name).toBe('PvP (copie) 2');
    await expect(p.importProfile('{"format":"other"}')).rejects.toThrow(/valide/);
  });

  it('reads profiles saved under the old "Amethyst" format', async () => {
    const p = await import('../electron/services/profiles');
    const legacy = JSON.stringify({
      format: 'amethyst-profile',
      formatVersion: 1,
      profile: { name: 'Ancien', mcVersion: '1.21.1', loader: 'fabric', icon: 'box', amethystMod: true, jvmArgs: '', mods: [], resourcePacks: [] },
    });
    const imported = await p.importProfile(legacy);
    expect(imported.zenthraMod).toBe(true);
  });

  it('keeps a history of important changes and restores settings', async () => {
    const p = await import('../electron/services/profiles');
    const h = await import('../electron/services/profileHistory');
    await p.updateProfile('survie', { mcVersion: '1.20.4', memoryMb: 4096 });
    const entries = await h.listHistory('survie');
    expect(entries[0].fields).toEqual(expect.arrayContaining(['version de Minecraft', 'mémoire']));
    expect(entries[0].before.mcVersion).toBe('1.21.1');
    const restored = await p.restoreProfileSettings('survie', entries[0].at);
    expect(restored.mcVersion).toBe('1.21.1');
    expect(restored.memoryMb).toBeNull();
  });

  it('refuses to delete the last profile', async () => {
    const p = await import('../electron/services/profiles');
    for (const id of ['survie', 'build', 'vanilla', 'performance']) await p.deleteProfile(id);
    await expect(p.deleteProfile('pvp')).rejects.toThrow(/dernier/);
  });
});

describe('settings', () => {
  it('sanitises values and tolerates a BOM', async () => {
    fs.mkdirSync(userData(), { recursive: true });
    fs.writeFileSync(path.join(userData(), 'settings.json'), '﻿{"accentColor":"#123456","memoryMb":3072}');
    const s = await import('../electron/services/settings');
    expect((await s.getSettings()).accentColor).toBe('#123456');
    const next = await s.updateSettings({
      accentColor: 'red' as never,
      downloadConcurrency: 99,
      presenceServerUrl: 'http://insecure.example',
      homeLayout: [{ id: 'hero', w: 40, h: 1, hidden: false }, { id: 'nope' as never, w: 4, h: 4, hidden: false }],
    });
    expect(next.accentColor).toBe('#123456');
    expect(next.downloadConcurrency).toBe(16);
    expect(next.presenceServerUrl).toBe('');
    expect(next.homeLayout).toEqual([{ id: 'hero', w: 12, h: 2, hidden: false }]);
  });
});

describe('launcher ↔ mod configuration', () => {
  it('only touches the "enabled" flag and keeps the mod settings', async () => {
    const m = await import('../electron/services/zenthraMod');
    const { instanceDir } = await import('../electron/services/paths');
    const file = path.join(instanceDir('pvp'), 'config', 'zenthra', 'zenthra.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ formatVersion: 1, modules: { zoom: { enabled: true, settings: { factor: 6 } } }, waypoints: [{ name: 'Base' }] }));
    await m.setModuleEnabled('pvp', 'zoom', false);
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(cfg.modules.zoom).toEqual({ enabled: false, settings: { factor: 6 } });
    expect(cfg.waypoints).toEqual([{ name: 'Base' }]);
    await expect(m.setModuleEnabled('pvp', 'not_a_module', true)).rejects.toThrow();
  });

  it('validates the telemetry written by the mod', async () => {
    const { parseTelemetry } = await import('../electron/services/diagnostics');
    const now = Date.now();
    const good = { formatVersion: 1, writtenAt: now - 1000, fps: 144, fpsAvg: 140, memUsedMb: 1500, memMaxMb: 4096, mods: [{ id: 'sodium', name: 'Sodium', version: '0.6' }] };
    expect(parseTelemetry(good, now)?.fps).toBe(144);
    expect(parseTelemetry({ ...good, writtenAt: now - 60_000 }, now)).toBeNull(); // stale: game closed
    expect(parseTelemetry({ ...good, formatVersion: 2 }, now)).toBeNull();
    expect(parseTelemetry({ ...good, fps: 'lots' }, now)).toBeNull();
    expect(parseTelemetry(null, now)).toBeNull();
  });
});

describe('resource packs', () => {
  it('lists packs, orders them in options.txt and keeps a backup', async () => {
    const { instanceDir } = await import('../electron/services/paths');
    const dir = path.join(instanceDir('pvp'), 'resourcepacks');
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, meta] of [
      ['A.zip', { pack: { pack_format: 34, description: 'Pack A' } }],
      ['B.zip', { pack: { pack_format: 15, supported_formats: [15, 40], description: [{ text: '§aPack ' }, 'B'] } }],
    ] as const) {
      const zip = new AdmZip();
      zip.addFile('pack.mcmeta', Buffer.from(JSON.stringify(meta)));
      zip.writeZip(path.join(dir, name));
    }
    fs.writeFileSync(path.join(instanceDir('pvp'), 'options.txt'), 'resourcePacks:["vanilla","fabric"]\nmaxFps:120\n');
    const rp = await import('../electron/services/resourcepacks');
    let packs = await rp.listPacks('pvp');
    expect(packs.map((p) => p.description)).toEqual(['Pack A', 'Pack B']);
    packs = await rp.setEnabledPacks('pvp', ['B.zip', 'A.zip']);
    const options = fs.readFileSync(path.join(instanceDir('pvp'), 'options.txt'), 'utf8');
    // Built-in packs kept first, lowest priority first: A then B (B on top).
    expect(options).toContain('resourcePacks:["vanilla","fabric","file/A.zip","file/B.zip"]');
    expect(options).toContain('maxFps:120');
    expect(packs.filter((p) => p.enabled).map((p) => p.fileName)).toEqual(['B.zip', 'A.zip']);
    expect(fs.readdirSync(path.join(instanceDir('pvp'), 'zenthra', 'options-backups'))).toHaveLength(1);
    await expect(rp.setEnabledPacks('pvp', ['../../escape.zip'])).rejects.toThrow();
  });
});

describe('migration from Amethyst', () => {
  it('brings old settings, profiles and game folder over once', async () => {
    const appData = path.join(root, 'appData');
    const oldCfg = path.join(appData, 'Amethyst Client');
    const oldData = path.join(appData, '.amethyst');
    fs.mkdirSync(path.join(oldData, 'instances', 'pvp', 'config', 'amethyst'), { recursive: true });
    fs.mkdirSync(path.join(oldData, 'instances', 'pvp', 'mods'), { recursive: true });
    fs.writeFileSync(path.join(oldData, 'instances', 'pvp', 'config', 'amethyst', 'amethyst.json'), '{"formatVersion":1,"modules":{}}');
    fs.writeFileSync(path.join(oldData, 'instances', 'pvp', 'mods', 'amethyst-client.jar'), 'old jar');
    fs.mkdirSync(oldCfg, { recursive: true });
    fs.writeFileSync(path.join(oldCfg, 'settings.json'), JSON.stringify({ dataDir: oldData, accentColor: '#22c55e' }));
    fs.writeFileSync(path.join(oldCfg, 'profiles.json'), '[]');

    const { migrateFromAmethyst } = await import('../electron/services/migration');
    await migrateFromAmethyst();
    const newData = path.join(appData, '.zenthra');
    expect(fs.existsSync(newData)).toBe(true);
    expect(fs.existsSync(oldData)).toBe(false);
    const settings = JSON.parse(fs.readFileSync(path.join(userData(), 'settings.json'), 'utf8'));
    expect(settings).toMatchObject({ dataDir: newData, accentColor: '#22c55e' });
    expect(fs.existsSync(path.join(newData, 'instances', 'pvp', 'config', 'zenthra', 'zenthra.json'))).toBe(true);
    expect(fs.existsSync(path.join(newData, 'instances', 'pvp', 'mods', 'amethyst-client.jar'))).toBe(false);
    // Idempotent: a second run changes nothing.
    await migrateFromAmethyst();
    expect(fs.existsSync(newData)).toBe(true);
  });
});
