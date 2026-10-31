import fsp from 'node:fs/promises';
import os from 'node:os';
import { BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import type { ModrinthProjectType, Profile } from '../../shared/types';
import { installFabric, listFabricLoaders } from './minecraft/fabric';
import { listForgeLikeVersions } from './minecraft/forge';
import { getGameState, getRecentLogs, killGame, launchProfile } from './minecraft/launch';
import { deleteVersion, installVanilla, listAvailableVersions, listInstalledVersions, repairVersion } from './minecraft/versions';
import { getModuleStates, MODULES, setModuleEnabled, supportedVersions } from './services/zenthraMod';
import { cancelPendingSignIn, getAuthState, refreshConfiguredFlag, signIn, signOut } from './services/auth';
import {
  addServer,
  answerRequest,
  deleteMyCommunityData,
  getCommunity,
  getPresence,
  listServers,
  removeFriend,
  removeServer,
  sendFriendRequest,
  setBlocked,
} from './services/community';
import { getDiagnostics } from './services/diagnostics';
import { listHistory } from './services/profileHistory';
import { analyzeProfile, applyGraphics, restoreGraphics } from './services/optimizer';
import { checkForUpdate, downloadUpdate } from './services/updater';
import { deletePack, listPacks, openPacksFolder, setEnabledPacks } from './services/resourcepacks';
import { toMessage, UserError } from './services/errors';
import { cancelTask, launcherLog, Task } from './services/events';
import * as modrinth from './services/modrinth';
import { importModrinthModpack, importMrpackFile } from './services/modpack';
import { dataDir, instanceDir, logsDir } from './services/paths';
import * as profiles from './services/profiles';
import { getSettings, resetSettings, updateSettings } from './services/settings';

type Handler = (...args: any[]) => unknown;

/** Registers a handler whose errors are converted to a safe { ok:false } result. */
function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      const message = toMessage(err);
      if (!(err instanceof UserError)) launcherLog(`[${channel}] ${message}`);
      return { ok: false, error: message };
    }
  });
}

