import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { SakuraBackground } from './components/SakuraBackground';
import { Sidebar } from './components/Sidebar';
import { TaskTray } from './components/TaskTray';
import { TitleBar } from './components/TitleBar';
import { HomePage } from './pages/HomePage';
import { playClick } from './sound';
import { useApp, type PageId } from './state/AppState';

/** Loads a named page export only when the page is first opened. */
function page<M>(load: () => Promise<M>, name: keyof M): ComponentType {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const PAGES: Record<PageId, ComponentType> = {
  home: HomePage,
  play: page(() => import('./pages/PlayPage'), 'PlayPage'),
  profiles: page(() => import('./pages/ProfilesPage'), 'ProfilesPage'),
  modules: page(() => import('./pages/ModsPage'), 'ModulesPage'),
  mods: page(() => import('./pages/ModsPage'), 'ModsPage'),
  resourcepacks: page(() => import('./pages/ResourcePacksPage'), 'ResourcePacksPage'),
  modrinth: page(() => import('./pages/ModrinthPage'), 'ModrinthPage'),
  versions: page(() => import('./pages/VersionsPage'), 'VersionsPage'),
  multiplayer: page(() => import('./pages/MultiplayerPage'), 'MultiplayerPage'),
  diagnostics: page(() => import('./pages/DiagnosticsPage'), 'DiagnosticsPage'),
  settings: page(() => import('./pages/SettingsPage'), 'SettingsPage'),
};

export function App() {
  const { page: current, settings } = useApp();
  const Page = PAGES[current];

  useEffect(() => {
    if (!settings?.uiSounds) return;
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) playClick(settings.uiVolume);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [settings?.uiSounds, settings?.uiVolume]);

  if (!settings) return <div className="boot" />;

  return (
    <div className="app">
      {settings.sakuraBackground && <SakuraBackground animate={settings.animations} accent={settings.accentColor} />}
      <Sidebar />
      <div className="main">
        <TitleBar />
        <main className="content" key={current}>
          <Suspense fallback={<div className="page-loading">Chargement…</div>}>
            <Page />
          </Suspense>
        </main>
      </div>
      <TaskTray />
    </div>
  );
}
