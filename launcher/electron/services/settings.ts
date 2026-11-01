import os from 'node:os';
import path from 'node:path';
import { HOME_BLOCK_IDS, type Settings } from '../../../shared/types';
import { readJson, writeJson } from './jsonStore';
import { configDir, defaultDataDir, setDataDir } from './paths';

const file = () => path.join(configDir(), 'settings.json');

/** Suggested default heap: a quarter of RAM, clamped to 2–6 GB. */
function defaultMemory(): number {
  const quarter = Math.floor(os.totalmem() / 1024 / 1024 / 4);
  return Math.max(2048, Math.min(6144, Math.round(quarter / 512) * 512));
}

export function defaultSettings(): Settings {
  return {
    accentColor: '#8b5cf6',
    backgroundOpacity: 0.6,
    sakuraBackground: true,
    animations: true,
    uiSounds: false,
    uiVolume: 0.5,
    dataDir: defaultDataDir(),
    memoryMb: defaultMemory(),
    jvmArgs: '',
    afterLaunch: 'minimize',
    language: 'fr',
    showOnlineStatus: false,
    discordPresence: true,
    presenceServerUrl: '',
    msClientId: process.env.ZENTHRA_MS_CLIENT_ID ?? '',
    selectedProfileId: 'pvp',
    downloadConcurrency: 8,
    updateUrl: process.env.ZENTHRA_UPDATE_URL ?? '',
    homeLayout: null,
    panelModules: null,
  };
}

let cache: Settings | null = null;

export async function getSettings(): Promise<Settings> {
  if (!cache) {
    const stored = await readJson<Partial<Settings>>(file(), {});
    cache = { ...defaultSettings(), ...stored };
    // The environment variable wins when the user has not entered an ID.
    if (!cache.msClientId && process.env.ZENTHRA_MS_CLIENT_ID) cache.msClientId = process.env.ZENTHRA_MS_CLIENT_ID;
    setDataDir(cache.dataDir);
  }
  return cache;
}

/** Number of parallel downloads chosen by the user. */
export async function downloadConcurrency(): Promise<number> {
  return (await getSettings()).downloadConcurrency;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, ...sanitize(patch) };
  cache = next;
  setDataDir(next.dataDir);
  await writeJson(file(), next);
  return next;
}

export async function resetSettings(): Promise<Settings> {
  const keep = await getSettings();
  // Keep the selected profile and data directory so the user does not "lose" their games.
  cache = { ...defaultSettings(), selectedProfileId: keep.selectedProfileId, dataDir: keep.dataDir };
  await writeJson(file(), cache);
  return cache;
}

function sanitize(patch: Partial<Settings>): Partial<Settings> {
  const out: Partial<Settings> = { ...patch };
  if (out.accentColor !== undefined && !/^#[0-9a-f]{6}$/i.test(out.accentColor)) delete out.accentColor;
  if (out.backgroundOpacity !== undefined) out.backgroundOpacity = clamp(out.backgroundOpacity, 0, 1);
  if (out.uiVolume !== undefined) out.uiVolume = clamp(out.uiVolume, 0, 1);
  if (out.memoryMb !== undefined) out.memoryMb = clamp(Math.round(out.memoryMb), 1024, 32768);
  if (out.dataDir !== undefined && !path.isAbsolute(out.dataDir)) delete out.dataDir;
  // HTTPS only (plain HTTP is accepted for a server running on this computer, for testing).
  if (out.presenceServerUrl && !/^(https:\/\/|http:\/\/127\.0\.0\.1[:/])\S+$/.test(out.presenceServerUrl)) out.presenceServerUrl = '';
  if (out.updateUrl !== undefined) out.updateUrl = /^https:\/\/\S+$/.test(out.updateUrl.trim()) ? out.updateUrl.trim() : '';
  if (out.msClientId !== undefined) out.msClientId = out.msClientId.trim();
  if (out.downloadConcurrency !== undefined) out.downloadConcurrency = Math.round(clamp(out.downloadConcurrency, 1, 16));
  if (out.homeLayout !== undefined && out.homeLayout !== null) {
    if (!Array.isArray(out.homeLayout)) delete out.homeLayout;
    else {
      const seen = new Set<string>();
      out.homeLayout = out.homeLayout
        .filter((b) => b && HOME_BLOCK_IDS.includes(b.id) && !seen.has(b.id) && seen.add(b.id))
        .map((b) => ({ id: b.id, w: Math.round(clamp(b.w, 3, 12)), h: Math.round(clamp(b.h, 2, 24)), hidden: !!b.hidden }));
    }
  }
  if (out.panelModules !== undefined && out.panelModules !== null) {
    if (!Array.isArray(out.panelModules)) delete out.panelModules;
    else out.panelModules = [...new Set(out.panelModules.filter((m) => typeof m === 'string' && /^[a-z_]{1,40}$/.test(m)))].slice(0, 50);
  }
  return out;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min));
