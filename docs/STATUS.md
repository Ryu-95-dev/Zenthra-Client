# État d'avancement — Zenthra Client 0.1.0

Légende : ✅ implémenté et vérifié · 🟡 implémenté, non vérifié de bout en bout · ⛔ dépend d'un élément externe · ⏳ à faire

> Anciennement **Amethyst Client**. Au premier lancement, `services/migration.ts` reprend
> automatiquement paramètres, profils, session, dossier `.amethyst` → `.zenthra` et
> configuration du mod (testé : `tests/storage.test.ts`).

## Tests

| Commande (dans `launcher/`) | Ce qui est vérifié |
| --- | --- |
| `npm test` | **39 tests unitaires** : téléchargements (vérification, fichier corrompu, reprise après coupure, annulation, taille max, hôte refusé), règles de versions, mémoire recommandée, options.txt, masquage des jetons, profils (validation, duplication, import/export, ancien format, historique, restauration), paramètres, communication launcher ↔ mod, télémétrie, resource packs, migration, dépendances et incompatibilités Modrinth, modpacks piégés, connexion Microsoft **simulée**, mises à jour, serveur communautaire complet |
| `npm run smoke` | Captures de toutes les pages + vrai lancement de Minecraft |
| `SMOKE_SELFTEST=1` (+ `SMOKE_LANG=fr_fr`/`en_us`) | Parcours en jeu dans un profil temporaire : menu Échap, menu Modules Zenthra, diagnostic, réglages + aperçu du viseur, éditeur de HUD, waypoints, zoom, free look, armure, potions, Hit Color, sprint, scoreboard, rechargement à chaud |
| `SMOKE_LOADER=forge` / `neoforge` | Installation et démarrage de Forge / NeoForge |
| `SMOKE_DASHBOARD=1` | Personnalisation de l'accueil (redimensionner, déplacer, retirer) |

Dépendances livrées : `npm audit --omit=dev` → 0 vulnérabilité (15 alertes modérées
uniquement dans les outils de compilation, non livrés).

## Launcher
- ✅ Electron + React + TypeScript ; pages chargées à la demande ; Ctrl+K pour la recherche
- ✅ Accueil personnalisable (blocs déplaçables, redimensionnables, masquables)
- ✅ Thème sombre, accent qui teinte toute l'interface, fond sakura, logo Zenthra
- ✅ Exécutable livré non modifié (accepté par Smart App Control) ; icône appliquée à la fenêtre
- ⛔ Installateur NSIS bloqué par Smart App Control sur ce PC (exécutable non signé) → livraison en zip

## Moteur Minecraft
- ✅ Installation vérifiée (SHA-1) des versions officielles, Java officiel Mojang
- ✅ Fabric, Forge, NeoForge (installateurs officiels, SHA-1 obligatoire)
- ✅ Téléchargements **annulables**, **reprise** des fichiers interrompus, parallélisme réglable (1–16)
- ✅ Vérification/réparation d'une version installée ; lancement hors ligne si tout est installé
- ✅ Un seul jeu à la fois ; journaux en direct et sur disque (jetons masqués)

## Profils
- ✅ 5 profils par défaut, création, duplication, import/export, suppression vers la corbeille
- ✅ Image personnalisée, version du chargeur, mémoire avec recommandation
- ✅ **Historique** : sauvegarde avant chaque modification importante, restauration des réglages

## Modrinth
- ✅ Recherche (cache avec expiration), dépendances, incompatibilités, installation vérifiée (SHA-512)
- ✅ Compatibilité revérifiée avant tout téléchargement ; installation annulable
- ✅ Modpacks .mrpack (Fabric/Forge/NeoForge/Vanilla), chemins et taille validés avant écriture,
  profil supprimé si l'import échoue ou est annulé

## Resource packs
- ✅ Activer/désactiver, ordre de priorité, aperçu (pack.png), compatibilité (format du pack vs jeu),
  import, suppression vers la corbeille, ouverture du dossier ; sauvegarde d'options.txt avant écriture

## Diagnostic et performances
- ✅ Mesures réelles : FPS, moyenne, temps de frame, mémoire Java, démarrage, GPU, mods chargés
  (télémétrie locale du mod), mémoire du launcher, système, erreurs/avertissements ; export JSON
- ✅ Assistant mémoire Java (jamais plus de la moitié de la RAM, explications, retour à la recommandation)
- ✅ Mods d'optimisation (Sodium, Lithium, FerriteCore, ImmediatelyFast, Entity Culling) avec
  compatibilité et conflits vérifiés et plan affiché avant installation
- ✅ Doublons, dépendances manquantes, mauvais chargeur, incompatibilités détectés
- ✅ Réglages graphiques recommandés selon le PC, aperçu avant/après, restauration

## Mod Fabric (multi-versions)
- ✅ « Modules Zenthra » dans le menu Échap (« Zenthra Skills » si le jeu est en anglais)
- ✅ 15 modules, dont Indicateurs d'état ; diagnostic en jeu ; aperçu du viseur ; réinitialisation
  complète (waypoints conservés) ; waypoints par monde ou serveur
- ✅ Un jar par famille de versions ; le launcher installe celui qui correspond au profil
  et ne propose le mod que pour ces versions (`launcher/resources/zenthra-mod/index.json`)

Validation : parcours automatique en jeu (`SMOKE_SELFTEST=1 SMOKE_MC=<version> npm run smoke`,
41 étapes : bouton du menu pause, écrans, HUD, zoom, free look, toggle sprint, effets,
hit color, scoreboard, rechargement à chaud depuis le launcher).

| Minecraft | Java | Parcours en jeu |
| --- | --- | --- |
| 1.20 – 1.20.1 | 17 | ✅ 41/41 (1.20.1) |
| 1.20.4 | 17 | ✅ 41/41 |
| 1.20.6 | 21 | ✅ 41/41 |
| 1.21 – 1.21.1 | 21 | ✅ 41/41 (1.21.1) |
| 1.21.4 | 21 | ✅ 41/41 |
| 1.21.5 | 21 | ✅ 41/41 |
| 1.21.6 – 1.21.8 | 21 | ✅ 41/41 (1.21.6 et 1.21.8 ; 1.21.7 non testée seule) |
| 1.21.9 | 21 | ✅ 41/41 |
| 1.21.10 | 21 | ✅ 41/41 |
| 1.21.11 | 21 | ✅ 41/41 |
| 26.3 | 25 | ✅ 41/41 |

- ⛔ Pas encore : 1.20.2–1.20.3, 1.20.5, 1.21.2–1.21.3, 26.1–26.2, 1.8.9 (ancien Forge, mod séparé), Forge/NeoForge

## Compte, mises à jour, communauté
- ✅ Connexion Microsoft PKCE complète, jetons chiffrés DPAPI (testée en simulation)
- ⛔ ID d'application Azure approuvé par Mojang requis pour la vraie connexion (docs/MICROSOFT_AUTH.md)
- ✅ Mises à jour : manifeste HTTPS + SHA-256, archive vérifiée, jamais d'écrasement en cours d'exécution
- ⛔ Aucun manifeste publié pour l'instant (docs/UPDATES.md)
- ✅ Serveur communautaire (amis, demandes, présence choisie, blocage, effacement) + client
- ⛔ Serveur à héberger en HTTPS ; nécessite aussi la connexion Microsoft (docs/COMMUNITY.md)
