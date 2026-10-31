import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { UserError } from '../services/errors';
import { launcherLog, Task } from '../services/events';
import { cancelledError, download, request } from '../services/http';
import { cacheDir, dataDir, versionsDir } from '../services/paths';
import { readVersionJson, installLibraries } from './versions';

// Forge and NeoForge are installed with their official installers in headless
// mode (--installClient). The installers write into our data directory, which
// uses the same layout as the official launcher (versions/, libraries/).

type ForgeLike = 'forge' | 'neoforge';

const REPOS: Record<ForgeLike, { metadata: string; installer: (v: string) => string; host: string }> = {
  forge: {
    metadata: 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml',
    installer: (v) => `https://maven.minecraftforge.net/net/minecraftforge/forge/${v}/forge-${v}-installer.jar`,
    host: 'maven.minecraftforge.net',
  },
  neoforge: {
    metadata: 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml',
    installer: (v) => `https://maven.neoforged.net/releases/net/neoforged/neoforge/${v}/neoforge-${v}-installer.jar`,
    host: 'maven.neoforged.net',
  },
};

const metadataCache = new Map<ForgeLike, { at: number; versions: string[] }>();

async function allVersions(loader: ForgeLike): Promise<string[]> {
  const cached = metadataCache.get(loader);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.versions;
  const res = await request(REPOS[loader].metadata);
  if (!res.ok) throw new UserError(`Liste des versions ${loader} indisponible (${res.status}).`);
  const xml = await res.text();
  const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
  metadataCache.set(loader, { at: Date.now(), versions });
  return versions;
}

/** NeoForge numbers its builds after the Minecraft version: 1.21.1 → 21.1.x, 1.21 → 21.0.x. */
function neoforgePrefix(mc: string): string {
  if (!mc.startsWith('1.')) return `${mc}.`;
  const [minor, patch = '0'] = mc.slice(2).split('.');
  return `${minor}.${patch}.`;
}

/** Loader versions compatible with `mc`, newest first, with a "stable" flag. */
export async function listForgeLikeVersions(loader: ForgeLike, mc: string): Promise<{ version: string; stable: boolean }[]> {
  const versions = await allVersions(loader);
  const matching =
    loader === 'forge' ? versions.filter((v) => v.startsWith(`${mc}-`)) : versions.filter((v) => v.startsWith(neoforgePrefix(mc)));
  return matching
    .reverse()
    .map((v) => ({ version: v, stable: !/beta|alpha|rc|pre/i.test(v) }));
}

function versionIdFor(loader: ForgeLike, version: string): string {
  // forge "1.21.1-52.0.40" → "1.21.1-forge-52.0.40" ; neoforge "21.1.77" → "neoforge-21.1.77"
  if (loader === 'forge') {
    const i = version.indexOf('-');
    return `${version.slice(0, i)}-forge-${version.slice(i + 1)}`;
  }
  return `neoforge-${version}`;
}

/** Newest installed Forge/NeoForge version id for `mc` (only those with a version JSON). */
async function installedForgeLike(loader: ForgeLike, mc: string): Promise<string | null> {
  if (!fs.existsSync(versionsDir())) return null;
  const prefix = loader === 'forge' ? `${mc}-forge-` : `neoforge-${neoforgePrefix(mc)}`;
  const ids = (await fsp.readdir(versionsDir())).filter((d) => d.startsWith(prefix));
  ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const id of ids.reverse()) if (await readVersionJson(id)) return id;
  return null;
}

/**
 * Installs Forge/NeoForge for `mc` and returns the version id to launch.
 * `java` is the path to a Java runtime able to run the installer.
 */
