# API active

Préfixe courant : `/api/v1`. Toutes les routes absentes renvoient 404. Les routes de communauté ne sont plus implémentées. Une demande d'accès public est conservée uniquement pour les responsabilités de présence; elle reste inactive jusqu'à validation administrative.

## Présentation publique

| Route | Accès | Usage |
|---|---|---|
| `POST /auth/register` | Public, limitée à 3 demandes / 10 minutes par IP et adresse | Demande de compte secrétaire des présences ou président d'un jour; pas de rôle libre, de sous-administrateur ni d'accès avant validation admin. |
| `GET /public/leader` | Public | Présentation du dirigeant et photo publique de présentation. |
| `GET /public/team` | Public | Équipe et rôles des cours bibliques. |
| `GET /public/sessions` | Public | Programme biblique public. |
| `GET /public/sessions/next` | Public | Prochaine séance. |

## Authentification et comptes

| Route | Accès | Usage |
|---|---|---|
| `POST /auth/login`, `/auth/admin/login`, `/auth/subadmin/login` | Public avec limitation de débit | Connexion selon le type de compte; session par cookies sécurisés en production. |
| `GET /auth/session` | Connecté | Identité et permissions courantes. |
| `POST /auth/password/forgot`, `/auth/password/reset` | Public avec limitation de débit | Code e-mail uniforme, haché, valable 15 minutes et limité à cinq essais; 2FA exigée lorsqu'elle est active. |
| `POST /auth/account/password/first-login`, `POST /auth/account/password` | Connecté | Changement initial ou courant du mot de passe. |
| `GET /auth/account/sessions`, `DELETE /auth/account/sessions/:id`, `POST /auth/refresh`, `POST /auth/logout` | Connecté/cookie de session selon l'action | Consultation et révocation des sessions, rotation du jeton de renouvellement, déconnexion. |
| `GET/POST/PATCH /auth/admin/members` | ADMIN/SUPER_ADMIN selon la route | Liste des comptes et demandes en attente, création par mot de passe temporaire, approbation/désactivation et modification auditée. |
| `PATCH /auth/admin/members/:id/permissions` | ADMIN/SUPER_ADMIN | Attribution auditée des permissions autorisées au sous-administrateur. |
| `POST /auth/admin/2fa/recovery-codes` | Administrateur avec second facteur | Régénération confirmée des codes de secours. |

La demande publique ne permet pas d'obtenir un compte actif : l'activation par ADMIN/SUPER_ADMIN est requise. Aucune inscription fidèle, communauté, média ni messagerie n'est disponible.

## Présences et programme

Les contrôles sont appliqués côté serveur à chaque route et relus depuis le compte actif. Les responsables sont limités à leur jour et leur fonction. L'administrateur supervise les totaux; toute consultation de noms requiert un motif et laisse une trace d'audit. Les routes principales couvrent `/attendance/today`, `/attendance/week`, les feuilles `/attendance/sheets/:id` (résumé, noms, entrées, correction, soumission, historique et export) et le programme `/attendance/course/:date`.

Les dates, zones, doublons et fenêtres horaires sont contrôlés côté serveur. Les totaux ne viennent pas du client. Les noms anciens sont anonymisés après la durée de rétention configurée; les totaux figés sont conservés.

La documentation de référence est ce fichier `docs/API.md`. L'API ne publie pas de route Swagger/OpenAPI dans aucun environnement. Les tests de sécurité vérifient que les anciennes routes de documentation renvoient 404.
