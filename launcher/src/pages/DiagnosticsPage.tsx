import { Activity, Cpu, Download, FileWarning, FolderOpen, Gauge, MemoryStick, Package, Rocket } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DiagnosticsReport } from '@shared/types';
import { LOADER_LABELS } from '@shared/types';
import { api } from '../api';
import { OptimizationPanel } from '../components/OptimizationPanel';
import { useApp } from '../state/AppState';

const NA = <span className="na">Indisponible</span>;
const ms = (v: number | null | undefined) => (v === null || v === undefined ? NA : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
const mb = (v: number | null | undefined) => (v === null || v === undefined ? NA : v >= 1024 ? `${(v / 1024).toFixed(1)} Go` : `${v} Mo`);

export function DiagnosticsPage() {
  const { game, run, notify, tasks, params } = useApp();
  const [tab, setTab] = useState<'measures' | 'optim'>(params.tab === 'optim' ? 'optim' : 'measures');
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [fpsHistory, setFpsHistory] = useState<number[]>([]);
  const lastSample = useRef(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await api.diagnostics.get().catch(() => null);
      if (!alive || !r) return;
      setReport(r);
      const t = r.game.telemetry;
      // Keep one point per telemetry write (every 2 s), up to 2 minutes.
      if (t && t.writtenAt !== lastSample.current) {
        lastSample.current = t.writtenAt;
        setFpsHistory((h) => [...h.slice(-59), t.fps]);
      }
    };
    void load();
    // Refresh only while the page is open and the game is running.
    if (game.status !== 'running') return () => void (alive = false);
    const timer = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [game.status]);

  const head = (
    <>
      <div className="page-head">
        <div>
          <h1>Diagnostic et performances</h1>
          <p className="muted">Mesures réelles du launcher et du jeu, et optimisations vérifiées avant d’être appliquées.</p>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => api.game.openLogsFolder()}>
            <FolderOpen size={15} /> Journaux
          </button>
          <button className="btn" onClick={async () => (await run(() => api.diagnostics.exportToFile())) && notify('success', 'Rapport exporté.')}>
            <Download size={15} /> Exporter le rapport
          </button>
        </div>
      </div>
      <div className="tabs">
        <button className={`tab${tab === 'measures' ? ' on' : ''}`} onClick={() => setTab('measures')}>
          Mesures
        </button>
        <button className={`tab${tab === 'optim' ? ' on' : ''}`} onClick={() => setTab('optim')}>
          Optimisation
        </button>
      </div>
    </>
  );

  if (tab === 'optim') {
    return (
      <div className="page diagnostics">
        {head}
        <OptimizationPanel />
      </div>
    );
  }
  if (!report) return <div className="page-loading">Chargement…</div>;
  const t = report.game.telemetry;
  const p = report.game.profile;
  const activeTasks = tasks.filter((x) => !x.done);

  return (
    <div className="page diagnostics">
      {head}

      <section className="panel">
        <header className="panel-header">
          <Gauge size={18} className="accent-icon" />
          <h3>Performances en jeu</h3>
          <span className={`tag${report.game.state === 'running' ? ' accent' : ''}`}>
            {report.game.state === 'running' ? 'Minecraft en cours' : report.game.state === 'preparing' ? 'Préparation' : 'Jeu fermé'}
          </span>
        </header>
        {t ? (
          <>
            <div className="stat-grid">
              <Stat label="FPS" value={t.fps} />
              <Stat label="FPS moyen (30 s)" value={t.fpsAvg.toFixed(0)} />
              <Stat label="Temps de frame moyen" value={t.frameMsAvg !== null ? `${t.frameMsAvg.toFixed(1)} ms` : NA} hint={t.inWorld ? undefined : 'hors monde'} />
              <Stat label="Pire frame (2 s)" value={t.frameMsMax !== null ? `${t.frameMsMax.toFixed(1)} ms` : NA} />
              <Stat label="Mémoire Java utilisée" value={mb(t.memUsedMb)} />
              <Stat label="Mémoire maximale (-Xmx)" value={mb(t.memMaxMb)} />
            </div>
            <MemoryBar used={t.memUsedMb} allocated={t.memAllocatedMb} max={t.memMaxMb} />
            {fpsHistory.length > 1 && <Sparkline values={fpsHistory} />}
          </>
        ) : (
          <p className="panel-note">{report.game.telemetryNote}</p>
        )}
      </section>

      <div className="two-col">
        <section className="panel">
          <header className="panel-header">
            <Rocket size={18} className="accent-icon" />
            <h3>Démarrage</h3>
          </header>
          <dl className="kv">
            <dt>Launcher (jusqu’à la fenêtre)</dt>
            <dd>{ms(report.launcher.startupMs)}</dd>
            <dt>Préparation du lancement</dt>
            <dd>{ms(report.game.prepareMs)}</dd>
            <dt>Démarrage de Minecraft</dt>
            <dd>{ms(t?.startupMs)}</dd>
          </dl>
        </section>

        <section className="panel">
          <header className="panel-header">
            <Activity size={18} className="accent-icon" />
            <h3>Jeu</h3>
          </header>
          <dl className="kv">
            <dt>Profil</dt>
            <dd>{p ? p.name : NA}</dd>
            <dt>Minecraft</dt>
            <dd>{t?.mcVersion ?? p?.mcVersion ?? NA}</dd>
            <dt>Chargeur</dt>
            <dd>{t ? `${t.loader} ${t.loaderVersion ?? ''}` : p ? LOADER_LABELS[p.loader] : NA}</dd>
            <dt>Java</dt>
            <dd>{t ? `${t.javaVersion} (${t.javaVendor})` : NA}</dd>
            <dt>Mémoire allouée au profil</dt>
            <dd>{p ? mb(p.memoryMb) : NA}</dd>
            <dt>Carte graphique</dt>
            <dd className="ellipsis">{t?.gpu ?? NA}</dd>
            <dt>Distance de rendu</dt>
            <dd>{t?.renderDistance != null ? `${t.renderDistance} chunks` : NA}</dd>
          </dl>
        </section>

        <section className="panel">
          <header className="panel-header">
            <Cpu size={18} className="accent-icon" />
            <h3>Système</h3>
          </header>
          <dl className="kv">
            <dt>Système</dt>
            <dd>{report.system.os}</dd>
            <dt>Processeur</dt>
            <dd className="ellipsis">
              {report.system.cpu} · {report.system.cores} cœurs
            </dd>
            <dt>Mémoire vive</dt>
            <dd>
              {mb(report.system.freeRamMb)} libres sur {mb(report.system.totalRamMb)}
            </dd>
            <dt>Espace disque libre</dt>
            <dd>{mb(report.launcher.freeDiskMb)}</dd>
          </dl>
        </section>

        <section className="panel">
          <header className="panel-header">
            <MemoryStick size={18} className="accent-icon" />
            <h3>Launcher</h3>
          </header>
          <dl className="kv">
            <dt>Version</dt>
            <dd>
              {report.launcher.version} (Electron {report.launcher.electron})
            </dd>
            <dt>Mémoire utilisée</dt>
            <dd>{mb(report.launcher.memoryMb)}</dd>
            <dt>Ouvert depuis</dt>
            <dd>{Math.round(report.launcher.uptimeS / 60)} min</dd>
            <dt>Téléchargements en cours</dt>
            <dd>{activeTasks.length ? activeTasks.map((x) => x.label).join(', ') : 'Aucun'}</dd>
          </dl>
        </section>
      </div>

      <section className="panel">
        <header className="panel-header">
          <FileWarning size={18} className="accent-icon" />
          <h3>Erreurs et avertissements</h3>
          <span className="muted small">depuis le dernier lancement</span>
        </header>
        <div className="stat-grid compact">
          <Stat label="Erreurs" value={report.logs.errors} tone={report.logs.errors ? 'bad' : undefined} />
          <Stat label="Avertissements" value={report.logs.warnings} />
        </div>
        {report.logs.lastErrors.length > 0 && (
          <div className="log-box short">
            {report.logs.lastErrors.map((l, i) => (
              <div key={i} className="log-line err">
                {l}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <Package size={18} className="accent-icon" />
          <h3>Mods chargés</h3>
          {t && <span className="badge">{t.mods.length}</span>}
        </header>
        {t ? (
          <ul className="mod-chips">
            {t.mods.map((m) => (
              <li key={m.id} title={m.id}>
                {m.name} <span className="muted">{m.version}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-note">La liste réelle des mods chargés s’affiche quand le jeu tourne avec le mod Zenthra.</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: 'bad' }) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">
        {label}
        {hint && <span className="muted"> · {hint}</span>}
      </div>
    </div>
  );
}

function MemoryBar({ used, allocated, max }: { used: number; allocated: number; max: number }) {
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="mem-bar" title={`Utilisée ${used} Mo · Réservée ${allocated} Mo · Maximum ${max} Mo`}>
      <div className="mem-allocated" style={{ width: pct(allocated) }} />
      <div className="mem-used" style={{ width: pct(used) }} />
      <span className="mem-legend">
        Utilisée {used} Mo · réservée par Java {allocated} Mo · limite {max} Mo
      </span>
    </div>
  );
}

/** FPS samples received from the game (one every 2 s). */
function Sparkline({ values }: { values: number[] }) {
  const w = 600, h = 60;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(' ');
  return (
    <figure className="sparkline">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`FPS des ${values.length * 2} dernières secondes`}>
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="muted small">
        FPS mesurés depuis l’ouverture de cette page (max {max}, min {Math.min(...values)})
      </figcaption>
    </figure>
  );
}
