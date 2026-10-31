import { GripVertical, Puzzle, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ModuleInfo, ModuleStates, Profile } from '@shared/types';
import { api } from '../api';
import { useApp } from '../state/AppState';
import { ModuleIcon } from './icons';
import { Toggle } from './Toggle';

let catalogCache: ModuleInfo[] | null = null;

export function useModules(profile: Profile | null) {
  const [catalog, setCatalog] = useState<ModuleInfo[]>(catalogCache ?? []);
  const [states, setStates] = useState<ModuleStates | null>(null);

  const reload = useCallback(async () => {
    if (!catalogCache) catalogCache = await api.modules.catalog();
    setCatalog(catalogCache);
    if (profile) setStates(await api.modules.get(profile.id));
  }, [profile]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { catalog, states, setStates, reload };
}

export const CATEGORY_LABELS: Record<ModuleInfo['category'], string> = {
  hud: 'HUD',
  pvp: 'PvP',
  camera: 'Caméra',
  utility: 'Utilitaires',
  world: 'Monde',
};

interface Props {
  onManage?(): void;
  /** Module ids to show, in order; null = every module in catalogue order. */
  order?: string[] | null;
  /** Edit mode: reorder, remove and add the modules listed here. */
  editing?: boolean;
  onOrderChange?(order: string[]): void;
}

export function ModulesPanel({ onManage, order = null, editing = false, onOrderChange }: Props) {
  const { selectedProfile, run } = useApp();
  const { catalog, states, setStates } = useModules(selectedProfile);
  const [dragId, setDragId] = useState<string | null>(null);
  const activeCount = states ? Object.values(states.enabled).filter(Boolean).length : 0;
  const ids = (order ?? catalog.map((m) => m.id)).filter((id) => catalog.some((m) => m.id === id));
  const shown = ids.map((id) => catalog.find((m) => m.id === id)!);
  const missing = catalog.filter((m) => !ids.includes(m.id));

  const toggle = async (id: string, value: boolean) => {
    if (!selectedProfile) return;
    const next = await run(() => api.modules.set(selectedProfile.id, id, value));
    if (next) setStates(next);
  };

  const moveBefore = (from: string, to: string) => {
    if (from === to) return;
    const list = ids.filter((id) => id !== from);
    list.splice(list.indexOf(to), 0, from);
    onOrderChange?.(list);
  };

  return (
    <section className="panel modules-panel">
      <header className="panel-header">
        <Puzzle size={18} className="accent-icon" />
        <h3>Modules actifs</h3>
        {states?.available && <span className="badge">{activeCount}</span>}
        <div className="grow" />
        {onManage && (
          <button className="btn small ghost" onClick={onManage}>
            Gérer
          </button>
        )}
      </header>
      {states && !states.available ? (
        <p className="panel-note">{states.reason}</p>
      ) : (
        <ul className="module-list">
          {shown.map((m) => (
            <li
              key={m.id}
              className={`module-row${dragId === m.id ? ' dragging' : ''}`}
              title={m.description}
              draggable={editing}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = 'move';
                setDragId(m.id);
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.stopPropagation();
                moveBefore(dragId, m.id);
              }}
              onDragEnd={(e) => {
                e.stopPropagation();
                setDragId(null);
              }}
            >
              {editing && <GripVertical size={14} className="module-grip" />}
              <span className="module-icon">
                <ModuleIcon name={m.icon} />
              </span>
              <span className="grow">{m.name}</span>
              {editing ? (
                <button className="icon-btn danger" title="Retirer du panneau" onClick={() => onOrderChange?.(ids.filter((id) => id !== m.id))}>
                  <X size={14} />
                </button>
              ) : (
                <Toggle label={m.name} checked={!!states?.enabled[m.id]} onChange={(v) => toggle(m.id, v)} disabled={!states} />
              )}
            </li>
          ))}
          {shown.length === 0 && <li className="panel-note">Aucun module affiché.</li>}
        </ul>
      )}
      {editing && missing.length > 0 && (
        <select
          className="module-add"
          value=""
          onChange={(e) => e.target.value && onOrderChange?.([...ids, e.target.value])}
          aria-label="Ajouter un module au panneau"
        >
          <option value="">+ Ajouter un module…</option>
          {missing.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}
