import { Activity, Boxes, ChevronRight, Compass, House, Image, Layers, Play, Puzzle, Server, Settings, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { useApp, type PageId } from '../state/AppState';
import { Logo } from './icons';
import { PlayerHead } from './PlayerHead';

const NAV: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Accueil', icon: House },
  { id: 'play', label: 'Jouer', icon: Play },
  { id: 'profiles', label: 'Profils', icon: Boxes },
  { id: 'modules', label: 'Modules', icon: SlidersHorizontal },
  { id: 'mods', label: 'Mods', icon: Puzzle },
  { id: 'resourcepacks', label: 'Resource Packs', icon: Image },
  { id: 'modrinth', label: 'Modrinth', icon: Compass },
  { id: 'versions', label: 'Versions', icon: Layers },
  { id: 'multiplayer', label: 'Multijoueur', icon: Server },
  { id: 'diagnostics', label: 'Diagnostic', icon: Activity },
  { id: 'settings', label: 'Paramètres', icon: Settings },
];

export function Sidebar() {
  const { page, navigate, auth } = useApp();
  const account = auth.status === 'signed-in' ? auth.account : null;

  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo />
        <div>
          <div className="brand-name">Zenthra</div>
          <div className="brand-tag">Client</div>
        </div>
      </div>

      <nav className="nav">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`nav-item${page === id ? ' active' : ''}`} onClick={() => navigate(id)}>
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <button className="account-card" onClick={() => navigate('settings', { section: 'account' })}>
        <PlayerHead skinUrl={account?.skinUrl ?? null} name={account?.name ?? '?'} size={34} />
        <div className="account-text">
          <div className="account-name">{account?.name ?? 'Non connecté'}</div>
          <div className={`account-status ${account ? 'online' : ''}`}>
            {auth.status === 'signing-in' ? 'Connexion…' : account ? 'Compte Microsoft' : 'Se connecter'}
          </div>
        </div>
        <ChevronRight size={16} className="muted" />
      </button>
    </aside>
  );
}
