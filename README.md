# Zenthra Client

Launcher Minecraft Java orienté PvP (Windows 10/11) : profils, versions,
Fabric, Modrinth, connexion Microsoft, et un mod Fabric qui ajoute
**Modules Zenthra** au menu Échap (« Zenthra Skills » si le jeu est en anglais).

Vocabulaire : un **module** est une fonction intégrée à Zenthra (Zoom, Keystrokes…),
un **mod** est un fichier Fabric/Forge installé dans un profil (Sodium, Fabric API…).

- `launcher/` — application Electron + React + TypeScript
- `minecraft-mod/` — mod Fabric multi-versions : 1.20.1 → 1.21.11 et 26.3 (voir docs/STATUS.md)
- `server/community/` — serveur communautaire (amis, présence), Node.js sans dépendance
- `shared/` — contrats partagés · `docs/` — documentation

## Prérequis de développement

| Outil | Version | Rôle |
| --- | --- | --- |
| Node.js | 22+ (testé 24.20) | launcher |
| JDK | **25** pour exécuter Gradle/Loom 1.19 | compilation du mod (cible Java 21) |

Les joueurs n'ont besoin d'aucun Java : le launcher installe le runtime
officiel de Mojang adapté à chaque version.

## Commandes

```bash
cd launcher && npm run build:mod           # compile le mod pour chaque version et le copie dans launcher/resources/zenthra-mod
cd minecraft-mod && gradlew.bat build -Ptarget=1.21.11   # une seule version (voir minecraft-mod/versions/)
cd launcher && npm install
npm run dev        # Vite + Electron avec rechargement
npm run build      # typecheck + bundle main/preload + renderer
npm start          # lance la version compilée
npm test           # 41 tests unitaires (vitest)
npm run icons      # régénère les icônes depuis assets-src/zenthra-logo.png
npm run smoke      # test de bout en bout : captures des pages + lancement réel en mode démo
                   # avec SMOKE_SELFTEST=1 : parcours automatique des écrans Zenthra en monde démo
                   # SMOKE_MC=<version> : version de Minecraft testée (ex. 26.3)
npm run dist       # dossier exécutable Windows (electron-builder, release/)
```

`JAVA_HOME` doit pointer vers un JDK 25 pour `gradlew`.

## Données

- Jeu : `%APPDATA%\.zenthra` (modifiable dans Paramètres) — `versions/`,
  `libraries/`, `assets/`, `runtimes/`, `instances/<profil>/`, `logs/`
- Launcher : `%APPDATA%\Zenthra Client` — `settings.json`, `profiles.json`,
  `servers.json`, `session.bin` (chiffré DPAPI)

## Dépendances externes à configurer

- **Connexion Microsoft** : identifiant d'application Azure approuvé pour
  l'API Minecraft → [docs/MICROSOFT_AUTH.md](docs/MICROSOFT_AUTH.md).
  Sans lui, seul le mode démo officiel est disponible.
- **Amis / présence** : serveur à déployer → [docs/COMMUNITY.md](docs/COMMUNITY.md).

Voir aussi [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) et
[docs/STATUS.md](docs/STATUS.md) (état d'avancement).
