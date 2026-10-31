import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { shell } from 'electron';
import type { Account, AuthState } from '../../../shared/types';
import { redact, toMessage, UserError } from './errors';
import { bus, launcherLog } from './events';
import { request } from './http';
import { deleteSecret, loadSecret, saveSecret } from './secureStore';
import { getSettings } from './settings';

// Microsoft identity platform (consumer accounts) — Authorization Code + PKCE,
// public client: no client secret is used or stored anywhere.
const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPE = 'XboxLive.signin offline_access';

interface Session {
  msRefreshToken: string;
  mcAccessToken: string;
  mcExpiresAt: number;
  xuid: string;
  profile: { uuid: string; name: string; skinUrl: string | null };
}

export interface LaunchIdentity {
  name: string;
  uuid: string;
  accessToken: string;
  xuid: string;
  demo: boolean;
}

let session: Session | null = null;
let state: AuthState = { status: 'signed-out', configured: false };
let pendingServer: http.Server[] = [];

function setState(next: AuthState): void {
  state = next;
  bus.emit('auth', next);
}

function toAccount(s: Session): Account {
  return { uuid: s.profile.uuid, name: s.profile.name, skinUrl: s.profile.skinUrl, expiresAt: new Date(s.mcExpiresAt).toISOString() };
}

async function clientId(): Promise<string> {
  return (await getSettings()).msClientId;
}

export async function initAuth(): Promise<AuthState> {
  const configured = !!(await clientId());
  session = await loadSecret<Session>('session');
  setState(session ? { status: 'signed-in', account: toAccount(session) } : { status: 'signed-out', configured });
  return state;
}

export function getAuthState(): AuthState {
  return state;
}

export async function refreshConfiguredFlag(): Promise<void> {
  if (state.status === 'signed-out' || state.status === 'error') {
    setState({ ...state, configured: !!(await clientId()) } as AuthState);
  }
}

// ---------- Interactive sign-in ----------