const PROJECT_TYPES: ModrinthProjectType[] = ['mod', 'resourcepack', 'modpack'];
function assertType(t: unknown): asserts t is ModrinthProjectType {
  if (!PROJECT_TYPES.includes(t as ModrinthProjectType)) throw new UserError('Type de contenu invalide.');
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.on('window:minimize', () => getWindow()?.minimize());
  ipcMain.on('window:maximize', () => {
    const w = getWindow();
    if (w) w.isMaximized() ? w.unmaximize() : w.maximize();
  });
  ipcMain.on('window:close', () => getWindow()?.close());

  handle('app:info', async () => ({
    version: '0.1.0',
    dataDir: dataDir(),
    modBundled: supportedVersions().length > 0,
    zenthraMcVersion: profiles.ZENTHRA_MC_VERSION,
    zenthraMcVersions: supportedVersions(),
    totalRamMb: Math.round(os.totalmem() / 1048576),
  }));

  // Settings
  handle('settings:get', getSettings);
  handle('settings:update', async (patch) => {
    const s = await updateSettings(patch);
    if ('msClientId' in patch) await refreshConfiguredFlag();
    return s;
  });
  handle('settings:reset', resetSettings);
  handle('settings:chooseDataDir', async () => {
    const res = await dialog.showOpenDialog(getWindow()!, { properties: ['openDirectory', 'createDirectory'], title: 'Répertoire du jeu' });
    return res.canceled ? null : res.filePaths[0];
  });

  // Profiles
  handle('profiles:list', profiles.listProfiles);
  handle('profiles:create', profiles.createProfile);
  handle('profiles:update', profiles.updateProfile);
  handle('profiles:duplicate', profiles.duplicateProfile);
  handle('profiles:remove', profiles.deleteProfile);
  handle('profiles:openFolder', async (id: string) => {
    await profiles.getProfile(id);
    await fsp.mkdir(instanceDir(id), { recursive: true });
    await shell.openPath(instanceDir(id));
  });
  handle('profiles:history', (id: string) => listHistory(id));
  handle('profiles:restore', (id: string, at: string) => profiles.restoreProfileSettings(id, String(at)));
  handle('profiles:chooseImage', async () => {
    const res = await dialog.showOpenDialog(getWindow()!, {
      title: 'Image du profil',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    if ((await fsp.stat(res.filePaths[0])).size > 15_000_000) throw new UserError('Image trop volumineuse (15 Mo maximum).');
    const img = nativeImage.createFromPath(res.filePaths[0]);
    if (img.isEmpty()) throw new UserError("Impossible de lire cette image. Essaie un fichier PNG ou JPG.");
    // Centre-crop to a square, then shrink: the picture is stored inside profiles.json.
    const { width, height } = img.getSize();
    const side = Math.min(width, height);
    const square = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side });
    return square.resize({ width: 128, height: 128, quality: 'best' }).toDataURL();
  });
  handle('profiles:export', async (id: string) => {
    const p = await profiles.getProfile(id);
    const res = await dialog.showSaveDialog(getWindow()!, {
      title: 'Exporter le profil',
      defaultPath: `${p.name.replace(/[^\w\- ]/g, '')}.zenthra.json`,
      filters: [{ name: 'Profil Zenthra', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return false;
    await fsp.writeFile(res.filePath, JSON.stringify(profiles.exportProfile(p), null, 2));
    return true;
  });
  handle('profiles:import', async () => {
    const res = await dialog.showOpenDialog(getWindow()!, {
      title: 'Importer un profil',
      filters: [
        { name: 'Profil Zenthra ou modpack Modrinth', extensions: ['json', 'mrpack'] },
      ],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const file = res.filePaths[0];
    if (file.endsWith('.mrpack')) return importMrpackFile(file);
    const stat = await fsp.stat(file);
    if (stat.size > 2_000_000) throw new UserError('Fichier de profil trop volumineux.');
    return profiles.importProfile(await fsp.readFile(file, 'utf8'));
  });

  // Versions
  handle('versions:available', listAvailableVersions);
  handle('versions:installed', listInstalledVersions);
  handle('versions:loaderVersions', async (loader: string, mc: string) => {
    if (loader === 'fabric') return listFabricLoaders(mc);
    if (loader === 'forge' || loader === 'neoforge') return listForgeLikeVersions(loader, mc);
    return [];
  });
  handle('versions:repair', async (id: string) => {
    if (!/^[\w.\-+]+$/.test(id)) throw new UserError('Version invalide.');
    const task = new Task(`Vérification de ${id}`, true);
    try {
      await repairVersion(id, task);
      task.done('Tous les fichiers sont vérifiés.');
    } catch (err) {
      task.fail(toMessage(err));
      throw err;
    }
  });
  handle('tasks:cancel', (taskId: string) => cancelTask(String(taskId)));

  // Resource packs
  handle('packs:list', (profileId: string) => listPacks(profileId));
  handle('packs:setEnabled', (profileId: string, order: unknown) => {
    if (!Array.isArray(order) || order.some((x) => typeof x !== 'string')) throw new UserError('Liste de packs invalide.');
    return setEnabledPacks(profileId, order as string[]);
  });
  handle('packs:remove', (profileId: string, fileName: string) => deletePack(profileId, String(fileName)));
  handle('packs:openFolder', (profileId: string) => openPacksFolder(profileId));

  // Updates
  handle('updates:check', checkForUpdate);
  handle('updates:download', downloadUpdate);

  // Optimisation
  handle('optimizer:analyze', (profileId: string) => analyzeProfile(profileId));
  handle('optimizer:applyGraphics', (profileId: string, keys: unknown) => {
    if (!Array.isArray(keys) || keys.some((k) => typeof k !== 'string')) throw new UserError('Sélection invalide.');
    return applyGraphics(profileId, keys as string[]);
  });
  handle('optimizer:restoreGraphics', (profileId: string) => restoreGraphics(profileId));

  // Diagnostics
  handle('diagnostics:get', getDiagnostics);
  handle('diagnostics:export', async () => {
    const res = await dialog.showSaveDialog(getWindow()!, {
      title: 'Exporter le diagnostic',
      defaultPath: `zenthra-diagnostic-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`,
      filters: [{ name: 'Rapport JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return false;
    // The report never contains tokens; logs were already redacted when captured.
    await fsp.writeFile(res.filePath, JSON.stringify(await getDiagnostics(), null, 2));
    return true;
  });
  handle('versions:install', async (id: string, withFabric: boolean) => {
    const task = new Task(`Installation de Minecraft ${id}`, true);
    try {
      await installVanilla(id, task);
      if (withFabric) await installFabric(id, null, task);
      task.done('Installation terminée');
    } catch (err) {
      task.fail(toMessage(err));
      throw err;
    }
  });
  handle('versions:remove', async (id: string) => {
    const used = (await profiles.listProfiles()).filter((p) => p.mcVersion === id || id.endsWith(`-${p.mcVersion}`));
    if (used.length && !id.startsWith('fabric-loader-')) {
      throw new UserError(`Version utilisée par : ${used.map((p) => p.name).join(', ')}. Elle serait retéléchargée au prochain lancement.`);
    }
    await deleteVersion(id);
  });

  // Game
  handle('game:launch', async (profileId: string, opts?: { server?: string; demo?: boolean }) => {
    const settings = await getSettings();
    await launchProfile(profileId, opts ?? {});
    await updateSettings({ selectedProfileId: profileId });
    const w = getWindow();
    if (w && settings.afterLaunch === 'minimize') w.minimize();
    if (w && settings.afterLaunch === 'hide') w.hide();
  });
  handle('game:kill', killGame);
  handle('game:state', getGameState);
  handle('game:logs', getRecentLogs);
  handle('game:openLogsFolder', async () => {
    await fsp.mkdir(logsDir(), { recursive: true });
    await shell.openPath(logsDir());
  });

  // Auth
  handle('auth:state', getAuthState);
  handle('auth:signIn', signIn);
  handle('auth:cancel', cancelPendingSignIn);
  handle('auth:signOut', signOut);

  // Modrinth
  handle('modrinth:search', modrinth.search);
  handle('modrinth:project', modrinth.getProject);
  handle('modrinth:versions', modrinth.getVersions);
  handle('modrinth:plan', (profileId: string, projectId: string, versionId: string | null, type: unknown) => {
    assertType(type);
    return modrinth.planInstall(profileId, projectId, versionId, type);
  });
  handle('modrinth:install', (profileId: string, plan, type: unknown, iconUrl: string | null) => {
    assertType(type);
    return modrinth.executeInstall(profileId, plan, type, iconUrl);
  });
  handle('modrinth:uninstall', (profileId: string, type: unknown, fileName: string) => {
    assertType(type);
    return modrinth.uninstall(profileId, type, fileName);
  });
  handle('modrinth:updates', (profileId: string, type: unknown) => {
    assertType(type);
    return modrinth.checkUpdates(profileId, type);
  });
  handle('modrinth:scanLocal', (profileId: string, type: unknown) => {
    assertType(type);
    return modrinth.scanLocal(profileId, type);
  });
  handle('modrinth:addLocal', async (profileId: string, type: unknown): Promise<Profile | null> => {
    assertType(type);
    const res = await dialog.showOpenDialog(getWindow()!, {
      title: type === 'resourcepack' ? 'Ajouter un resource pack' : 'Ajouter un mod',
      filters: [type === 'resourcepack' ? { name: 'Resource pack', extensions: ['zip'] } : { name: 'Mod Fabric', extensions: ['jar'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return modrinth.addLocalFile(profileId, type, res.filePaths[0]);
  });
  handle('modrinth:sync', modrinth.syncProfile);
  handle('modrinth:importModpack', importModrinthModpack);
  handle('modrinth:importMrpackFile', async () => {
    const res = await dialog.showOpenDialog(getWindow()!, {
      title: 'Importer un modpack',
      filters: [{ name: 'Modpack Modrinth', extensions: ['mrpack'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return importMrpackFile(res.filePaths[0]);
  });
  handle('modrinth:openWebsite', async (slug?: string, type?: ModrinthProjectType) => {
    const safeSlug = slug && /^[\w-]+$/.test(slug) ? slug : null;
    const path = safeSlug ? `${type ?? 'mod'}/${safeSlug}` : type === 'resourcepack' ? 'resourcepacks' : type === 'modpack' ? 'modpacks' : 'mods';
    await shell.openExternal(`https://modrinth.com/${path}`);
  });

  // Zenthra modules
  handle('modules:catalog', async () => MODULES);
  handle('modules:get', getModuleStates);
  handle('modules:set', setModuleEnabled);

  // Community
  handle('community:servers', listServers);
  handle('community:addServer', addServer);
  handle('community:removeServer', removeServer);
  handle('community:presence', getPresence);
  handle('community:overview', getCommunity);
  handle('community:sendRequest', (name: string) => sendFriendRequest(String(name)));
  handle('community:answerRequest', (uuid: string, accept: boolean) => answerRequest(String(uuid), accept === true));
  handle('community:removeFriend', (uuid: string) => removeFriend(String(uuid)));
  handle('community:setBlocked', (uuid: string, blocked: boolean) => setBlocked(String(uuid), blocked === true));
  handle('community:deleteMyData', deleteMyCommunityData);
}
