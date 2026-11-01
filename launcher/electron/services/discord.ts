import net from 'node:net';
import type { GameState } from '../../../shared/types';
import { getProfile } from './profiles';
import { getSettings } from './settings';

/**
 * Discord Rich Presence ("Joue à Zenthra Client"). Talks only to the Discord app
 * running on this PC through its local pipe (\\.\pipe\discord-ipc-N): nothing goes
 * through the Internet from here. The application ID is public (it only tells
 * Discord which name and logo to show). Shows the Minecraft version and loader,
 * never account names. Disabled in Settings → Confidentialité.
 */
export const DISCORD_APP_ID = '1566514775276388432';
const LOGO_URL = 'https://raw.githubusercontent.com/Ryu-95-dev/Zenthra-Client/main/launcher/build/icon-1024.png';

let socket: net.Socket | null = null;
let ready = false;
let connecting = false;
let current: Record<string, unknown> | null = null;
let launcherSince = Math.floor(Date.now() / 1000);

function frame(op: number, payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(json.length, 4);
  return Buffer.concat([header, json]);
}

function tryPipe(i: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s = net.createConnection(`\\\\?\\pipe\\discord-ipc-${i}`);
    s.once('connect', () => resolve(s));
    s.once('error', reject);
  });
}

async function connect(): Promise<void> {
  if (socket || connecting) return;
  connecting = true;
  try {
    for (let i = 0; i < 10; i++) {
      try {
        const s = await tryPipe(i);
        socket = s;
        s.on('data', (d: Buffer) => {
          // Op 1 frames are replies; the first one after the handshake is READY.
          if (d.length >= 8 && d.readInt32LE(0) === 1 && !ready) {
            ready = true;
            void push();
          }
        });
        const reset = () => {
          socket = null;
          ready = false;
        };
        s.on('close', reset);
        s.on('error', reset);
        s.write(frame(0, { v: 1, client_id: DISCORD_APP_ID }));
        return;
      } catch {
        // Next pipe number; Discord may not be running at all.
      }
    }
  } finally {
    connecting = false;
  }
}

async function push(): Promise<void> {
  if (!socket || !ready) return;
  socket.write(frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: current ?? undefined }, nonce: String(Date.now()) }));
}

/** Updates the activity from the launcher / game state. */
export async function updateDiscord(game: GameState): Promise<void> {
  const settings = await getSettings();
  if (!settings.discordPresence) {
    current = null;
    if (socket) {
      await push();
      socket.destroy();
      socket = null;
      ready = false;
    }
    return;
  }
  const assets = { large_image: LOGO_URL, large_text: 'Zenthra Client' };
  if (game.status === 'running') {
    const profile = await getProfile(game.profileId).catch(() => null);
    const loader = profile ? profile.loader.charAt(0).toUpperCase() + profile.loader.slice(1) : '';
    current = {
      details: profile ? `Minecraft ${profile.mcVersion}` : 'Minecraft',
      state: profile?.zenthraMod ? `${loader} · modules Zenthra` : loader || undefined,
      timestamps: { start: Math.floor(new Date(game.startedAt).getTime() / 1000) },
      assets,
    };
  } else {
    if (current?.details !== 'Dans le launcher') launcherSince = Math.floor(Date.now() / 1000);
    current = { details: 'Dans le launcher', timestamps: { start: launcherSince }, assets };
  }
  await connect();
  await push();
}
