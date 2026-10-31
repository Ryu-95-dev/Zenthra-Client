import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, setupTempRoot } from './helpers';

let root: string;
let modDir: string;

async function load() {
  vi.doMock('../electron/services/paths', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../electron/services/paths')>()),
    bundledModDir: () => modDir,
  }));
  return import('../electron/services/zenthraMod');
}

function writeIndex(versions: Record<string, string>, jars: string[]): void {
  fs.mkdirSync(modDir, { recursive: true });
  for (const j of jars) fs.writeFileSync(path.join(modDir, j), 'jar');
  fs.writeFileSync(path.join(modDir, 'index.json'), JSON.stringify({ formatVersion: 1, versions }));
}

const profile = (mcVersion: string, loader = 'fabric') =>
  ({ id: 'p', mcVersion, loader, zenthraMod: true }) as unknown as import('../../shared/types').Profile;

describe('Zenthra mod jar per Minecraft version', () => {
  beforeEach(() => {
    root = setupTempRoot();
    modDir = path.join(root, 'zenthra-mod');
  });
  afterEach(() => {
    vi.doUnmock('../electron/services/paths');
    cleanup(root);
  });

  it('picks the jar built for the profile version and lists versions newest first', async () => {
    writeIndex(
      { '1.21': 'zenthra-client-0.1.0+1.21.1.jar', '1.21.1': 'zenthra-client-0.1.0+1.21.1.jar', '1.21.11': 'zenthra-client-0.1.0+1.21.11.jar', '26.3': 'zenthra-client-0.1.0+26.3.jar' },
      ['zenthra-client-0.1.0+1.21.1.jar', 'zenthra-client-0.1.0+1.21.11.jar', 'zenthra-client-0.1.0+26.3.jar'],
    );
    const mod = await load();
    expect(path.basename(mod.bundledJar('1.21')!)).toBe('zenthra-client-0.1.0+1.21.1.jar');
    expect(path.basename(mod.bundledJar('1.21.11')!)).toBe('zenthra-client-0.1.0+1.21.11.jar');
    expect(mod.bundledJar('1.19.4')).toBeNull();
    expect(mod.supportedVersions()).toEqual(['26.3', '1.21.11', '1.21.1', '1.21']);
    expect(mod.unavailableReason(profile('1.21.11'))).toBeNull();
    expect(mod.unavailableReason(profile('1.19.4'))).toMatch(/1\.19\.4.*26\.3, 1\.21\.11/);
    expect(mod.unavailableReason(profile('1.21.11', 'forge'))).toMatch(/Fabric/);
  });

  it('ignores versions whose jar is missing and file names that leave the folder', async () => {
    writeIndex({ '1.21.1': 'zenthra-client-0.1.0+1.21.1.jar', '1.20.1': '../evil.jar' }, []);
    fs.writeFileSync(path.join(root, 'evil.jar'), 'x');
    const mod = await load();
    expect(mod.bundledJar('1.21.1')).toBeNull();
    expect(mod.bundledJar('1.20.1')).toBeNull();
    expect(mod.unavailableReason(profile('1.21.1'))).toMatch(/compilé/);
  });
});
