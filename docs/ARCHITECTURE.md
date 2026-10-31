# Architecture

```
launcher/                 Application Electron (launcher)
  electron/               Processus principal (Node) — accès disque, réseau, processus Java
    main.ts               Fenêtre, sécurité (sandbox, navigation bloquée), relais d'événements
    preload.ts            Pont contextBridge → window.zenthra (API typée shared/api.ts)
    ipc.ts                Handlers IPC ; erreurs converties en messages sûrs
    minecraft/            Installation et lancement du jeu
      versions.ts         Manifeste Mojang, client, bibliothèques, natives, assets (SHA-1 vérifiés)
      java.ts             Runtime Java officiel Mojang (java-runtime-*) par version
      fabric.ts           Profils Fabric via meta.fabricmc.net
      forge.ts            Forge / NeoForge via leurs installateurs officiels
      versionJson.ts      Règles, coordonnées Maven, fusion parent/enfant
      launch.ts           Arguments JVM/jeu, processus, journaux, Quick Play, mode démo
    services/
      auth.ts             Microsoft → Xbox → XSTS → Minecraft (PKCE, sans secret)
      secureStore.ts      Jetons chiffrés DPAPI (safeStorage)
      profiles.ts         Profils (CRUD, duplication, import/export)
      modrinth.ts         API Modrinth v2 : recherche, versions, dépendances, conflits, installation
      modpack.ts          Import .mrpack (validation des chemins et des hôtes)
      zenthraMod.ts       Injection du mod Zenthra + état des modules (fichier partagé)
      migration.ts        Reprise des données de l'ancien nom (Amethyst) au premier lancement
      settings.ts         Préférences locales (JSON)
      community.ts        Serveurs favoris + client de présence (serveur requis)
      http.ts             Requêtes HTTPS, tentatives, limite 429, téléchargements atomiques vérifiés
  src/                    Interface React (aucun accès Node)
    components/ pages/ state/ styles/
minecraft-mod/            Mod Fabric multi-versions (mappings officiels Mojang ; 26.x non obfusqué)
  versions/<cible>.properties   Une cible par famille : version de Minecraft, Fabric API, Java,
                                versions exactes servies par ce jar (supported_versions)
  build-all.ps1           Compile toutes les cibles (gradlew build -Ptarget=<cible> pour une seule)
  src/main/java/client/zenthra/   Code commun à toutes les versions
    ZenthraClient.java    Initialisation, événements, bouton « Modules Zenthra » du menu pause
    Hooks.java            Décisions appelées par les mixins de chaque version
    compat/               Interfaces communes : Gfx (dessin), HudRenderer, WorldFrameListener, PerfOption
    config/               Lecture/écriture de zenthra.json + rechargement à chaud
    module/               Système de modules, réglages typés, 15 modules dans impl/
    gui/                  Menu Modules Zenthra, réglages, éditeur de HUD, waypoints
    dev/SelfTest.java     Parcours automatique en jeu (-Dzenthra.selftest=true)
  src/compat/<famille>/   Adaptation à une famille de versions (v1_20_1 … v1_21_11, v26_3) :
    compat/Platform.java  Tout ce qui change d'une version à l'autre (touches, écrans, rendu, options)
    compat/ZScreen.java   Base des écrans Zenthra (rendu et entrées de cette version)
    compat/GuiGfx.java    Gfx sur le moteur de rendu d'interface de cette version
    mixin/                Points d'accroche minimaux dans le code du jeu
shared/                   Contrats communs (types TS, liste des modules, format de config)
docs/                     Documentation
```

## Choix techniques

- **Electron plutôt que Tauri** : le launcher télécharge des centaines de
  fichiers, lance et surveille un processus Java et héberge un serveur OAuth
  local ; Node le fait nativement et la chaîne Rust n'était pas nécessaire.
- **JSON plutôt que SQLite** : quelques petits fichiers (paramètres, profils,
  serveurs) ; écriture atomique, aucun module natif à recompiler.
- **Runtime Java Mojang** : chaque version reçoit le Java prévu par Mojang
  (17 pour 1.20.1–1.20.4, 21 pour 1.20.5–1.21.11, 25 pour 26.x) sans dépendre
  d'une installation système.
- **Un jar du mod par famille de versions** : `launcher/resources/zenthra-mod/index.json`
  associe chaque version exacte de Minecraft à son jar ; le launcher installe celui
  du profil et propose le mod uniquement pour ces versions.
- **Un dossier de jeu par profil** (`instances/<id>`) ; versions, bibliothèques
  et assets sont partagés.

## Communication launcher ↔ mod

Fichier `instances/<id>/config/zenthra/zenthra.json` (voir
`shared/zenthra-config.md`). Le launcher ne modifie que les drapeaux
`enabled` ; le mod relit le fichier quand il change, même en cours de partie.

## Sécurité

- Renderer isolé (`contextIsolation`, `sandbox`, CSP stricte, navigation bloquée).
- Téléchargements uniquement en HTTPS, hôtes autorisés par source, empreintes
  SHA-1/SHA-512 vérifiées avant installation, protection contre les chemins
  sortant du dossier cible (zip slip).
- Suppressions de profils et de mods envoyées dans la corbeille Windows.
