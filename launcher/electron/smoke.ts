// End-to-end smoke test (not shipped): renders every page to PNG, then
// installs and launches the "pvp" profile in official demo mode and waits for
// the Zenthra mod to report it loaded.
//   npm run build && node scripts/build-main.mjs --smoke && electron dist-electron/smoke.cjs
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { registerIpc } from './ipc';
import { getGameState, killGame, launchProfile } from './minecraft/launch';
import { initAuth } from './services/auth';
import { bus } from './services/events';
import { migrateFromAmethyst } from './services/migration';
import { setModuleEnabled } from './services/zenthraMod';
import { instanceDir, setDataDir } from './services/paths';
import { createProfile, deleteProfile } from './services/profiles';
import { getSettings, updateSettings } from './services/settings';

const outDir = process.env.SMOKE_OUT ?? path.join(process.cwd(), 'smoke-output');
const pages: [string, string][] = [
  ['home', 'Accueil'],
  ['profiles', 'Profils'],
  ['modules', 'Modules'],
  ['mods', 'Mods'],
  ['resourcepacks', 'Resource Packs'],
  ['diagnostics', 'Diagnostic'],
  ['modrinth', 'Modrinth'],
  ['versions', 'Versions'],
  ['multiplayer', 'Multijoueur'],
  ['settings', 'Paramètres'],
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Same folder as the real app (productName), so the test reuses its downloads.
app.setPath('userData', path.join(app.getPath('appData'), 'Zenthra Client'));

// SMOKE_DATA_DIR=<folder>: game data outside %APPDATA% (inside the Claude app's sandbox, Java 25 sees
// redirected paths under %APPDATA% and Fabric then loads its libraries twice).
app.whenReady().then(async () => {
  if (process.env.SMOKE_DATA_DIR) {
    await getSettings(); // loads the saved data folder first, then the test folder replaces it
    setDataDir(process.env.SMOKE_DATA_DIR);
  }
  fs.mkdirSync(outDir, { recursive: true });
  await migrateFromAmethyst();
  await getSettings();
  await initAuth();
  let win: BrowserWindow | null = null;
  registerIpc(() => win);
  win = new BrowserWindow({
    width: 1360,
    height: 820,
    frame: false,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log(`[renderer] ${message}`);
  });
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await sleep(2500);

  for (const [id, label] of pages) {
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.nav-item')].find(b => b.textContent.trim() === ${JSON.stringify(label)})?.click()`,
    );
    await sleep(id === 'modrinth' || id === 'versions' ? 3500 : 1200);
    // A hidden window paints lazily: force a fresh frame before capturing.
    win.webContents.invalidate();
    await sleep(400);
    await win.webContents.capturePage();
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `${id}.png`), img.toPNG());
    console.log(`[smoke] capture ${id}.png`);
  }
  // Optimisation tab of the diagnostics page.
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.nav-item')].find(b => b.textContent.trim() === 'Diagnostic')?.click()`);
  await sleep(1500);
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.tab')].find(b => b.textContent.trim() === 'Optimisation')?.click()`);
  await sleep(6000); // analysis queries Modrinth
  win.webContents.invalidate();
  await sleep(400);
  await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'optimisation.png'), (await win.webContents.capturePage()).toPNG());
  console.log('[smoke] capture optimisation.png');

  // SMOKE_DASHBOARD=1: customise the home page like a user would, then restore the layout.
  if (process.env.SMOKE_DASHBOARD) {
    const before = await getSettings();
    const saved = { homeLayout: before.homeLayout, panelModules: before.panelModules };
    const js = (code: string) => win!.webContents.executeJavaScript(code);
    const shot = async (name: string) => {
      await sleep(600);
      // A hidden window paints lazily: force a fresh frame before capturing.
      win!.webContents.invalidate();
      await sleep(400);
      await win!.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, `${name}.png`), (await win!.webContents.capturePage()).toPNG());
      console.log(`[smoke] capture ${name}.png`);
    };
    const clickText = (text: string) => js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim().includes(${JSON.stringify(text)}))?.click()`);
    await js(`[...document.querySelectorAll('.nav-item')].find(b => b.textContent.trim() === 'Accueil')?.click()`);
    await sleep(800);
    await clickText('Personnaliser');
    await shot('dash-1-edit');

    // Resize "Mods actifs" (second block) with real mouse input: +2 columns, +3 rows.
    const r = await js(`(() => { const h = document.querySelectorAll('.dash-block')[1].querySelector('.dash-resize').getBoundingClientRect(); return { x: Math.round(h.x + h.width / 2), y: Math.round(h.y + h.height / 2) }; })()`);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 10; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x + i * 18, y: r.y + i * 16, button: 'left' });
      await sleep(30);
    }
    win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x + 180, y: r.y + 160, button: 'left', clickCount: 1 });
    await sleep(300);

    // Move "Récemment installés" (last block) before the first block.
    await js(`(() => {
      const blocks = document.querySelectorAll('.dash-block');
      const handle = blocks[blocks.length - 1].querySelector('.dash-handle');
      const dt = new DataTransfer();
      handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      return new Promise((res) => setTimeout(() => {
        blocks[0].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        setTimeout(() => { handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); res(true); }, 100);
      }, 100));
    })()`);
    await sleep(300);
    // Hide the "Communauté" block and remove the first module from the panel.
    await js(`[...document.querySelectorAll('.dash-block')].find(b => b.querySelector('.dash-handle')?.textContent.includes('Communauté'))?.querySelector('.dash-remove').click()`);
    await js(`document.querySelector('.modules-panel .module-row button.icon-btn')?.click()`);
    await shot('dash-2-edited');
    await clickText('Terminé');
    await shot('dash-3-done');
    await sleep(800);
    const after = await getSettings();
    console.log(`[smoke] disposition enregistrée : ${after.homeLayout?.map((b) => `${b.id}${b.hidden ? '(masqué)' : ''}:${b.w}x${b.h}`).join(' ')}`);
    console.log(`[smoke] modules du panneau : ${after.panelModules?.join(', ')}`);
    await updateSettings(saved);
    console.log('[smoke] disposition d’origine restaurée');
    return app.quit();
  }

  if (process.env.SMOKE_SKIP_GAME) return app.quit();

  // SMOKE_LOADER=forge|neoforge: install and start that loader in a temporary profile.
  const loaderUnderTest = process.env.SMOKE_LOADER as 'forge' | 'neoforge' | undefined;
  if (loaderUnderTest) {
    const temp = await createProfile({ name: `Test ${loaderUnderTest}`, mcVersion: '1.21.1', loader: loaderUnderTest });
    let started = false;
    let crashed = false;
    bus.on('log', (l) => {
      if (/Sound engine started|Created: \d+x\d+x\d+ minecraft:textures\/atlas/.test(l.text)) started = true;
      if (/Crash report saved|Exception in thread "main"|Mixin apply failed/.test(l.text)) crashed = true;
      if (/ERROR|FATAL|Exception|ModLauncher|Forge|NeoForge|forge/i.test(l.text) && l.stream !== 'launcher') console.log(`[game] ${l.text.slice(0, 220)}`);
      else if (l.stream === 'launcher') console.log(`[launcher] ${l.text.slice(0, 300)}`);
    });
    bus.on('task', (t) => t.done && console.log(`[task] ${t.label} → ${t.error ?? t.detail ?? 'ok'}`));
    let ok = false;
    try {
      await launchProfile(temp.id, { demo: true });
      const end = Date.now() + 300_000;
      while (Date.now() < end && !started && !crashed && getGameState().status === 'running') await sleep(2000);
      if (started) await sleep(8000);
      ok = started && !crashed && getGameState().status === 'running';
      console.log(`[smoke] ${loaderUnderTest} : démarré=${started} crash=${crashed} état=${getGameState().status}`);
    } catch (err) {
      console.log(`[smoke] ÉCHEC ${loaderUnderTest} : ${(err as Error).message}`);
    }
    killGame();
    await sleep(3000);
    await deleteProfile(temp.id).catch(() => undefined);
    return app.exit(ok ? 0 : 1);
  }

  let loaded = false;
  let fatal = false;
  bus.on('log', (l) => {
    if (/Zenthra Client chargé/.test(l.text)) loaded = true;
    if (/FATAL|Mixin apply failed|Crash report saved|InvalidInjectionException/.test(l.text)) fatal = true;
    if (l.stream !== 'stdout' || /WARN|ERROR|Exception|Zenthra|selftest|Fabric|Mixin/.test(l.text)) console.log(`[game] ${l.text}`);
  });
  bus.on('task', (t) => t.done && console.log(`[task] ${t.label} → ${t.error ?? t.detail ?? 'ok'}`));

  // SMOKE_SELFTEST=1: in a temporary profile (the user's profiles are never touched),
  // the mod walks through its screens in the demo world and quits by itself.
  if (process.env.SMOKE_SELFTEST) {
    const temp = await createProfile({
      name: 'Autotest Zenthra',
      // SMOKE_MC=<version>: Minecraft version under test (one of the versions the mod ships for).
      mcVersion: process.env.SMOKE_MC ?? '1.21.1',
      loader: 'fabric',
      zenthraMod: true,
      jvmArgs: '-Dzenthra.selftest=true',
    });
    // SMOKE_LANG=fr_fr|en_us: game language of the temporary profile.
    if (process.env.SMOKE_LANG && /^[a-z]{2}_[a-z]{2}$/.test(process.env.SMOKE_LANG)) {
      fs.mkdirSync(instanceDir(temp.id), { recursive: true });
      fs.writeFileSync(path.join(instanceDir(temp.id), 'options.txt'), `lang:${process.env.SMOKE_LANG}\n`);
    }
    // Hot-reload check: the launcher toggles a module while the game runs.
    bus.on('log', (l) => {
      if (/attente launcher/.test(l.text)) {
        void setModuleEnabled(temp.id, 'fps_counter', false).then(() => console.log('[smoke] launcher : fps_counter désactivé dans zenthra.json'));
      }
    });
    try {
      await launchProfile(temp.id, { demo: true });
    } catch (err) {
      console.log(`[smoke] ÉCHEC du lancement : ${(err as Error).message}`);
      await deleteProfile(temp.id).catch(() => undefined);
      return app.exit(1);
    }
    const end = Date.now() + 300_000;
    while (Date.now() < end && getGameState().status === 'running') await sleep(2000);
    const st = getGameState();
    const shots = path.join(instanceDir(temp.id), 'screenshots');
    if (fs.existsSync(shots)) {
      fs.mkdirSync(path.join(outDir, 'ingame'), { recursive: true });
      for (const f of fs.readdirSync(shots)) fs.copyFileSync(path.join(shots, f), path.join(outDir, 'ingame', f));
    }
    if (st.status === 'running' && process.env.SMOKE_JSTACK) {
      // Diagnose a stalled game with a thread dump from a JDK.
      const { execFileSync } = await import('node:child_process');
      try {
        fs.writeFileSync(path.join(outDir, 'threads.txt'), execFileSync(process.env.SMOKE_JSTACK, [String(st.pid)], { encoding: 'utf8' }));
        console.log('[smoke] dump des threads écrit');
      } catch (err) {
        console.log(`[smoke] jstack impossible : ${(err as Error).message}`);
      }
    }
    console.log(`[smoke] autotest terminé, état=${st.status}`);
    if (st.status === 'running') killGame();
    await sleep(2000);
    await deleteProfile(temp.id).catch(() => undefined);
    return app.exit(st.status === 'idle' && loaded && !fatal ? 0 : 1);
  }
  // Wait for the game to reach the title screen (sound engine + resource reload).
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline && !fatal && getGameState().status === 'running') {
    await sleep(2000);
    if (loaded) {
      await sleep(25_000); // let the title screen finish loading and mixins apply
      break;
    }
  }
  const state = getGameState();
  console.log(`[smoke] mod chargé=${loaded} erreur fatale=${fatal} état=${state.status}`);
  killGame();
  await sleep(2000);
  app.exit(loaded && !fatal && state.status === 'running' ? 0 : 1);
});
