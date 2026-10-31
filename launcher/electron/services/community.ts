import crypto from 'node:crypto';
import path from 'node:path';
import type { CommunityOverview, PresenceState, ServerEntry } from '../../../shared/types';
import { getLaunchIdentity } from './auth';
import { toMessage, UserError } from './errors';
import { fetchJson, HttpError, request } from './http';
import { deleteSecret, loadSecret, saveSecret } from './secureStore';
import { readJson, writeJson } from './jsonStore';
import { configDir } from './paths';
import { getSettings } from './settings';
import { getAuthState } from './auth';

// ---- Saved servers (Quick Play) ----

const serversFile = () => path.join(configDir(), 'servers.json');

export async function listServers(): Promise<ServerEntry[]> {
  return readJson<ServerEntry[]>(serversFile(), []);
}

export async function addServer(name: string, address: string): Promise<ServerEntry[]> {
  if (!name.trim() || name.length > 40) throw new UserError('Nom de serveur invalide.');
  if (!/^[\w.\-]+(:\d{1,5})?$/.test(address.trim())) throw new UserError('Adresse invalide (ex. play.exemple.fr ou 1.2.3.4:25565).');
  const list = await listServers();
  list.push({ id: crypto.randomUUID().slice(0, 8), name: name.trim(), address: address.trim() });
  await writeJson(serversFile(), list);
  return list;
}

export async function removeServer(id: string): Promise<ServerEntry[]> {
  const list = (await listServers()).filter((s) => s.id !== id);
  await writeJson(serversFile(), list);
  return list;
}

// ---- Community server (server/community, see docs/COMMUNITY.md) ----

interface CommunitySession {
  server: string;
  uuid: string;
  token: string;
  expiresAt: string;
}

type Person = { uuid: string; name: string };

const cleanPerson = (p: unknown): Person | null => {
  const o = p as Record<string, unknown>;
  return o && typeof o.uuid === 'string' && /^[0-9a-f]{32}$/.test(o.uuid) && typeof o.name === 'string'
    ? { uuid: o.uuid, name: o.name.slice(0, 16) }
    : null;
};

async function serverUrl(): Promise<string | null> {
  const url = (await getSettings()).presenceServerUrl;
  return url ? url.replace(/\/$/, '') : null;
}

/** Logs into the community server with an official Minecraft identity proof. */
async function session(): Promise<CommunitySession> {
  const server = await serverUrl();
  if (!server) throw new UserError('Aucun serveur communautaire configuré.');
  const saved = await loadSecret<CommunitySession>('community');
  const auth = getAuthState();
  if (saved && saved.server === server && Date.parse(saved.expiresAt) > Date.now() && auth.status === 'signed-in' && saved.uuid === auth.account.uuid) {
    return saved;
  }
  const identity = await getLaunchIdentity();
  if (!identity) throw new UserError('Connecte ton compte Microsoft pour utiliser la liste d’amis.');
  const { serverId } = await fetchJson<{ serverId: string }>(`${server}/v1/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: identity.name }),
  });
  if (!/^[0-9a-f]{32}$/.test(serverId)) throw new UserError('Réponse invalide du serveur communautaire.');
  // Official Mojang session endpoint: the access token goes to Mojang only, never to our server.
  const join = await request('https://sessionserver.mojang.com/session/minecraft/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: identity.accessToken, selectedProfile: identity.uuid, serverId }),
  });
  if (join.status !== 204 && join.status !== 200) throw new UserError('Mojang a refusé la vérification d’identité.');
  const res = await fetchJson<{ token: string; uuid: string; expiresAt: string }>(`${server}/v1/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: identity.name }),
  });
  const s: CommunitySession = { server, uuid: res.uuid, token: res.token, expiresAt: res.expiresAt };
  await saveSecret('community', s);
  return s;
}

