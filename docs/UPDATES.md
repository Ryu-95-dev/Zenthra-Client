# Mises à jour — publication

Le launcher vérifie les mises à jour **uniquement à la demande** (Paramètres →
Mises à jour), à partir d'un manifeste JSON publié en HTTPS. Rien n'est configuré
par défaut : il faut d'abord un endroit où publier les versions (par exemple les
« Releases » d'un dépôt GitHub).

## Publier une version

1. Monter `version` dans `launcher/package.json` et `mod_version` dans
   `minecraft-mod/gradle.properties` (le mod est livré avec le launcher).
2. Compiler : `gradlew.bat build` puis `npm run dist` (ou `electron-builder --dir`
   et zipper `release/win-unpacked`).
3. Mettre l'archive en ligne (HTTPS), puis générer le manifeste :

   ```bash
   node scripts/make-update-manifest.mjs release/Zenthra-Client-0.2.0-win64.zip https://exemple/Zenthra-Client-0.2.0-win64.zip notes.txt > zenthra-update.json
   ```

4. Publier `zenthra-update.json` en HTTPS et renseigner son adresse dans
   Paramètres → Mises à jour (ou la variable `ZENTHRA_UPDATE_URL`).

## Sécurités

- Manifeste et archive uniquement en HTTPS ; l'archive doit venir du même domaine
  que le manifeste ou de GitHub.
- Empreinte **SHA-256** obligatoire et vérifiée avant de garder le fichier.
- Le launcher en cours d'exécution n'est **jamais** remplacé : l'archive vérifiée
  est enregistrée dans Téléchargements et affichée ; le joueur ferme Zenthra et
  l'extrait. L'ancien dossier peut être gardé pour revenir en arrière.
- Les données (profils, mondes, réglages) sont dans `%APPDATA%` et ne sont pas
  touchées par une mise à jour.
