import { Ban, Check, RefreshCw, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { CommunityOverview } from '@shared/types';
import { api } from '../api';
import { useApp } from '../state/AppState';
import { ConfirmDialog } from './Modal';
import { Toggle } from './Toggle';

/** Friends, requests and blocks on the Zenthra community server. */
export function FriendsPanel() {
  const { run, notify, navigate, settings, updateSettings } = useApp();
  const [data, setData] = useState<CommunityOverview | null>(null);
  const [name, setName] = useState('');
  const [confirmErase, setConfirmErase] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setData(await api.community.overview().catch((e: Error) => ({ status: 'error' as const, message: e.message })));
    setBusy(false);
  }, []);

  useEffect(() => {
    void load();
    // Refresh while the page is open only.
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    const r = await run(fn, ok);
    void load();
    return r;
  };

  return (
    <section className="panel">
      <header className="panel-header">
        <Users size={18} className="accent-icon" />
        <h3>Amis Zenthra</h3>
        <div className="grow" />
        {data?.status === 'ok' && (
          <button className="icon-btn" title="Actualiser" onClick={load} disabled={busy}>
            <RefreshCw size={15} className={busy ? 'spin' : ''} />
          </button>
        )}
      </header>

      {!data ? (
        <p className="panel-note">Chargement…</p>
      ) : data.status === 'not-configured' ? (
        <div className="panel-note">
          <p>La liste d’amis nécessite un serveur communautaire Zenthra. Aucun n’est configuré pour l’instant.</p>
          <p className="muted small">
            Le serveur est fourni (server/community) mais doit être hébergé en HTTPS. Personne n’est détecté à son insu : seuls les joueurs qui
            activent le partage apparaissent en ligne. Voir docs/COMMUNITY.md.
          </p>
          <button className="btn small ghost" onClick={() => navigate('settings', { section: 'privacy' })}>
            Configurer
          </button>
        </div>
      ) : data.status === 'signed-out' ? (
        <p className="panel-note">Connecte ton compte Microsoft pour retrouver tes amis (Paramètres → Compte).</p>
      ) : data.status === 'error' ? (
        <div className="panel-note">
          <p>{data.message}</p>
          <button className="btn small ghost" onClick={load}>
            Réessayer
          </button>
        </div>
      ) : (
        <>
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const msg = await act(() => api.community.sendRequest(name.trim()));
              if (msg) {
                notify('success', msg as string);
                setName('');
              }
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pseudo Minecraft" maxLength={16} spellCheck={false} />
            <button className="btn" type="submit" disabled={!/^\w{1,16}$/.test(name.trim())}>
              <UserPlus size={15} /> Ajouter
            </button>
          </form>

          {data.incoming.length > 0 && (
            <>
              <h4 className="section-title">Demandes reçues</h4>
              <ul className="row-list">
                {data.incoming.map((p) => (
                  <li key={p.uuid}>
                    <span className="grow">{p.name}</span>
                    <button className="btn small" onClick={() => act(() => api.community.answerRequest(p.uuid, true), `${p.name} est maintenant ton ami.`)}>
                      <Check size={14} /> Accepter
                    </button>
                    <button className="icon-btn" title="Refuser" onClick={() => act(() => api.community.answerRequest(p.uuid, false))}>
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4 className="section-title">Amis ({data.friends.length})</h4>
          {data.friends.length ? (
            <ul className="row-list">
              {[...data.friends]
                .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
                .map((f) => (
                  <li key={f.uuid}>
                    <span className={`dot ${f.online ? 'ok' : 'off'}`} />
                    <span className="grow">{f.name}</span>
                    <span className="muted small">{f.online ? (f.activity ?? 'En ligne') : 'Hors ligne'}</span>
                    <button className="icon-btn" title="Retirer" onClick={() => act(() => api.community.removeFriend(f.uuid), `${f.name} retiré.`)}>
                      <UserMinus size={15} />
                    </button>
                    <button className="icon-btn danger" title="Bloquer" onClick={() => act(() => api.community.setBlocked(f.uuid, true), `${f.name} bloqué.`)}>
                      <Ban size={15} />
                    </button>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="panel-note">Aucun ami pour le moment. Ajoute un joueur qui utilise aussi Zenthra.</p>
          )}

          {data.outgoing.length > 0 && <p className="muted small">En attente de réponse : {data.outgoing.map((p) => p.name).join(', ')}</p>}

          {data.blocked.length > 0 && (
            <>
              <h4 className="section-title">Bloqués</h4>
              <ul className="row-list">
                {data.blocked.map((p) => (
                  <li key={p.uuid}>
                    <span className="grow">{p.name}</span>
                    <button className="btn small ghost" onClick={() => act(() => api.community.setBlocked(p.uuid, false), `${p.name} débloqué.`)}>
                      Débloquer
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="setting-row">
            <div className="grow">
              <div>Apparaître en ligne</div>
              <div className="muted small">Tes amis voient si tu joues et sur quel profil. Désactivé : tu restes invisible.</div>
            </div>
            <Toggle label="Apparaître en ligne" checked={!!settings?.showOnlineStatus} onChange={(v) => updateSettings({ showOnlineStatus: v })} />
          </div>
          <button className="link-btn danger-link" onClick={() => setConfirmErase(true)}>
            Supprimer mes données du serveur communautaire
          </button>
        </>
      )}

      {confirmErase && (
        <ConfirmDialog
          title="Supprimer mes données"
          danger
          confirmLabel="Tout supprimer"
          message="Ta liste d’amis, tes demandes, tes blocages et ton statut seront définitivement effacés du serveur communautaire."
          onCancel={() => setConfirmErase(false)}
          onConfirm={async () => {
            setConfirmErase(false);
            await act(() => api.community.deleteMyData(), 'Tes données ont été supprimées du serveur.');
          }}
        />
      )}
    </section>
  );
}
