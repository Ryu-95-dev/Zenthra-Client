import { LOADER_LABELS } from '@shared/types';
import { useApp } from '../state/AppState';

/** Compact selector for the profile a page operates on. */
export function ProfileSelect() {
  const { profiles, selectedProfile, selectProfile } = useApp();
  return (
    <label className="field inline">
      <span>Profil</span>
      <select value={selectedProfile?.id ?? ''} onChange={(e) => selectProfile(e.target.value)}>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {p.mcVersion} {LOADER_LABELS[p.loader]}
          </option>
        ))}
      </select>
    </label>
  );
}
