import { ArrowUpCircle, Compass, FilePlus, Package, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { UpdateInfo } from '@shared/api';
import type { InstalledContent, ModrinthProjectType } from '@shared/types';
import { api } from '../api';
import { useApp } from '../state/AppState';
import { ConfirmDialog } from './Modal';

/** Installed mods, resource packs or shaders of the selected profile. */
export function ContentList({ type }: { type: Extract<ModrinthProjectType, 'mod' | 'resourcepack' | 'shader'> }) {
  const { selectedProfile, run, navigate, notify } = useApp();
  const [local, setLocal] = useState<InstalledContent[]>([]);
  const [updates, setUpdates] = useState<UpdateInfo[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [removing, setRemoving] = useState<InstalledContent | null>(null);

  const tracked = selectedProfile ? (type === 'mod' ? selectedProfile.mods : type === 'shader' ? (selectedProfile.shaderPacks ?? []) : selectedProfile.resourcePacks) : [];
  const label = type === 'mod' ? 'mod' : type === 'shader' ? 'shader' : 'resource pack';

  const refreshLocal = useCallback(async () => {
    if (selectedProfile) setLocal(await api.modrinth.scanLocal(selectedProfile.id, type).catch(() => []));
  }, [selectedProfile, type]);

  useEffect(() => {
    setUpdates(null);
    void refreshLocal();
  }, [refreshLocal]);

  if (!selectedProfile) return null;
  const items = [...tracked, ...local];

  const checkUpdates = async () => {
    setChecking(true);
    const u = await run(() => api.modrinth.updates(selectedProfile.id, type));
    setChecking(false);
    if (u) {
      setUpdates(u);
      if (!u.length) notify('success', 'Tout est à jour.');
    }
  };

  const update = async (u: UpdateInfo) => {
    const plan = await run(() => api.modrinth.plan(selectedProfile.id, u.latest.project_id, u.latest.id, type));
    if (!plan) return;
    if (plan.conflicts.length) return notify('error', plan.conflicts.join(' '));
    const ok = await run(() => api.modrinth.install(selectedProfile.id, plan, type, null), `${u.title} mis à jour.`);
    if (ok) setUpdates((list) => list?.filter((x) => x.fileName !== u.fileName) ?? null);
  };

  return (
    <section className="panel">
      <header className="panel-header">
        <Package size={18} className="accent-icon" />
        <h3>
          {type === 'mod' ? 'Mods installés' : type === 'shader' ? 'Shaders installés' : 'Resource packs installés'} <span className="muted">({items.length})</span>
        </h3>
        <div className="grow" />
        <button className="btn small ghost" onClick={checkUpdates} disabled={checking || !tracked.length}>
          <RefreshCw size={14} className={checking ? 'spin' : ''} /> Mises à jour
        </button>
        <button
          className="btn small ghost"
          onClick={async () => {
            const p = await run(() => api.modrinth.addLocal(selectedProfile.id, type));
            if (p) notify('success', `Fichier ajouté au profil ${p.name}.`);
          }}
        >
          <FilePlus size={14} /> Fichier local
        </button>
        <button className="btn small primary" onClick={() => navigate('modrinth', { type })}>
          <Compass size={14} /> Parcourir Modrinth
        </button>
      </header>

      {type === 'mod' && selectedProfile.loader === 'vanilla' ? (
        <p className="panel-note">Ce profil est Vanilla. Crée ou sélectionne un profil Fabric pour ajouter des mods.</p>
      ) : type === 'shader' && !['fabric', 'neoforge', 'quilt'].includes(selectedProfile.loader) ? (
        <p className="panel-note">Les shaders passent par Iris : crée ou sélectionne un profil Fabric (ou NeoForge).</p>
      ) : items.length === 0 ? (
        <p className="panel-note">Aucun {label} installé dans ce profil.</p>
      ) : (
        <ul className="row-list content-list">
          {items.map((c) => {
            const upd = updates?.find((u) => u.fileName === c.fileName);
            return (
              <li key={c.fileName}>
                {c.iconUrl ? <img className="row-img" src={c.iconUrl} alt="" /> : <span className="row-icon"><Package size={16} /></span>}
                <div className="grow ellipsis">
                  <div className="ellipsis">{c.title}</div>
                  <div className="muted small ellipsis">
                    {c.fileName}
                    {!c.projectId && ' · ajouté manuellement'}
                  </div>
                </div>
                {upd && (
                  <button className="btn small" onClick={() => update(upd)}>
                    <ArrowUpCircle size={14} /> {upd.latest.version_number}
                  </button>
                )}
                <button className="icon-btn danger" title="Désinstaller" onClick={() => setRemoving(c)}>
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {removing && (
        <ConfirmDialog
          title={`Désinstaller ${label === 'mod' ? 'le mod' : label === 'shader' ? 'le shader' : 'le resource pack'}`}
          danger
          confirmLabel="Désinstaller"
          message={<>Retirer « {removing.title} » du profil {selectedProfile.name} ? Le fichier sera placé dans la corbeille.</>}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const c = removing;
            setRemoving(null);
            await run(() => api.modrinth.uninstall(selectedProfile.id, type, c.fileName), `${c.title} désinstallé.`);
            await refreshLocal();
          }}
        />
      )}
    </section>
  );
}
