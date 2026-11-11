import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectiveMemoryMb, recommendMemory } from '../../shared/performance';
import { cdsPathUsable, parseJavaRelease, supportsAutoCds, tunedJvmFlags, userChoseGc } from '../electron/minecraft/jvmFlags';
import { cleanup, mockFetch, setupTempRoot } from './helpers';

let root: string;
beforeEach(() => {
  root = setupTempRoot();
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup(root);
});

describe('TTL JSON cache', () => {
  it('uses a fresh copy without loading, reloads once expired', async () => {
    const { cachedJson } = await import('../electron/services/jsonCache');
    const file = path.join(root, 'cache', 'x.json');
    let t = 1_000_000;
    const load = vi.fn(async () => ({ n: load.mock.calls.length }));
    const opts = { file, key: 'https://a.test/x', ttlMs: 1000, load, now: () => t };

    expect(await cachedJson(opts)).toEqual({ data: { n: 1 }, source: 'network' });
    t += 500;
    expect(await cachedJson(opts)).toEqual({ data: { n: 1 }, source: 'cache' });
    expect(load).toHaveBeenCalledTimes(1);
    t += 600;
    expect(await cachedJson(opts)).toEqual({ data: { n: 2 }, source: 'network' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('ignores a copy stored for another key or dated in the future', async () => {
    const { cachedJson } = await import('../electron/services/jsonCache');
    const file = path.join(root, 'cache', 'y.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ key: 'other', fetchedAt: Date.now(), data: 'old' }));
    expect((await cachedJson({ file, key: 'k', ttlMs: 60_000, load: async () => 'new' })).source).toBe('network');
    fs.writeFileSync(file, JSON.stringify({ key: 'k', fetchedAt: Date.now() + 3_600_000, data: 'future' }));
    expect(await cachedJson({ file, key: 'k', ttlMs: 60_000, load: async () => 'fresh' })).toEqual({ data: 'fresh', source: 'network' });
  });

  it('falls back to an expired copy when offline, and fails without one', async () => {
    const { cachedJson } = await import('../electron/services/jsonCache');
    const file = path.join(root, 'cache', 'z.json');
    let t = 0;
    await cachedJson({ file, key: 'k', ttlMs: 10, load: async () => [1, 2], now: () => t });
    t = 1000;
    const offline = async (): Promise<number[]> => {
      throw new Error('offline');
    };
    expect(await cachedJson({ file, key: 'k', ttlMs: 10, load: offline, now: () => t })).toEqual({ data: [1, 2], source: 'stale' });
    await expect(cachedJson({ file, key: 'k', ttlMs: 10, load: offline, now: () => t, allowStale: false })).rejects.toThrow('offline');
    await expect(cachedJson({ file: path.join(root, 'none.json'), key: 'k', ttlMs: 10, load: offline })).rejects.toThrow('offline');
  });

  it('does not store refused answers', async () => {
    const { cachedJson } = await import('../electron/services/jsonCache');
    const file = path.join(root, 'cache', 'empty.json');
    await cachedJson({ file, key: 'k', ttlMs: 60_000, load: async () => [] as string[], accept: (l) => l.length > 0 });
    expect(fs.existsSync(file)).toBe(false);
  });

  it('launch: an installed Java runtime with a fresh index needs no network', async () => {
    const { ensureJavaRuntime } = await import('../electron/minecraft/java');
    const { Task } = await import('../electron/services/events');
    const { runtimesDir } = await import('../electron/services/paths');
    const platform = process.arch === 'arm64' ? 'windows-arm64' : process.arch === 'ia32' ? 'windows-x86' : 'windows-x64';
    const index = { [platform]: { 'java-runtime-delta': [{ manifest: { sha1: 'abc', url: 'https://piston-meta.mojang.com/m.json' }, version: { name: '21.0.7' } }] } };
    const fetchMock = mockFetch({ 'java-runtime': index });
    const rt = path.join(runtimesDir(), 'java-runtime-delta');
    fs.mkdirSync(path.join(rt, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(rt, 'bin', 'javaw.exe'), '');
    fs.writeFileSync(path.join(rt, '.zenthra-manifest'), 'abc');

    const javaw = await ensureJavaRuntime('java-runtime-delta', new Task('t'));
    expect(javaw).toBe(path.join(rt, 'bin', 'javaw.exe'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await ensureJavaRuntime('java-runtime-delta', new Task('t'));
    // Second launch: the cached index is fresh, nothing is downloaded.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('launch: Fabric loader list is cached and an installed loader needs no network', async () => {
    const { installFabric } = await import('../electron/minecraft/fabric');
    const { Task } = await import('../electron/services/events');
    const { versionsDir } = await import('../electron/services/paths');
    const fetchMock = mockFetch({ 'versions/loader/1.21.1': [{ loader: { version: '0.17.2', stable: true } }] });
    const id = 'fabric-loader-0.17.2-1.21.1';
    fs.mkdirSync(path.join(versionsDir(), id), { recursive: true });
    fs.writeFileSync(path.join(versionsDir(), id, `${id}.json`), JSON.stringify({ id, inheritsFrom: '1.21.1', libraries: [] }));

    expect(await installFabric('1.21.1', null, new Task('t'))).toBe(id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await installFabric('1.21.1', null, new Task('t'))).toBe(id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('JVM flags', () => {
  it('uses generational ZGC on Java 21-22 and plain ZGC (already generational) on 23+', () => {
    expect(tunedJvmFlags({ javaMajor: 21, userArgs: [], cdsArchive: null })).toEqual(['-XX:+UseZGC', '-XX:+ZGenerational']);
    expect(tunedJvmFlags({ javaMajor: 25, userArgs: [], cdsArchive: null })).toEqual(['-XX:+UseZGC']);
  });

  it('uses tuned G1 on Java 17 and nothing on Java 8 or unknown', () => {
    const g1 = tunedJvmFlags({ javaMajor: 17, userArgs: [], cdsArchive: null });
    expect(g1[0]).toBe('-XX:+UseG1GC');
    expect(g1).toContain('-XX:+UnlockExperimentalVMOptions');
    expect(g1.indexOf('-XX:+UnlockExperimentalVMOptions')).toBeLessThan(g1.indexOf('-XX:G1NewSizePercent=30'));
    expect(tunedJvmFlags({ javaMajor: 8, userArgs: [], cdsArchive: null })).toEqual([]);
    expect(tunedJvmFlags({ javaMajor: null, userArgs: [], cdsArchive: 'C:/x/zenthra.jsa' })).toEqual([]);
  });

  it('leaves the collector to the player when they chose one', () => {
    expect(userChoseGc(['-XX:+UseG1GC'])).toBe(true);
    expect(userChoseGc(['-XX:+UseShenandoahGC'])).toBe(true);
    expect(userChoseGc(['-Xss2M', '-XX:MaxGCPauseMillis=10'])).toBe(false);
    expect(tunedJvmFlags({ javaMajor: 21, userArgs: ['-XX:+UseG1GC'], cdsArchive: null })).toEqual([]);
  });

  it('adds CDS only for Java 19+, ASCII paths, and when the player did not configure it', () => {
    const a = 'C:\\Games\\.zenthra\\cache\\cds\\1.21.1\\zenthra-java21.jsa';
    const flags = tunedJvmFlags({ javaMajor: 21, userArgs: [], cdsArchive: a });
    expect(flags.slice(-3)).toEqual(['-Xshare:auto', `-XX:SharedArchiveFile=${a}`, '-XX:+AutoCreateSharedArchive']);
    expect(tunedJvmFlags({ javaMajor: 17, userArgs: [], cdsArchive: a }).some((f) => f.includes('Shared'))).toBe(false);
    expect(tunedJvmFlags({ javaMajor: 21, userArgs: ['-Xshare:off'], cdsArchive: a }).some((f) => f.includes('Shared'))).toBe(false);
    expect(cdsPathUsable('C:\\Users\\Élodie\\x.jsa')).toBe(false);
    expect(supportsAutoCds(19)).toBe(true);
    expect(supportsAutoCds(18)).toBe(false);
  });

  it('reads the Java version from the runtime release file', () => {
    expect(parseJavaRelease('IMPLEMENTOR="Microsoft"\nJAVA_VERSION="21.0.7"\n')).toBe(21);
    expect(parseJavaRelease('JAVA_VERSION="1.8.0_51"')).toBe(8);
    expect(parseJavaRelease('JAVA_VERSION="17"')).toBe(17);
    expect(parseJavaRelease('nothing')).toBeNull();
  });

  it('puts the player arguments after the tuned flags so they win', async () => {
    const { buildArguments } = await import('../electron/minecraft/launch');
    const args = buildArguments(
      { id: '1.21.1', mainClass: 'net.minecraft.client.main.Main', libraries: [], arguments: { jvm: ['-Dversion=x'], game: [] } } as never,
      '1.21.1',
      {
        providesGameJar: false,
        identity: { name: 'Player', uuid: '0', accessToken: '0', xuid: '0', demo: true },
        gameDir: root,
        memoryMb: 4096,
        extraJvm: '-XX:+UseZGC -Dmine=1',
        resolution: null,
        javaMajor: 21,
        cdsArchive: null,
      },
    );
    const main = args.indexOf('net.minecraft.client.main.Main');
    expect(args[0]).toBe('-Xmx4096M');
    // The player picked the collector: ours is not added (two collectors would stop the JVM).
    expect(args.filter((a) => a === '-XX:+UseZGC')).toHaveLength(1);
    expect(args.indexOf('-Dmine=1')).toBe(main - 1);
    expect(args.indexOf('-Dversion=x')).toBeLessThan(args.indexOf('-XX:+UseZGC'));
  });
});

describe('automatic memory', () => {
  const settings = { memoryMb: 6144, autoMemory: true };
  it('keeps an explicit profile value', () => {
    expect(effectiveMemoryMb({ memoryMb: 3072, loader: 'fabric', mods: [] }, settings, 16384)).toEqual({ memoryMb: 3072, source: 'profile' });
  });
  it('picks the recommendation from total RAM and mod count', () => {
    const mods = new Array(40).fill(0);
    const auto = effectiveMemoryMb({ memoryMb: null, loader: 'fabric', mods }, settings, 16384);
    expect(auto).toEqual({ memoryMb: recommendMemory(16384, 'fabric', 40).recommendedMb, source: 'auto' });
    expect(auto.memoryMb).toBe(4096);
    // 8 GB PC: capped at half of the RAM.
    expect(effectiveMemoryMb({ memoryMb: null, loader: 'fabric', mods }, settings, 8192).memoryMb).toBe(4096);
    expect(effectiveMemoryMb({ memoryMb: null, loader: 'vanilla', mods: [] }, settings, 32768).memoryMb).toBe(2048);
  });
  it('uses the launcher value when automatic memory is off', () => {
    expect(effectiveMemoryMb({ memoryMb: null, loader: 'fabric', mods: [] }, { memoryMb: 6144, autoMemory: false }, 16384)).toEqual({
      memoryMb: 6144,
      source: 'launcher',
    });
  });
  it('keeps a memory value the player changed before the setting existed', async () => {
    const { configDir } = await import('../electron/services/paths');
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(path.join(configDir(), 'settings.json'), JSON.stringify({ memoryMb: 12345 }));
    const s = await import('../electron/services/settings');
    expect((await s.getSettings()).autoMemory).toBe(false);
  });
  it('new installs default to automatic memory', async () => {
    const s = await import('../electron/services/settings');
    expect((await s.getSettings()).autoMemory).toBe(true);
  });
});

describe('Pack Performance', () => {
  it('limits ScalableLux to 1.21.1+ and ModernFix to 1.21.4 and older', async () => {
    const { OPTIMIZATION_MODS, compareMcVersions, versionRangeReason } = await import('../electron/services/optimizer');
    const byName = (n: string) => OPTIMIZATION_MODS.find((m) => m.name === n)!;
    expect(compareMcVersions('1.21.10', '1.21.4')).toBeGreaterThan(0);
    expect(compareMcVersions('26.3', '1.21.11')).toBeGreaterThan(0);
    expect(compareMcVersions('1.21', '1.21.0')).toBe(0);
    expect(versionRangeReason(byName('ScalableLux'), '1.20.4')).toMatch(/1\.21\.1/);
    expect(versionRangeReason(byName('ScalableLux'), '1.21.1')).toBeNull();
    expect(versionRangeReason(byName('ModernFix'), '1.21.4')).toBeNull();
    expect(versionRangeReason(byName('ModernFix'), '1.21.5')).toMatch(/1\.21\.4/);
    expect(versionRangeReason(byName('ModernFix'), '26.3')).not.toBeNull();
  });

  it('adds Dynamic FPS only when asked', async () => {
    const { packMods } = await import('../electron/services/optimizer');
    const ids = (dynamicFps: boolean) => packMods({ dynamicFps }).map((m) => m.projectId);
    expect(ids(false)).toEqual(['AANobbMI', 'gvQqBUqZ', 'uXXizFIs', '5ZwdcRci', 'NNAgCjsB', '51shyZVL', 'g96Z4WVZ', 'fQEb0iXm', 'Ps1zyz6x', 'nmDcB62a']);
    expect(ids(true)).toContain('LQ3K71Q1');
  });

  it('installs what is compatible and reports the rest', async () => {
    const { createProfile } = await import('../electron/services/profiles');
    const profile = await createProfile({ name: 'Perf', mcVersion: '1.21.5', loader: 'fabric', zenthraMod: false });
    // Only Sodium has a build in this fake Modrinth; every other project has none.
    const sodium = {
      id: 'v1', project_id: 'AANobbMI', version_number: '0.6.13', version_type: 'release', date_published: '2025-01-01T00:00:00Z',
      game_versions: ['1.21.5'], loaders: ['fabric'], dependencies: [],
      files: [{ url: 'https://cdn.modrinth.com/s.jar', filename: 'sodium.jar', primary: true, hashes: { sha1: 'a', sha512: 'b' } }],
    };
    mockFetch({ 'project/AANobbMI/version': [sodium], '/version?': [], '/project/': { title: 'Projet' } });
    const modrinth = await import('../electron/services/modrinth');
    const exec = vi.spyOn(modrinth, 'executeInstall').mockResolvedValue(profile);
    const { installPerformancePack } = await import('../electron/services/optimizer');
    const r = await installPerformancePack(profile.id, { dynamicFps: false });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(r.installed).toEqual(['Projet']);
    expect(r.skipped.find((s) => s.name === 'ModernFix')?.reason).toMatch(/1\.21\.4/);
    expect(r.skipped.find((s) => s.name === 'Lithium')?.reason).toMatch(/aucune version compatible/);
    expect(r.skipped.some((s) => s.name === 'Dynamic FPS')).toBe(false);
  });

  it('refuses non-Fabric profiles', async () => {
    const { createProfile } = await import('../electron/services/profiles');
    const p = await createProfile({ name: 'Vanilla 2', mcVersion: '1.21.1', loader: 'vanilla' });
    const { installPerformancePack } = await import('../electron/services/optimizer');
    await expect(installPerformancePack(p.id, { dynamicFps: false })).rejects.toThrow(/Fabric/);
  });
});

describe('launch markers', () => {
  it('identifies the native jars used', async () => {
    const { nativesSignature } = await import('../electron/minecraft/versions');
    const a = nativesSignature([{ path: 'a.jar', sha1: '1' }]);
    expect(nativesSignature([{ path: 'a.jar', sha1: '1' }])).toBe(a);
    expect(nativesSignature([{ path: 'a.jar', sha1: '2' }])).not.toBe(a);
  });
});
