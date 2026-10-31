import { contextBridge, ipcRenderer } from 'electron';
import type { ZenthraApi } from '../../shared/api';

type Result = { ok: true; data: unknown } | { ok: false; error: string };

/** Invokes a main-process handler and rethrows its user-facing error. */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as Result;
  if (!res.ok) throw new Error(res.error);
  return res.data as T;
}

const c =
  <T>(channel: string) =>
  (...args: unknown[]) =>
    call<T>(channel, ...args);

function listen<T>(channel: string) {
  return (cb: (payload: T) => void) => {
    const handler = (_: unknown, payload: T) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

const api: ZenthraApi = {
  app: { info: c('app:info') },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  settings: { get: c('settings:get'), update: c('settings:update'), reset: c('settings:reset'), chooseDataDir: c('settings:chooseDataDir') },
  profiles: {
    list: c('profiles:list'),
    create: c('profiles:create'),
    update: c('profiles:update'),
    duplicate: c('profiles:duplicate'),
    remove: c('profiles:remove'),
    exportToFile: c('profiles:export'),
    importFromFile: c('profiles:import'),
    openFolder: c('profiles:openFolder'),
    chooseImage: c('profiles:chooseImage'),
    history: c('profiles:history'),
    restore: c('profiles:restore'),
  },
  versions: {
    available: c('versions:available'),
    installed: c('versions:installed'),
    install: c('versions:install'),
    remove: c('versions:remove'),
    loaderVersions: c('versions:loaderVersions'),
    repair: c('versions:repair'),
  },
  game: { launch: c('game:launch'), kill: c('game:kill'), state: c('game:state'), logs: c('game:logs'), openLogsFolder: c('game:openLogsFolder') },
  auth: { state: c('auth:state'), signIn: c('auth:signIn'), cancel: c('auth:cancel'), signOut: c('auth:signOut') },
  modrinth: {
    search: c('modrinth:search'),
    project: c('modrinth:project'),
    versions: c('modrinth:versions'),
    plan: c('modrinth:plan'),
    install: c('modrinth:install'),
    uninstall: c('modrinth:uninstall'),
    updates: c('modrinth:updates'),
    scanLocal: c('modrinth:scanLocal'),
    addLocal: c('modrinth:addLocal'),
    sync: c('modrinth:sync'),
    importModpack: c('modrinth:importModpack'),
    importMrpackFile: c('modrinth:importMrpackFile'),
    openWebsite: c('modrinth:openWebsite'),
  },
  modules: { catalog: c('modules:catalog'), get: c('modules:get'), set: c('modules:set') },
  community: { servers: c('community:servers'), addServer: c('community:addServer'), removeServer: c('community:removeServer'), presence: c('community:presence'),
    overview: c('community:overview'),
    sendRequest: c('community:sendRequest'),
    answerRequest: c('community:answerRequest'),
    removeFriend: c('community:removeFriend'),
    setBlocked: c('community:setBlocked'),
    deleteMyData: c('community:deleteMyData'),
  },
  tasks: { cancel: c('tasks:cancel') },
  diagnostics: { get: c('diagnostics:get'), exportToFile: c('diagnostics:export') },
  updates: { check: c('updates:check'), download: c('updates:download') },
  optimizer: {
    analyze: c('optimizer:analyze'),
    applyGraphics: c('optimizer:applyGraphics'),
    restoreGraphics: c('optimizer:restoreGraphics'),
  },
  resourcePacks: {
    list: c('packs:list'),
    setEnabled: c('packs:setEnabled'),
    remove: c('packs:remove'),
    openFolder: c('packs:openFolder'),
  },
  on: {
    task: listen('event:task'),
    log: listen('event:log'),
    game: listen('event:game'),
    auth: listen('event:auth'),
    profiles: listen('event:profiles'),
  },
} as ZenthraApi;

contextBridge.exposeInMainWorld('zenthra', api);
