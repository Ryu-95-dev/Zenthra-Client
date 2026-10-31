// Zenthra community server: friends, friend requests, blocks and opt-in presence.
// Node.js built-ins only. Data is kept in a JSON file. Run behind an HTTPS
// reverse proxy in production (the launcher refuses plain HTTP except 127.0.0.1).
//
//   node server/community/server.mjs            (PORT, DATA_FILE env vars)
//
// Identity: the launcher calls Mojang's official session "join" endpoint with
// a random serverId we hand out; we then ask Mojang ("hasJoined") who joined.
// The player's Minecraft access token never reaches this server.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const MAX_BODY = 8 * 1024;
const SESSION_DAYS = 30;
const ONLINE_WINDOW_MS = 2 * 60_000;
const RATE_LIMIT = 120; // requests per minute and IP

/** Default identity check against Mojang's session server. */
async function mojangHasJoined(name, serverId) {
  const url = `https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(name)}&serverId=${encodeURIComponent(serverId)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (res.status !== 200) return null;
  const p = await res.json();
  return typeof p?.id === 'string' && typeof p?.name === 'string' ? { uuid: p.id, name: p.name } : null;
}

const emptyState = () => ({ users: {}, friends: [], requests: [], blocks: {}, sessions: {} });
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const NAME_RE = /^\w{1,16}$/;
const UUID_RE = /^[0-9a-f]{32}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createCommunityServer({ dataFile, verify = mojangHasJoined, now = () => Date.now() } = {}) {
  let state = emptyState();
  if (dataFile && fs.existsSync(dataFile)) state = { ...emptyState(), ...JSON.parse(fs.readFileSync(dataFile, 'utf8')) };
  const challenges = new Map(); // name(lowercase) -> { serverId, expires }
  const hits = new Map(); // ip -> { count, reset }
  let saveTimer = null;

  const save = () => {
    if (!dataFile || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      fs.mkdirSync(path.dirname(dataFile), { recursive: true });
      fs.writeFileSync(`${dataFile}.tmp`, JSON.stringify(state));
      fs.renameSync(`${dataFile}.tmp`, dataFile);
    }, 200);
  };

  const isBlocked = (a, b) => (state.blocks[a] ?? []).includes(b) || (state.blocks[b] ?? []).includes(a);
  const areFriends = (a, b) => state.friends.includes(pairKey(a, b));
  const publicUser = (uuid) => ({ uuid, name: state.users[uuid]?.name ?? '?' });
  const userByName = (name) => Object.entries(state.users).find(([, u]) => u.name.toLowerCase() === String(name).toLowerCase())?.[0];

  function authenticate(req) {
    const m = /^Bearer ([\w-]{20,})$/.exec(req.headers.authorization ?? '');
    const s = m && state.sessions[sha256(m[1])];
    if (!s || s.expires < now()) throw new HttpError(401, 'Session expirée, reconnecte-toi.');
    return s.uuid;
  }

  const routes = [
    ['POST', /^\/v1\/auth\/challenge$/, async (_req, body) => {
      if (!NAME_RE.test(body.name ?? '')) throw new HttpError(400, 'Pseudo invalide.');
      const serverId = crypto.randomBytes(16).toString('hex');
      challenges.set(body.name.toLowerCase(), { serverId, expires: now() + 120_000 });
      return { serverId };
    }],
    ['POST', /^\/v1\/auth\/verify$/, async (_req, body) => {
      const c = challenges.get(String(body.name ?? '').toLowerCase());
      if (!c || c.expires < now()) throw new HttpError(400, 'Défi expiré, recommence.');
      challenges.delete(body.name.toLowerCase());
      const who = await verify(body.name, c.serverId);
      if (!who || !UUID_RE.test(who.uuid)) throw new HttpError(403, 'Identité Minecraft non vérifiée.');
      state.users[who.uuid] = { visible: false, online: false, activity: null, lastSeen: 0, ...state.users[who.uuid], name: who.name };
      const token = crypto.randomBytes(32).toString('base64url');
      const expires = now() + SESSION_DAYS * 86_400_000;
      state.sessions[sha256(token)] = { uuid: who.uuid, expires };
      save();
      return { token, uuid: who.uuid, name: who.name, expiresAt: new Date(expires).toISOString() };
    }],
    ['PUT', /^\/v1\/presence$/, async (req, body) => {
      const me = authenticate(req);
      const u = state.users[me];
      u.visible = body.visible === true;
      u.online = body.online === true;
      u.activity = typeof body.activity === 'string' ? body.activity.slice(0, 40) : null;
      u.lastSeen = now();
      save();
      return { ok: true };
    }],
    ['GET', /^\/v1\/friends$/, async (req) => {
      const me = authenticate(req);
      const friends = state.friends
        .filter((k) => k.split('|').includes(me))
        .map((k) => k.split('|').find((x) => x !== me))
        .map((uuid) => {
          const u = state.users[uuid] ?? {};
          // Presence is only shared by players who chose to appear online.
          const online = !!(u.visible && u.online && now() - (u.lastSeen ?? 0) < ONLINE_WINDOW_MS);
          return { ...publicUser(uuid), online, activity: online ? u.activity : null };
        });
      return { friends };
    }],
    ['GET', /^\/v1\/friends\/requests$/, async (req) => {
      const me = authenticate(req);
      return {
        incoming: state.requests.filter((r) => r.to === me).map((r) => ({ ...publicUser(r.from), at: r.at })),
        outgoing: state.requests.filter((r) => r.from === me).map((r) => ({ ...publicUser(r.to), at: r.at })),
      };
    }],
    ['POST', /^\/v1\/friends\/requests$/, async (req, body) => {
      const me = authenticate(req);
      const target = userByName(body.name);
      // Same answer for unknown and blocking players: no account enumeration.
      if (!target || target === me || isBlocked(me, target)) throw new HttpError(404, 'Joueur introuvable sur Zenthra.');
      if (areFriends(me, target)) return { status: 'already-friends' };
      const reverse = state.requests.findIndex((r) => r.from === target && r.to === me);
      if (reverse >= 0) {
        state.requests.splice(reverse, 1);
        state.friends.push(pairKey(me, target));
        save();
        return { status: 'friends' };
      }
      if (!state.requests.some((r) => r.from === me && r.to === target)) {
        if (state.requests.filter((r) => r.from === me).length >= 50) throw new HttpError(429, 'Trop de demandes en attente.');
        state.requests.push({ from: me, to: target, at: new Date(now()).toISOString() });
        save();
      }
      return { status: 'sent' };
    }],
    ['POST', /^\/v1\/friends\/requests\/([0-9a-f]{32})\/(accept|decline)$/, async (req, _body, [, from, action]) => {
      const me = authenticate(req);
      const i = state.requests.findIndex((r) => r.from === from && r.to === me);
      if (i < 0) throw new HttpError(404, 'Demande introuvable.');
      state.requests.splice(i, 1);
      if (action === 'accept' && !areFriends(me, from)) state.friends.push(pairKey(me, from));
      save();
      return { ok: true };
    }],
    ['DELETE', /^\/v1\/friends\/([0-9a-f]{32})$/, async (req, _body, [, other]) => {
      const me = authenticate(req);
      state.friends = state.friends.filter((k) => k !== pairKey(me, other));
      save();
      return { ok: true };
    }],
    ['GET', /^\/v1\/blocks$/, async (req) => {
      const me = authenticate(req);
      return { blocked: (state.blocks[me] ?? []).map(publicUser) };
    }],
    ['POST', /^\/v1\/blocks\/([0-9a-f]{32})$/, async (req, _body, [, other]) => {
      const me = authenticate(req);
      state.blocks[me] = [...new Set([...(state.blocks[me] ?? []), other])];
      state.friends = state.friends.filter((k) => k !== pairKey(me, other));
      state.requests = state.requests.filter((r) => !(r.from === other && r.to === me) && !(r.from === me && r.to === other));
      save();
      return { ok: true };
    }],
    ['DELETE', /^\/v1\/blocks\/([0-9a-f]{32})$/, async (req, _body, [, other]) => {
      const me = authenticate(req);
      state.blocks[me] = (state.blocks[me] ?? []).filter((x) => x !== other);
      save();
      return { ok: true };
    }],
    ['DELETE', /^\/v1\/me$/, async (req) => {
      // Right to erasure: every trace of the player is removed.
      const me = authenticate(req);
      delete state.users[me];
      delete state.blocks[me];
      for (const k of Object.keys(state.blocks)) state.blocks[k] = state.blocks[k].filter((x) => x !== me);
      state.friends = state.friends.filter((k) => !k.split('|').includes(me));
      state.requests = state.requests.filter((r) => r.from !== me && r.to !== me);
      for (const [h, s] of Object.entries(state.sessions)) if (s.uuid === me) delete state.sessions[h];
      save();
      return { ok: true };
    }],
  ];

  const server = http.createServer(async (req, res) => {
    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(payload));
    };
    try {
      const ip = req.socket.remoteAddress ?? '?';
      const h = hits.get(ip);
      if (!h || h.reset < now()) hits.set(ip, { count: 1, reset: now() + 60_000 });
      else if (++h.count > RATE_LIMIT) throw new HttpError(429, 'Trop de requêtes, réessaie dans une minute.');

      const url = new URL(req.url ?? '/', 'http://localhost');
      const route = routes.find(([m, re]) => m === req.method && re.test(url.pathname));
      if (!route) throw new HttpError(404, 'Route inconnue.');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > MAX_BODY) throw new HttpError(413, 'Requête trop volumineuse.');
      }
      let body = {};
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          throw new HttpError(400, 'JSON invalide.');
        }
      }
      send(200, await route[2](req, body, route[1].exec(url.pathname)));
    } catch (err) {
      if (err instanceof HttpError) send(err.status, { error: err.message });
      else {
        console.error(err);
        send(500, { error: 'Erreur interne.' });
      }
    }
  });
  return server;
}

// Started directly (not imported by tests).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const port = Number(process.env.PORT ?? 8787);
  const dataFile = process.env.DATA_FILE ?? path.join(process.cwd(), 'zenthra-community.json');
  createCommunityServer({ dataFile }).listen(port, () => console.log(`Zenthra community server sur le port ${port} (données : ${dataFile})`));
}
