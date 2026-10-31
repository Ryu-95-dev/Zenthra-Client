import { ArrowDown, ArrowUp, Compass, FilePlus, FolderOpen, Image, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ResourcePackInfo } from '@shared/types';
import { api } from '../api';
import { ConfirmDialog } from '../components/Modal';
import { ProfileSelect } from '../components/ProfileSelect';
import { Toggle } from '../components/Toggle';
import { useApp } from '../state/AppState';

const COMPAT: Record<ResourcePackInfo['compatibility'], { label: string; tone: string }> = {
  ok: { label: 'Compatible', tone: 'ok' },
  older: { label: 'Conçu pour une version plus ancienne', tone: 'warn' },
  newer: { label: 'Conçu pour une version plus récente', tone: 'warn' },
  unknown: { label: 'Compatibilité inconnue', tone: '' },
};

export function ResourcePacksPage() {
  const { selectedProfile, run, navigate, notify, game } = useApp();
  const [packs, setPacks] = useState<ResourcePackInfo[] | null>(null);
  const [removing, setRemoving] = useState<ResourcePackInfo | null>(null);
  const gameOpen = (game.status === 'running' || game.status === 'preparing') && game.profileId === selectedProfile?.id;

  const reload = useCallback(async () => {
    if (selectedProfile) setPacks(await api.resourcePacks.list(selectedProfile.id).catch(() => []));
  }, [selectedProfile]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!selectedProfile) return null;
  const enabled = packs?.filter((p) => p.enabled) ?? [];
  const disabled = packs?.filter((p) => !p.enabled) ?? [];

  const apply = async (order: string[]) => {
    const next = await run(() => api.resourcePacks.setEnabled(selectedProfile.id, order));
    if (next) setPacks(next);
  };
  const names = enabled.map((p) => p.fileName);
  const move = (i: number, d: number) => {
    const order = [...names];
    [order[i], order[i + d]] = [order[i + d], order[i]];
    void apply(order);
  };

  const row = (p: ResourcePackInfo, i: number) => (
    <li key={p.fileName} className="pack-row">
      {p.icon ? <img src={p.icon} alt="" className="pack-icon" /> : <span className="pack-icon empty"><Image size={18} /></span>}
      <div className="grow ellipsis">
        <div className="ellipsis">
          {p.title} {p.isFolder && <span className="tag">dossier</span>}
        </div>
        <div className="muted small clamp2">{p.description || 'Pas de description.'}</div>
        <div className={`compat ${COMPAT[p.compatibility].tone}`}>
          {COMPAT[p.compatibility].label}
          {p.packFormat !== null && p.gamePackFormat !== null && p.compatibility !== 'ok' && ` (format ${p.packFormat}, jeu ${p.gamePackFormat})`}
        </div>
      </div>
      {p.enabled && (
        <div className="pack-order">
          <button className="icon-btn" title="Monter (priorité plus haute)" disabled={i === 0 || gameOpen} onClick={() => move(i, -1)}>
            <ArrowUp size={15} />
          </button>
          <button className="icon-btn" title="Descendre" disabled={i === names.length - 1 || gameOpen} onClick={() => move(i, 1)}>
            <ArrowDown size={15} />
          </button>
        </div>
      )}
      <Toggle
        label={`Activer ${p.title}`}
        checked={p.enabled}
        disabled={gameOpen}
        onChange={(v) => void apply(v ? [p.fileName, ...names] : names.filter((n) => n !== p.fileName))}
      />
      <button className="icon-btn danger" title="Supprimer" disabled={gameOpen} onClick={() => setRemoving(p)}>
        <Trash2 size={15} />
      </button>
    </li>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Resource Packs</h1>
          <p className="muted">Active les packs et choisis leur ordre : le pack du haut s’applique par-dessus les autres.</p>
        </div>
        <div className="actions">
          <ProfileSelect />
        </div>
      </div>

      <div className="toolbar">
        <button className="btn primary" onClick={() => navigate('modrinth', { type: 'resourcepack' })}>
          <Compass size={15} /> Parcourir Modrinth
        </button>
        <button
          className="btn"
          onClick={async () => {
            const p = await run(() => api.modrinth.addLocal(selectedProfile.id, 'resourcepack'));
            if (p) {
              notify('success', 'Pack ajouté.');
              void reload();
            }
          }}
        >
          <FilePlus size={15} /> Importer un fichier
        </button>
        <button className="btn ghost" onClick={() => run(() => api.resourcePacks.openFolder(selectedProfile.id))}>
          <FolderOpen size={15} /> Ouvrir le dossier
        </button>
      </div>

      {gameOpen && <p className="notice">Minecraft est ouvert avec ce profil : ferme-le pour modifier les packs (le jeu réécrit ses options en quittant).</p>}

      <section className="panel">
        <header className="panel-header">
          <h3>Actifs</h3>
          <span className="badge">{enabled.length}</span>
        </header>
        {packs === null ? (
          <p className="panel-note">Chargement…</p>
        ) : enabled.length ? (
          <ul className="row-list">{enabled.map(row)}</ul>
        ) : (
          <p className="panel-note">Aucun pack actif : le jeu utilise ses textures d’origine.</p>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h3>Disponibles</h3>
          <span className="badge">{disabled.length}</span>
        </header>
        {disabled.length ? <ul className="row-list">{disabled.map(row)}</ul> : <p className="panel-note">Tous les packs installés sont actifs.</p>}
      </section>

      {removing && (
        <ConfirmDialog
          title="Supprimer le resource pack"
          danger
          confirmLabel="Supprimer"
          message={<>Supprimer « {removing.title} » ? Le fichier sera placé dans la corbeille de Windows.</>}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const p = removing;
            setRemoving(null);
            const next = await run(() => api.resourcePacks.remove(selectedProfile.id, p.fileName), `${p.title} supprimé.`);
            if (next) setPacks(next);
          }}
        />
      )}
    </div>
  );
}
