import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { UserError } from '../services/errors';
import { Task } from '../services/events';
import { fetchJson, HttpError } from '../services/http';
import { readJson, writeJson } from '../services/jsonStore';
import { versionsDir } from '../services/paths';
import type { VersionJson } from './versionJson';
import { installLibraries } from './versions';

const META = 'https://meta.fabricmc.net/v2';

interface LoaderEntry {
  loader: { version: string; stable: boolean };
}

/** Lists Fabric loader versions compatible with a Minecraft version (newest first). */
export async function listFabricLoaders(mcVersion: string): Promise<{ version: string; stable: boolean }[]> {
  try {
    const list = await fetchJson<LoaderEntry[]>(`${META}/versions/loader/${encodeURIComponent(mcVersion)}`);
    return list.map((e) => e.loader);
  } catch (err) {
    if (err instanceof HttpError && (err.status === 400 || err.status === 404)) return [];
    throw err;
  }
}

export async function isFabricSupported(mcVersion: string): Promise<boolean> {
  return (await listFabricLoaders(mcVersion)).length > 0;
}

/** Newest Fabric Loader version already installed for `mcVersion`, if any. */
async function installedFabricLoader(mcVersion: string): Promise<string | null> {
  if (!fs.existsSync(versionsDir())) return null;
  const re = new RegExp(`^fabric-loader-(.+)-${mcVersion.replace(/\./g, '\\.')}$`);
  const found = (await fsp.readdir(versionsDir()))
    .map((d) => re.exec(d)?.[1])
    .filter((v): v is string => !!v)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return found.pop() ?? null;
}

/**
 * Installs the Fabric profile for `mcVersion` and returns its version id.
 * The vanilla version must be installed separately (it is the parent).
 */
export async function installFabric(mcVersion: string, loaderVersion: string | null, task: Task): Promise<string> {
  let loader = loaderVersion;
  if (!loader) {
    task.update(-1, 'Recherche de Fabric Loader');
    try {
      const loaders = await listFabricLoaders(mcVersion);
      const stable = loaders.find((l) => l.stable) ?? loaders[0];
      if (!stable) throw new UserError(`Fabric n'est pas disponible pour Minecraft ${mcVersion}.`);
      loader = stable.version;
    } catch (err) {
      // Offline: fall back to the newest Fabric already installed for this version.
      const local = await installedFabricLoader(mcVersion);
      if (!local || (err instanceof UserError && err.message.includes("n'est pas disponible"))) throw err;
      loader = local;
    }
  }
  if (!/^[\w.+\-]+$/.test(loader)) throw new UserError('Version de Fabric Loader invalide.');

  const id = `fabric-loader-${loader}-${mcVersion}`;
  const file = path.join(versionsDir(), id, `${id}.json`);
  const marker = path.join(versionsDir(), id, '.zenthra-verified');
  let json = await readJson<VersionJson | null>(file, null);
  if (!json) {
    task.update(-1, `Fabric Loader ${loader}`);
    json = await fetchJson<VersionJson>(
      `${META}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loader)}/profile/json`,
      { signal: task.signal },
    );
    if (json.inheritsFrom !== mcVersion) throw new UserError('Réponse inattendue du serveur Fabric.');
    await writeJson(file, json);
  }
  await installLibraries(json.libraries, task, fs.existsSync(marker));
  await fsp.writeFile(marker, new Date().toISOString());
  return id;
}