export async function signIn(): Promise<AuthState> {
  const id = await clientId();
  if (!id) {
    setState({
      status: 'error',
      configured: false,
      message: "Aucun identifiant d'application Microsoft (Azure) n'est configuré. Voir Paramètres → Compte et docs/MICROSOFT_AUTH.md.",
    });
    return state;
  }
  cancelPendingSignIn();
  setState({ status: 'signing-in' });
  try {
    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    const expectedState = base64url(crypto.randomBytes(16));
    const { port, codePromise } = await startLoopback(expectedState);
    const redirectUri = `http://localhost:${port}`;

    const url = new URL(`${AUTHORITY}/authorize`);
    url.search = new URLSearchParams({
      client_id: id,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: SCOPE,
      state: expectedState,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    // The official Microsoft page opens in the user's default browser:
    // the launcher never sees the password.
    await shell.openExternal(url.toString());

    const code = await codePromise;
    const tokens = await msToken(id, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    session = await minecraftLogin(tokens.access_token, tokens.refresh_token);
    await saveSecret('session', session);
    setState({ status: 'signed-in', account: toAccount(session) });
  } catch (err) {
    launcherLog(`[auth] Échec de connexion : ${toMessage(err)}`);
    setState({ status: 'error', configured: true, message: toMessage(err) });
  } finally {
    cancelPendingSignIn();
  }
  return state;
}

export function cancelPendingSignIn(): void {
  for (const s of pendingServer) s.close();
  pendingServer = [];
}

/** Local loopback HTTP server receiving the OAuth redirect (RFC 8252). */
async function startLoopback(expectedState: string): Promise<{ port: number; codePromise: Promise<string> }> {
  let resolveCode!: (c: string) => void;
  let rejectCode!: (e: Error) => void;
  const codePromise = new Promise<string>((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });

  const handler: http.RequestListener = (req, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost');
    if (u.pathname !== '/') {
      res.writeHead(404).end();
      return;
    }
    const error = u.searchParams.get('error');
    const code = u.searchParams.get('code');
    const ok = !error && code && u.searchParams.get('state') === expectedState;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>Zenthra Client</title><body style="background:#0e0e12;color:#e7e5ee;font-family:Segoe UI,sans-serif;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>${
        ok ? 'Connexion réussie' : 'Connexion annulée'
      }</h2><p style="color:#9a97a8">Tu peux fermer cet onglet et revenir dans Zenthra Client.</p></div>`,
    );
    if (ok) resolveCode(code!);
    else if (error) rejectCode(new UserError(error === 'access_denied' ? 'Connexion annulée.' : `Microsoft a refusé la connexion (${error}).`));
    else rejectCode(new UserError('Réponse de connexion invalide (state incorrect).'));
  };

  // Listen on both loopback addresses: browsers may resolve "localhost" to either.
  const v4 = http.createServer(handler);
  await new Promise<void>((r, j) => v4.once('error', j).listen(0, '127.0.0.1', () => r()));
  const port = (v4.address() as AddressInfo).port;
  pendingServer.push(v4);
  const v6 = http.createServer(handler);
  await new Promise<void>((r) => v6.once('error', () => r()).listen(port, '::1', () => r()));
  pendingServer.push(v6);

  const timeout = setTimeout(() => rejectCode(new UserError('Délai de connexion dépassé (5 minutes).')), 5 * 60_000);
  codePromise.finally(() => clearTimeout(timeout)).catch(() => undefined);
  return { port, codePromise };
}

// ---------- Token chain: Microsoft → Xbox Live → XSTS → Minecraft ----------

async function msToken(client: string, params: Record<string, string>): Promise<{ access_token: string; refresh_token: string }> {
  const res = await request(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: client, scope: SCOPE, ...params }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok || typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') {
    if (body.error === 'invalid_grant') throw new UserError('Session Microsoft expirée. Reconnecte-toi.');
    throw new UserError(`Microsoft a refusé la demande de jeton (${body.error ?? res.status}).`, redact(JSON.stringify(body)));
  }
  return { access_token: body.access_token, refresh_token: body.refresh_token };
}

async function postJson<T>(url: string, payload: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: T }> {
  const res = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

const XSTS_ERRORS: Record<string, string> = {
  '2148916233': "Ce compte Microsoft n'a pas de profil Xbox. Crée-en un sur xbox.com puis réessaie.",
  '2148916235': "Xbox Live n'est pas disponible dans le pays de ce compte.",
  '2148916236': 'Ce compte nécessite une vérification d’âge sur xbox.com.',
  '2148916237': 'Ce compte nécessite une vérification d’âge sur xbox.com.',
  '2148916238': "Compte enfant : il doit être ajouté à une famille Microsoft par un adulte.",
};

async function minecraftLogin(msAccessToken: string, msRefreshToken: string): Promise<Session> {
  const xbl = await postJson<{ Token?: string; DisplayClaims?: { xui: { uhs: string }[] } }>(
    'https://user.auth.xboxlive.com/user/authenticate',
    { Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' },
  );
  if (xbl.status !== 200 || !xbl.body.Token) throw new UserError(`Authentification Xbox Live refusée (${xbl.status}).`);
  const uhs = xbl.body.DisplayClaims?.xui?.[0]?.uhs;

  const xsts = await postJson<{ Token?: string; XErr?: number; DisplayClaims?: { xui: { uhs: string; xid?: string }[] } }>(
    'https://xsts.auth.xboxlive.com/xsts/authorize',
    { Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.body.Token] }, RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT' },
  );
  if (xsts.status !== 200 || !xsts.body.Token) {
    const code = String(xsts.body.XErr ?? '');
    throw new UserError(XSTS_ERRORS[code] ?? `Autorisation Xbox refusée (${code || xsts.status}).`);
  }
  const xui = xsts.body.DisplayClaims?.xui?.[0];
  if (!uhs || !xui) throw new UserError('Réponse Xbox Live incomplète.');

  const mc = await postJson<{ access_token?: string; expires_in?: number }>(
    'https://api.minecraftservices.com/authentication/login_with_xbox',
    { identityToken: `XBL3.0 x=${uhs};${xsts.body.Token}` },
  );
  if (mc.status === 403) {
    throw new UserError(
      "Les services Minecraft ont refusé cette application. L'identifiant Azure doit être approuvé par Mojang pour l'API Minecraft (voir docs/MICROSOFT_AUTH.md).",
    );
  }
  if (mc.status !== 200 || !mc.body.access_token) throw new UserError(`Connexion aux services Minecraft refusée (${mc.status}).`);
  const auth = { Authorization: `Bearer ${mc.body.access_token}` };

  const ent = await request('https://api.minecraftservices.com/entitlements/mcstore', { headers: auth });
  const entBody = (await ent.json().catch(() => ({}))) as { items?: { name: string }[] };
  const owns = entBody.items?.some((i) => i.name === 'game_minecraft' || i.name === 'product_minecraft');

  const prof = await request('https://api.minecraftservices.com/minecraft/profile', { headers: auth });
  if (prof.status === 404 || !owns) {
    throw new UserError("Ce compte ne possède pas Minecraft: Java Edition (ou n'a pas encore créé de profil).");
  }
  if (!prof.ok) throw new UserError(`Profil Minecraft indisponible (${prof.status}).`);
  const p = (await prof.json()) as { id: string; name: string; skins?: { state: string; url: string }[] };
  if (!/^[0-9a-f]{32}$/i.test(p.id) || !/^\w{1,16}$/.test(p.name)) throw new UserError('Profil Minecraft invalide.');
  const skin = p.skins?.find((s) => s.state === 'ACTIVE')?.url ?? null;

  return {
    msRefreshToken,
    mcAccessToken: mc.body.access_token,
    mcExpiresAt: Date.now() + (mc.body.expires_in ?? 86_400) * 1000,
    xuid: xui.xid ?? '',
    profile: { uuid: p.id, name: p.name, skinUrl: skin && skin.startsWith('https://textures.minecraft.net/') ? skin : null },
  };
}

/** Returns a valid identity for launching, refreshing tokens if needed. */
export async function getLaunchIdentity(): Promise<LaunchIdentity | null> {
  if (!session) return null;
  if (session.mcExpiresAt - Date.now() < 5 * 60_000) {
    const id = await clientId();
    if (!id) throw new UserError("Identifiant d'application Microsoft manquant : impossible de renouveler la session.");
    try {
      const tokens = await msToken(id, { grant_type: 'refresh_token', refresh_token: session.msRefreshToken });
      session = await minecraftLogin(tokens.access_token, tokens.refresh_token);
      await saveSecret('session', session);
      setState({ status: 'signed-in', account: toAccount(session) });
    } catch (err) {
      await signOut();
      setState({ status: 'error', configured: true, message: `Session expirée : ${toMessage(err)}` });
      throw new UserError('Ta session Minecraft a expiré. Reconnecte-toi.');
    }
  }
  return { name: session.profile.name, uuid: session.profile.uuid, accessToken: session.mcAccessToken, xuid: session.xuid, demo: false };
}

export async function signOut(): Promise<AuthState> {
  session = null;
  await deleteSecret('session');
  setState({ status: 'signed-out', configured: !!(await clientId()) });
  return state;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