async function call<T>(method: string, route: string, body?: unknown): Promise<T> {
  const s = await session();
  try {
    return await fetchJson<T>(`${s.server}${route}`, {
      method,
      headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      retries: 1,
      timeoutMs: 8000,
    });
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 401) await deleteSecret('community');
      const msg = (() => {
        try {
          return JSON.parse(err.body).error as string;
        } catch {
          return null;
        }
      })();
      throw new UserError(msg ?? `Le serveur communautaire a répondu ${err.status}.`);
    }
    throw err;
  }
}

export async function getCommunity(): Promise<CommunityOverview> {
  if (!(await serverUrl())) return { status: 'not-configured' };
  if (getAuthState().status !== 'signed-in') return { status: 'signed-out' };
  try {
    const [f, r, b] = await Promise.all([
      call<{ friends: unknown[] }>('GET', '/v1/friends'),
      call<{ incoming: unknown[]; outgoing: unknown[] }>('GET', '/v1/friends/requests'),
      call<{ blocked: unknown[] }>('GET', '/v1/blocks'),
    ]);
    const friends = (f.friends ?? []).flatMap((x) => {
      const p = cleanPerson(x);
      const o = x as { online?: unknown; activity?: unknown };
      return p ? [{ ...p, online: o.online === true, activity: typeof o.activity === 'string' ? o.activity.slice(0, 40) : undefined }] : [];
    });
    const people = (list: unknown[] | undefined) => (list ?? []).flatMap((x) => (cleanPerson(x) ? [cleanPerson(x)!] : []));
    return { status: 'ok', friends, incoming: people(r.incoming), outgoing: people(r.outgoing), blocked: people(b.blocked) };
  } catch (err) {
    return { status: 'error', message: toMessage(err) };
  }
}

/** Short summary used by the home page. */
export async function getPresence(): Promise<PresenceState> {
  const c = await getCommunity();
  if (c.status === 'ok') return { status: 'ok', friends: c.friends };
  if (c.status === 'not-configured') return { status: 'not-configured' };
  return { status: 'error', message: c.status === 'signed-out' ? 'Connecte ton compte pour voir tes amis.' : c.message };
}

export async function sendFriendRequest(name: string): Promise<string> {
  if (!/^\w{1,16}$/.test(name)) throw new UserError('Pseudo Minecraft invalide.');
  const r = await call<{ status: string }>('POST', '/v1/friends/requests', { name });
  return r.status === 'friends' ? 'Vous êtes maintenant amis.' : r.status === 'already-friends' ? 'Vous êtes déjà amis.' : 'Demande envoyée.';
}

const assertUuid = (uuid: string) => {
  if (!/^[0-9a-f]{32}$/.test(uuid)) throw new UserError('Joueur invalide.');
};

export async function answerRequest(uuid: string, accept: boolean): Promise<void> {
  assertUuid(uuid);
  await call('POST', `/v1/friends/requests/${uuid}/${accept ? 'accept' : 'decline'}`, {});
}

export async function removeFriend(uuid: string): Promise<void> {
  assertUuid(uuid);
  await call('DELETE', `/v1/friends/${uuid}`);
}

export async function setBlocked(uuid: string, blocked: boolean): Promise<void> {
  assertUuid(uuid);
  await call(blocked ? 'POST' : 'DELETE', `/v1/blocks/${uuid}`, blocked ? {} : undefined);
}

export async function deleteMyCommunityData(): Promise<void> {
  await call('DELETE', '/v1/me');
  await deleteSecret('community');
}

/**
 * Sends the player's presence. Only shared with friends, and only when the
 * player chose "Apparaître en ligne"; otherwise the server is told to hide it.
 */
export async function publishPresence(activity: string | null): Promise<void> {
  const s = await getSettings();
  if (!s.presenceServerUrl || getAuthState().status !== 'signed-in') return;
  await call('PUT', '/v1/presence', { online: true, visible: s.showOnlineStatus, activity }).catch(() => undefined);
}
