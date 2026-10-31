// Types and helpers for Mojang / Fabric version JSON files.

export interface OsRule {
  name?: string;
  arch?: string;
  version?: string;
}

export interface Rule {
  action: 'allow' | 'disallow';
  os?: OsRule;
  features?: Record<string, boolean>;
}

export interface Artifact {
  path: string;
  url: string;
  sha1: string;
  size: number;
}

export interface Library {
  name: string;
  downloads?: { artifact?: Artifact; classifiers?: Record<string, Artifact> };
  /** Maven repository base URL (Fabric style). */
  url?: string;
  sha1?: string;
  size?: number;
  rules?: Rule[];
  natives?: Record<string, string>;
  extract?: { exclude?: string[] };
}

export type Argument = string | { rules?: Rule[]; value: string | string[] };

export interface VersionJson {
  id: string;
  inheritsFrom?: string;
  type?: string;
  mainClass: string;
  minecraftArguments?: string;
  arguments?: { game?: Argument[]; jvm?: Argument[] };
  libraries: Library[];
  assetIndex?: { id: string; sha1: string; url: string; totalSize?: number };
  assets?: string;
  downloads?: { client?: { sha1: string; url: string; size: number } };
  javaVersion?: { component: string; majorVersion: number };
}

export type Features = Record<string, boolean>;

const osName = 'windows';
const osArch = process.arch === 'ia32' ? 'x86' : process.arch;

function osMatches(os: OsRule): boolean {
  if (os.name && os.name !== osName) return false;
  if (os.arch && os.arch !== osArch) return false;
  return true;
}

/** Mojang rule evaluation: last matching rule wins, default deny when rules exist. */
export function rulesAllow(rules: Rule[] | undefined, features: Features = {}): boolean {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    let matches = true;
    if (rule.os && !osMatches(rule.os)) matches = false;
    if (rule.features) {
      for (const [k, v] of Object.entries(rule.features)) {
        if ((features[k] ?? false) !== v) matches = false;
      }
    }
    if (matches) allowed = rule.action === 'allow';
  }
  return allowed;
}

/** Converts a Maven coordinate (group:artifact:version[:classifier][@ext]) to a repository path. */
export function mavenPath(name: string): string {
  const [coords, ext = 'jar'] = name.split('@');
  const [group, artifact, version, classifier] = coords.split(':');
  const file = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.${ext}`;
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${file}`;
}

/** Key used to de-duplicate libraries between a child version and its parent. */
export function libraryKey(name: string): string {
  const [group, artifact, , classifier] = name.split('@')[0].split(':');
  return `${group}:${artifact}${classifier ? `:${classifier}` : ''}`;
}

/** Merges a child version (e.g. Fabric) with its parent (vanilla). */
export function mergeVersions(child: VersionJson, parent: VersionJson): VersionJson {
  const seen = new Set<string>();
  const libraries: Library[] = [];
  for (const lib of [...child.libraries, ...parent.libraries]) {
    const key = libraryKey(lib.name);
    if (seen.has(key)) continue;
    seen.add(key);
    libraries.push(lib);
  }
  return {
    ...parent,
    id: child.id,
    inheritsFrom: parent.id,
    mainClass: child.mainClass ?? parent.mainClass,
    libraries,
    minecraftArguments: child.minecraftArguments ?? parent.minecraftArguments,
    arguments: {
      game: [...(parent.arguments?.game ?? []), ...(child.arguments?.game ?? [])],
      jvm: [...(parent.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])],
    },
  };
}
