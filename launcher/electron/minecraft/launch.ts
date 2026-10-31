import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { GameState, LogLine } from '../../../shared/types';
import { prepareZenthraMod } from '../services/zenthraMod';
import { getLaunchIdentity, type LaunchIdentity } from '../services/auth';
import { redact, toMessage, UserError } from '../services/errors';
import { cancelledError } from '../services/http';
import { bus, launcherLog, Task } from '../services/events';
import { assetsDir, instanceDir, librariesDir, logsDir, nativesDir } from '../services/paths';
import { getProfile, markPlayed } from '../services/profiles';
import { getSettings } from '../services/settings';
import { installFabric } from './fabric';
import { installForgeLike } from './forge';
import { ensureJavaRuntime } from './java';
import { mergeVersions, rulesAllow, type Argument, type Features, type VersionJson } from './versionJson';
import { clientJarPath, installVanilla, libraryFile, readVersionJson, resolveLibraries } from './versions';

let game: GameState = { status: 'idle' };
let child: ChildProcess | null = null;
const recentLogs: LogLine[] = [];

function setGame(next: GameState): void {
  game = next;
  bus.emit('game', next);
}

export const getGameState = () => game;

/** Timings of the last launch, shown on the diagnostics page. */
export let lastLaunch: { profileId: string; prepareMs: number; spawnedAt: number } | null = null;
export const getRecentLogs = () => recentLogs.slice();

bus.on('log', (line) => {
  recentLogs.push(line);
  if (recentLogs.length > 2000) recentLogs.splice(0, recentLogs.length - 2000);
});

export interface LaunchOptions {
  /** Join this server directly (Quick Play, Minecraft 1.20+). */
  server?: string;
  /** Launch the official demo mode when no Microsoft account is signed in. */
  demo?: boolean;
}

/** Offline UUID the way the vanilla server computes it (used for demo mode only). */
function offlineUuid(name: string): string {
  const h = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  return h.toString('hex');
}

export async function launchProfile(profileId: string, opts: LaunchOptions = {}): Promise<void> {
  if (game.status === 'preparing' || game.status === 'running') throw new UserError('Minecraft est déjà en cours d’exécution.');
  if (opts.server && !/^[\w.\-]+(:\d{1,5})?$/.test(opts.server)) throw new UserError('Adresse de serveur invalide.');

  let identity: LaunchIdentity | null = await getLaunchIdentity();
  if (!identity) {
    if (!opts.demo) throw new UserError('Connecte ton compte Microsoft pour jouer, ou lance le mode démo.');
    identity = { name: 'Player', uuid: offlineUuid('Player'), accessToken: '0', xuid: '0', demo: true };
  }

  setGame({ status: 'preparing', profileId });
  let profile = await getProfile(profileId);
  const task = new Task(`Préparation de ${profile.name}`, true);
  const prepStart = Date.now();
  try {
    const settings = await getSettings();
    const vanilla = await installVanilla(profile.mcVersion, task);
    const java = await ensureJavaRuntime(vanilla.javaVersion?.component ?? 'jre-legacy', task);
    let versionId = profile.mcVersion;
    if (profile.loader === 'fabric') versionId = await installFabric(profile.mcVersion, profile.loaderVersion, task);
    else if (profile.loader === 'forge' || profile.loader === 'neoforge') {
      versionId = await installForgeLike(profile.loader, profile.mcVersion, profile.loaderVersion, java, task);
    }
    await prepareZenthraMod(profile, task);
    profile = await getProfile(profileId);

    const json = versionId === vanilla.id ? vanilla : mergeVersions((await readVersionJson(versionId))!, vanilla);
    const gameDir = instanceDir(profile.id);
    await fsp.mkdir(gameDir, { recursive: true });

    const args = buildArguments(json, vanilla.id, {
      providesGameJar: profile.loader === 'forge' || profile.loader === 'neoforge',
      identity,
      gameDir,
      memoryMb: profile.memoryMb ?? settings.memoryMb,
      extraJvm: `${settings.jvmArgs} ${profile.jvmArgs}`,
      resolution: profile.resolution,
      server: opts.server,
    });

    if (task.cancelled) throw cancelledError();
    task.relabel('Lancement de Minecraft');
    lastLaunch = { profileId: profile.id, prepareMs: Date.now() - prepStart, spawnedAt: Date.now() };
    const logFile = path.join(logsDir(), `${profile.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    await fsp.mkdir(logsDir(), { recursive: true });
    const logStream = fs.createWriteStream(logFile);
    const log = (stream: LogLine['stream'], text: string) => {
      const safe = redact(text);
      logStream.write(`${safe}\n`);
      bus.emit('log', { ts: Date.now(), stream, text: safe });
    };
    log('launcher', `Lancement de ${profile.name} — Minecraft ${profile.mcVersion} (${profile.loader})${identity.demo ? ' — mode démo' : ''}`);
    log('launcher', `Java : ${java}`);

    child = spawn(java, args, { cwd: gameDir, windowsHide: false, env: { ...process.env, ZENTHRA_PROFILE: profile.id } });
    const pid = child.pid ?? 0;
    for (const [stream, src] of [['stdout', child.stdout], ['stderr', child.stderr]] as const) {
      let buf = '';
      src?.on('data', (d: Buffer) => {
        buf += d.toString('utf8');
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? '';
        for (const l of lines) log(stream, l);
      });
    }
    child.on('error', (err) => {
      log('launcher', `Erreur de processus : ${err.message}`);
      setGame({ status: 'crashed', profileId, exitCode: null });
    });
    child.on('exit', (code) => {
      log('launcher', `Minecraft s'est arrêté (code ${code}).`);
      logStream.end();
      child = null;
      setGame(code === 0 || code === null ? { status: 'idle' } : { status: 'crashed', profileId, exitCode: code });
    });

    await markPlayed(profile.id);
    task.done('Minecraft est lancé');
    setGame({ status: 'running', profileId, pid, startedAt: new Date().toISOString() });
  } catch (err) {
    task.fail(toMessage(err));
    launcherLog(`[launch] ${toMessage(err)}`);
    setGame({ status: 'idle' });
    throw err;
  }
}

