# Contrat de l’API active

Préfixe des routes métier : `/api/v1`. `/health` et `/ready` sont hors préfixe. Swagger/OpenAPI est absent. Les routes communautaires, l’auto-inscription et l’export nominatif ne sont pas exposés.

Toutes les requêtes JSON sont limitées à 64 Kio (`express.json` et `express.urlencoded`). Le `ValidationPipe` global utilise `whitelist`, `forbidNonWhitelisted` et `transform`. Les champs du corps non déclarés dans un DTO sont refusés. Les réponses d’erreur 5xx sont neutres.

## Routes

| Méthode et route | Authentification et permission | Paramètres et corps acceptés |
|---|---|---|
| `GET /public/leader` | Public, limiteur global | Aucun paramètre. Données publiques du dirigeant. |
| `GET /public/team` | Public, limiteur global | Aucun paramètre. Équipe publique active. |
| `GET /public/sessions` | Public, limiteur global | Aucun paramètre. Programme public. |
| `GET /public/sessions/next` | Public, limiteur global | Aucun paramètre. Prochaine séance. |
| `GET /health`, `GET /ready` | Public, limiteur global | Aucun paramètre. État minimal sans détail de connexion. `/ready` vérifie PostgreSQL par une requête Prisma. |
| `POST /auth/login`, `/auth/admin/login`, `/auth/subadmin/login` | Public, limiteurs IP et compte | `LoginDto`: e-mail (`IsEmail`) et mot de passe 1–128 caractères uniquement. Les routes distinguent le rôle requis, pas les erreurs d’identifiants. |
| `POST /auth/password/forgot` | Public, limiteurs IP et adresse | `email` (`IsEmail`). Réponse uniforme, code à usage unique, expiration de 15 minutes et cinq essais au plus. |
| `POST /auth/password/reset` | Public, limiteurs IP et adresse | E-mail, code de récupération reçu par e-mail, nouveau mot de passe et confirmation de 12–128 caractères. |
| `POST /auth/refresh`, `POST /auth/logout` | Cookie de renouvellement; CSRF requis si un cookie de session accompagne une écriture | Aucun corps. Rotation ou révocation de la famille de sessions. |
| `GET /auth/session` | Session valide | Aucun paramètre. Retourne l’identifiant, le rôle et les permissions du compte. |
| `GET /auth/account/sessions` | Session valide | Aucun paramètre. Sessions de l’utilisateur courant uniquement. |
| `DELETE /auth/account/sessions/:id` | Session valide | `id` opaque de session; suppression limitée au compte courant. Le format de l’identifiant n’est pas validé par un DTO de route. |
| `POST /auth/account/sessions/revoke-all` | Session valide et CSRF si cookie | Aucun corps; révoque les sessions du compte courant. |
| `POST /auth/account/password`, `/auth/account/password/first-login` | Session valide et CSRF si cookie | Mot de passe actuel, nouveau mot de passe et confirmation de 12–128 caractères. |
| `GET /auth/admin/members` | ADMIN/SUPER_ADMIN uniquement | Aucun paramètre. Coordonnées de gestion des comptes; EDITEUR reçoit 403. |
| `POST /auth/admin/members` | ADMIN/SUPER_ADMIN, réauthentification et CSRF | Nom 3–120, e-mail ≤254, téléphone optionnel ≤32, rôle dans la liste autorisée, jour entier 1–7 si président, permissions limitées à deux valeurs, motif 8–1000, preuve récente par mot de passe. Le mot de passe temporaire aléatoire est renvoyé une seule fois. |
| `PATCH /auth/admin/members/:id` | ADMIN/SUPER_ADMIN, réauthentification et CSRF | Identifiant opaque, statut actif, rôle/jour/permissions stricts et motif 8–1000. La modification invalide les sessions. L’identifiant de route n’a pas de DTO de format. |
| `PATCH /auth/admin/members/:id/permissions` | ADMIN/SUPER_ADMIN, réauthentification et CSRF | Identifiant opaque, tableau d’au plus deux permissions autorisées et motif 8–1000. |
| `GET /auth/admin/presenters` | ADMIN/SUPER_ADMIN | Aucun paramètre. Intervenants publics. |
| `POST /auth/admin/presenters`, `PATCH /auth/admin/presenters/:id` | ADMIN/SUPER_ADMIN, réauthentification et CSRF | Prénom 1–80, nom 1–120, grade optionnel ≤80, motif 8–1000; identifiant opaque pour la modification. |
| `PATCH /auth/admin/presenters/:id/retirer` | ADMIN/SUPER_ADMIN, réauthentification et CSRF | Identifiant opaque, motif 8–1000. |
| `GET /attendance/today` | Session active, rôle responsable autorisé | Aucun paramètre. Le serveur détermine le jour et le périmètre à partir du compte. |
| `GET /attendance/week?start=YYYY-MM-DD` | Session active; semaine limitée au jour du responsable | `start` optionnel, date calendaire valide. Administrateur : période bornée à 366 jours en arrière et 90 jours en avant; président : semaine courante et jour assigné. |
| `GET /attendance/sheets/:id/summary` | Session active; contrôle serveur du jour et de la feuille | Identifiant opaque de feuille. Les noms restent masqués sauf consultation admin motivée. |
| `POST /attendance/sheets/:id/names/access` | ADMIN/SUPER_ADMIN; réauthentification et CSRF | Motif dans une liste fermée (`VERIFICATION_DEMANDE`, `SIGNAL_ADMIN`, `CORRECTION_ADMIN`) et preuve récente. Consultation auditée. |
| `POST /attendance/sheets/:id/entries` | Responsable assigné à cette feuille, rôle/jour/zone contrôlés côté serveur | `fullName` ≤120, sexe et zone énumérés, `clientUuid` UUID, confirmation de doublon booléenne optionnelle. |
| `PATCH /attendance/sheets/:id/entries/:clientUuid` | Responsable assigné | UUID de pointage, nom ≤120, sexe/zone énumérés; feuille, jour et zone contrôlés côté serveur. |
| `DELETE /attendance/sheets/:id/entries/:clientUuid` | Responsable assigné | Identifiant opaque de feuille et UUID de pointage; contrôle IDOR côté serveur. |
| `POST /attendance/sheets/:id/submit` | Responsable assigné | Corps optionnel avec motif texte. **Constat :** ce champ n’a pas de longueur maximale propre; la limite générale reste 64 Kio. À corriger avant d’accepter du texte métier. |
| `PATCH /attendance/sheets/:id/entries/:clientUuid/correction` | ADMIN/SUPER_ADMIN, réauthentification et CSRF | UUID de pointage, nom ≤120, sexe/zone énumérés, motif dans une liste fermée. L’administrateur ne saisit pas la feuille à la place du responsable. |
| `GET /attendance/course/:date` | Secrétaire du cours et administrateurs selon rôle | Date ISO `YYYY-MM-DD`, lundi seulement; date vérifiée au niveau du contrôleur, mais pas par DTO de route. |
| `PUT /attendance/course/:date` | Secrétaire assigné, fenêtre locale du lundi, CSRF si cookie | Résumé et texte biblique ≤10 000 chacun; référence ≤300; thème ≤500; identifiants intervenants formatés; tableau de 30 moniteurs au plus. |
| `POST /attendance/course-corrections` | ADMIN/SUPER_ADMIN, CSRF si cookie | Date ISO, identifiant de destinataire au format restreint, message 8–1000. |
| `GET /attendance/course-corrections` | Secrétaire du cours uniquement | Aucun paramètre; messages adressés au compte courant. |
| `POST /attendance/course-corrections/read` | Secrétaire du cours, CSRF si cookie | Identifiant de demande au format restreint; la demande est recherchée dans le périmètre du compte. |

