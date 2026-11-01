import { FolderOpen, LogIn, LogOut, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { UpdateStatus } from '@shared/types';
import { api } from '../api';
import { ConfirmDialog } from '../components/Modal';
import { PlayerHead } from '../components/PlayerHead';
import { Toggle } from '../components/Toggle';
import { useApp } from '../state/AppState';

function UpdatesSection() {
  const { settings, updateSettings, run, notify } = useApp();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  if (!settings) return null;

  const check = async () => {
    setChecking(true);
    const s = await run(() => api.updates.check());
    setChecking(false);
    if (s) setStatus(s);
  };

  return (
    <section className="panel settings-section">
      <h3>Mises à jour</h3>
      <div className="setting-row">
        <div className="grow">
          <div>Adresse du manifeste de mise à jour</div>
          <div className="muted small">Lien HTTPS publié par l’équipe Zenthra (voir docs/UPDATES.md). Vide : vérification désactivée.</div>
        </div>
        <input
          className="mono"
          style={{ width: 300 }}
          defaultValue={settings.updateUrl}
          placeholder="https://…/zenthra-update.json"
          onBlur={(e) => e.target.value.trim() !== settings.updateUrl && updateSettings({ updateUrl: e.target.value.trim() })}
        />
      </div>
      <div className="setting-row">
        <div className="grow">
          {!status && <div className="muted small">La vérification ne se fait que lorsque tu la demandes.</div>}
          {status?.status === 'not-configured' && <div className="muted small">Aucune adresse configurée (version {status.current}).</div>}
          {status?.status === 'up-to-date' && <div>Zenthra est à jour (version {status.current}).</div>}
          {status?.status === 'available' && (
            <div>
              <div>
                Nouvelle version {status.latest} disponible (installée : {status.current}).
              </div>
              {status.notes && <pre className="release-notes">{status.notes}</pre>}
            </div>
          )}
        </div>
        {status?.status === 'available' ? (
          <button
            className="btn primary"
            onClick={async () => {
              const file = await run(() => api.updates.download());
              if (file) notify('success', `Archive vérifiée enregistrée : ${file}. Ferme Zenthra puis extrais-la à la place de l’ancienne version.`);
            }}
          >
            Télécharger la mise à jour
          </button>
        ) : (
          <button className="btn" disabled={checking} onClick={check}>
            Vérifier maintenant
          </button>
        )}
      </div>
    </section>
  );
}

const ACCENTS =['#8b5cf6', '#a855f7', '#7c3aed', '#6366f1', '#d946ef', '#ec4899'];

/**
 * Custom accent colour: follows the picker live on screen, but saves only once the
 * colour stops changing (dragging in the picker fires dozens of changes a second).
 */
function AccentPicker({ value, onCommit }: { value: string; onCommit: (c: string) => void }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const change = (c: string) => {
    setLocal(c);
    document.documentElement.style.setProperty('--accent', c);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(c), 300);
  };
  return <input type="color" value={local} onChange={(e) => change(e.target.value)} aria-label="Couleur personnalisée" />;
}

