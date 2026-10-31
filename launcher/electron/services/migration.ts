import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { readJson, writeJson } from './jsonStore';
import { defaultDataDir } from './paths';
import { LEGACY_MOD_FILE } from './zenthraMod';

// The launcher was called "Amethyst Client" before being renamed to Zenthra.
// This one-time migration brings the user's data over so nothing is lost or
// downloaded again. Every step is idempotent and checks what exists first.

const LEGACY_CONFIG_DIR = 'Amethyst Client';
const LEGACY_DATA_DIR = '.amethyst';
const CONFIG_FILES = ['settings.json', 'profiles.json', 'servers.json', 'session.bin'];

export async function migrateFromAmethyst(): Promise<void> {
  const appData = app.getPath('appData');
  const configDir = app.getPath('userData');
  const legacyConfig = path.join(appData, LEGACY_CONFIG_DIR);

  // 1. Launcher files (settings, profiles, servers, encrypted session).
  //    Electron creates the new folder itself at startup, so check the files.
  const alreadyMigrated = fs.existsSync(path.join(configDir, 'settings.json')) || fs.existsSync(path.join(configDir, 'profiles.json'));
  if (!alreadyMigrated && fs.existsSync(legacyConfig)) {
    await fsp.mkdir(configDir, { recursive: true });
    for (const f of CONFIG_FILES) {
      const from = path.join(legacyConfig, f);
      if (fs.existsSync(from)) await fsp.copyFile(from, path.join(configDir, f));
    }
    console.log('[migration] Paramètres et profils Amethyst repris.');
  }

  // 2. Game data folder (.amethyst → .zenthra), when the default location was used.
  const settingsFile = path.join(configDir, 'settings.json');
  const settings = await readJson<{ dataDir?: string } | null>(settingsFile, null);
  const legacyData = path.join(appData, LEGACY_DATA_DIR);
  const newData = defaultDataDir();
  const usesLegacyDefault = !settings?.dataDir || path.resolve(settings.dataDir) === path.resolve(legacyData);
  let dataDir = settings?.dataDir ?? newData;
  if (usesLegacyDefault && fs.existsSync(legacyData)) {
    if (!fs.existsSync(newData)) {
      try {
        await fsp.rename(legacyData, newData);
        dataDir = newData;
        console.log('[migration] Dossier de jeu .amethyst renommé en .zenthra.');
      } catch (err) {
        // A file may be locked (game still open): keep using the old folder rather than lose anything.
        dataDir = legacyData;
        console.warn('[migration] Impossible de renommer .amethyst, il reste utilisé :', (err as Error).message);
      }
    } else {
      dataDir = newData;
    }
    if (settings && settings.dataDir !== dataDir) await writeJson(settingsFile, { ...settings, dataDir });
  }

  // 3. Per-profile mod configuration and the old mod jar.
  const instances = path.join(dataDir, 'instances');
  if (!fs.existsSync(instances)) return;
  for (const id of await fsp.readdir(instances)) {
    const oldCfg = path.join(instances, id, 'config', 'amethyst', 'amethyst.json');
    const newCfg = path.join(instances, id, 'config', 'zenthra', 'zenthra.json');
    if (fs.existsSync(oldCfg) && !fs.existsSync(newCfg)) {
      await fsp.mkdir(path.dirname(newCfg), { recursive: true });
      await fsp.copyFile(oldCfg, newCfg);
    }
    // Remove the old folder once its content lives under config/zenthra.
    if (fs.existsSync(newCfg) || !fs.existsSync(oldCfg)) {
      await fsp.rm(path.dirname(oldCfg), { recursive: true, force: true });
    }
    await fsp.rm(path.join(instances, id, 'mods', LEGACY_MOD_FILE), { force: true });
  }
}
