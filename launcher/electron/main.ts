import path from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { registerIpc } from './ipc';
import { initAuth } from './services/auth';
import { getGameState } from './minecraft/launch';
import { publishPresence } from './services/community';
import { recordLauncherStartup } from './services/diagnostics';
import { getProfile } from './services/profiles';
import { bus } from './services/events';
import { migrateFromAmethyst } from './services/migration';
import { getSettings } from './services/settings';

let win: BrowserWindow | null = null;
const devUrl = process.env.ZENTHRA_DEV_URL;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 1040,
    minHeight: 660,
    frame: false,
    show: false,
    backgroundColor: '#0c0c10',
    title: 'Zenthra Client',
    // The executable is shipped unmodified (see package.json, signAndEditExecutable),
    // so the Zenthra icon is applied to the window at runtime.
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => {
    recordLauncherStartup();
    win?.show();
  });

  // Never let the renderer navigate away or open arbitrary windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://modrinth.com/')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault();
  });

  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.on('closed', () => {
    win = null;
  });
}

async function sharePresence(): Promise<void> {
  const g = getGameState();
  const profile = g.status === 'running' ? await getProfile(g.profileId).catch(() => null) : null;
  await publishPresence(profile ? `En jeu · ${profile.name}` : 'Dans le launcher');
}

function forward(channel: string) {
  return (payload?: unknown) => win?.webContents.send(channel, payload);
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

app.whenReady().then(async () => {
  try {
    await migrateFromAmethyst();
  } catch (err) {
    console.error('[migration] échec, les anciennes données restent en place :', err);
  }
  await getSettings();
  await initAuth();
  registerIpc(() => win);

  bus.on('task', forward('event:task'));
  bus.on('log', forward('event:log'));
  bus.on('auth', forward('event:auth'));
  bus.on('profiles', forward('event:profiles'));
  bus.on('game', (g) => {
    forward('event:game')(g);
    // Bring the launcher back when the game stops.
    if ((g.status === 'idle' || g.status === 'crashed') && win && !win.isVisible()) win.show();
    if (g.status === 'running' || g.status === 'idle') void sharePresence();
  });

  // Presence for friends (community server). Does nothing at all when no server
  // is configured or nobody is signed in; otherwise a heartbeat every 90 s.
  void sharePresence();
  setInterval(() => void sharePresence(), 90_000);

  createWindow();
});

app.on('window-all-closed', () => app.quit());
