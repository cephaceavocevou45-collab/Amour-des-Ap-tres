# Classification des routes API — identité, sécurité et Actualités

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
| `PATCH /auth/social/admin/members/:id/suspension` | ADMIN ou SUPER_ADMIN | Suspend ou réactive un compte non-administrateur. Motif obligatoire pour suspendre; révocation des sessions et journal d’audit atomiques. |
| `GET /social/posts`, `GET /social/saved` | FIDELE confirmé | Fil paginé et fil des publications enregistrées. Exclut les publications privées, supprimées, masquées ou provenant de comptes bloqués. |
| `POST /social/posts`, `PATCH /social/posts/:id`, `DELETE /social/posts/:id` | FIDELE, SECRETAIRE_PRESENCE ou RESPONSABLE_SEMAINE actif; propriétaire pour modifier/supprimer | Texte limité à 5 000 caractères, idempotence à la création, limitation anti-spam, modification et suppression de ses propres publications. |
| `GET/POST /social/posts/:id/comments`, `DELETE /social/comments/:id` | Membre actif de la communauté | Commentaires et réponses limitées à un niveau; vérification de visibilité; suppression réservée à l’auteur du commentaire. |
| `POST /social/reactions`, `POST /social/posts/:id/share`, `/save`, `/hide` | Membre actif de la communauté | Réactions et partages vérifient la visibilité; favoris et masquage sont propres au compte courant. |
| `POST/DELETE /social/blocks/:id`, `GET /social/blocks`, `GET/PATCH /social/settings` | Membre actif de la communauté | Blocage du contenu d’un compte et préférences de notifications du compte courant. |
| `POST /social/posts/:id/pin` | ADMIN ou SUPER_ADMIN | Épinglage/désépinglage journalisé; ne donne aucun droit de saisie de présence. |
| `/attendance/**` | Secrétaire, président de jour ou admin selon chaque route | FIDELE et MODERATEUR sont refusés par les contrôles métier; aucun compte social n’est lié à un nom saisi dans une feuille. Voir les contrôles et tests du module Présences. |
| `/auth/admin/**` | ADMIN/SUPER_ADMIN, ou EDITEUR avec autorisation précise selon la route | Un compte social ne peut consulter ni modifier des comptes sensibles. La décision d’accès ne peut viser son propre compte. |

## Inventaire de sécurité — présence et sessions

Tous les chemins ci-dessous sont préfixés par `/api/v1`. Les routes notées FIDELE ou OWNER nécessitent le cookie de session et une vérification du rôle et de l’affectation courants en base ; le rôle déclaré dans le client ne suffit jamais.

| Endpoint | Niveau requis | Portée |
|---|---|---|
| `GET /public/leader`, `/public/team`, `/public/sessions/next`, `/public/sessions`, `/public/announcements` | PUBLIC | Données publiques uniquement. Les listes de présence et identités saisies ne sont pas renvoyées. |
| `POST /auth/register`, `/auth/login`, `/auth/admin/login`, `/auth/subadmin/login`, `/auth/password/forgot`, `/auth/password/reset` | PUBLIC, limitation de débit | Authentification/demandes ; les identifiants n’accordent pas un rôle. |
| `POST /auth/refresh`, `/auth/logout` | Cookie de session, CSRF sur les mutations selon guard global | Rotation/révocation de session. Le jeton n’est pas rendu au JavaScript. |
| `GET /auth/session`, `/auth/notifications` | SESSION, FIDELE ou rôle attribué | Session courante/notifications de l’utilisateur courant seulement. |
| `GET /attendance/today`, `/attendance/sheets/:id/summary`, `/attendance/week` | OWNER de feuille ou ADMIN pour totaux | Le responsable est limité au cours du lundi courant ou à son jour de semaine. La vue ADMIN retourne les totaux et le secrétaire déclaré, pas les noms. Période admin bornée. |
| `POST /attendance/sheets/:id/names/access` | ADMIN/SUPER_ADMIN, motif fermé obligatoire | Consultation des noms explicite et auditée ; défaut : accès refusé. |
| `POST /attendance/sheets/:id/entries`, `DELETE /attendance/sheets/:id/entries/:clientUuid`, `POST /attendance/sheets/:id/submit` | OWNER responsable de la feuille et de la zone | Secrétaire : cours biblique. Président : groupe de semaine, jour affecté. ADMIN ne saisit pas les noms. Fenêtres contrôlées côté serveur. |
| `PATCH /attendance/sheets/:id/entries/:clientUuid/correction` | ADMIN/SUPER_ADMIN | Correction administrative avec motif et journalisation. |
| `GET /attendance/course/:date` | Secrétaire du cours, ADMIN/SUPER_ADMIN ou EDITEUR autorisé | Le secrétaire ne lit que le lundi courant ; roster restreint au programme. |
| `PUT /attendance/course/:date` | Secrétaire dans la fenêtre, ADMIN/SUPER_ADMIN, ou EDITEUR autorisé | Modifie le programme et intervenants ; l’API vérifie le lundi et les rôles des personnes. |
| `GET /auth/admin/members` | ADMIN ou SUPER_ADMIN | Tout EDITEUR reçoit `403`, même avec `GESTION_COMPTES`; aucune liste expurgée n’est renvoyée. Sans authentification : `401`. |
| `PATCH /auth/admin/members/:id/decision` | ADMIN/SUPER_ADMIN ou EDITEUR avec `GESTION_COMPTES` | Toute demande non autorisée reçoit `403`. ADMIN ne peut se valider lui-même. |
| `PATCH /auth/admin/members/:id/subadmin`, `PATCH /auth/admin/members/:id/permissions` | ADMIN/SUPER_ADMIN | Attribution sous-admin/permissions ; pas de cible personnelle ni d’élévation par sous-admin. |
| `POST /auth/admin/2fa/recovery-codes` | Admin authentifié, reconfirmation de code | Renouvellement de secours ; les codes restent secrets et à usage unique. |
| `GET /auth/social/admin/members`, `PATCH /auth/social/admin/members/:id/suspension` | ADMIN/SUPER_ADMIN | Liste les comptes sociaux; la suspension/réactivation vise tout compte non-administrateur, est auditée et révoque les sessions. |

Les routes sociales nécessitent une session active FIDELE, SECRETAIRE_PRESENCE ou RESPONSABLE_SEMAINE, sauf l’épinglage admin. Les rôles secrétaire et président ne confèrent aucun accès supplémentaire aux feuilles de présence via le réseau social. Les médias, téléversements, profils éditables, signalements, console de modération, exports sociaux et contrôles de charge ne sont pas implémentés. Aucun endpoint public provisoire ne simule ces fonctions.

Le fil, commentaires, réactions, profils et signalements n’ont pas encore de routes dans cette phase. Aucun endpoint provisoire ne simule ces fonctions.
