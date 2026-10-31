import { ArrowRight, Check, Clock, Compass, Download, FileUp, History, Image, LayoutGrid, Layers, Plus, Puzzle, RefreshCw, RotateCcw, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HOME_BLOCK_IDS, LOADER_LABELS, type HomeBlockId, type HomeBlockLayout, type InstalledVersion, type PresenceState } from '@shared/types';
import { api, formatBytes, timeAgo } from '../api';
import { Dashboard, type BlockDef } from '../components/Dashboard';
import { ProfileAvatar } from '../components/icons';
import { ModulesPanel } from '../components/ModulesPanel';
import { PlayButton } from '../components/PlayButton';
import { useApp } from '../state/AppState';

/** Default home layout on the 12-column grid (36 px rows). */
export const DEFAULT_LAYOUT: HomeBlockLayout[] = [
  { id: 'hero', w: 6, h: 8, hidden: false },
  { id: 'modules', w: 3, h: 8, hidden: false },
  { id: 'community', w: 3, h: 8, hidden: false },
  { id: 'quickActions', w: 12, h: 2, hidden: false },
  { id: 'recentProfiles', w: 4, h: 5, hidden: false },
  { id: 'versions', w: 4, h: 5, hidden: false },
  { id: 'recentContent', w: 4, h: 5, hidden: false },
];

/** Stored layout + any block added in a later version, unknown ids dropped. */
function resolveLayout(stored: HomeBlockLayout[] | null): HomeBlockLayout[] {
  if (!stored) return DEFAULT_LAYOUT;
  const known = stored.filter((b) => HOME_BLOCK_IDS.includes(b.id));
  const missing = DEFAULT_LAYOUT.filter((d) => !known.some((b) => b.id === d.id));
  return [...known, ...missing];
}

