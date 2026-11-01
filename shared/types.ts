// Types shared between the Electron main process and the React renderer.
// The on-disk format of the Zenthra mod configuration is documented in
// shared/zenthra-config.md and must stay in sync with the Java mod.

export type LoaderType = 'vanilla' | 'fabric' | 'forge' | 'neoforge';

/** Loaders the launcher can actually install and launch today. */
export const SUPPORTED_LOADERS: LoaderType[] = ['vanilla', 'fabric', 'forge', 'neoforge'];

export const LOADER_LABELS: Record<LoaderType, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
};

export interface InstalledContent {
  /** Modrinth project id, or null for files added manually. */
  projectId: string | null;
  versionId: string | null;
  title: string;
  fileName: string;
  sha1?: string;
  iconUrl?: string | null;
  installedAt: string;
}

export interface Profile {
  id: string;
  name: string;
  icon: ProfileIcon;
  /** Custom picture chosen by the user (128×128 PNG data URL), shown instead of the icon. */
  iconImage?: string | null;
  mcVersion: string;
  loader: LoaderType;
  /** Fabric loader version; null = latest stable at install time. */
  loaderVersion: string | null;
  /** Whether the Zenthra Fabric mod is injected into this profile. */
  zenthraMod: boolean;
  memoryMb: number | null;
  jvmArgs: string;
  resolution: { width: number; height: number } | null;
  mods: InstalledContent[];
  resourcePacks: InstalledContent[];
  /** Shader packs (shaderpacks/), used through Iris. */
  shaderPacks: InstalledContent[];
  createdAt: string;
  lastPlayed: string | null;
  builtin: boolean;
}

export type ProfileIcon = 'sword' | 'tree' | 'hammer' | 'grass' | 'gauge' | 'box' | 'star';

/** Snapshot of a profile's settings taken before an important change. */
export interface ProfileHistoryEntry {
  at: string;
  /** Labels of the fields that were changed. */
  fields: string[];
  before: Omit<Profile, 'mods' | 'resourcePacks' | 'shaderPacks' | 'iconImage'>;
}

export interface ProfileExport {
  format: 'zenthra-profile';
  formatVersion: 1;
  profile: Omit<Profile, 'id' | 'createdAt' | 'lastPlayed' | 'builtin'>;
}

export interface Settings {
  accentColor: string;
  backgroundOpacity: number;
  sakuraBackground: boolean;
  animations: boolean;
  uiSounds: boolean;
  uiVolume: number;
  dataDir: string;
  memoryMb: number;
  jvmArgs: string;
  afterLaunch: 'keep' | 'minimize' | 'hide';
  language: 'fr';
  showOnlineStatus: boolean;
  /** Discord Rich Presence ("Joue à Zenthra Client"), through the local Discord app only. */
  discordPresence: boolean;
  presenceServerUrl: string;
  msClientId: string;
  selectedProfileId: string;
  /** HTTPS address of the update manifest (empty = updates not configured). */
  updateUrl: string;
  /** Maximum number of files downloaded at the same time (1–16). */
  downloadConcurrency: number;
  /** Customised home page; null = default layout. */
  homeLayout: HomeBlockLayout[] | null;
  /** Modules shown, in order, in the home "Modules actifs" block; null = all. */
  panelModules: string[] | null;
}

export const HOME_BLOCK_IDS = ['hero', 'modules', 'community', 'quickActions', 'recentProfiles', 'versions', 'recentContent'] as const;
export type HomeBlockId = (typeof HOME_BLOCK_IDS)[number];

export interface HomeBlockLayout {
  id: HomeBlockId;
  /** Width in columns of a 12-column grid. */
  w: number;
  /** Height in grid rows. */
  h: number;
  hidden: boolean;
}

export interface VersionSummary {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  releaseTime: string;
  installed: boolean;
}

export interface InstalledVersion {
  id: string;
  /** Size in bytes of the version folder (client jar + json). */
  size: number;
  inheritsFrom?: string;
}

export interface Account {
  uuid: string;
  name: string;
  skinUrl: string | null;
  /** ISO date at which the Minecraft access token expires. */
  expiresAt: string;
}

export type AuthState =
  | { status: 'signed-out'; configured: boolean }
  | { status: 'signing-in' }
  | { status: 'signed-in'; account: Account }
  | { status: 'error'; message: string; configured: boolean };

export interface TaskProgress {
  taskId: string;
  label: string;
  /** 0..1, or -1 when indeterminate. */
  progress: number;
  detail?: string;
  done?: boolean;
  error?: string;
  /** The user can cancel this operation. */
  cancellable?: boolean;
}

export type GameState =
  | { status: 'idle' }
  | { status: 'preparing'; profileId: string }
  | { status: 'running'; profileId: string; pid: number; startedAt: string }
  | { status: 'crashed'; profileId: string; exitCode: number | null };

export interface LogLine {
  ts: number;
  stream: 'stdout' | 'stderr' | 'launcher';
  text: string;
}

// ---- Modrinth ----

export type ModrinthProjectType = 'mod' | 'resourcepack' | 'shader' | 'modpack';

export interface ModrinthSearchQuery {
  query: string;
  projectType: ModrinthProjectType;
  gameVersion: string | null;
  loader: LoaderType | null;
  offset: number;
  sort: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated';
}

export interface ModrinthHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  follows: number;
  icon_url: string | null;
  categories: string[];
  versions: string[];
  project_type: string;
  date_modified: string;
}

