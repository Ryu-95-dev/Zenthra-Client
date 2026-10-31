import { describe, expect, it } from 'vitest';
import { mavenPath, mergeVersions, rulesAllow, type VersionJson } from '../electron/minecraft/versionJson';
import { hardwareTier, recommendMemory } from '../../shared/performance';
import { GameOptions } from '../electron/services/gameOptions';
import { redact } from '../electron/services/errors';

describe('version selection rules', () => {
  it('applies Mojang OS and feature rules', () => {
    expect(rulesAllow(undefined)).toBe(true);
    expect(rulesAllow([{ action: 'allow', os: { name: 'osx' } }])).toBe(false);
    expect(rulesAllow([{ action: 'allow' }, { action: 'disallow', os: { name: 'windows' } }])).toBe(false);
    expect(rulesAllow([{ action: 'allow', features: { is_demo_user: true } }], { is_demo_user: true })).toBe(true);
    expect(rulesAllow([{ action: 'allow', features: { is_demo_user: true } }], {})).toBe(false);
  });

  it('builds Maven paths', () => {
    expect(mavenPath('net.fabricmc:fabric-loader:0.20.1')).toBe('net/fabricmc/fabric-loader/0.20.1/fabric-loader-0.20.1.jar');
    expect(mavenPath('org.lwjgl:lwjgl:3.3.3:natives-windows')).toBe('org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar');
  });

  it('merges a loader with vanilla, the loader winning on duplicates', () => {
    const vanilla = { id: '1.21.1', mainClass: 'net.minecraft.client.main.Main', libraries: [{ name: 'org.ow2.asm:asm:9.6' }, { name: 'a:b:1' }] } as VersionJson;
    const fabric = { id: 'fabric', inheritsFrom: '1.21.1', mainClass: 'net.fabricmc.Knot', libraries: [{ name: 'org.ow2.asm:asm:9.7' }] } as VersionJson;
    const m = mergeVersions(fabric, vanilla);
    expect(m.mainClass).toBe('net.fabricmc.Knot');
    expect(m.libraries.map((l) => l.name)).toEqual(['org.ow2.asm:asm:9.7', 'a:b:1']);
  });
});

describe('memory recommendation', () => {
  it('never exceeds half of the RAM', () => {
    for (const ram of [4096, 8192, 16384, 32768]) {
      const a = recommendMemory(ram, 'fabric', 200);
      expect(a.recommendedMb).toBeLessThanOrEqual(ram / 2);
      expect(a.ceilingMb).toBeLessThanOrEqual(ram / 2);
    }
  });

  it('does not hand out arbitrary 8 or 16 GB', () => {
    expect(recommendMemory(65536, 'vanilla', 0).recommendedMb).toBe(2048);
    expect(recommendMemory(65536, 'fabric', 10).recommendedMb).toBe(3072);
    expect(recommendMemory(65536, 'fabric', 150).recommendedMb).toBe(6144);
  });

  it('warns about values that are too high or too low', () => {
    expect(recommendMemory(8192, 'fabric', 10, 6000).warning).toMatch(/Trop élevé/);
    expect(recommendMemory(16384, 'fabric', 50, 1024).warning).toMatch(/trop bas/);
    expect(recommendMemory(16384, 'fabric', 10, 3072).warning).toBeNull();
  });
});

describe('hardware tier', () => {
  it('treats integrated graphics as a modest PC', () => {
    expect(hardwareTier({ totalRamMb: 32768, cores: 16, gpu: 'Intel(R) UHD Graphics 630' }).tier).toBe('low');
    expect(hardwareTier({ totalRamMb: 32768, cores: 16, gpu: 'NVIDIA GeForce RTX 4070/PCIe/SSE2' }).tier).toBe('high');
    expect(hardwareTier({ totalRamMb: 16384, cores: 8, gpu: null }).tier).toBe('medium');
  });
});

describe('options.txt', () => {
  it('round-trips unknown keys and edits lists', () => {
    const o = GameOptions.parse('﻿version:3955\nresourcePacks:["vanilla","file/A.zip"]\nkey_key.jump:key.keyboard.space\n');
    expect(o.resourcePacks).toEqual(['vanilla', 'file/A.zip']);
    o.resourcePacks = ['vanilla', 'file/B.zip'];
    expect(o.serialize()).toBe('version:3955\nresourcePacks:["vanilla","file/B.zip"]\nkey_key.jump:key.keyboard.space\n');
  });

  it('refuses injected lines', () => {
    expect(() => new GameOptions().set('maxFps', '120\nfullscreen:true')).toThrow();
  });
});

describe('log redaction', () => {
  it('never lets tokens reach the logs', () => {
    const line = 'args --accessToken eyJhbGciOi.secret.token --version 1.21.1 {"refresh_token":"M.R3_abc"} Bearer abc.def';
    const out = redact(line);
    expect(out).not.toMatch(/eyJhbGciOi|M\.R3_abc|abc\.def/);
    expect(out).toContain('--version 1.21.1');
  });
});
