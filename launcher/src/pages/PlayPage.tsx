import { FolderOpen, Terminal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LOADER_LABELS, type LogLine } from '@shared/types';
import { api } from '../api';
import { PlayButton } from '../components/PlayButton';
import { ProfileAvatar } from '../components/icons';
import { useApp } from '../state/AppState';

export function PlayPage() {
  const { selectedProfile, settings, game } = useApp();
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [follow, setFollow] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api.game.logs().then(setLogs);
    return api.on.log((l) => setLogs((prev) => (prev.length > 2000 ? [...prev.slice(-1500), l] : [...prev, l])));
  }, []);

  useEffect(() => {
    if (follow && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [logs, follow]);

  if (!selectedProfile || !settings) return null;
  const p = selectedProfile;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Jouer</h1>
          <p className="muted">Lance le profil sélectionné et suis le démarrage du jeu.</p>
        </div>
      </div>

      <section className="panel play-card">
        <ProfileAvatar profile={p} size={56} />
        <div className="grow">
          <h2>{p.name}</h2>
          <div className="meta">
            <span>Minecraft {p.mcVersion}</span>
            <span>{p.loader === 'vanilla' ? 'Vanilla' : `${LOADER_LABELS[p.loader]} ${p.loaderVersion ?? '(dernière stable)'}`}</span>
            <span>{((p.memoryMb ?? settings.memoryMb) / 1024).toFixed(1)} Go de mémoire</span>
            <span>{p.mods.length} mod(s)</span>
            <span>{p.zenthraMod ? 'Mod Zenthra inclus' : 'Sans mod Zenthra'}</span>
          </div>
        </div>
        <PlayButton />
      </section>

      <section className="panel logs-panel">
        <header className="panel-header">
          <Terminal size={18} className="accent-icon" />
          <h3>Journal de lancement</h3>
          <span className="muted small">{game.status === 'running' ? `PID ${game.pid}` : ''}</span>
          <div className="grow" />
          <label className="check">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Suivre
          </label>
          <button className="btn small ghost" onClick={() => setLogs([])}>
            Effacer
          </button>
          <button className="btn small ghost" onClick={() => api.game.openLogsFolder()}>
            <FolderOpen size={14} /> Dossier
          </button>
        </header>
        <div className="log-box" ref={boxRef}>
          {logs.length === 0 && <div className="muted">Aucun journal. Lance le jeu pour voir sa sortie ici.</div>}
          {logs.map((l, i) => (
            <div key={i} className={`log-line ${l.stream}${/\b(ERROR|FATAL|Exception)\b/.test(l.text) ? ' err' : /\bWARN\b/.test(l.text) ? ' warn' : ''}`}>
              {l.text}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
