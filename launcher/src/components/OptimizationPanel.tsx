import { AlertTriangle, CheckCircle2, Cpu, Download, MemoryStick, MonitorCog, RefreshCw, Rocket, RotateCcw, Wrench } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { effectiveMemoryMb, recommendMemory } from '@shared/performance';
import type { InstallPlan, OptimizationReport, PerformancePackResult } from '@shared/types';
import { api } from '../api';
import { useApp } from '../state/AppState';
import { ConfirmDialog, Modal } from './Modal';
import { ProfileSelect } from './ProfileSelect';

const TIER_LABEL = { low: 'PC modeste', medium: 'PC intermédiaire', high: 'PC performant' } as const;
const gb = (mb: number) => `${(mb / 1024).toFixed(1).replace('.0', '')} Go`;

export function OptimizationPanel() {
  const { selectedProfile, settings, appInfo, run, notify, game } = useApp();
  const [report, setReport] = useState<OptimizationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMods, setSelectedMods] = useState<string[]>([]);
  const [selectedGfx, setSelectedGfx] = useState<string[]>([]);
  const [plans, setPlans] = useState<{ name: string; plan: InstallPlan }[] | null>(null);
  const [confirmGfx, setConfirmGfx] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dynamicFps, setDynamicFps] = useState(false);
  const [packResult, setPackResult] = useState<{ mode: boolean; result: PerformancePackResult } | null>(null);

  const analyze = useCallback(async () => {
    if (!selectedProfile) return;
    setLoading(true);
    const r = await run(() => api.optimizer.analyze(selectedProfile.id));
    setLoading(false);
    if (r) {
      setReport(r);
      setSelectedMods(r.candidates.filter((c) => !c.installed && !c.blocked).map((c) => c.projectId));
      setSelectedGfx(r.graphics.map((g) => g.key));
    }
  }, [selectedProfile, run]);

  useEffect(() => {
    void analyze();
  }, [analyze]);

  const memory = useMemo(
    () =>
      selectedProfile && appInfo
        ? recommendMemory(
            appInfo.totalRamMb,
            selectedProfile.loader,
            selectedProfile.mods.length,
            settings ? effectiveMemoryMb(selectedProfile, settings, appInfo.totalRamMb).memoryMb : selectedProfile.memoryMb,
          )
        : null,
    [selectedProfile, appInfo, settings],
  );

  if (!selectedProfile || !settings) return null;
  const currentMem = effectiveMemoryMb(selectedProfile, settings, appInfo?.totalRamMb ?? 0).memoryMb;
  const gameOpen = (game.status === 'running' || game.status === 'preparing') && game.profileId === selectedProfile.id;

  // Compute every install plan first, so the player sees exactly what will be downloaded.
  const prepareMods = async (projectIds: string[]) => {
    setBusy(true);
    const out: { name: string; plan: InstallPlan }[] = [];
    for (const id of projectIds) {
      const name = report?.candidates.find((c) => c.projectId === id)?.name ?? id;
      const plan = await run(() => api.modrinth.plan(selectedProfile.id, id, null, 'mod'));
      if (plan) out.push({ name, plan });
    }
    setBusy(false);
    if (out.length) setPlans(out);
  };

  const installPlans = async () => {
    if (!plans) return;
    setBusy(true);
    for (const { name, plan } of plans) {
      if (plan.conflicts.length) continue;
      await run(() => api.modrinth.install(selectedProfile.id, plan, 'mod', null), `${name} installé.`);
    }
    setBusy(false);
    setPlans(null);
    void analyze();
  };

  // One click: every compatible mod of the pack (and, for the Mode Performance, the Zenthra optimization module).
  const runPack = async (mode: boolean) => {
    setBusy(true);
    setPackResult(null);
    const opts = { dynamicFps };
    const result = await run(() => (mode ? api.optimizer.performanceMode(selectedProfile.id, opts) : api.optimizer.installPack(selectedProfile.id, opts)));
    setBusy(false);
    if (result) {
      setPackResult({ mode, result });
      notify('success', mode ? 'Mode Performance appliqué.' : 'Pack Performance installé.');
      void analyze();
    }
  };

  return (
    <div className="optim-panel">
      <div className="toolbar">
        <ProfileSelect />
        <div className="grow" />
        <button className="btn ghost" onClick={analyze} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> Analyser à nouveau
        </button>
      </div>

      <section className="panel">
        <header className="panel-header">
          <Cpu size={18} className="accent-icon" />
          <h3>Ton PC</h3>
          {report && <span className="tag accent">{TIER_LABEL[report.tier]}</span>}
        </header>
        {report ? (
          <ul className="reason-list">
            {report.tierReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="panel-note">{loading ? 'Analyse en cours…' : 'Analyse indisponible.'}</p>
        )}
        <p className="muted small panel-foot">Les recommandations ne garantissent aucun nombre de FPS : le résultat dépend du matériel, de la version et de la scène.</p>
      </section>

      {selectedProfile.loader === 'fabric' && (
        <section className="panel">
          <header className="panel-header">
            <Rocket size={18} className="accent-icon" />
            <h3>Pack Performance</h3>
          </header>
          <p className="panel-note">
            Installe en un clic les mods d’optimisation qui ont une version compatible avec Minecraft {selectedProfile.mcVersion} : Sodium, Lithium, FerriteCore,
            ImmediatelyFast, Entity Culling, More Culling, BadOptimizations, Krypton, ScalableLux (1.21.1 et plus), ModernFix (jusqu’à 1.21.4). Les
            dépendances et les incompatibilités sont vérifiées sur Modrinth ; ce qui ne peut pas être installé est indiqué.
          </p>
          <label className="check">
            <input type="checkbox" checked={dynamicFps} onChange={(e) => setDynamicFps(e.target.checked)} />
            Ajouter Dynamic FPS (réduit les FPS quand la fenêtre du jeu est en arrière-plan)
          </label>
          {gameOpen && <p className="notice">Ferme Minecraft pour installer des mods dans ce profil.</p>}
          {packResult && (
            <div className="plan">
              {packResult.result.installed.length > 0 && <p>Installés : {packResult.result.installed.join(', ')}.</p>}
              {packResult.result.alreadyInstalled.length > 0 && <p className="muted small">Déjà présents : {packResult.result.alreadyInstalled.join(', ')}.</p>}
              {packResult.result.skipped.map((s) => (
                <p key={s.name} className="notice">
                  {s.name} non installé : {s.reason}
                </p>
              ))}
              {packResult.mode && (
                <p className={packResult.result.moduleEnabled ? 'muted small' : 'notice'}>
                  {packResult.result.moduleEnabled
                    ? 'Module Zenthra Optimisation activé (pris en compte au prochain lancement, ou en jeu dans les 2 secondes).'
                    : `Module Zenthra Optimisation non activé : ${packResult.result.moduleNote ?? 'mod Zenthra indisponible.'}`}
                </p>
              )}
            </div>
          )}
          <div className="modal-actions">
            <button className="btn ghost" disabled={busy || gameOpen} onClick={() => runPack(false)}>
              <Download size={14} /> Installer le pack
            </button>
            <button className="btn primary" disabled={busy || gameOpen} onClick={() => runPack(true)}>
              <Rocket size={14} /> Mode Performance
            </button>
          </div>
          <p className="muted small panel-foot">Mode Performance = Pack Performance + module « Zenthra Optimisation » du mod Zenthra. Aucun gain de FPS n’est garanti.</p>
        </section>
      )}

      {memory && (
        <section className="panel">
          <header className="panel-header">
            <MemoryStick size={18} className="accent-icon" />
            <h3>Mémoire Java</h3>
          </header>
          <div className="mem-advice">
            <div>
              <div className="muted small">Actuelle</div>
              <div className="big">{gb(currentMem)}</div>
            </div>
            <div>
              <div className="muted small">Recommandée</div>
              <div className="big accent-text">{gb(memory.recommendedMb)}</div>
            </div>
            <div>
              <div className="muted small">Maximum raisonnable</div>
              <div className="big">{gb(memory.ceilingMb)}</div>
            </div>
          </div>
          <ul className="reason-list">
            {memory.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {memory.warning && (
            <p className="notice">
              <AlertTriangle size={14} /> {memory.warning}
            </p>
          )}
          <div className="modal-actions">
            {selectedProfile.memoryMb !== null && (
              <button className="btn ghost" onClick={() => run(() => api.profiles.update(selectedProfile.id, { memoryMb: null }), 'Valeur par défaut du launcher rétablie.')}>
                <RotateCcw size={14} /> {settings.autoMemory ? 'Mémoire automatique' : 'Valeur par défaut du launcher'}
              </button>
            )}
            <button
              className="btn primary"
              disabled={currentMem === memory.recommendedMb}
              onClick={() => run(() => api.profiles.update(selectedProfile.id, { memoryMb: memory.recommendedMb }), `Mémoire réglée sur ${gb(memory.recommendedMb)}.`)}
            >
              Utiliser la recommandation
            </button>
          </div>
        </section>
      )}

      {report && (
        <section className="panel">
          <header className="panel-header">
            <Download size={18} className="accent-icon" />
            <h3>Mods d’optimisation</h3>
          </header>
          <ul className="row-list">
            {report.candidates.map((c) => (
              <li key={c.projectId}>
                <input
                  type="checkbox"
                  aria-label={c.name}
                  disabled={c.installed || !!c.blocked}
                  checked={selectedMods.includes(c.projectId)}
                  onChange={(e) => setSelectedMods((s) => (e.target.checked ? [...s, c.projectId] : s.filter((x) => x !== c.projectId)))}
                />
                <div className="grow">
                  <div>
                    {c.name} {c.versionNumber && <span className="muted small">{c.versionNumber}</span>}
                  </div>
                  <div className="muted small">{c.purpose}</div>
                </div>
                {c.installed ? (
                  <span className="compat ok">
                    <CheckCircle2 size={13} /> Installé
                  </span>
                ) : c.blocked ? (
                  <span className="muted small">{c.blocked}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button className="btn primary" disabled={!selectedMods.length || busy} onClick={() => prepareMods(selectedMods)}>
              Vérifier et installer ({selectedMods.length})
            </button>
          </div>
        </section>
      )}

      {report && (
        <section className="panel">
          <header className="panel-header">
            <Wrench size={18} className="accent-icon" />
            <h3>Problèmes détectés</h3>
            <span className={`badge${report.issues.length ? ' warn' : ''}`}>{report.issues.length}</span>
          </header>
          {report.issues.length ? (
            <ul className="row-list">
              {report.issues.map((i, idx) => (
                <li key={idx}>
                  <AlertTriangle size={15} className="warn-icon" />
                  <span className="grow">{i.message}</span>
                  {i.fixProjectId && (
                    <button className="btn small" disabled={busy} onClick={() => prepareMods([i.fixProjectId!])}>
                      Installer la dépendance
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-note">Aucun doublon, dépendance manquante ni conflit connu dans ce profil.</p>
          )}
        </section>
      )}

      {report && (
        <section className="panel">
          <header className="panel-header">
            <MonitorCog size={18} className="accent-icon" />
            <h3>Réglages graphiques recommandés</h3>
          </header>
          {gameOpen && <p className="notice">Ferme Minecraft pour appliquer ou restaurer des réglages.</p>}
          {report.graphics.length ? (
            <table className="diff-table">
              <thead>
                <tr>
                  <th />
                  <th>Réglage</th>
                  <th>Actuel</th>
                  <th>Recommandé</th>
                </tr>
              </thead>
              <tbody>
                {report.graphics.map((g) => (
                  <tr key={g.key}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={g.label}
                        checked={selectedGfx.includes(g.key)}
                        onChange={(e) => setSelectedGfx((s) => (e.target.checked ? [...s, g.key] : s.filter((x) => x !== g.key)))}
                      />
                    </td>
                    <td>{g.label}</td>
                    <td className="muted">{g.current}</td>
                    <td className="accent-text">{g.recommended}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="panel-note">Tes réglages correspondent déjà aux recommandations pour ce PC.</p>
          )}
          {report.sodiumInstalled && <p className="muted small panel-foot">Sodium a aussi ses propres options en jeu : Options → Vidéo.</p>}
          <div className="modal-actions">
            {report.canRestoreGraphics && (
              <button
                className="btn ghost"
                disabled={gameOpen}
                onClick={async () => {
                  const ok = await run(() => api.optimizer.restoreGraphics(selectedProfile.id));
                  if (ok) notify('success', 'Réglages précédents restaurés.');
                  void analyze();
                }}
              >
                <RotateCcw size={14} /> Restaurer les réglages précédents
              </button>
            )}
            <button className="btn primary" disabled={!selectedGfx.length || gameOpen} onClick={() => setConfirmGfx(true)}>
              Appliquer ({selectedGfx.length})
            </button>
          </div>
        </section>
      )}

      {plans && (
        <Modal
          title="Installation des mods"
          onClose={() => setPlans(null)}
          width={560}
          footer={
            <>
              <button className="btn ghost" onClick={() => setPlans(null)}>
                Annuler
              </button>
              <button className="btn primary" disabled={busy || plans.every((p) => p.plan.conflicts.length)} onClick={installPlans}>
                Installer
              </button>
            </>
          }
        >
          {plans.map(({ name, plan }) => (
            <div key={name} className="plan">
              <h4>{name}</h4>
              <ul>
                {plan.toInstall.map((t) => (
                  <li key={t.version.id}>
                    <Download size={13} /> {t.title} <span className="muted">{t.version.version_number}</span>
                  </li>
                ))}
              </ul>
              {plan.warnings.map((w) => (
                <p key={w} className="notice">
                  {w}
                </p>
              ))}
              {plan.conflicts.map((c) => (
                <p key={c} className="notice error">
                  {c} — ce mod ne sera pas installé.
                </p>
              ))}
            </div>
          ))}
        </Modal>
      )}

      {confirmGfx && report && (
        <ConfirmDialog
          title="Appliquer les réglages graphiques"
          confirmLabel="Appliquer"
          message={
            <>
              {selectedGfx.length} réglage(s) vont être modifiés dans options.txt. Une copie des réglages actuels est gardée : tu pourras les restaurer.
            </>
          }
          onCancel={() => setConfirmGfx(false)}
          onConfirm={async () => {
            setConfirmGfx(false);
            await run(() => api.optimizer.applyGraphics(selectedProfile.id, selectedGfx), 'Réglages graphiques appliqués.');
            void analyze();
          }}
        />
      )}
    </div>
  );
}
