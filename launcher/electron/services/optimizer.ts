import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GraphicsChange, OptimizationCandidate, OptimizationReport, Profile, ProfileIssue } from '../../../shared/types';
import { describeOption, GRAPHICS_DEFAULTS, GRAPHICS_KEYS, GRAPHICS_PRESETS, hardwareTier } from '../../../shared/performance';
import { getGameState } from '../minecraft/launch';
import { UserError } from './errors';
import { latestOptionsBackup, readOptions, restoreOptionsBackup, writeOptions } from './gameOptions';
import { readJson } from './jsonStore';
import { getVersion, getVersions } from './modrinth';
import { instanceDir } from './paths';
import { getProfile } from './profiles';

/** Open-source optimisation mods (ids verified on Modrinth). */
export const OPTIMIZATION_MODS = [
  { projectId: 'AANobbMI', name: 'Sodium', purpose: 'Moteur de rendu bien plus rapide (FPS).' },
  { projectId: 'gvQqBUqZ', name: 'Lithium', purpose: 'Optimise la logique du jeu (physique, IA, chunks).' },
  { projectId: 'uXXizFIs', name: 'FerriteCore', purpose: 'Réduit la mémoire utilisée par le jeu.' },
  { projectId: '5ZwdcRci', name: 'ImmediatelyFast', purpose: 'Accélère l’affichage du HUD, du texte et des entités.' },
  { projectId: 'NNAgCjsB', name: 'Entity Culling', purpose: 'Ne dessine pas les entités cachées derrière des blocs.' },
];

/** GPU name from the last telemetry the mod wrote for this profile (any age: the hardware does not change). */
async function knownGpu(profileId: string): Promise<string | null> {
  const t = await readJson<{ gpu?: unknown } | null>(path.join(instanceDir(profileId), 'zenthra', 'telemetry.json'), null);
  return typeof t?.gpu === 'string' ? t.gpu.slice(0, 200) : null;
}

/** Strips versions from a jar name: "sodium-fabric-0.6.0+mc1.21.1.jar" → "sodium-fabric". */
export function modBaseName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/\.jar$/, '')
    .replace(/[-_+]?(mc)?\d+(\.\d+)+.*$/, '')
    .replace(/[-_](fabric|forge|neoforge|quilt)$/, '');
}

async function findIssues(profile: Profile): Promise<ProfileIssue[]> {
  const issues: ProfileIssue[] = [];
  // Duplicates: same Modrinth project twice, or two jars with the same base name.
  const byProject = new Map<string, string[]>();
  const byBase = new Map<string, string[]>();
  for (const m of profile.mods) {
    if (m.projectId) byProject.set(m.projectId, [...(byProject.get(m.projectId) ?? []), m.fileName]);
    const base = modBaseName(m.fileName);
    if (base) byBase.set(base, [...(byBase.get(base) ?? []), m.fileName]);
  }
  const reported = new Set<string>();
  for (const files of [...byProject.values(), ...byBase.values()]) {
    const key = [...files].sort().join('|');
    if (files.length > 1 && !reported.has(key)) {
      reported.add(key);
      issues.push({ kind: 'duplicate', message: `Mod en double : ${files.join(', ')}. Garde une seule version.` });
    }
  }
  // Missing dependencies and wrong loader, for mods installed from Modrinth.
  const installed = new Set(profile.mods.map((m) => m.projectId).filter(Boolean));
  for (const m of profile.mods) {
    if (!m.versionId) continue;
    try {
      const v = await getVersion(m.versionId);
      if (profile.loader !== 'vanilla' && !v.loaders.includes(profile.loader)) {
        issues.push({ kind: 'wrong-loader', message: `${m.title} est prévu pour ${v.loaders.join('/')}, pas pour ${profile.loader}.` });
      }
      for (const d of v.dependencies) {
        if (d.dependency_type === 'required' && d.project_id && !installed.has(d.project_id)) {
          issues.push({ kind: 'missing-dependency', message: `${m.title} a besoin d’un mod qui n’est pas installé.`, fixProjectId: d.project_id });
        }
        if (d.dependency_type === 'incompatible' && d.project_id && installed.has(d.project_id)) {
          const other = profile.mods.find((x) => x.projectId === d.project_id)?.title ?? d.project_id;
          issues.push({ kind: 'incompatible', message: `${m.title} est incompatible avec ${other}.` });
        }
      }
    } catch {
      // Offline or project removed: skip this mod rather than fail the whole analysis.
    }
  }
  return issues;
}

