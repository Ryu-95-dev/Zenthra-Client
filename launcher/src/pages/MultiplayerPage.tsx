import { Plus, Server, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ServerEntry } from '@shared/types';
import { api } from '../api';
import { FriendsPanel } from '../components/FriendsPanel';
import { PlayButton } from '../components/PlayButton';
import { ProfileSelect } from '../components/ProfileSelect';
import { useApp } from '../state/AppState';

export function MultiplayerPage() {
  const { run, selectedProfile } = useApp();
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    void api.community.servers().then(setServers);
  }, []);

  const quickPlay = selectedProfile ? isQuickPlaySupported(selectedProfile.mcVersion) : false;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Multijoueur</h1>
          <p className="muted">Serveurs favoris avec connexion directe, et joueurs Zenthra.</p>
        </div>
        <ProfileSelect />
      </div>

      <div className="two-col">
        <section className="panel">
          <header className="panel-header">
            <Server size={18} className="accent-icon" />
            <h3>Serveurs</h3>
          </header>
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const list = await run(() => api.community.addServer(name, address));
              if (list) {
                setServers(list);
                setName('');
                setAddress('');
              }
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" maxLength={40} />
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse (ex. play.exemple.fr)" spellCheck={false} />
            <button className="btn" type="submit" disabled={!name.trim() || !address.trim()}>
              <Plus size={15} /> Ajouter
            </button>
          </form>
          {!quickPlay && <p className="muted small">La connexion directe nécessite Minecraft 1.20 ou plus récent.</p>}
          {servers.length === 0 ? (
            <p className="panel-note">Aucun serveur enregistré.</p>
          ) : (
            <ul className="row-list">
              {servers.map((s) => (
                <li key={s.id} className={target === s.address ? 'selected' : ''}>
                  <div className="grow ellipsis">
                    <div>{s.name}</div>
                    <div className="muted small">{s.address}</div>
                  </div>
                  <button className="btn small" disabled={!quickPlay} onClick={() => setTarget(target === s.address ? null : s.address)}>
                    {target === s.address ? 'Choisi' : 'Choisir'}
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Retirer"
                    onClick={async () => {
                      const list = await run(() => api.community.removeServer(s.id));
                      if (list) setServers(list);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {target && (
            <div className="join-bar">
              <span className="muted small">Rejoindre {target} avec le profil sélectionné</span>
              <PlayButton server={target} />
            </div>
          )}
        </section>

        <FriendsPanel />
      </div>
    </div>
  );
}

function isQuickPlaySupported(v: string): boolean {
  const m = /^1\.(\d+)/.exec(v);
  if (!m) return /^\d{2}\./.test(v); // year-based versions (26.x) are recent
  return Number(m[1]) >= 20;
}
