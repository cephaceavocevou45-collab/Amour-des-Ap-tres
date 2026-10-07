# Classification des routes API — phase 1 Actualités

Toutes les routes sont sous `/api/v1`. La validation Nest utilise `whitelist` et `forbidNonWhitelisted`; les rôles privilégiés ne sont jamais acceptés comme champ d’inscription.

| Route | Accès | Contrôle de ressource et données |
|---|---|---|
| `GET /auth/social/registration-config` | PUBLIC | N’expose que les paramètres publics de création de compte et le texte/version de la charte approuvée. Désactive l’inscription si une décision obligatoire ou l’envoi d’e-mail manque. |
| `POST /auth/social/register` | PUBLIC | Création FIDELE sans rôle reçu du client. Âge, charte, e-mail jetable, CAPTCHA configuré et limitation de débit vérifiés côté serveur. Le compte demeure inactif avant confirmation. |
| `POST /auth/social/email/confirm` | PUBLIC | Jeton aléatoire à usage unique, haché au repos et expirant après 30 minutes; activation atomique et journalisée. |
| `POST /auth/social/email/resend` | PUBLIC | Réponse uniforme sans indiquer si un compte existe; limitation de débit par IP et adresse. |
| `POST /auth/login` | PUBLIC | Les comptes FIDELE non confirmés ou suspendus reçoivent la réponse générique de connexion refusée. |
| `GET /auth/session` | FIDELE, responsables autorisés, MODERATEUR, sous-admin ou admin | Le guard vérifie signature, statut courant, version de session, confirmation d’e-mail et suspension en base. Retourne seulement l’identité du compte courant, son rôle et ses propres autorisations. |
| `GET /auth/social/admin/members` | ADMIN ou SUPER_ADMIN | Liste les comptes FIDELE/MODERATEUR pour l’administration; ne renvoie pas les dates de naissance ni les sessions. |
| `PATCH /auth/social/admin/members/:id/suspension` | ADMIN ou SUPER_ADMIN | Ressource limitée à un compte FIDELE/MODERATEUR. Motif obligatoire; révocation des sessions et journal d’audit atomiques. |
| `/attendance/**` | Secrétaire, président de jour ou admin selon chaque route | FIDELE et MODERATEUR sont refusés par les contrôles métier; aucun compte social n’est lié à un nom saisi dans une feuille. Voir les contrôles et tests du module Présences. |
| `/auth/admin/**` | ADMIN/SUPER_ADMIN, ou EDITEUR avec autorisation précise selon la route | Un compte social ne peut consulter ni modifier des comptes sensibles. La décision d’accès ne peut viser son propre compte. |

Le fil, commentaires, réactions, profils et signalements n’ont pas encore de routes dans cette phase. Aucun endpoint provisoire ne simule ces fonctions.