async function candidates(profile: Profile): Promise<OptimizationCandidate[]> {
  const out: OptimizationCandidate[] = [];
  for (const c of OPTIMIZATION_MODS) {
    const installed = profile.mods.some((m) => m.projectId === c.projectId);
    let versionNumber: string | null = null;
    let blocked: string | null = null;
    if (profile.loader === 'vanilla') blocked = 'Profil Vanilla : choisis Fabric, Forge ou NeoForge.';
    else {
      try {
        const versions = await getVersions(c.projectId, profile.loader, profile.mcVersion);
        const best = versions.find((v) => v.version_type === 'release') ?? versions[0];
        if (best) versionNumber = best.version_number;
        else blocked = `Pas de version pour Minecraft ${profile.mcVersion} (${profile.loader}).`;
      } catch {
        blocked = 'Modrinth injoignable : vérifie ta connexion.';
      }
    }
    out.push({ ...c, installed, versionNumber, blocked });
  }
  return out;
}

async function graphicsPlan(profileId: string, preset: Record<string, string>): Promise<GraphicsChange[]> {
  const options = await readOptions(profileId);
  const changes: GraphicsChange[] = [];
  for (const [key, recommended] of Object.entries(preset)) {
    const current = options.get(key) ?? GRAPHICS_DEFAULTS[key];
    if (current !== recommended) {
      changes.push({ key, label: GRAPHICS_KEYS[key], current: describeOption(key, current), recommended: describeOption(key, recommended) });
    }
  }
  return changes;
}

export async function analyzeProfile(profileId: string): Promise<OptimizationReport> {
  const profile = await getProfile(profileId);
  const system = { totalRamMb: Math.round(os.totalmem() / 1048576), cores: os.cpus().length, gpu: await knownGpu(profileId) };
  const { tier, reasons } = hardwareTier(system);
  const [cands, issues, graphics] = await Promise.all([candidates(profile), findIssues(profile), graphicsPlan(profileId, GRAPHICS_PRESETS[tier])]);
  return {
    profileId,
    system,
    tier,
    tierReasons: reasons,
    candidates: cands,
    issues,
    graphics,
    canRestoreGraphics: !!(await latestOptionsBackup(profileId)),
    sodiumInstalled: profile.mods.some((m) => m.projectId === 'AANobbMI') || fs.existsSync(path.join(instanceDir(profileId), 'config', 'sodium-options.json')),
  };
}

function assertClosed(profileId: string): void {
  const g = getGameState();
  if ((g.status === 'running' || g.status === 'preparing') && g.profileId === profileId) {
    throw new UserError('Ferme Minecraft avant de changer les réglages graphiques : le jeu réécrit ses options en quittant.');
  }
}

/** Applies the selected recommended settings (keys) after backing up options.txt. */
export async function applyGraphics(profileId: string, keys: string[]): Promise<void> {
  assertClosed(profileId);
  const profile = await getProfile(profileId);
  const system = { totalRamMb: Math.round(os.totalmem() / 1048576), cores: os.cpus().length, gpu: await knownGpu(profile.id) };
  const preset = GRAPHICS_PRESETS[hardwareTier(system).tier];
  const options = await readOptions(profileId);
  for (const k of keys) {
    if (!(k in preset)) throw new UserError(`Réglage inconnu : ${k}`);
    options.set(k, preset[k]);
  }
  await writeOptions(profileId, options);
}

export async function restoreGraphics(profileId: string): Promise<boolean> {
  assertClosed(profileId);
  return restoreOptionsBackup(profileId);
}
