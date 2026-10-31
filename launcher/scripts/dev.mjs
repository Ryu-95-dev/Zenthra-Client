// Development runner: Vite dev server + esbuild watch + Electron.
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const vite = await createServer({ configFile: 'vite.config.ts' });
await vite.listen();
const url = 'http://localhost:5317';

const esbuild = spawn(process.execPath, ['scripts/build-main.mjs', '--watch'], { stdio: 'inherit' });

// Give esbuild a moment to produce the first bundle.
await new Promise((r) => setTimeout(r, 1500));

const electronPath = (await import('electron')).default;
const app = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, ZENTHRA_DEV_URL: url },
});

app.on('exit', async (code) => {
  esbuild.kill();
  await vite.close();
  process.exit(code ?? 0);
});