export async function installForgeLike(loader: ForgeLike, mc: string, loaderVersion: string | null, java: string, task: Task): Promise<string> {
  let version = loaderVersion;
  if (!version) {
    task.update(-1, `Recherche de ${loader === 'forge' ? 'Forge' : 'NeoForge'}`, true);
    let list: { version: string; stable: boolean }[] = [];
    try {
      list = await listForgeLikeVersions(loader, mc);
    } catch (err) {
      // Offline: launch the newest build already installed for this Minecraft version.
      const local = await installedForgeLike(loader, mc);
      if (!local) throw err;
      return local;
    }
    version = (list.find((v) => v.stable) ?? list[0])?.version ?? null;
    if (!version) throw new UserError(`${loader === 'forge' ? 'Forge' : 'NeoForge'} n'est pas disponible pour Minecraft ${mc}.`);
  }
  if (!/^[\w.+\-]+$/.test(version)) throw new UserError('Version du chargeur invalide.');

  const id = versionIdFor(loader, version);
  const existing = await readVersionJson(id);
  if (existing) {
    // Already installed: make sure downloadable libraries are present.
    await installLibraries(existing.libraries, task, true);
    return id;
  }

  const label = loader === 'forge' ? 'Forge' : 'NeoForge';
  const repo = REPOS[loader];
  const installerUrl = repo.installer(version);
  const installer = path.join(cacheDir(), 'installers', path.basename(new URL(installerUrl).pathname));
  task.update(-1, `Téléchargement de l'installateur ${label} ${version}`, true);
  const sha1Res = await request(`${installerUrl}.sha1`, { signal: task.signal });
  const sha1 = sha1Res.ok ? (await sha1Res.text()).trim().slice(0, 40) : null;
  if (!sha1 || !/^[0-9a-f]{40}$/i.test(sha1)) {
    // Never run an installer whose integrity cannot be checked.
    throw new UserError(`Empreinte de l'installateur ${label} introuvable : installation annulée par sécurité.`);
  }
  await download({ url: installerUrl, dest: installer, hash: { algo: 'sha1', value: sha1 }, allowedHosts: [repo.host], signal: task.signal });

  // The installers refuse to run without a launcher profile file.
  const profilesFile = path.join(dataDir(), 'launcher_profiles.json');
  if (!fs.existsSync(profilesFile)) {
    await fsp.mkdir(dataDir(), { recursive: true });
    await fsp.writeFile(profilesFile, JSON.stringify({ profiles: {} }));
  }

  task.update(-1, `Installation de ${label} ${version} (peut prendre quelques minutes)`, true);
  const javaExe = path.join(path.dirname(java), 'java.exe');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(fs.existsSync(javaExe) ? javaExe : java, ['-jar', installer, '--installClient', dataDir()], {
      cwd: path.dirname(installer),
      windowsHide: true,
    });
    let tail = '';
    const onData = (d: Buffer) => {
      const text = d.toString('utf8');
      tail = (tail + text).slice(-4000);
      const last = text.trim().split(/\r?\n/).pop();
      if (last) task.update(-1, last.slice(0, 120));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const timer = setTimeout(() => child.kill(), 15 * 60_000);
    const onAbort = () => child.kill();
    task.signal.addEventListener('abort', onAbort, { once: true });
    child.on('error', (err) => reject(err));
    child.on('exit', (code) => {
      clearTimeout(timer);
      task.signal.removeEventListener('abort', onAbort);
      if (task.cancelled) reject(cancelledError());
      else if (code === 0) resolve();
      else {
        launcherLog(`[${loader}] installateur : ${tail}`);
        reject(new UserError(`L'installateur ${label} a échoué (code ${code}). Détails dans le journal de lancement.`));
      }
    });
  });

  if (!(await readVersionJson(id))) {
    // Fall back to the newest version folder created for this loader and Minecraft version.
    const dirs = await fsp.readdir(versionsDir());
    const candidates = dirs.filter((d) => d.includes(loader === 'forge' ? 'forge' : 'neoforge') && d.includes(loader === 'forge' ? mc : version!));
    if (!candidates.length) throw new UserError(`${label} semble installé, mais sa version est introuvable.`);
    return candidates.sort().pop()!;
  }
  return id;
}
