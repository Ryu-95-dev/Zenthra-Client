# Format de configuration partagé launcher ↔ mod

Le launcher et le mod Fabric communiquent par **un fichier JSON** situé dans le
répertoire de jeu de chaque profil :

```
<dataDir>/instances/<profileId>/config/zenthra/zenthra.json
```

## Règles

- Le **mod** est propriétaire du fichier : il le crée au premier lancement, y
  écrit tous les réglages et le recharge lorsque sa date de modification change
  (vérification toutes les 2 secondes en jeu).
- Le **launcher** ne modifie que `modules.<id>.enabled` et conserve tous les
  autres champs tels quels (lecture → modification → écriture atomique).
- Un identifiant de module inconnu est ignoré par les deux côtés.
- `formatVersion` permet les migrations futures ; la version actuelle est `1`.

## Structure

```json
{
  "formatVersion": 1,
  "modules": {
    "fps_counter": {
      "enabled": true,
      "settings": { "color": "#FFFFFF", "background": true },
      "hud": { "x": 4, "y": 4, "scale": 1.0 }
    }
  },
  "waypoints": [
    { "name": "Base", "x": 120, "y": 64, "z": -40, "dimension": "minecraft:overworld", "color": "#A855F7", "visible": true }
  ]
}
```

## Télémétrie locale (mod → launcher)

Toutes les 2 secondes, le mod écrit `<dossier du profil>/zenthra/telemetry.json`
(écriture atomique). Rien n'est envoyé sur Internet. Le launcher ne lit ce fichier
que lorsque la page Diagnostic est ouverte, et l'ignore s'il a plus de 10 secondes
(jeu fermé ou figé).

```json
{
  "formatVersion": 1,
  "writtenAt": 1767225600000,
  "pid": 1234,
  "fps": 144, "fpsAvg": 139.5,
  "frameMsAvg": 6.9, "frameMsMax": 21.4,
  "inWorld": true,
  "memUsedMb": 1830, "memAllocatedMb": 2560, "memMaxMb": 4096,
  "javaVersion": "21.0.7", "javaVendor": "Microsoft",
  "mcVersion": "1.21.1", "loader": "fabric", "loaderVersion": "0.20.1",
  "startupMs": 14230, "renderDistance": 12,
  "gpu": "…", "gpuVendor": "…", "cpu": "…",
  "mods": [{ "id": "sodium", "name": "Sodium", "version": "0.6.0" }],
  "modCountTotal": 61
}
```

`frameMsAvg`/`frameMsMax` sont absents hors d'un monde (aucune image de monde mesurée).

La liste des modules (identifiants, noms, catégories) est définie dans
`shared/modules.json` ; elle doit rester alignée avec les classes de
`minecraft-mod/src/main/java/client/zenthra/module/impl/`.
