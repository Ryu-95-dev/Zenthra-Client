// Pure recommendation logic shared by the launcher process and the interface
// (and covered by unit tests). Nothing here promises a number of FPS: the
// result depends on the hardware, the version and the scene.

import type { LoaderType } from './types';

export interface MemoryAdvice {
  /** Recommended maximum heap (-Xmx), in MB. */
  recommendedMb: number;
  /** Hard ceiling we accept for this computer, in MB. */
  ceilingMb: number;
  /** Plain-language reasons, shown to the player. */
  reasons: string[];
  /** Warning for a value chosen by the player, if any. */
  warning: string | null;
}

const round512 = (mb: number) => Math.max(512, Math.round(mb / 512) * 512);

/**
 * Java heap recommendation. More memory is not more FPS: an oversized heap
 * makes garbage collections longer and starves Windows and the GPU driver.
 */
export function recommendMemory(totalRamMb: number, loader: LoaderType, modCount: number, chosenMb?: number | null): MemoryAdvice {
  const reasons: string[] = [];
  let need: number;
  if (loader === 'vanilla' || modCount === 0) {
    need = 2048;
    reasons.push('Minecraft sans mods fonctionne bien avec 2 Go.');
  } else if (modCount < 30) {
    need = 3072;
    reasons.push(`${modCount} mod(s) : 3 Go suffisent pour un profil léger.`);
  } else if (modCount < 100) {
    need = 4096;
    reasons.push(`${modCount} mods : 4 Go recommandés pour un profil chargé.`);
  } else {
    need = 6144;
    reasons.push(`${modCount} mods : un gros modpack demande environ 6 Go.`);
  }
  // Never take more than half of the RAM, and leave at least 4 GB to Windows when possible.
  const ceiling = round512(Math.max(1536, Math.min(totalRamMb * 0.5, totalRamMb - 4096)));
  if (need > ceiling) {
    reasons.push(`Limité à ${(ceiling / 1024).toFixed(1)} Go pour laisser assez de mémoire à Windows (${Math.round(totalRamMb / 1024)} Go au total).`);
  }
  const recommendedMb = round512(Math.min(need, ceiling));
  reasons.push('Allouer plus de mémoire n’augmente pas les FPS et peut provoquer des saccades.');

  let warning: string | null = null;
  if (chosenMb) {
    if (chosenMb > ceiling) warning = `Trop élevé pour ce PC : au-delà de ${(ceiling / 1024).toFixed(1)} Go, Windows risque de manquer de mémoire.`;
    else if (chosenMb > recommendedMb * 1.75) warning = 'Bien au-dessus du besoin : les pauses du ramasse-miettes Java peuvent s’allonger.';
    else if (chosenMb < Math.min(2048, recommendedMb) || chosenMb < recommendedMb * 0.6) warning = 'Probablement trop bas : le jeu risque de manquer de mémoire.';
  }
  return { recommendedMb, ceilingMb: ceiling, reasons, warning };
}

export type HardwareTier = 'low' | 'medium' | 'high';

export interface HardwareInfo {
  totalRamMb: number;
  cores: number;
  /** Renderer string reported by the game (OpenGL), when known. */
  gpu: string | null;
}

export function hardwareTier(hw: HardwareInfo): { tier: HardwareTier; reasons: string[] } {
  const reasons: string[] = [];
  const gpu = hw.gpu ?? '';
  const integrated = /intel|uhd|iris|hd graphics|vega \d+ graphics|radeon\(tm\) graphics/i.test(gpu);
  const strongGpu = /rtx|rx ?[67]\d{3}|rx ?[5-9]\d{2}0|arc a7|radeon pro/i.test(gpu);
  if (!hw.gpu) reasons.push('Carte graphique inconnue : lance le jeu une fois pour qu’elle soit détectée.');
  else reasons.push(`Carte graphique : ${gpu}${integrated ? ' (intégrée)' : ''}.`);
  reasons.push(`${Math.round(hw.totalRamMb / 1024)} Go de RAM, ${hw.cores} cœurs logiques.`);
  if (hw.totalRamMb < 8192 || hw.cores <= 4 || integrated) return { tier: 'low', reasons };
  if (hw.totalRamMb >= 16384 && hw.cores >= 8 && strongGpu) return { tier: 'high', reasons };
  return { tier: 'medium', reasons };
}

/** options.txt keys we recommend, with labels. Values use Minecraft's own encoding. */
export const GRAPHICS_KEYS: Record<string, string> = {
  renderDistance: 'Distance de rendu',
  simulationDistance: 'Distance de simulation',
  graphicsMode: 'Qualité graphique',
  particles: 'Particules',
  renderClouds: 'Nuages',
  entityShadows: 'Ombres des entités',
  biomeBlendRadius: 'Fondu des biomes',
  enableVsync: 'VSync',
  maxFps: 'Limite de FPS',
};

/** Minecraft 1.21 defaults, used when options.txt does not exist yet. */
export const GRAPHICS_DEFAULTS: Record<string, string> = {
  renderDistance: '12',
  simulationDistance: '12',
  graphicsMode: '1',
  particles: '0',
  renderClouds: '"true"',
  entityShadows: 'true',
  biomeBlendRadius: '2',
  enableVsync: 'true',
  maxFps: '120',
};

export const GRAPHICS_PRESETS: Record<HardwareTier, Record<string, string>> = {
  low: {
    renderDistance: '8',
    simulationDistance: '6',
    graphicsMode: '0',
    particles: '2',
    renderClouds: '"false"',
    entityShadows: 'false',
    biomeBlendRadius: '0',
    enableVsync: 'false',
    maxFps: '120',
  },
  medium: {
    renderDistance: '12',
    simulationDistance: '8',
    graphicsMode: '1',
    particles: '1',
    renderClouds: '"fast"',
    entityShadows: 'true',
    biomeBlendRadius: '2',
    enableVsync: 'false',
    maxFps: '144',
  },
  high: {
    renderDistance: '16',
    simulationDistance: '10',
    graphicsMode: '1',
    particles: '0',
    renderClouds: '"true"',
    entityShadows: 'true',
    biomeBlendRadius: '3',
    enableVsync: 'false',
    maxFps: '240',
  },
};

/** Human-readable rendering of an options.txt value. */
export function describeOption(key: string, raw: string): string {
  const v = raw.replace(/^"|"$/g, '');
  switch (key) {
    case 'renderDistance':
    case 'simulationDistance':
      return `${v} chunks`;
    case 'graphicsMode':
      return ['Rapide', 'Détaillée', 'Fabuleuse'][Number(v)] ?? v;
    case 'particles':
      return ['Toutes', 'Réduites', 'Minimales'][Number(v)] ?? v;
    case 'renderClouds':
      return v === 'false' ? 'Désactivés' : v === 'fast' ? 'Rapides' : 'Détaillés';
    case 'entityShadows':
    case 'enableVsync':
      return v === 'true' ? 'Activé' : 'Désactivé';
    case 'maxFps':
      return Number(v) >= 260 ? 'Illimitée' : `${v} FPS`;
    case 'biomeBlendRadius':
      return v === '0' ? 'Désactivé' : `${Number(v) * 2 + 1}×${Number(v) * 2 + 1}`;
    default:
      return v;
  }
}
