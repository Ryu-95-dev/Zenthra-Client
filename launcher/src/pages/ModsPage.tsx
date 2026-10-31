import { Gauge, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ModuleInfo } from '@shared/types';
import { api } from '../api';
import { ContentList } from '../components/ContentList';
import { ModuleIcon } from '../components/icons';
import { CATEGORY_LABELS, useModules } from '../components/ModulesPanel';
import { ProfileSelect } from '../components/ProfileSelect';
import { Toggle } from '../components/Toggle';
import { useApp } from '../state/AppState';

// Vocabulary used across the launcher:
//   module = feature built into Zenthra (Zoom, Keystrokes…)
//   mod    = Fabric/Forge file installed in a profile (Sodium, Fabric API…)

/** Zenthra's built-in modules for the selected profile. */
export function ModulesPage() {
  const { selectedProfile, run } = useApp();
  const { catalog, states, setStates } = useModules(selectedProfile);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ModuleInfo['category'] | 'all'>('all');

  const filtered = useMemo(
    () =>
      catalog.filter(
        (m) => (category === 'all' || m.category === category) && (m.name + m.description).toLowerCase().includes(query.toLowerCase()),
      ),
    [catalog, query, category],
  );

  if (!selectedProfile) return null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Modules</h1>
          <p className="muted">Fonctions intégrées à Zenthra, activables pour chaque profil.</p>
        </div>
        <ProfileSelect />
      </div>

      <section className="panel">
        <header className="panel-header">
          <h3>Modules Zenthra</h3>
          <div className="grow" />
          <div className="search small">
            <Search size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un module" />
          </div>
        </header>
        <div className="chips">
          {(['all', ...Object.keys(CATEGORY_LABELS)] as (ModuleInfo['category'] | 'all')[]).map((c) => (
            <button key={c} className={`chip${category === c ? ' on' : ''}`} onClick={() => setCategory(c)}>
              {c === 'all' ? 'Tous' : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        {states && !states.available ? (
          <p className="panel-note">{states.reason}</p>
        ) : (
          <div className="module-grid">
            {filtered.map((m) => (
              <div key={m.id} className="module-tile">
                <span className="module-icon">
                  <ModuleIcon name={m.icon} />
                </span>
                <div className="grow">
                  <div className="module-name">
                    {m.name} <span className="tag">{CATEGORY_LABELS[m.category]}</span>
                  </div>
                  <div className="muted small">{m.description}</div>
                </div>
                <Toggle
                  label={m.name}
                  checked={!!states?.enabled[m.id]}
                  disabled={!states}
                  onChange={async (v) => {
                    const next = await run(() => api.modules.set(selectedProfile.id, m.id, v));
                    if (next) setStates(next);
                  }}
                />
              </div>
            ))}
          </div>
        )}
        <p className="muted small panel-foot">
          Les réglages détaillés (touches, couleurs, position du HUD, waypoints) se font en jeu : Échap → Modules Zenthra.
        </p>
      </section>
    </div>
  );
}

/** Fabric/Forge mods installed in the selected profile. */
export function ModsPage() {
  const { selectedProfile, navigate } = useApp();
  if (!selectedProfile) return null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Mods</h1>
          <p className="muted">Mods installés dans le profil, depuis Modrinth ou un fichier.</p>
        </div>
        <ProfileSelect />
      </div>

      {selectedProfile.loader !== 'vanilla' && (
        <section className="panel optim">
          <Gauge size={18} className="accent-icon" />
          <div className="grow">
            <div>Optimisations</div>
            <div className="muted small">
              Sodium, Lithium, FerriteCore, ImmediatelyFast, Entity Culling : compatibilité vérifiée avant installation, doublons et
              dépendances manquantes détectés. Les gains dépendent de ton matériel.
            </div>
          </div>
          <button className="btn small" onClick={() => navigate('diagnostics', { tab: 'optim' })}>
            Analyser ce profil
          </button>
        </section>
      )}

      <ContentList type="mod" />
    </div>
  );
}