export function killGame(): void {
  child?.kill();
}

interface ArgContext {
  /** The loader puts its own (patched) Minecraft jar on the classpath. */
  providesGameJar: boolean;
  identity: LaunchIdentity;
  gameDir: string;
  memoryMb: number;
  extraJvm: string;
  resolution: { width: number; height: number } | null;
  server?: string;
}

function splitArgs(s: string): string[] {
  return (s.match(/"[^"]*"|\S+/g) ?? []).map((a) => a.replace(/^"|"$/g, ''));
}

function buildArguments(json: VersionJson, vanillaId: string, ctx: ArgContext): string[] {
  const classpath = resolveLibraries(json.libraries)
    .filter((l) => !l.native)
    .map((l) => libraryFile(l.path));
  // Forge/NeoForge ship their own patched game jar: adding the vanilla one
  // as well makes the Java module system reject the duplicate packages.
  if (!ctx.providesGameJar) classpath.push(clientJarPath(vanillaId));
  const features: Features = {
    is_demo_user: ctx.identity.demo,
    has_custom_resolution: !!ctx.resolution,
    is_quick_play_multiplayer: !!ctx.server,
  };
  const vars: Record<string, string> = {
    auth_player_name: ctx.identity.name,
    version_name: json.id,
    game_directory: ctx.gameDir,
    assets_root: assetsDir(),
    game_assets: path.join(assetsDir(), 'virtual', json.assetIndex?.id ?? 'legacy'),
    assets_index_name: json.assetIndex?.id ?? json.assets ?? 'legacy',
    auth_uuid: ctx.identity.uuid,
    auth_access_token: ctx.identity.accessToken,
    auth_session: ctx.identity.accessToken,
    auth_xuid: ctx.identity.xuid,
    clientid: '',
    user_type: ctx.identity.demo ? 'legacy' : 'msa',
    user_properties: '{}',
    version_type: json.type ?? 'release',
    natives_directory: nativesDir(vanillaId),
    launcher_name: 'zenthra-client',
    launcher_version: '0.1.0',
    classpath: classpath.join(path.delimiter),
    classpath_separator: path.delimiter,
    library_directory: librariesDir(),
    resolution_width: String(ctx.resolution?.width ?? 854),
    resolution_height: String(ctx.resolution?.height ?? 480),
    quick_play_multiplayer: ctx.server ?? '',
  };
  const sub = (s: string) => s.replace(/\$\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  const expand = (list: Argument[]) =>
    list.flatMap((a) => {
      if (typeof a === 'string') return [sub(a)];
      if (!rulesAllow(a.rules, features)) return [];
      return (Array.isArray(a.value) ? a.value : [a.value]).map(sub);
    });

  const jvm: string[] = [`-Xmx${ctx.memoryMb}M`, `-Xms${Math.min(1024, ctx.memoryMb)}M`, '-Dzenthra.launcher=true'];
  if (json.arguments?.jvm?.length) {
    jvm.push(...expand(json.arguments.jvm));
  } else {
    jvm.push(`-Djava.library.path=${vars.natives_directory}`, '-cp', vars.classpath);
  }
  jvm.push(...splitArgs(ctx.extraJvm));

  const gameArgs = json.arguments?.game?.length ? expand(json.arguments.game) : splitArgs(json.minecraftArguments ?? '').map(sub);
  if (ctx.identity.demo && !gameArgs.includes('--demo')) gameArgs.push('--demo');
  if (ctx.server && !json.arguments?.game?.length) {
    const [host, port = '25565'] = ctx.server.split(':');
    gameArgs.push('--server', host, '--port', port);
  }
  return [...jvm, json.mainClass, ...gameArgs];
}
