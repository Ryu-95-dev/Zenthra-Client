import { ChevronLeft, ChevronRight, Download, ExternalLink, Heart, LoaderCircle, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { InstallPlan, ModrinthHit, ModrinthProjectType, ModrinthSearchQuery, ModrinthSearchResult, ModrinthVersion } from '@shared/types';
import { api, formatDownloads } from '../api';
import { Modal } from '../components/Modal';
import { ProfileSelect } from '../components/ProfileSelect';
import { useApp } from '../state/AppState';

const TYPES: { id: ModrinthProjectType; label: string }[] = [
  { id: 'mod', label: 'Mods' },
  { id: 'resourcepack', label: 'Resource Packs' },
  { id: 'shader', label: 'Shaders' },
  { id: 'modpack', label: 'Modpacks' },
];

export function ModrinthPage() {
  const { params, selectedProfile, run } = useApp();
  const [type, setType] = useState<ModrinthProjectType>((params.type as ModrinthProjectType) ?? 'mod');
  const [query, setQuery] = useState(params.query ?? '');
  const [debounced, setDebounced] = useState(query);
  const [versionFilter, setVersionFilter] = useState<'profile' | 'all'>('profile');
  const [sort, setSort] = useState<ModrinthSearchQuery['sort']>('relevance');
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<ModrinthSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<ModrinthHit | null>(null);

  useEffect(() => {
    if (params.type) setType(params.type as ModrinthProjectType);
    if (params.query !== undefined) setQuery(params.query);
  }, [params]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => setOffset(0), [debounced, type, versionFilter, sort]);

  useEffect(() => {
    if (!selectedProfile) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.modrinth
      .search({
        query: debounced,
        projectType: type,
        gameVersion: versionFilter === 'profile' && type !== 'modpack' ? selectedProfile.mcVersion : null,
        loader: type === 'mod' && selectedProfile.loader !== 'vanilla' ? selectedProfile.loader : type === 'modpack' ? 'fabric' : null,
        offset,
        sort,
      })
      .then((r) => !cancelled && setResult(r))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, type, versionFilter, sort, offset, selectedProfile]);

  if (!selectedProfile) return null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Modrinth</h1>
          <p className="muted">Contenu open source vérifié, téléchargé depuis le CDN officiel de Modrinth.</p>
        </div>
        <div className="actions">
          <ProfileSelect />
          <button className="btn ghost" onClick={() => run(() => api.modrinth.openWebsite(undefined, type))}>
            <ExternalLink size={15} /> modrinth.com
          </button>
        </div>
      </div>

      <div className="tabs">
        {TYPES.map((t) => (
          <button key={t.id} className={`tab${type === t.id ? ' on' : ''}`} onClick={() => setType(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="search grow">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Rechercher des ${TYPES.find((t) => t.id === type)!.label.toLowerCase()}`} />
        </div>
        {type !== 'modpack' && (
          <select value={versionFilter} onChange={(e) => setVersionFilter(e.target.value as 'profile' | 'all')}>
            <option value="profile">Compatible {selectedProfile.mcVersion}</option>
            <option value="all">Toutes les versions</option>
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as ModrinthSearchQuery['sort'])}>
          <option value="relevance">Pertinence</option>
          <option value="downloads">Téléchargements</option>
          <option value="follows">Popularité</option>
          <option value="updated">Mis à jour</option>
          <option value="newest">Nouveautés</option>
        </select>
      </div>

      {type === 'mod' && selectedProfile.loader === 'vanilla' && (
        <p className="notice">Le profil « {selectedProfile.name} » est Vanilla : sélectionne un profil Fabric pour installer des mods.</p>
      )}
      {error && <p className="notice error">{error}</p>}

      <div className={`results${loading ? ' loading' : ''}`}>
        {result?.hits.map((h) => (
          <button key={h.project_id} className="result" onClick={() => setOpen(h)}>
            {h.icon_url ? <img src={h.icon_url} alt="" className="result-icon" loading="lazy" /> : <span className="result-icon empty" />}
            <div className="grow ellipsis">
              <div className="result-title">
                {h.title} <span className="muted small">par {h.author}</span>
              </div>
              <div className="muted small clamp2">{h.description}</div>
            </div>
            <div className="result-stats">
              <span>
                <Download size={13} /> {formatDownloads(h.downloads)}
              </span>
              <span>
                <Heart size={13} /> {formatDownloads(h.follows)}
              </span>
            </div>
          </button>
        ))}
        {result && result.hits.length === 0 && !loading && <p className="panel-note">Aucun résultat.</p>}
        {loading && !result && <p className="panel-note">Chargement…</p>}
      </div>

      {result && result.total_hits > 20 && (
        <div className="pager">
          <button className="btn small ghost" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 20))}>
            <ChevronLeft size={14} /> Précédent
          </button>
          <span className="muted small">
            {offset + 1}–{Math.min(offset + 20, result.total_hits)} sur {result.total_hits.toLocaleString('fr-FR')}
          </span>
          <button className="btn small ghost" disabled={offset + 20 >= result.total_hits} onClick={() => setOffset((o) => o + 20)}>
            Suivant <ChevronRight size={14} />
          </button>
        </div>
      )}

      {open && <ProjectModal hit={open} type={type} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ProjectModal({ hit, type, onClose }: { hit: ModrinthHit; type: ModrinthProjectType; onClose(): void }) {
  const { selectedProfile, run, notify, selectProfile } = useApp();
  const [versions, setVersions] = useState<ModrinthVersion[] | null>(null);
  const [plan, setPlan] = useState<InstallPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const profile = selectedProfile!;

  useEffect(() => {
    const loader = type === 'resourcepack' ? 'minecraft' : type === 'shader' ? 'iris' : type === 'modpack' ? null : profile.loader === 'vanilla' ? null : profile.loader;
    const gv = type === 'modpack' ? null : profile.mcVersion;
    void api.modrinth
      .versions(hit.project_id, loader, gv)
      .then(setVersions)
      .catch((e: Error) => {
        notify('error', e.message);
        setVersions([]);
      });
  }, [hit, type, profile, notify]);

  const prepare = async (v: ModrinthVersion) => {
    if (type === 'modpack') {
      setBusy(true);
      const p = await run(() => api.modrinth.importModpack(v.id));
      setBusy(false);
      if (p) {
        selectProfile(p.id);
        notify('success', `Modpack importé dans le nouveau profil « ${p.name} ».`);
        onClose();
      }
      return;
    }
    setBusy(true);
    const pl = await run(() => api.modrinth.plan(profile.id, hit.project_id, v.id, type));
    setBusy(false);
    if (pl) setPlan(pl);
  };

  const install = async () => {
    if (!plan) return;
    setBusy(true);
    const ok = await run(() => api.modrinth.install(profile.id, plan, type, hit.icon_url), `${hit.title} installé dans ${profile.name}.`);
    setBusy(false);
    if (ok) onClose();
  };

  const installed = (type === 'resourcepack' ? profile.resourcePacks : type === 'shader' ? (profile.shaderPacks ?? []) : profile.mods).find((m) => m.projectId === hit.project_id);

  return (
    <Modal title={hit.title} onClose={onClose} width={640}>
      <div className="project-head">
        {hit.icon_url && <img src={hit.icon_url} alt="" className="result-icon large" />}
        <div className="grow">
          <p>{hit.description}</p>
          <div className="muted small">
            par {hit.author} · {formatDownloads(hit.downloads)} téléchargements · {hit.categories.slice(0, 4).join(', ')}
          </div>
        </div>
        <button className="btn small ghost" onClick={() => api.modrinth.openWebsite(hit.slug, type)}>
          <ExternalLink size={14} /> Page
        </button>
      </div>

      {plan ? (
        <div className="plan">
          <h4>Installation dans « {profile.name} »</h4>
          <ul>
            {plan.toInstall.map((t) => (
              <li key={t.version.id}>
                <Download size={13} /> {t.title} <span className="muted">{t.version.version_number}</span>
              </li>
            ))}
          </ul>
          {plan.alreadyInstalled.length > 0 && <p className="muted small">Déjà présents : {plan.alreadyInstalled.join(', ')}</p>}
          {plan.warnings.map((w) => (
            <p key={w} className="notice">
              {w}
            </p>
          ))}
          {plan.conflicts.map((c) => (
            <p key={c} className="notice error">
              {c}
            </p>
          ))}
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setPlan(null)}>
              Retour
            </button>
            <button className="btn primary" disabled={busy || plan.conflicts.length > 0} onClick={install}>
              {busy ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />} Installer {plan.toInstall.length > 1 ? `(${plan.toInstall.length} fichiers)` : ''}
            </button>
          </div>
        </div>
      ) : (
        <>
          <h4 className="section-title">
            {type === 'modpack' ? 'Versions disponibles' : `Versions compatibles avec ${profile.mcVersion}${type === 'mod' ? ` (${profile.loader})` : ''}`}
          </h4>
          {installed && <p className="muted small">Installé : {installed.fileName}</p>}
          {versions === null ? (
            <p className="panel-note">Chargement…</p>
          ) : versions.length === 0 ? (
            <p className="notice">Aucune version compatible avec ce profil.</p>
          ) : (
            <ul className="row-list version-list">
              {versions.slice(0, 12).map((v) => (
                <li key={v.id}>
                  <div className="grow ellipsis">
                    <div className="ellipsis">
                      {v.name} {v.version_type !== 'release' && <span className="tag">{v.version_type}</span>}
                    </div>
                    <div className="muted small ellipsis">
                      {v.loaders.join(', ')} · {v.game_versions.slice(-4).join(', ')} · {new Date(v.date_published).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <button className="btn small" disabled={busy || (type === 'mod' && profile.loader === 'vanilla')} onClick={() => prepare(v)}>
                    {type === 'modpack' ? 'Importer' : installed?.versionId === v.id ? 'Réinstaller' : 'Installer'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