export function SettingsPage() {
  const { settings, updateSettings, auth, run, params, appInfo } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const [clientId, setClientId] = useState(settings?.msClientId ?? '');
  const accountRef = useRef<HTMLElement>(null);
  const privacyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = params.section === 'account' ? accountRef.current : params.section === 'privacy' ? privacyRef.current : null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [params.section]);

  useEffect(() => setClientId(settings?.msClientId ?? ''), [settings?.msClientId]);

  if (!settings) return null;
  const s = settings;

  return (
    <div className="page settings">
      <div className="page-head">
        <div>
          <h1>Paramètres</h1>
          <p className="muted">Préférences enregistrées localement sur cet ordinateur.</p>
        </div>
      </div>

      <section className="panel settings-section" ref={accountRef}>
        <h3>Compte Microsoft</h3>
        {auth.status === 'signed-in' ? (
          <div className="setting-row">
            <PlayerHead skinUrl={auth.account.skinUrl} name={auth.account.name} size={40} />
            <div className="grow">
              <div>{auth.account.name}</div>
              <div className="muted small">Minecraft: Java Edition · session valide jusqu'au {new Date(auth.account.expiresAt).toLocaleString('fr-FR')}</div>
            </div>
            <button className="btn" onClick={() => run(() => api.auth.signOut(), 'Déconnecté. Les données de session locales ont été supprimées.')}>
              <LogOut size={15} /> Se déconnecter
            </button>
          </div>
        ) : (
          <div className="setting-row">
            <div className="grow">
              <div>{auth.status === 'signing-in' ? 'Connexion en cours dans ton navigateur…' : 'Non connecté'}</div>
              <div className="muted small">
                La connexion s'ouvre sur la page officielle de Microsoft, dans ton navigateur. Zenthra ne voit jamais ton mot de passe.
              </div>
              {auth.status === 'error' && <p className="form-error">{auth.message}</p>}
            </div>
            {auth.status === 'signing-in' ? (
              <button className="btn ghost" onClick={() => api.auth.cancel()}>
                Annuler
              </button>
            ) : (
              <button className="btn primary" disabled={!s.msClientId} onClick={() => run(() => api.auth.signIn())}>
                <LogIn size={15} /> Se connecter avec Microsoft
              </button>
            )}
          </div>
        )}
        <div className="setting-row">
          <div className="grow">
            <div>Identifiant d'application Azure (client ID)</div>
            <div className="muted small">
              Identifiant public de l'application enregistrée sur Azure et approuvée pour l'API Minecraft. Aucun secret n'est nécessaire. Voir
              docs/MICROSOFT_AUTH.md.
            </div>
          </div>
          <input
            className="mono"
            style={{ width: 300 }}
            value={clientId}
            placeholder="00000000-0000-0000-0000-000000000000"
            spellCheck={false}
            onChange={(e) => setClientId(e.target.value)}
            onBlur={() => clientId !== s.msClientId && updateSettings({ msClientId: clientId })}
          />
        </div>
      </section>

      <section className="panel settings-section">
        <h3>Apparence</h3>
        <div className="setting-row">
          <div className="grow">
            <div>Thème</div>
            <div className="muted small">Sombre</div>
          </div>
        </div>
        <div className="setting-row">
          <div className="grow">Couleur d'accent</div>
          <div className="swatches">
            {ACCENTS.map((c) => (
              <button key={c} className={`swatch${s.accentColor === c ? ' on' : ''}`} style={{ background: c }} onClick={() => updateSettings({ accentColor: c })} aria-label={c} />
            ))}
            <AccentPicker value={s.accentColor} onCommit={(c) => updateSettings({ accentColor: c })} />
          </div>
        </div>
        <div className="setting-row">
          <div className="grow">Fond sakura</div>
          <Toggle label="Fond sakura" checked={s.sakuraBackground} onChange={(v) => updateSettings({ sakuraBackground: v })} />
        </div>
        <div className="setting-row">
          <div className="grow">Opacité du fond</div>
          <input type="range" min={0} max={1} step={0.05} value={s.backgroundOpacity} onChange={(e) => updateSettings({ backgroundOpacity: Number(e.target.value) })} />
          <span className="muted small value">{Math.round(s.backgroundOpacity * 100)} %</span>
        </div>
        <div className="setting-row">
          <div className="grow">
            <div>Animations</div>
            <div className="muted small">Transitions de l'interface et pétales animés.</div>
          </div>
          <Toggle label="Animations" checked={s.animations} onChange={(v) => updateSettings({ animations: v })} />
        </div>
      </section>

      <section className="panel settings-section">
        <h3>Son</h3>
        <div className="setting-row">
          <div className="grow">Sons de l'interface</div>
          <Toggle label="Sons de l'interface" checked={s.uiSounds} onChange={(v) => updateSettings({ uiSounds: v })} />
        </div>
        <div className="setting-row">
          <div className="grow">Volume</div>
          <input type="range" min={0} max={1} step={0.05} disabled={!s.uiSounds} value={s.uiVolume} onChange={(e) => updateSettings({ uiVolume: Number(e.target.value) })} />
          <span className="muted small value">{Math.round(s.uiVolume * 100)} %</span>
        </div>
      </section>

      <section className="panel settings-section">
        <h3>Jeu et lancement</h3>
        <div className="setting-row">
          <div className="grow">
            <div>Répertoire du jeu</div>
            <div className="muted small mono">{s.dataDir}</div>
          </div>
          <button
            className="btn"
            onClick={async () => {
              const dir = await run(() => api.settings.chooseDataDir());
              if (dir) await updateSettings({ dataDir: dir });
            }}
          >
            <FolderOpen size={15} /> Changer
          </button>
        </div>
        <div className="setting-row">
          <div className="grow">
            <div>Mémoire Java par défaut</div>
            <div className="muted small">Chaque profil peut la remplacer. Trop de mémoire peut provoquer des saccades.</div>
          </div>
          <input type="range" min={1024} max={16384} step={512} value={s.memoryMb} onChange={(e) => updateSettings({ memoryMb: Number(e.target.value) })} />
          <span className="muted small value">{(s.memoryMb / 1024).toFixed(1)} Go</span>
        </div>
        <div className="setting-row">
          <div className="grow">Arguments JVM supplémentaires</div>
          <input className="mono" style={{ width: 300 }} defaultValue={s.jvmArgs} onBlur={(e) => e.target.value !== s.jvmArgs && updateSettings({ jvmArgs: e.target.value })} spellCheck={false} />
        </div>
        <div className="setting-row">
          <div className="grow">
            <div>Téléchargements simultanés</div>
            <div className="muted small">Moins si ta connexion est lente ou partagée ; plus pour installer plus vite.</div>
          </div>
          <input
            type="range"
            min={1}
            max={16}
            step={1}
            value={s.downloadConcurrency}
            onChange={(e) => updateSettings({ downloadConcurrency: Number(e.target.value) })}
          />
          <span className="muted small value">{s.downloadConcurrency}</span>
        </div>
        <div className="setting-row">
          <div className="grow">Après le lancement</div>
          <select value={s.afterLaunch} onChange={(e) => updateSettings({ afterLaunch: e.target.value as typeof s.afterLaunch })}>
            <option value="minimize">Réduire le launcher</option>
            <option value="hide">Masquer le launcher</option>
            <option value="keep">Laisser ouvert</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="grow">
            <div>Raccourcis clavier en jeu</div>
            <div className="muted small">
              Zoom (C), Free Look (Alt gauche), Waypoint (B), Menu Zenthra (Maj droite) : modifiables dans Options → Commandes → Zenthra.
            </div>
          </div>
        </div>
      </section>

      <section className="panel settings-section" ref={privacyRef}>
        <h3>Confidentialité</h3>
        <div className="setting-row">
          <div className="grow">
            <div>Apparaître en ligne</div>
            <div className="muted small">Partage ton pseudo et ton statut avec tes amis via le serveur de présence. Désactivé par défaut.</div>
          </div>
          <Toggle label="Apparaître en ligne" checked={s.showOnlineStatus} onChange={(v) => updateSettings({ showOnlineStatus: v })} />
        </div>
        <div className="setting-row">
          <div className="grow">
            <div>Statut Discord</div>
            <div className="muted small">Affiche « Joue à Zenthra Client » et la version de Minecraft sur ton profil Discord (via l'application Discord de ce PC).</div>
          </div>
          <Toggle label="Statut Discord" checked={s.discordPresence} onChange={(v) => updateSettings({ discordPresence: v })} />
        </div>
        <div className="setting-row">
          <div className="grow">
            <div>Serveur de présence</div>
            <div className="muted small">Adresse HTTPS d'un serveur compatible (voir docs/COMMUNITY.md). Vide = fonctionnalité désactivée.</div>
          </div>
          <input
            className="mono"
            style={{ width: 300 }}
            defaultValue={s.presenceServerUrl}
            placeholder="https://"
            onBlur={(e) => e.target.value !== s.presenceServerUrl && updateSettings({ presenceServerUrl: e.target.value.trim() })}
          />
        </div>
      </section>

      <section className="panel settings-section">
        <h3>Langue</h3>
        <div className="setting-row">
          <div className="grow">Langue de l'interface</div>
          <select value={s.language} disabled>
            <option value="fr">Français</option>
          </select>
        </div>
      </section>

      <UpdatesSection />

      <section className="panel settings-section">
        <h3>Réinitialisation</h3>
        <div className="setting-row">
          <div className="grow">
            <div>Réinitialiser les paramètres</div>
            <div className="muted small">Restaure les valeurs par défaut. Profils, mondes, compte et répertoire du jeu sont conservés.</div>
          </div>
          <button className="btn danger-outline" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={15} /> Réinitialiser
          </button>
        </div>
        <p className="muted small">Zenthra Client {appInfo?.version}</p>
      </section>

      {confirmReset && (
        <ConfirmDialog
          title="Réinitialiser les paramètres"
          confirmLabel="Réinitialiser"
          danger
          message="Toutes les préférences reviendront à leurs valeurs par défaut."
          onCancel={() => setConfirmReset(false)}
          onConfirm={async () => {
            setConfirmReset(false);
            const next = await run(() => api.settings.reset(), 'Paramètres réinitialisés.');
            if (next) await updateSettings({});
          }}
        />
      )}
    </div>
  );
}
