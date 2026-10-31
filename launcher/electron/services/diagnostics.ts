import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type { DiagnosticsReport, GameTelemetry } from '../../../shared/types';
import { getGameState, getRecentLogs, lastLaunch } from '../minecraft/launch';
import { readJson } from './jsonStore';
import { dataDir, instanceDir } from './paths';
import { getProfile } from './profiles';
import { getSettings } from './settings';
import { unavailableReason } from './zenthraMod';

/** Time from process start to the first window being shown (set by main.ts). */
let launcherStartupMs: number | null = null;
export function recordLauncherStartup(): void {
  launcherStartupMs = Math.round(process.uptime() * 1000);
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 200): string | null => (typeof v === 'string' ? v.slice(0, max) : null);

/** Validates the file written by the mod (shared/zenthra-config.md). Returns null when unusable. */
export function parseTelemetry(raw: unknown, now = Date.now()): GameTelemetry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.formatVersion !== 1) return null;
  const writtenAt = num(o.writtenAt);
  // Older than 10 s: the game is closed or frozen, do not show stale numbers.
  if (writtenAt === null || now - writtenAt > 10_000) return null;
  const fps = num(o.fps);
  const memUsed = num(o.memUsedMb);
  const memMax = num(o.memMaxMb);
  if (fps === null || memUsed === null || memMax === null) return null;
  const mods = Array.isArray(o.mods)
    ? o.mods
        .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
        .map((m) => ({ id: str(m.id, 64) ?? '?', name: str(m.name, 80) ?? '?', version: str(m.version, 40) ?? '?' }))
        .slice(0, 500)
    : [];
  return {
    writtenAt,
    fps,
    fpsAvg: num(o.fpsAvg) ?? fps,
    frameMsAvg: num(o.frameMsAvg),
    frameMsMax: num(o.frameMsMax),
    inWorld: o.inWorld === true,
    memUsedMb: memUsed,
    memAllocatedMb: num(o.memAllocatedMb) ?? memUsed,
    memMaxMb: memMax,
    javaVersion: str(o.javaVersion, 40) ?? '?',
    javaVendor: str(o.javaVendor, 80) ?? '?',
    mcVersion: str(o.mcVersion, 40) ?? '?',
    loader: str(o.loader, 20) ?? '?',
    loaderVersion: str(o.loaderVersion, 40),
    startupMs: num(o.startupMs) !== null && (o.startupMs as number) >= 0 ? (o.startupMs as number) : null,
    renderDistance: num(o.renderDistance),
    gpu: str(o.gpu),
    cpu: str(o.cpu),
    mods,
    modCountTotal: num(o.modCountTotal) ?? mods.length,
  };
}

async function freeDiskMb(dir: string): Promise<number | null> {
  try {
    const s = await fsp.statfs(dir);
    return Math.round((s.bavail * s.bsize) / 1048576);
  } catch {
    return null;
  }
}

export async function getDiagnostics(): Promise<DiagnosticsReport> {
  const settings = await getSettings();
  const game = getGameState();
  const profileId = game.status === 'idle' ? (lastLaunch?.profileId ?? settings.selectedProfileId) : game.profileId;
  const profile = await getProfile(profileId).catch(() => null);

  let telemetry: GameTelemetry | null = null;
  let telemetryNote: string | null = null;
  if (game.status !== 'running') {
    telemetryNote = 'Minecraft n’est pas lancé.';
  } else if (!profile || unavailableReason(profile)) {
    telemetryNote = `Mesures en jeu indisponibles : ${profile ? unavailableReason(profile) : 'profil inconnu.'}`;
  } else {
    telemetry = parseTelemetry(await readJson<unknown>(path.join(instanceDir(profile.id), 'zenthra', 'telemetry.json'), null));
    if (!telemetry) telemetryNote = 'En attente des premières mesures du jeu (le mod les envoie toutes les 2 secondes).';
  }

  const metrics = app.getAppMetrics();
  const logs = getRecentLogs();
  const since = lastLaunch?.spawnedAt ?? 0;
  const gameLines = logs.filter((l) => l.ts >= since && l.stream !== 'launcher');
  const errorLines = gameLines.filter((l) => /\b(ERROR|FATAL)\b|Exception/.test(l.text));

  return {
    generatedAt: new Date().toISOString(),
    launcher: {
      version: app.getVersion(),
      electron: process.versions.electron,
      startupMs: launcherStartupMs,
      // Working set of every launcher process (main, renderer, GPU…), in MB.
      memoryMb: Math.round(metrics.reduce((sum, m) => sum + m.memory.workingSetSize, 0) / 1024),
      uptimeS: Math.round(process.uptime()),
      dataDir: dataDir(),
      freeDiskMb: await freeDiskMb(dataDir()),
    },
    system: {
      os: `${os.type()} ${os.release()}`,
      cpu: os.cpus()[0]?.model.trim() ?? 'inconnu',
      cores: os.cpus().length,
      totalRamMb: Math.round(os.totalmem() / 1048576),
      freeRamMb: Math.round(os.freemem() / 1048576),
    },
    game: {
      state: game.status,
      profile: profile
        ? {
            id: profile.id,
            name: profile.name,
            mcVersion: profile.mcVersion,
            loader: profile.loader,
            memoryMb: profile.memoryMb ?? settings.memoryMb,
            mods: profile.mods.length,
          }
        : null,
      prepareMs: lastLaunch && lastLaunch.profileId === profileId ? lastLaunch.prepareMs : null,
      telemetry,
      telemetryNote,
    },
    logs: {
      errors: errorLines.length,
      warnings: gameLines.filter((l) => /\bWARN\b/.test(l.text)).length,
      lastErrors: errorLines.slice(-5).map((l) => l.text.slice(0, 300)),
    },
  };
}
