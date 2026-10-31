# Connexion Microsoft — configuration requise

Zenthra implémente le flux officiel **OAuth 2.0 Authorization Code + PKCE**
pour applications de bureau (client public, aucun secret). La chaîne complète
est codée dans `launcher/electron/services/auth.ts` :

1. Ouverture de la page officielle `login.microsoftonline.com` dans le
   **navigateur par défaut** (le launcher ne voit jamais le mot de passe).
2. Retour sur un serveur local éphémère `http://localhost:<port>` (RFC 8252),
   vérification du paramètre `state`.
3. Échange du code (avec `code_verifier`) contre un jeton Microsoft.
4. Xbox Live (`user.auth.xboxlive.com`) → XSTS (`xsts.auth.xboxlive.com`).
5. `api.minecraftservices.com/authentication/login_with_xbox`.
6. Vérification de la possession du jeu (`/entitlements/mcstore`) et lecture
   du profil (`/minecraft/profile` : pseudo, UUID, skin).

Les jetons sont chiffrés avec **DPAPI** (Electron `safeStorage`) dans
`%APPDATA%\Zenthra Client\session.bin`. Ils ne sont jamais journalisés
(filtrage dans `services/errors.ts`). La déconnexion supprime ce fichier.
Pour révoquer l'accès côté Microsoft : https://account.live.com/consent/Manage

## Ce qui doit être configuré (une seule fois, par le développeur)

La connexion **ne peut pas fonctionner sans identifiant d'application** :
rien n'est simulé.

1. Sur https://portal.azure.com → *Microsoft Entra ID* → *Inscriptions
   d'applications* → **Nouvelle inscription**.
   - Types de comptes : *Comptes Microsoft personnels uniquement*.
   - URI de redirection : plateforme **Applications mobiles et de bureau**,
     valeur `http://localhost`.
2. Dans *Authentification*, activer **Autoriser les flux clients publics**.
3. Copier l'**ID d'application (client)**.
4. **Demander l'accès à l'API Minecraft** : Mojang exige que toute nouvelle
   application soit approuvée avant d'utiliser `login_with_xbox`
   (formulaire officiel : https://aka.ms/mce-reviewappid). Tant que la demande
   n'est pas acceptée, l'étape 5 renvoie **403** — Zenthra affiche alors un
   message explicite.
5. Saisir l'ID dans **Paramètres → Compte Microsoft**, ou définir la variable
   d'environnement `ZENTHRA_MS_CLIENT_ID`.

Aucun secret client n'est nécessaire ni stocké : l'ID d'application est public
par nature.

## Sans compte

Le bouton *Jouer* propose le **mode démo officiel** de Minecraft (`--demo`) :
monde limité dans le temps, pas de multijoueur. Il permet de vérifier
l'installation, Fabric et le mod Zenthra sans compte. Zenthra ne propose
aucun mode « hors ligne » contournant l'achat du jeu.
