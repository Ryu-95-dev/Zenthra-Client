import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  GraphicsChange,
  OptimizationCandidate,
  OptimizationReport,
  PerformancePackOptions,
  PerformancePackResult,
  Profile,
  ProfileIssue,
} from '../../../shared/types';
import { describeOption, GRAPHICS_DEFAULTS, GRAPHICS_KEYS, GRAPHICS_PRESETS, hardwareTier } from '../../../shared/performance';
import { getGameState } from '../minecraft/launch';
import { toMessage, UserError } from './errors';
import { latestOptionsBackup, readOptions, restoreOptionsBackup, writeOptions } from './gameOptions';
import { readJson } from './jsonStore';
import { executeInstall, getVersion, getVersions, planInstall } from './modrinth';
import { instanceDir } from './paths';
import { getProfile } from './profiles';
import { setModuleEnabled, unavailableReason } from './zenthraMod';

/**
 * "Pack Performance": open-source optimisation mods (Modrinth ids verified).
 * `minMc`/`maxMc` limit a mod to the Minecraft versions it exists for; within
 * that range Modrinth still decides whether a compatible build exists.
 */
export interface PackMod {
  projectId: string;
  name: string;
  purpose: string;
  minMc?: string;
  maxMc?: string;
  /** Installed only when the player asks for it. */
  optional?: boolean;
}

export const OPTIMIZATION_MODS: PackMod[] = [
  { projectId: 'AANobbMI', name: 'Sodium', purpose: 'Moteur de rendu bien plus rapide (FPS).' },
  { projectId: 'gvQqBUqZ', name: 'Lithium', purpose: 'Optimise la logique du jeu (physique, IA, chunks).' },
  { projectId: 'uXXizFIs', name: 'FerriteCore', purpose: 'Réduit la mémoire utilisée par le jeu.' },
  { projectId: '5ZwdcRci', name: 'ImmediatelyFast', purpose: 'Accélère l’affichage du HUD, du texte et des entités.' },
  { projectId: 'NNAgCjsB', name: 'Entity Culling', purpose: 'Ne dessine pas les entités cachées derrière des blocs.' },
  { projectId: '51shyZVL', name: 'More Culling', purpose: 'Ne dessine pas les faces de blocs invisibles (feuilles, cadres…).' },
  { projectId: 'g96Z4WVZ', name: 'BadOptimizations', purpose: 'Petites optimisations du rendu et des calculs par image.' },
  { projectId: 'fQEb0iXm', name: 'Krypton', purpose: 'Optimise la partie réseau du jeu.' },
  { projectId: 'Ps1zyz6x', name: 'ScalableLux', purpose: 'Calcul de la lumière plus rapide (chargement des chunks).', minMc: '1.21.1' },
  { projectId: 'nmDcB62a', name: 'ModernFix', purpose: 'Démarrage plus rapide et moins de mémoire.', maxMc: '1.21.4' },
  { projectId: 'LQ3K71Q1', name: 'Dynamic FPS', purpose: 'Réduit les FPS quand la fenêtre est en arrière-plan (option).', optional: true },
];

/** Compares Minecraft release numbers ("1.21.4" < "1.21.10" < "26.3"). */
export function compareMcVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Why a pack mod does not apply to this Minecraft version (null = it may apply). */
export function versionRangeReason(mod: PackMod, mcVersion: string): string | null {
  if (mod.minMc && compareMcVersions(mcVersion, mod.minMc) < 0) return `Disponible à partir de Minecraft ${mod.minMc}.`;
  if (mod.maxMc && compareMcVersions(mcVersion, mod.maxMc) > 0) return `Disponible jusqu’à Minecraft ${mod.maxMc}.`;
  return null;
}

/** Mods of the pack to try for a profile, in order. */
export function packMods(opts: PerformancePackOptions): PackMod[] {
  return OPTIMIZATION_MODS.filter((m) => !m.optional || (m.projectId === 'LQ3K71Q1' && opts.dynamicFps));
}

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
    let blocked: string | null = versionRangeReason(c, profile.mcVersion);
    if (profile.loader === 'vanilla') blocked = 'Profil Vanilla : choisis Fabric, Forge ou NeoForge.';
    else if (!blocked) {
      try {
        const versions = await getVersions(c.projectId, profile.loader, profile.mcVersion);
        const best = versions.find((v) => v.version_type === 'release') ?? versions[0];
        if (best) versionNumber = best.version_number;
        else blocked = `Pas de version pour Minecraft ${profile.mcVersion} (${profile.loader}).`;
      } catch {
        blocked = 'Modrinth injoignable : vérifie ta connexion.';
      }
    }
    out.push({ projectId: c.projectId, name: c.name, purpose: c.purpose, optional: c.optional, installed, versionNumber, blocked });
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

function assertNotRunning(profileId: string): void {
  const g = getGameState();
  if ((g.status === 'running' || g.status === 'preparing') && g.profileId === profileId) {
    throw new UserError('Ferme Minecraft avant d’installer des mods dans ce profil.');
  }
}

/**
 * Installs the Pack Performance into a Fabric profile: each mod goes through the
 * usual Modrinth plan (best compatible version, required dependencies, declared
 * incompatibilities) and is installed only when the plan has no conflict.
 * Nothing is forced: what cannot be installed is reported with the reason.
 */
export async function installPerformancePack(profileId: string, opts: PerformancePackOptions): Promise<PerformancePackResult> {
  assertNotRunning(profileId);
  const profile = await getProfile(profileId);
  if (profile.loader !== 'fabric') throw new UserError('Le Pack Performance est prévu pour les profils Fabric.');
  const result: PerformancePackResult = { installed: [], alreadyInstalled: [], skipped: [], moduleEnabled: null, moduleNote: null };
  for (const mod of packMods(opts)) {
    const range = versionRangeReason(mod, profile.mcVersion);
    if (range) {
      result.skipped.push({ name: mod.name, reason: range });
      continue;
    }
    // Re-read the profile: previous installs (and their dependencies) count for the next plan.
    const current = await getProfile(profileId);
    if (current.mods.some((m) => m.projectId === mod.projectId)) {
      result.alreadyInstalled.push(mod.name);
      continue;
    }
    try {
      const plan = await planInstall(profileId, mod.projectId, null, 'mod');
      if (plan.conflicts.length) {
        result.skipped.push({ name: mod.name, reason: plan.conflicts.join(' ') });
        continue;
      }
      if (!plan.toInstall.length) {
        result.alreadyInstalled.push(mod.name);
        continue;
      }
      await executeInstall(profileId, plan, 'mod', null);
      result.installed.push(...plan.toInstall.map((t) => t.title));
    } catch (err) {
      result.skipped.push({ name: mod.name, reason: toMessage(err) });
    }
  }
  result.installed = [...new Set(result.installed)];
  return result;
}

/** "Mode Performance": the pack, plus the Zenthra optimization module turned on. */
export async function applyPerformanceMode(profileId: string, opts: PerformancePackOptions): Promise<PerformancePackResult> {
  const result = await installPerformancePack(profileId, opts);
  const profile = await getProfile(profileId);
  const reason = unavailableReason(profile);
  if (reason) {
    result.moduleEnabled = false;
    result.moduleNote = reason;
  } else {
    // Only modules.<id>.enabled is changed (see shared/zenthra-config.md).
    await setModuleEnabled(profileId, 'optimization', true);
    result.moduleEnabled = true;
  }
  return result;
}