## Limites de validation à traiter

- La validation stricte du corps JSON est active globalement, mais certaines méthodes reçoivent `@Req() req: any`, `@Res() response: any`, et plusieurs paramètres `@Param()` n’ont pas de DTO avec un validateur UUID/format. Ces cas ne sont pas des champs libres de corps, mais rendent l’inventaire TypeScript/validation non entièrement strict : statut **Partiel** dans `CHECKLIST_AUDIT.md`.
- `SubmitDto.reason` n’a pas de `MaxLength`; la limite de corps globale est 64 Kio, supérieure à une limite métier attendue.
- Il n’existe aucune route d’export CSV/Excel/PDF, d’upload ou de téléchargement communautaire dans l’API active; aucune protection d’export ne doit être présumée pour une future route.
- Les réponses JSON sérialisent les noms comme des valeurs de données. Angular les affiche par interpolation normale; le test Playwright vérifie l’échappement pour des champs de noms existants.
- Les contrôles d’accès et les limites de débit sont côté API. Les réglages Nginx sont documentés dans `infra/nginx-edge.conf`, mais ne sont pas validés par `nginx -t` dans cet environnement.

## Politique de sécurité

Les écritures avec cookies requièrent la preuve CSRF. CORS de production est limité à l’origine `APP_PUBLIC_URL`. En production les cookies de session sont `HttpOnly`, `Secure` et `SameSite=Strict`. Aucun jeton de session n’est stocké dans `localStorage`, `sessionStorage` ou IndexedDB. Les routes de documentation répondent 404; tests E2E associés dans `apps/api/test/security.e2e-spec.ts`.
