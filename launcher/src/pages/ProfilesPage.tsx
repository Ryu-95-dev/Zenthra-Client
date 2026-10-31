import { Copy, Download, FileUp, FolderOpen, History, ImagePlus, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { recommendMemory } from '@shared/performance';
import { LOADER_LABELS, type LoaderType, type Profile, type ProfileHistoryEntry, type ProfileIcon, type VersionSummary } from '@shared/types';
import { api, timeAgo } from '../api';
import { PROFILE_ICONS, ProfileAvatar, ProfileGlyph } from '../components/icons';
import { ConfirmDialog, Modal } from '../components/Modal';
import { useApp } from '../state/AppState';

export function ProfilesPage() {
  const { profiles, selectedProfile, selectProfile, run, notify } = useApp();
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);
  const [historyOf, setHistoryOf] = useState<Profile | null>(null);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Profils</h1>
          <p className="muted">Chaque profil a sa version, son chargeur, ses mods et son propre dossier de jeu.</p>
        </div>
        <div className="actions">
          <button
            className="btn"
            onClick={async () => {
              const p = await run(() => api.profiles.importFromFile());
              if (p) notify('success', `Profil « ${p.name} » importé.`);
            }}
          >
            <FileUp size={16} /> Importer
          </button>
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Plus size={16} /> Nouveau profil
          </button>
        </div>
      </div>

      <div className="profile-grid">
        {profiles.map((p) => (
          <article key={p.id} className={`panel profile-card${p.id === selectedProfile?.id ? ' selected' : ''}`}>
            <div className="profile-card-top">
              <ProfileAvatar profile={p} />
              <div className="grow ellipsis">
                <h3 className="ellipsis">{p.name}</h3>
                <div className="muted small">
                  {p.mcVersion} · {LOADER_LABELS[p.loader]} · {p.mods.length} mod(s)
                </div>
              </div>
            </div>
            <div className="muted small">{timeAgo(p.lastPlayed)}</div>
            <div className="profile-card-actions">
              <button className="btn small" onClick={() => selectProfile(p.id)} disabled={p.id === selectedProfile?.id}>
                {p.id === selectedProfile?.id ? 'Actif' : 'Activer'}
              </button>
              <div className="grow" />
              <button className="icon-btn" title="Modifier" onClick={() => setEditing(p)}>
                <Pencil size={15} />
              </button>
              <button className="icon-btn" title="Historique des modifications" onClick={() => setHistoryOf(p)}>
                <History size={15} />
              </button>
              <button className="icon-btn" title="Dupliquer" onClick={() => run(() => api.profiles.duplicate(p.id), 'Profil dupliqué.')}>
                <Copy size={15} />
              </button>
              <button className="icon-btn" title="Exporter" onClick={async () => (await run(() => api.profiles.exportToFile(p.id))) && notify('success', 'Profil exporté.')}>
                <Download size={15} />
              </button>
              <button className="icon-btn" title="Ouvrir le dossier" onClick={() => run(() => api.profiles.openFolder(p.id))}>
                <FolderOpen size={15} />
              </button>
              <button className="icon-btn danger" title="Supprimer" onClick={() => setDeleting(p)}>
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {editing && <ProfileEditor profile={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {historyOf && <HistoryModal profile={historyOf} onClose={() => setHistoryOf(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Supprimer le profil"
          danger
          confirmLabel="Supprimer"
          message={
            <>
              Supprimer « {deleting.name} » ? Son dossier (mondes, mods, captures) sera déplacé dans la corbeille de Windows.
            </>
          }
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            setDeleting(null);
            await run(() => api.profiles.remove(deleting.id), 'Profil supprimé.');
          }}
        />
      )}
    </div>
  );
}

function HistoryModal({ profile, onClose }: { profile: Profile; onClose(): void }) {
  const { run } = useApp();
  const [entries, setEntries] = useState<ProfileHistoryEntry[] | null>(null);
  const load = () => void api.profiles.history(profile.id).then(setEntries).catch(() => setEntries([]));
  useEffect(load, [profile.id]);

  return (
    <Modal title={`Historique de « ${profile.name} »`} onClose={onClose} width={560}>
      <p className="muted small">
        Avant chaque modification importante, les réglages précédents sont sauvegardés. Restaurer remet ces réglages ; les mods, packs et mondes ne
        sont pas touchés.
      </p>
      {entries === null ? (
        <p className="panel-note">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="panel-note">Aucune modification enregistrée pour ce profil.</p>
      ) : (
        <ul className="row-list">
          {entries.map((e) => (
            <li key={e.at}>
              <div className="grow">
                <div>Modifié : {e.fields.join(', ')}</div>
                <div className="muted small">
                  {new Date(e.at).toLocaleString('fr-FR')} · avant : Minecraft {e.before.mcVersion}, {LOADER_LABELS[e.before.loader]}
                  {e.before.memoryMb ? `, ${e.before.memoryMb} Mo` : ''}
                </div>
              </div>
              <button
                className="btn small"
                onClick={async () => {
                  const ok = await run(() => api.profiles.restore(profile.id, e.at), 'Réglages restaurés.');
                  if (ok) load();
                }}
              >
                <RotateCcw size={14} /> Restaurer
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function ProfileEditor({ profile, onClose }: { profile: Profile | null; onClose(): void }) {
  const { run, settings, appInfo, selectProfile } = useApp();
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  /** Versions of the selected loader for the selected Minecraft version (null while loading). */
  const [loaderVersions, setLoaderVersions] = useState<{ version: string; stable: boolean }[] | null>(null);
  const [form, setForm] = useState({
    name: profile?.name ?? '',
    icon: profile?.icon ?? ('box' as ProfileIcon),
    iconImage: profile?.iconImage ?? (null as string | null),
    mcVersion: profile?.mcVersion ?? appInfo?.zenthraMcVersion ?? '1.21.1',
    loader: profile?.loader ?? ('fabric' as LoaderType),
    loaderVersion: profile?.loaderVersion ?? (null as string | null),
    zenthraMod: profile?.zenthraMod ?? true,
    memoryMb: profile?.memoryMb ?? null,
    jvmArgs: profile?.jvmArgs ?? '',
  });

  useEffect(() => {
    void api.versions.available(false).then((r) => setVersions(r.versions)).catch(() => setVersions([]));
  }, []);
  useEffect(() => {
    setLoaderVersions(null);
    if (form.loader === 'vanilla') return;
    let cancelled = false;
    api.versions
      .loaderVersions(form.loader, form.mcVersion)
      .then((l) => !cancelled && setLoaderVersions(l))
      .catch(() => !cancelled && setLoaderVersions(null));
    return () => {
      cancelled = true;
    };
  }, [form.mcVersion, form.loader]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const memoryAdvice = appInfo
    ? recommendMemory(appInfo.totalRamMb, form.loader, profile?.mods.length ?? 0, form.memoryMb ?? settings?.memoryMb)
    : null;
  const loaderUnavailable =form.loader !== 'vanilla' && loaderVersions !== null && loaderVersions.length === 0;
  // A pinned loader version only applies to the Minecraft version/loader it was chosen for.
  const pinnedValid = !form.loaderVersion || !loaderVersions || loaderVersions.some((v) => v.version === form.loaderVersion);
  const zenthraCompatible = form.loader === 'fabric' && !!appInfo?.zenthraMcVersions.includes(form.mcVersion);

  const save = async () => {
    const data = {
      ...form,
      loaderVersion: form.loader === 'vanilla' || !pinnedValid ? null : form.loaderVersion,
      zenthraMod: form.zenthraMod && zenthraCompatible,
    };
    const res = profile ? await run(() => api.profiles.update(profile.id, data), 'Profil enregistré.') : await run(() => api.profiles.create(data), 'Profil créé.');
    if (res) {
      if (!profile) selectProfile(res.id);
      onClose();
    }
  };

  return (
    <Modal
      title={profile ? `Modifier « ${profile.name} »` : 'Nouveau profil'}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={save} disabled={!form.name.trim() || loaderUnavailable}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span>Nom</span>
          <input value={form.name} maxLength={40} onChange={(e) => set('name', e.target.value)} autoFocus />
        </label>
        <div className="field">
          <span>Image du profil</span>
          <div className="image-picker">
            <ProfileAvatar profile={form} size={48} />
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                const img = await run(() => api.profiles.chooseImage());
                if (img) set('iconImage', img);
              }}
            >
              <ImagePlus size={14} /> Choisir une image
            </button>
            {form.iconImage && (
              <button type="button" className="btn small ghost" onClick={() => set('iconImage', null)}>
                Retirer
              </button>
            )}
          </div>
        </div>
        <div className="field">
          <span>{form.iconImage ? 'Icône (utilisée si l’image est retirée)' : 'Icône'}</span>
          <div className="icon-picker">
            {(Object.keys(PROFILE_ICONS) as ProfileIcon[]).map((i) => (
              <button key={i} type="button" className={form.icon === i ? 'on' : ''} onClick={() => set('icon', i)} aria-label={i}>
                <ProfileGlyph icon={i} size={16} />
              </button>
            ))}
          </div>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Version Minecraft</span>
            <select value={form.mcVersion} onChange={(e) => set('mcVersion', e.target.value)}>
              {!versions.some((v) => v.id === form.mcVersion) && <option value={form.mcVersion}>{form.mcVersion}</option>}
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                  {v.installed ? ' (installée)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Chargeur</span>
            <select value={form.loader} onChange={(e) => set('loader', e.target.value as LoaderType)}>
              {(['fabric', 'vanilla', 'forge', 'neoforge'] as LoaderType[]).map((l) => (
                <option key={l} value={l}>
                  {LOADER_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {form.loader !== 'vanilla' && (
          <label className="field">
            <span>Version de {LOADER_LABELS[form.loader]}</span>
            <select
              value={pinnedValid && form.loaderVersion ? form.loaderVersion : ''}
              disabled={!loaderVersions?.length}
              onChange={(e) => set('loaderVersion', e.target.value || null)}
            >
              <option value="">{loaderVersions === null ? 'Chargement…' : 'Dernière version stable (recommandé)'}</option>
              {loaderVersions?.slice(0, 40).map((v) => (
                <option key={v.version} value={v.version}>
                  {v.version}
                  {v.stable ? '' : ' (bêta)'}
                </option>
              ))}
            </select>
          </label>
        )}
        {loaderUnavailable && <p className="form-error">{LOADER_LABELS[form.loader]} n'est pas disponible pour Minecraft {form.mcVersion}.</p>}
        {(form.loader === 'forge' || form.loader === 'neoforge') && (
          <p className="muted small">Installé avec l'installateur officiel au premier lancement (quelques minutes).</p>
        )}
        <label className="check">
          <input type="checkbox" checked={form.zenthraMod && zenthraCompatible} disabled={!zenthraCompatible} onChange={(e) => set('zenthraMod', e.target.checked)} />
          Inclure le mod Zenthra (menu Échap, modules PvP)
        </label>
        {!zenthraCompatible && <p className="muted small">Le mod Zenthra est disponible avec Fabric pour Minecraft {appInfo?.zenthraMcVersions.join(', ')}.</p>}
        <div className="field-row">
          <label className="field">
            <span>Mémoire (Mo)</span>
            <input
              type="number"
              min={1024}
              max={32768}
              step={512}
              placeholder={`Par défaut : ${settings?.memoryMb ?? 4096}`}
              value={form.memoryMb ?? ''}
              onChange={(e) => set('memoryMb', e.target.value ? Number(e.target.value) : null)}
            />
            {memoryAdvice && (
              <small className={memoryAdvice.warning ? 'form-error' : 'muted'}>
                {memoryAdvice.warning ?? `Recommandé : ${memoryAdvice.recommendedMb} Mo`}
              </small>
            )}
          </label>
          <label className="field">
            <span>Arguments JVM</span>
            <input value={form.jvmArgs} onChange={(e) => set('jvmArgs', e.target.value)} placeholder="-XX:+UseG1GC" spellCheck={false} />
          </label>
        </div>
      </div>
    </Modal>
  );
}