export interface ModrinthSearchResult {
  hits: ModrinthHit[];
  offset: number;
  limit: number;
  total_hits: number;
}

export interface ModrinthFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  hashes: { sha1: string; sha512: string };
}

export interface ModrinthDependency {
  version_id: string | null;
  project_id: string | null;
  file_name: string | null;
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  version_type: 'release' | 'beta' | 'alpha';
  game_versions: string[];
  loaders: string[];
  downloads: number;
  date_published: string;
  files: ModrinthFile[];
  dependencies: ModrinthDependency[];
}

export interface InstallPlan {
  /** Versions that will be installed (requested + required dependencies). */
  toInstall: { title: string; version: ModrinthVersion }[];
  /** Required dependencies already present in the profile. */
  alreadyInstalled: string[];
  /** Blocking problems: incompatibilities, missing compatible versions. */
  conflicts: string[];
  warnings: string[];
}

// ---- Zenthra mod modules (launcher side view) ----

export interface ModuleInfo {
  id: string;
  name: string;
  description: string;
  category: 'hud' | 'pvp' | 'camera' | 'utility' | 'world';
  icon: string;
  defaultEnabled: boolean;
}

export interface ModuleStates {
  /** False when the Zenthra mod cannot run on the profile (wrong version/loader). */
  available: boolean;
  reason?: string;
  enabled: Record<string, boolean>;
}

// ---- Updates ----

export type UpdateStatus =
  | { status: 'not-configured'; current: string }
  | { status: 'up-to-date'; current: string; latest: string }
  | { status: 'available'; current: string; latest: string; notes: string };

// ---- Resource packs ----

export interface ResourcePackInfo {
  fileName: string;
  title: string;
  description: string;
  /** pack.png as a data URL, if present. */
  icon: string | null;
  packFormat: number | null;
  gamePackFormat: number | null;
  compatibility: 'ok' | 'older' | 'newer' | 'unknown';
  enabled: boolean;
  /** Position in options.txt (-1 when disabled); higher = applied on top. */
  priority: number;
  isFolder: boolean;
}

// ---- Optimisation ----

export interface OptimizationCandidate {
  projectId: string;
  name: string;
  purpose: string;
  installed: boolean;
  /** Compatible version found for the profile (null = none). */
  versionNumber: string | null;
  /** Why it cannot be installed, when it cannot. */
  blocked: string | null;
}

export interface ProfileIssue {
  kind: 'duplicate' | 'missing-dependency' | 'incompatible' | 'wrong-loader';
  message: string;
  /** Modrinth project to install to fix it, when relevant. */
  fixProjectId?: string;
}

export interface GraphicsChange {
  key: string;
  label: string;
  current: string;
  recommended: string;
}

export interface OptimizationReport {
  profileId: string;
  system: { totalRamMb: number; cores: number; gpu: string | null };
  tier: 'low' | 'medium' | 'high';
  tierReasons: string[];
  candidates: OptimizationCandidate[];
  issues: ProfileIssue[];
  graphics: GraphicsChange[];
  /** A backup of options.txt exists and can be restored. */
  canRestoreGraphics: boolean;
  sodiumInstalled: boolean;
}

// ---- Diagnostics (real measurements only; null = unavailable) ----

export interface GameTelemetry {
  writtenAt: number;
  fps: number;
  fpsAvg: number;
  frameMsAvg: number | null;
  frameMsMax: number | null;
  inWorld: boolean;
  memUsedMb: number;
  memAllocatedMb: number;
  memMaxMb: number;
  javaVersion: string;
  javaVendor: string;
  mcVersion: string;
  loader: string;
  loaderVersion: string | null;
  startupMs: number | null;
  renderDistance: number | null;
  gpu: string | null;
  cpu: string | null;
  mods: { id: string; name: string; version: string }[];
  modCountTotal: number;
}

export interface DiagnosticsReport {
  generatedAt: string;
  launcher: {
    version: string;
    electron: string;
    startupMs: number | null;
    memoryMb: number;
    uptimeS: number;
    dataDir: string;
    freeDiskMb: number | null;
  };
  system: { os: string; cpu: string; cores: number; totalRamMb: number; freeRamMb: number };
  game: {
    state: GameState['status'];
    profile: { id: string; name: string; mcVersion: string; loader: LoaderType; memoryMb: number; mods: number } | null;
    prepareMs: number | null;
    telemetry: GameTelemetry | null;
    /** Why telemetry is missing, when it is. */
    telemetryNote: string | null;
  };
  logs: { errors: number; warnings: number; lastErrors: string[] };
}

// ---- Multiplayer / community ----

export interface ServerEntry {
  id: string;
  name: string;
  address: string;
}

export type CommunityOverview =
  | { status: 'not-configured' }
  | { status: 'signed-out' }
  | { status: 'error'; message: string }
  | {
      status: 'ok';
      friends: { name: string; uuid: string; online: boolean; activity?: string }[];
      incoming: { name: string; uuid: string }[];
      outgoing: { name: string; uuid: string }[];
      blocked: { name: string; uuid: string }[];
    };

export type PresenceState =
  | { status: 'not-configured' }
  | { status: 'disabled' }
  | { status: 'error'; message: string }
  | { status: 'ok'; friends: { name: string; uuid: string; online: boolean; activity?: string }[] };
