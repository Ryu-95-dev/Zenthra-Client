import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { safeStorage } from 'electron';
import { UserError } from './errors';
import { configDir } from './paths';

/**
 * Stores secrets encrypted with the OS keychain (DPAPI on Windows) through
 * Electron's safeStorage. Nothing is ever written in clear text.
 */
const file = (name: string) => path.join(configDir(), `${name}.bin`);

export async function saveSecret(name: string, value: unknown): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new UserError("Le stockage sécurisé de Windows n'est pas disponible : la session ne peut pas être conservée.");
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(value));
  await fsp.mkdir(configDir(), { recursive: true });
  await fsp.writeFile(file(name), encrypted, { mode: 0o600 });
}

export async function loadSecret<T>(name: string): Promise<T | null> {
  if (!fs.existsSync(file(name)) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return JSON.parse(safeStorage.decryptString(await fsp.readFile(file(name)))) as T;
  } catch {
    // Corrupted or encrypted by another Windows user: discard.
    await deleteSecret(name);
    return null;
  }
}

export async function deleteSecret(name: string): Promise<void> {
  await fsp.rm(file(name), { force: true });
}
