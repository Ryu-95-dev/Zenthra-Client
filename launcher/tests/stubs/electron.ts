// Minimal stand-in for the Electron APIs used by the launcher services.
// Every path lives under process.env.ZTEST_ROOT, set by tests/helpers.ts.
import fs from 'node:fs';
import path from 'node:path';

const root = () => {
  const r = process.env.ZTEST_ROOT;
  if (!r) throw new Error('ZTEST_ROOT not set (use setupTempRoot() from tests/helpers.ts)');
  return r;
};

export const app = {
  isPackaged: false,
  getPath: (name: string) => path.join(root(), name === 'userData' ? 'appData/Zenthra Client' : name),
  getAppPath: () => root(),
  getVersion: () => '0.1.0-test',
  getAppMetrics: () => [{ memory: { workingSetSize: 51200 } }],
};

/** Reversible fake encryption so tests can check nothing is stored in clear text. */
export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(`ENC:${Buffer.from(s).toString('base64')}`),
  decryptString: (b: Buffer) => {
    const t = b.toString();
    if (!t.startsWith('ENC:')) throw new Error('not encrypted');
    return Buffer.from(t.slice(4), 'base64').toString();
  },
};

export const shell = {
  trashItem: async (p: string) => fs.rmSync(p, { recursive: true, force: true }),
  openPath: async () => '',
  openExternal: async () => undefined,
};

export const dialog = {};
export const nativeImage = {};
export const ipcMain = { handle: () => undefined, on: () => undefined };
export class BrowserWindow {}
