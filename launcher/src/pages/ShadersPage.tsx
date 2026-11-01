import { Sparkles } from 'lucide-react';
import { ContentList } from '../components/ContentList';
import { ProfileSelect } from '../components/ProfileSelect';
import { useApp } from '../state/AppState';

/** Shader packs of the selected profile (installed with Iris, which the launcher adds when needed). */
export function ShadersPage() {
  const { selectedProfile } = useApp();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Shaders</h1>
          <p className="muted">Lumières, ombres et reflets réalistes. Le launcher installe Iris (et Sodium) automatiquement avec le premier shader.</p>
        </div>
        <div className="actions">
          <ProfileSelect />
        </div>
      </div>
      {selectedProfile ? (
        <>
          <ContentList type="shader" />
          <section className="panel">
            <header className="panel-header">
              <Sparkles size={18} className="accent-icon" />
              <h3>Activer un shader en jeu</h3>
            </header>
            <p className="panel-note">
              Lance le profil, puis Options → Paramètres vidéo → Packs de shaders (ajouté par Iris) et choisis ton shader. Les shaders
              demandent une carte graphique correcte : si le jeu rame, choisis un shader « Lite » ou désactive-le avec la touche K.
            </p>
          </section>
        </>
      ) : (
        <p className="panel-note">Crée d'abord un profil.</p>
      )}
    </div>
  );
}