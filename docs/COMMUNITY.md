# Amis et communauté Zenthra

La liste d'amis fonctionne avec le **serveur communautaire** fourni dans
`server/community/server.mjs` (Node.js, aucune dépendance). Tant qu'aucun serveur
n'est renseigné dans Paramètres → Confidentialité, le launcher l'indique
clairement et n'affiche aucun joueur fictif.

## Héberger le serveur

```bash
node server/community/server.mjs          # PORT=8787, DATA_FILE=./zenthra-community.json
```

En production, placer le serveur derrière un proxy **HTTPS** (Caddy, Nginx…) :
le launcher refuse le HTTP, sauf `http://127.0.0.1` pour des essais sur le même PC.
Puis saisir l'adresse dans Paramètres → Confidentialité → « Serveur de présence ».

## Identité (sans jamais voir le jeton Minecraft)

1. Le launcher demande un défi : `POST /v1/auth/challenge {name}` → `{serverId}`.
2. Il appelle l'endpoint **officiel** de Mojang `session/minecraft/join` avec ce
   `serverId` (le jeton d'accès ne part que vers Mojang).
3. `POST /v1/auth/verify {name}` : le serveur interroge Mojang (`hasJoined`) et,
   si l'identité est confirmée, délivre un jeton de session (stocké haché côté
   serveur, chiffré DPAPI côté launcher).

Nécessite donc la connexion Microsoft (docs/MICROSOFT_AUTH.md).

## API (JSON, `Authorization: Bearer <jeton>`)

| Méthode | Route | Rôle |
| --- | --- | --- |
| `PUT` | `/v1/presence` | `{online, visible, activity}` — signal toutes les 90 s |
| `GET` | `/v1/friends` | Amis ; « en ligne » seulement s'ils ont choisi d'être visibles |
| `GET` / `POST` | `/v1/friends/requests` | Demandes reçues/envoyées ; envoyer `{name}` |
| `POST` | `/v1/friends/requests/{uuid}/accept` · `/decline` | Répondre |
| `DELETE` | `/v1/friends/{uuid}` | Retirer un ami |
| `GET` / `POST` / `DELETE` | `/v1/blocks[/{uuid}]` | Bloquer / débloquer |
| `DELETE` | `/v1/me` | Effacer toutes ses données |

## Confidentialité

- « Apparaître en ligne » est **désactivé par défaut** : sans lui, tes amis te
  voient hors ligne.
- Seuls des amis (demande acceptée) voient ton statut ; un joueur bloqué ne peut
  plus t'envoyer de demande, et la réponse est identique à celle d'un pseudo
  inconnu (pas d'énumération des comptes).
- Données conservées : pseudo, UUID, liens d'amitié, demandes, blocages, dernier
  statut. Aucune adresse IP n'est stockée. Suppression complète en un clic.
- Limites : 8 Ko par requête, 120 requêtes/minute par IP, 50 demandes en attente.

Testé par `launcher/tests/services.test.ts` (Mojang simulé).
