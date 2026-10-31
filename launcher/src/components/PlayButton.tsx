import { Check, ChevronDown, LoaderCircle, Play, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LOADER_LABELS } from '@shared/types';
import { api } from '../api';
import { useApp } from '../state/AppState';
import { ProfileAvatar } from './icons';
import { Modal } from './Modal';

/** Main launch control: launches the selected profile, with a profile picker. */
export function PlayButton({ server }: { server?: string }) {
  const { selectedProfile, profiles, selectProfile, game, auth, run, navigate } = useApp();
  const [open, setOpen] = useState(false);
  const [askAuth, setAskAuth] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const busy = game.status === 'preparing';
  const running = game.status === 'running';

  const launch = async (demo = false) => {
    if (!selectedProfile) return;
    if (auth.status !== 'signed-in' && !demo) {
      setAskAuth(true);
      return;
    }
    setAskAuth(false);
    await run(() => api.game.launch(selectedProfile.id, { server, demo }));
  };

  return (
    <div className="play" ref={ref}>
      {running ? (
        <button className="play-main running" onClick={() => run(() => api.game.kill())}>
          <Square size={16} fill="currentColor" />
          <span>Arrêter Minecraft</span>
        </button>
      ) : (
        <button className="play-main" disabled={busy || !selectedProfile} onClick={() => launch()}>
          {busy ? <LoaderCircle size={20} className="spin" /> : <Play size={20} fill="currentColor" />}
          <span>{busy ? 'Préparation…' : server ? 'Rejoindre' : 'Jouer maintenant'}</span>
        </button>
      )}
      <button className="play-caret" onClick={() => setOpen((o) => !o)} aria-label="Choisir le profil" disabled={busy || running}>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className="menu play-menu">
          {profiles.map((p) => (
            <button
              key={p.id}
              className="menu-item"
              onClick={() => {
                selectProfile(p.id);
                setOpen(false);
              }}
            >
              <ProfileAvatar profile={p} size={22} className="small" />
              <span className="grow">{p.name}</span>
              <span className="muted small">
                {p.mcVersion} · {LOADER_LABELS[p.loader]}
              </span>
              {p.id === selectedProfile?.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}

      {askAuth && (
        <Modal
          title="Compte Minecraft requis"
          onClose={() => setAskAuth(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => launch(true)}>
                Lancer en mode démo
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setAskAuth(false);
                  if (auth.status === 'signed-out' && !auth.configured) navigate('settings', { section: 'account' });
                  else void run(() => api.auth.signIn());
                }}
              >
                Se connecter avec Microsoft
              </button>
            </>
          }
        >
          <p>
            Pour jouer à la version complète, connecte le compte Microsoft qui possède Minecraft: Java Edition.
          </p>
          <p className="muted">
            Le mode démo officiel de Minecraft fonctionne sans compte, avec un monde limité dans le temps et sans multijoueur.
          </p>
        </Modal>
      )}
    </div>
  );
}
