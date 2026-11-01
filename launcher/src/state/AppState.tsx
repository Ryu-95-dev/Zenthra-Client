import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthState, GameState, Profile, Settings, TaskProgress } from '@shared/types';
import { api } from '../api';

export type PageId = 'home' | 'play' | 'profiles' | 'modules' | 'mods' | 'diagnostics' | 'resourcepacks' | 'shaders' | 'modrinth' | 'versions' | 'multiplayer' | 'settings';

export interface Toast {
  id: number;
  kind: 'error' | 'success' | 'info';
  text: string;
}

interface AppState {
  page: PageId;
  navigate(page: PageId, params?: Record<string, string>): void;
  params: Record<string, string>;
  settings: Settings | null;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  profiles: Profile[];
  selectedProfile: Profile | null;
  selectProfile(id: string): void;
  reloadProfiles(): Promise<void>;
  auth: AuthState;
  game: GameState;
  tasks: TaskProgress[];
  toasts: Toast[];
  notify(kind: Toast['kind'], text: string): void;
  dismissToast(id: number): void;
  /** Runs an async action and reports its error as a toast. */
  run<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined>;
  appInfo: { version: string; dataDir: string; modBundled: boolean; zenthraMcVersion: string; zenthraMcVersions: string[]; totalRamMb: number } | null;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<PageId>('home');
  const [params, setParams] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [auth, setAuth] = useState<AuthState>({ status: 'signed-out', configured: false });
  const [game, setGame] = useState<GameState>({ status: 'idle' });
  const [tasks, setTasks] = useState<TaskProgress[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [appInfo, setAppInfo] = useState<AppState['appInfo']>(null);

  const notify = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string) => {
      try {
        const r = await fn();
        if (success) notify('success', success);
        return r;
      } catch (err) {
        notify('error', (err as Error).message);
        return undefined;
      }
    },
    [notify],
  );

  const reloadProfiles = useCallback(async () => setProfiles(await api.profiles.list()), []);

  useEffect(() => {
    void (async () => {
      setSettings(await api.settings.get());
      await reloadProfiles();
      setAuth(await api.auth.state());
      setGame(await api.game.state());
      setAppInfo(await api.app.info());
    })();
    const offs = [
      api.on.auth(setAuth),
      api.on.game(setGame),
      api.on.profiles(() => void reloadProfiles()),
      api.on.task((t) => {
        setTasks((list) => {
          const others = list.filter((x) => x.taskId !== t.taskId);
          return [...others, t];
        });
        if (t.done) {
          setTimeout(() => setTasks((list) => list.filter((x) => x.taskId !== t.taskId)), t.error ? 6000 : 2500);
        }
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [reloadProfiles]);

  // Apply visual settings as CSS variables.
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    root.style.setProperty('--accent', settings.accentColor);
    root.style.setProperty('--bg-opacity', String(settings.backgroundOpacity));
    root.dataset.animations = settings.animations ? 'on' : 'off';
  }, [settings]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = await run(() => api.settings.update(patch));
      if (next) setSettings(next);
    },
    [run],
  );

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === settings?.selectedProfileId) ?? profiles[0] ?? null,
    [profiles, settings?.selectedProfileId],
  );

  const value: AppState = {
    page,
    params,
    navigate: (p, prm) => {
      setPage(p);
      setParams(prm ?? {});
    },
    settings,
    updateSettings,
    profiles,
    selectedProfile,
    selectProfile: (id) => void updateSettings({ selectedProfileId: id }),
    reloadProfiles,
    auth,
    game,
    tasks,
    toasts,
    notify,
    dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
    run,
    appInfo,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
