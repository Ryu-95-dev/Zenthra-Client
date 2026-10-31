import { app } from 'electron';
import path from 'node:path';

let dataDirOverride: string | null = null;

/** Default game data directory: %APPDATA%/.zenthra */
export function defaultDataDir(): string {
  return path.join(app.getPath('appData'), '.zenthra');
}

export function setDataDir(dir: string | null): void {
  dataDirOverride = dir && dir.trim() ? dir : null;
}

export function dataDir(): string {
  return dataDirOverride ?? defaultDataDir();
}

/** Launcher-private files (settings, profiles, encrypted session). */
export const configDir = () => app.getPath('userData');

export const versionsDir = () => path.join(dataDir(), 'versions');
export const librariesDir = () => path.join(dataDir(), 'libraries');
export const assetsDir = () => path.join(dataDir(), 'assets');
export const runtimesDir = () => path.join(dataDir(), 'runtimes');
export const instancesDir = () => path.join(dataDir(), 'instances');
export const cacheDir = () => path.join(dataDir(), 'cache');
export const logsDir = () => path.join(dataDir(), 'logs');

export const instanceDir = (profileId: string) => path.join(instancesDir(), profileId);
export const nativesDir = (versionId: string) => path.join(versionsDir(), versionId, 'natives');

/** Folder holding the bundled Zenthra mod jar (dev: launcher/resources, packaged: resources/). */
export function bundledModDir(): string {
  // In development the bundle lives in launcher/dist-electron, next to launcher/resources.
  return app.isPackaged
    ? path.join(process.resourcesPath, 'zenthra-mod')
    : path.join(__dirname, '..', 'resources', 'zenthra-mod');
}

/** Rejects paths that would escape `root` (zip slip / path traversal). */
export function safeJoin(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Chemin refusé (hors du dossier autorisé) : ${relative}`);
  }
  return target;
}
