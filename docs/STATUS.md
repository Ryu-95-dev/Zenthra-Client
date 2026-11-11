# État d'avancement — Zenthra Client 0.1.0

Légende : ✅ implémenté et vérifié · 🟡 implémenté, non vérifié de bout en bout · ⛔ dépend d'un élément externe · ⏳ à faire

> Anciennement **Amethyst Client**. Au premier lancement, `services/migration.ts` reprend
> automatiquement paramètres, profils, session, dossier `.amethyst` → `.zenthra` et
> configuration du mod (testé : `tests/storage.test.ts`).

## Tests

| Commande (dans `launcher/`) | Ce qui est vérifié |
| --- | --- |
| `npm test` | **64 tests unitaires** : caches de lancement (index Java, liste Fabric), options JVM (ZGC/G1, CDS, arguments du joueur en dernier), mémoire automatique, Pack Performance, téléchargements (vérification, fichier corrompu, reprise après coupure, annulation, taille max, hôte refusé), règles de versions, mémoire recommandée, options.txt, masquage des jetons, profils (validation, duplication, import/export, ancien format, historique, restauration), paramètres, communication launcher ↔ mod, télémétrie, resource packs, migration, dépendances et incompatibilités Modrinth, modpacks piégés, connexion Microsoft **simulée**, mises à jour, serveur communautaire complet |
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

## Optimisations (branche `claude/zen-goldberg-lx75tc`, non fusionnée)

Implémentées et couvertes par des tests unitaires, **pas encore testées en jeu sous Windows**
(pas de Minecraft dans l'environnement de développement) : à valider avant fusion dans `main`.

Temps de lancement :
- 🟡 Index des runtimes Java Mojang et liste des Fabric Loader gardés 24 h (`cache/java-runtime-index.json`,
  `cache/fabric/loaders-<version>.json`) : runtime et loader déjà installés → aucun accès réseau
- 🟡 Bibliothèques natives extraites une seule fois par version (`natives/.zenthra-extracted`)
- 🟡 Boucle sur les ~4000 ressources sautée si la version est vérifiée et l'index inchangé
  (`assets/indexes/<id>.zenthra-verified` = SHA-1 de l'index) ; « Réparer » revérifie tout
- 🟡 Class Data Sharing (Java 19+) : `-XX:SharedArchiveFile=<données>/cache/cds/<version>/zenthra-java<N>.jsa
  -XX:+AutoCreateSharedArchive -Xshare:auto` ; archive invalide = ignorée puis recréée ; désactivé si le chemin
  n'est pas en ASCII ou si le joueur règle lui-même `-Xshare`/CDS
- 🟡 ModernFix dans le Pack Performance (jusqu'à 1.21.4)

FPS :
- 🟡 **Pack Performance** (Diagnostic → Optimisation, et case cochée par défaut à la création d'un profil Fabric) :
  Sodium, Lithium, FerriteCore, ImmediatelyFast, Entity Culling, More Culling, BadOptimizations, Krypton,
  ScalableLux (1.21.1+), ModernFix (≤ 1.21.4), Dynamic FPS en option. Chaque mod passe par le plan Modrinth
  (dépendances, incompatibilités) ; seuls les mods compatibles sont installés, les autres sont listés avec la raison
- 🟡 **Mode Performance** : Pack Performance + module « Zenthra Optimisation » activé (seul `enabled` est modifié)
- 🟡 Options JVM : ZGC générationnel pour Java 21+ (`-XX:+ZGenerational` seulement sur Java 21–22), G1 réglé pour
  Java 17–20 ; aucun collecteur ajouté si le joueur en choisit un ; arguments du joueur toujours en dernier
- 🟡 Mémoire automatique (par défaut) : profil sans valeur → recommandation selon la RAM et le nombre de mods
  (même calcul que le conseil mémoire) ; une valeur déjà modifiée dans les paramètres est conservée
- 🟡 Minecraft lancé en priorité « supérieure à la normale » ; launcher sans animations pendant la partie
- 🟡 Mod : HUD sans `String.format`/listes recréés à chaque image (texte reconstruit seulement quand la valeur change) ;
  ⛔ compilation des 11 cibles non vérifiée ici (hôtes Mojang/Fabric et JDK 25 inaccessibles), à faire sur le PC

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
  compatibilité et conflits vérifiés et plan affiché avant installation (🟡 liste étendue au Pack Performance, voir plus haut)
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
- ✅ Application Azure de Zenthra Client approuvée par Mojang (novembre 2026) et intégrée au launcher
- ✅ Mises à jour : manifeste HTTPS + SHA-256, archive vérifiée, jamais d'écrasement en cours d'exécution
- ⛔ Aucun manifeste publié pour l'instant (docs/UPDATES.md)
- ✅ Serveur communautaire (amis, demandes, présence choisie, blocage, effacement) + client
- ⛔ Serveur à héberger en HTTPS ; nécessite aussi la connexion Microsoft (docs/COMMUNITY.md)