export function HomePage() {
  const { selectedProfile, profiles, auth, game, navigate, run, selectProfile, notify, settings, updateSettings } = useApp();
  const [versions, setVersions] = useState<InstalledVersion[]>([]);
  const [presence, setPresence] = useState<PresenceState | null>(null);
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<HomeBlockLayout[]>(() => resolveLayout(settings?.homeLayout ?? null));
  const [panelModules, setPanelModules] = useState<string[] | null>(settings?.panelModules ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    void api.versions.installed().then(setVersions).catch(() => setVersions([]));
    void api.community.presence().then(setPresence);
  }, [game.status]);

  const commitLayout = useCallback((next: HomeBlockLayout[]) => void updateSettings({ homeLayout: next }), [updateSettings]);

  const changeModules = (next: string[]) => {
    setPanelModules(next);
    // Dragging fires many changes: save once it settles.
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void updateSettings({ panelModules: next }), 400);
  };

  const name = auth.status === 'signed-in' ? auth.account.name : null;
  const recentProfiles = useMemo(
    () => [...profiles].filter((p) => p.lastPlayed).sort((a, b) => Date.parse(b.lastPlayed!) - Date.parse(a.lastPlayed!)).slice(0, 8),
    [profiles],
  );
  const recentContent = useMemo(
    () =>
      profiles
        .flatMap((p) => [
          ...p.mods.map((m) => ({ ...m, kind: 'Mod', profile: p.name })),
          ...p.resourcePacks.map((r) => ({ ...r, kind: 'Resource pack', profile: p.name })),
        ])
        .filter((c) => c.installedAt)
        .sort((a, b) => Date.parse(b.installedAt) - Date.parse(a.installedAt))
        .slice(0, 12),
    [profiles],
  );
  const gameVersions = versions.filter((v) => !v.inheritsFrom);

  const statusText =
    game.status === 'running' ? 'Minecraft en cours' : game.status === 'preparing' ? 'Préparation…' : game.status === 'crashed' ? `Arrêt inattendu (code ${game.exitCode})` : 'Client prêt';

  const sync = async () => {
    if (!selectedProfile) return;
    const r = await run(() => api.modrinth.sync(selectedProfile.id));
    if (r) notify(r.failed.length ? 'error' : 'success', r.failed.length ? `Fichiers non restaurés : ${r.failed.join(', ')}` : `${r.restored} fichier(s) restauré(s), profil à jour.`);
  };

  const blocks: Record<HomeBlockId, BlockDef> = {
    hero: {
      title: 'Bienvenue',
      render: () => (
        <section className="hero">
          <h1>{name ? `Bienvenue, ${name}` : 'Bienvenue sur Zenthra'}</h1>
          <p className="hero-sub">Prêt à vivre une nouvelle aventure ?</p>
          <PlayButton />
          {selectedProfile && (
            <div className="hero-status">
              <span className={`dot ${game.status === 'crashed' ? 'bad' : 'ok'}`} />
              <span className={game.status === 'crashed' ? 'bad-text' : 'ok-text'}>{statusText}</span>
              <span className="sep">·</span>
              <span>Profil {selectedProfile.name}</span>
              <span className="sep">·</span>
              <span>Minecraft {selectedProfile.mcVersion}</span>
              <span className="sep">·</span>
              <span>{LOADER_LABELS[selectedProfile.loader]}</span>
              <span className="sep">·</span>
              <span>{selectedProfile.mods.length} mod(s) installé(s)</span>
            </div>
          )}
        </section>
      ),
    },
    modules: {
      title: 'Modules actifs',
      interactiveInEdit: true,
      render: () => <ModulesPanel onManage={editing ? undefined : () => navigate('modules')} order={panelModules} editing={editing} onOrderChange={changeModules} />,
    },
    community: {
      title: 'Communauté',
      render: () => (
        <section className="panel community-panel">
          <header className="panel-header">
            <Users size={18} className="accent-icon" />
            <h3>Communauté</h3>
          </header>
          {presence?.status === 'ok' ? (
            presence.friends.length ? (
              <ul className="friend-list">
                {presence.friends.map((f) => (
                  <li key={f.uuid}>
                    <span className={`dot ${f.online ? 'ok' : 'off'}`} />
                    <span className="grow">{f.name}</span>
                    <span className="muted small">{f.online ? f.activity ?? 'En ligne' : 'Hors ligne'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="panel-note">Aucun ami pour le moment.</p>
            )
          ) : (
            <p className="panel-note">
              {presence?.status === 'error'
                ? presence.message
                : presence?.status === 'disabled'
                  ? 'Le partage de présence est désactivé dans les paramètres de confidentialité.'
                  : 'La liste d’amis nécessite un serveur de présence Zenthra. Aucun serveur n’est configuré.'}
            </p>
          )}
          <button className="link-btn" onClick={() => navigate('multiplayer')}>
            Multijoueur <ArrowRight size={14} />
          </button>
        </section>
      ),
    },
    quickActions: {
      title: 'Actions rapides',
      render: () => (
        <div className="quick-actions">
          <QuickAction icon={<Puzzle size={18} />} title="Ajouter un mod" onClick={() => navigate('modrinth', { type: 'mod' })} />
          <QuickAction icon={<Image size={18} />} title="Ajouter un resource pack" onClick={() => navigate('modrinth', { type: 'resourcepack' })} />
          <QuickAction
            icon={<FileUp size={18} />}
            title="Importer un profil"
            onClick={async () => {
              const p = await run(() => api.profiles.importFromFile());
              if (p) {
                selectProfile(p.id);
                notify('success', `Profil « ${p.name} » importé.`);
              }
            }}
          />
          <QuickAction icon={<Compass size={18} />} title="Ouvrir Modrinth" onClick={() => navigate('modrinth', { type: 'modpack' })} />
          <QuickAction icon={<RefreshCw size={18} />} title="Synchroniser le profil" onClick={sync} />
        </div>
      ),
    },
    recentProfiles: {
      title: 'Profils récents',
      render: () => (
        <section className="panel">
          <header className="panel-header">
            <History size={18} className="accent-icon" />
            <h3>Profils récents</h3>
            <div className="grow" />
            <button className="link-btn" onClick={() => navigate('profiles')}>
              Voir tout <ArrowRight size={14} />
            </button>
          </header>
          {recentProfiles.length ? (
            <ul className="row-list">
              {recentProfiles.map((p) => (
                <li key={p.id}>
                  <ProfileAvatar profile={p} size={34} />
                  <div className="grow ellipsis">
                    <div className="ellipsis">{p.name}</div>
                    <div className="muted small">
                      {timeAgo(p.lastPlayed)} · {p.mcVersion}
                    </div>
                  </div>
                  <button className="btn small" onClick={() => selectProfile(p.id)} disabled={selectedProfile?.id === p.id}>
                    {selectedProfile?.id === p.id ? 'Sélectionné' : 'Sélectionner'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-note">Aucune partie lancée pour l’instant.</p>
          )}
        </section>
      ),
    },
    versions: {
      title: 'Versions installées',
      render: () => (
        <section className="panel">
          <header className="panel-header">
            <Layers size={18} className="accent-icon" />
            <h3>Versions installées</h3>
            <div className="grow" />
            <button className="link-btn" onClick={() => navigate('versions')}>
              Voir tout <ArrowRight size={14} />
            </button>
          </header>
          {gameVersions.length ? (
            <ul className="row-list">
              {gameVersions.map((v) => (
                <li key={v.id}>
                  <span className="row-icon">
                    <Download size={16} />
                  </span>
                  <span className="grow">{v.id}</span>
                  <span className="muted small">{formatBytes(v.size)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-note">Aucune version installée. Elle sera téléchargée au premier lancement.</p>
          )}
        </section>
      ),
    },
    recentContent: {
      title: 'Récemment installés',
      render: () => (
        <section className="panel">
          <header className="panel-header">
            <Clock size={18} className="accent-icon" />
            <h3>Récemment installés</h3>
          </header>
          {recentContent.length ? (
            <ul className="row-list">
              {recentContent.map((c) => (
                <li key={`${c.profile}-${c.fileName}`}>
                  {c.iconUrl ? (
                    <img className="row-img" src={c.iconUrl} alt="" />
                  ) : (
                    <span className="row-icon">
                      <Puzzle size={16} />
                    </span>
                  )}
                  <div className="grow ellipsis">
                    <div className="ellipsis">{c.title}</div>
                    <div className="muted small">
                      {c.kind} · {c.profile}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-note">Les mods et resource packs installés apparaîtront ici.</p>
          )}
        </section>
      ),
    },
  };

  const hidden = layout.filter((b) => b.hidden);

  return (
    <div className="page home">
      <div className={`home-toolbar${editing ? ' editing' : ''}`}>
        {editing ? (
          <>
            <span className="muted small grow">
              Glisse un bloc par son titre pour le déplacer, tire son coin en bas à droite pour le redimensionner, × pour le retirer.
            </span>
            <div className="add-block">
              <button className="btn small" disabled={!hidden.length} onClick={() => setAddOpen((o) => !o)}>
                <Plus size={14} /> Ajouter un bloc
              </button>
              {addOpen && hidden.length > 0 && (
                <div className="menu add-menu">
                  {hidden.map((b) => (
                    <button
                      key={b.id}
                      className="menu-item"
                      onClick={() => {
                        const next = layout.map((x) => (x.id === b.id ? { ...x, hidden: false } : x));
                        setLayout(next);
                        commitLayout(next);
                        setAddOpen(false);
                      }}
                    >
                      {blocks[b.id].title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="btn small ghost"
              onClick={() => {
                setLayout(DEFAULT_LAYOUT);
                setPanelModules(null);
                void updateSettings({ homeLayout: null, panelModules: null });
              }}
            >
              <RotateCcw size={14} /> Réinitialiser
            </button>
            <button
              className="btn small primary"
              onClick={() => {
                setEditing(false);
                setAddOpen(false);
              }}
            >
              <Check size={14} /> Terminé
            </button>
          </>
        ) : (
          <button className="btn small ghost" onClick={() => setEditing(true)}>
            <LayoutGrid size={14} /> Personnaliser
          </button>
        )}
      </div>

      <Dashboard blocks={blocks} layout={layout} editing={editing} onChange={setLayout} onCommit={commitLayout} />
    </div>
  );
}

function QuickAction({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick(): void }) {
  return (
    <button className="quick-action" onClick={onClick}>
      <span className="qa-icon">{icon}</span>
      <span>{title}</span>
    </button>
  );
}
