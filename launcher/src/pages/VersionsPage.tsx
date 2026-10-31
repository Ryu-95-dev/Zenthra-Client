import { Check, Download, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InstalledVersion, VersionSummary } from '@shared/types';
import { api, formatBytes } from '../api';
import { ConfirmDialog } from '../components/Modal';
import { useApp } from '../state/AppState';

export function VersionsPage() {
  const { run, profiles, tasks, appInfo } = useApp();
  const [snapshots, setSnapshots] = useState(false);
  const [available, setAvailable] = useState<VersionSummary[]>([]);
  const [latest, setLatest] = useState<string | null>(null);
  const [installed, setInstalled] = useState<InstalledVersion[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<InstalledVersion | null>(null);

  const reload = useCallback(async () => {
    setInstalled(await api.versions.installed());
    try {
      const r = await api.versions.available(snapshots);
      setAvailable(r.versions);
      setLatest(r.latest.release);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [snapshots]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Refresh when an install task finishes.
  const activeTasks = tasks.filter((t) => !t.done).length;
  useEffect(() => {
    if (activeTasks === 0) void reload();
  }, [activeTasks, reload]);

  const list = useMemo(() => available.filter((v) => v.id.includes(filter.trim())).slice(0, 80), [available, filter]);
  const usedBy = (id: string) => profiles.filter((p) => p.mcVersion === id || id.endsWith(`-${p.mcVersion}`)).map((p) => p.name);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Versions</h1>
          <p className="muted">
            Versions officielles de Minecraft Java (manifeste Mojang). Le mod Zenthra existe pour : {appInfo?.zenthraMcVersions.join(', ') || 'aucune version (mod non compilé)'}.
          </p>
        </div>
      </div>

      <div className="two-col">
        <section className="panel">
          <header className="panel-header">
            <h3>Installées</h3>
          </header>
          {installed.length === 0 ? (
            <p className="panel-note">Aucune version installée. Elles sont téléchargées automatiquement au premier lancement d'un profil.</p>
          ) : (
            <ul className="row-list">
              {installed.map((v) => (
                <li key={v.id}>
                  <div className="grow ellipsis">
                    <div className="ellipsis">{v.id}</div>
                    <div className="muted small">
                      {v.inheritsFrom ? `Fabric · basé sur ${v.inheritsFrom}` : formatBytes(v.size)}
                      {usedBy(v.inheritsFrom ?? v.id).length > 0 && ` · utilisé par ${usedBy(v.inheritsFrom ?? v.id).join(', ')}`}
                    </div>
                  </div>
                  <button className="icon-btn" title="Vérifier et réparer les fichiers" onClick={() => run(() => api.versions.repair(v.id), `${v.id} vérifiée.`)}>
                    <ShieldCheck size={15} />
                  </button>
                  <button className="icon-btn danger" title="Supprimer" onClick={() => setRemoving(v)}>
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <header className="panel-header">
            <h3>Disponibles</h3>
            <div className="grow" />
            <label className="check">
              <input type="checkbox" checked={snapshots} onChange={(e) => setSnapshots(e.target.checked)} /> Snapshots
            </label>
          </header>
          <div className="search small">
            <Search size={14} />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer (ex. 1.21)" />
          </div>
          {error && <p className="notice error">{error}</p>}
          <ul className="row-list scroll">
            {list.map((v) => (
              <li key={v.id}>
                <div className="grow">
                  <div>
                    {v.id} {v.id === latest && <span className="tag accent">Dernière</span>}
                    {appInfo?.zenthraMcVersions.includes(v.id) && <span className="tag accent">Zenthra</span>}
                    {v.type !== 'release' && <span className="tag">{v.type}</span>}
                  </div>
                  <div className="muted small">{new Date(v.releaseTime).toLocaleDateString('fr-FR')}</div>
                </div>
                {v.installed ? (
                  <span className="muted small">
                    <Check size={14} /> Installée
                  </span>
                ) : (
                  <>
                    <button className="btn small ghost" onClick={() => run(() => api.versions.install(v.id, false), `Minecraft ${v.id} installé.`)}>
                      <Download size={14} /> Vanilla
                    </button>
                    <button className="btn small" onClick={() => run(() => api.versions.install(v.id, true), `Minecraft ${v.id} + Fabric installés.`)}>
                      <Download size={14} /> + Fabric
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {removing && (
        <ConfirmDialog
          title="Supprimer la version"
          danger
          confirmLabel="Supprimer"
          message={<>Supprimer {removing.id} ? Les mondes et profils ne sont pas touchés ; la version sera retéléchargée si un profil en a besoin.</>}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const v = removing;
            setRemoving(null);
            await run(() => api.versions.remove(v.id), `${v.id} supprimée.`);
            await reload();
          }}
        />
      )}
    </div>
  );
}
