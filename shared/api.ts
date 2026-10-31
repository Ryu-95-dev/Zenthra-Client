// Contract of the API exposed by the preload script as `window.zenthra`.
import type {
  AuthState,
  CommunityOverview,
  DiagnosticsReport,
  OptimizationReport,
  GameState,
  InstallPlan,
  InstalledContent,
  InstalledVersion,
  LoaderType,
  LogLine,
  ModrinthProjectType,
  ModrinthSearchQuery,
  ModrinthSearchResult,
  ModrinthVersion,
  ModuleInfo,
  ModuleStates,
  PresenceState,
  Profile,
  ProfileHistoryEntry,
  ResourcePackInfo,
  ServerEntry,
  Settings,
  TaskProgress,
  UpdateStatus,
  VersionSummary,
} from './types';

export interface ProjectDetailsView {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  followers: number;
  license?: { id: string; name: string };
  project_type: string;
  game_versions: string[];
  loaders: string[];
}

export interface UpdateInfo {
  fileName: string;
  title: string;
  current: string | null;
  latest: ModrinthVersion;
}

export interface ZenthraApi {
  app: { info(): Promise<{ version: string; dataDir: string; modBundled: boolean; zenthraMcVersion: string; zenthraMcVersions: string[]; totalRamMb: number }> };
  window: { minimize(): void; toggleMaximize(): void; close(): void };
  settings: {
    get(): Promise<Settings>;
    update(patch: Partial<Settings>): Promise<Settings>;
    reset(): Promise<Settings>;
    chooseDataDir(): Promise<string | null>;
  };
  profiles: {
    list(): Promise<Profile[]>;
    create(input: Pick<Profile, 'name' | 'mcVersion' | 'loader'> & Partial<Profile>): Promise<Profile>;
    update(id: string, patch: Partial<Profile>): Promise<Profile>;
    duplicate(id: string): Promise<Profile>;
    remove(id: string): Promise<void>;
    exportToFile(id: string): Promise<boolean>;
    importFromFile(): Promise<Profile | null>;
    openFolder(id: string): Promise<void>;
    history(id: string): Promise<ProfileHistoryEntry[]>;
    /** Restores the settings saved at `at` (files are not touched). */
    restore(id: string, at: string): Promise<Profile>;
    /** Opens a file picker and returns the picture as a square 128×128 PNG data URL. */
    chooseImage(): Promise<string | null>;
  };
  versions: {
    available(includeSnapshots: boolean): Promise<{ latest: { release: string; snapshot: string }; versions: VersionSummary[] }>;
    installed(): Promise<InstalledVersion[]>;
    install(id: string, withFabric: boolean): Promise<void>;
    remove(id: string): Promise<void>;
    /** Re-hashes every file of an installed version and re-downloads what is missing or corrupted. */
    repair(id: string): Promise<void>;
    /** Versions of a mod loader available for a Minecraft version (newest first). */
    loaderVersions(loader: LoaderType, mcVersion: string): Promise<{ version: string; stable: boolean }[]>;
  };
  game: {
    launch(profileId: string, opts?: { server?: string; demo?: boolean }): Promise<void>;
    kill(): Promise<void>;
    state(): Promise<GameState>;
    logs(): Promise<LogLine[]>;
    openLogsFolder(): Promise<void>;
  };
  auth: {
    state(): Promise<AuthState>;
    signIn(): Promise<AuthState>;
    cancel(): Promise<void>;
    signOut(): Promise<AuthState>;
  };
  modrinth: {
    search(q: ModrinthSearchQuery): Promise<ModrinthSearchResult>;
    project(id: string): Promise<ProjectDetailsView>;
    versions(projectId: string, loader: string | null, gameVersion: string | null): Promise<ModrinthVersion[]>;
    plan(profileId: string, projectId: string, versionId: string | null, type: ModrinthProjectType): Promise<InstallPlan>;
    install(profileId: string, plan: InstallPlan, type: ModrinthProjectType, iconUrl: string | null): Promise<Profile>;
    uninstall(profileId: string, type: ModrinthProjectType, fileName: string): Promise<Profile>;
    updates(profileId: string, type: ModrinthProjectType): Promise<UpdateInfo[]>;
    scanLocal(profileId: string, type: ModrinthProjectType): Promise<InstalledContent[]>;
    addLocal(profileId: string, type: ModrinthProjectType): Promise<Profile | null>;
    sync(profileId: string): Promise<{ restored: number; failed: string[] }>;
    importModpack(versionId: string): Promise<Profile>;
    importMrpackFile(): Promise<Profile | null>;
    openWebsite(slug?: string, type?: ModrinthProjectType): Promise<void>;
  };
  modules: {
    catalog(): Promise<ModuleInfo[]>;
    get(profileId: string): Promise<ModuleStates>;
    set(profileId: string, moduleId: string, enabled: boolean): Promise<ModuleStates>;
  };
  community: {
    servers(): Promise<ServerEntry[]>;
    addServer(name: string, address: string): Promise<ServerEntry[]>;
    removeServer(id: string): Promise<ServerEntry[]>;
    presence(): Promise<PresenceState>;
    overview(): Promise<CommunityOverview>;
    sendRequest(name: string): Promise<string>;
    answerRequest(uuid: string, accept: boolean): Promise<void>;
    removeFriend(uuid: string): Promise<void>;
    setBlocked(uuid: string, blocked: boolean): Promise<void>;
    /** Erases every trace of the player on the community server. */
    deleteMyData(): Promise<void>;
  };
  tasks: {
    cancel(taskId: string): Promise<boolean>;
  };
  resourcePacks: {
    list(profileId: string): Promise<ResourcePackInfo[]>;
    /** Enabled packs, highest priority first. */
    setEnabled(profileId: string, highestFirst: string[]): Promise<ResourcePackInfo[]>;
    remove(profileId: string, fileName: string): Promise<ResourcePackInfo[]>;
    openFolder(profileId: string): Promise<void>;
  };
  updates: {
    check(): Promise<UpdateStatus>;
    /** Downloads and verifies the new version; returns the saved archive path. */
    download(): Promise<string>;
  };
  optimizer: {
    analyze(profileId: string): Promise<OptimizationReport>;
    /** Applies the chosen recommended graphics settings (options.txt is backed up first). */
    applyGraphics(profileId: string, keys: string[]): Promise<void>;
    /** Restores the options.txt saved before the last change. */
    restoreGraphics(profileId: string): Promise<boolean>;
  };
  diagnostics: {
    get(): Promise<DiagnosticsReport>;
    /** Saves the current report as a JSON file chosen by the user. */
    exportToFile(): Promise<boolean>;
  };
  on: {
    task(cb: (t: TaskProgress) => void): () => void;
    log(cb: (l: LogLine) => void): () => void;
    game(cb: (g: GameState) => void): () => void;
    auth(cb: (a: AuthState) => void): () => void;
    profiles(cb: () => void): () => void;
  };
}
