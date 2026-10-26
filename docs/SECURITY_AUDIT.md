# Audit de sécurité — surface « présences uniquement »

Dernière vérification locale : 10 octobre 2026. Les statuts décrivent le code et les commandes de cette version, pas un hébergement réel.

## Réduction de surface observée

- `apps/api/src/app.module.ts` n'enregistre que présentation publique, présences, authentification et état de santé. Aucun contrôleur de communauté n'y est importé.
- Les routes Angular actives (`apps/web/src/main.ts`) sont accueil, demande d'accès responsable, connexion, récupération, première connexion, programme biblique, admin et présences. Les routes inconnues reviennent à l'accueil.
- `apps/api/prisma/schema.prisma` ne contient plus de modèles sociaux/messagerie/médias ni les rôles FIDELE/MODERATEUR/PENDING. `FIDELES` reste un libellé de zone pour les feuilles de cours, et `Person.photoUrl` sert à la présentation publique préexistante de l'équipe.
- Le script e2e vérifie toujours les routes communautaires et d'inscription fidèle en 404; un scénario couvre la demande d'accès responsable inactive et son activation admin. **18/18 E2E ont passé sur `paroisse_test`; le test E2E sur copie restaurée historique n'a pas démarré (contrôle d'approbation de l'outil refusé).**

## Contrôles visibles dans le code

| Domaine | Statut de code | Preuve / limite |
|---|---|---|
| Inscription des responsables | Demande limitée, accès fermé par défaut | Seuls secrétaire de présence et président d'un jour sont acceptés; demande inactive jusqu'à approbation, jour sélectionné pour le président, rate limit de 3 demandes/10 min par IP et e-mail. E-mail non confirmé et numéro WhatsApp non vérifié automatiquement; les E2E actifs passent sur la base de test. |
| Validation des données et rôles | Présent | DTO whitelist et rôles pris depuis session/base; la liste des comptes est désormais limitée à ADMIN/SUPER_ADMIN. 18 E2E passent sur la base dédiée. |
| Authentification et mots de passe | Présent | Argon2id, délai progressif, hash factice pour compte absent, version de session, mot de passe temporaire à changer. Revue et e2e non finalisées sur DB. |
| 2FA | Présent | TOTP administrateur obligatoire, AES-256-GCM avec IV aléatoire; clé dérivée par HKDF-SHA256 à partir de `JWT_ACCESS_SECRET` avec sel et contexte dédiés. Codes de secours hachés; migration paresseuse des secrets historiques; CLI, sans route publique d’enrôlement. La rotation JWT impose le ré-enrôlement TOTP. Tests à relancer après modification. |
| Cookies et CSRF | Configuré | Cookies `HttpOnly`, `SameSite=Strict`, `Secure` en production et garde CSRF; HTTPS/proxy de production non testés. |
| Rate limiting | Présent en mémoire | Adapté à une instance locale/simple; plusieurs réplicas exigeraient un stockage partagé. Vérification opérationnelle non faite. |
| Autorisations de présence | Dans les contrôleurs/guards | Responsables limités à leur jour et rôles; 18 E2E réussis sur `paroisse_test`, mais un E2E historique n'a pas été exécuté. |
| Données nominatives | Protection par action | Admin voit les totaux; consultation nominative motivée/auditée. Les scénarios e2e actuels ne sont pas exécutés. |
| Rétention | Présente | Noms anonymisés à 12 mois par défaut, totaux conservés; audit au moins 36 mois. Cron/base pas testés en prod. |
| Journaux | Mesures en place | À contrôler avec scan automatisé des logs pendant e2e courants. |
| Santé | Présente | `/health` liveness et `/ready` teste DB sans renvoyer d'identifiants. |
| Documentation d'API | Module Swagger retiré de toutes les configurations; docs/API.md fait référence | E2E qui attend 404 sur les routes Swagger/OpenAPI courantes. |
| Sauvegarde | AES-256-GCM/S3 | Une archive chiffrée de `paroisse` a été restaurée dans une base neuve : 27 tables, sommes de lignes et schéma identiques, 35 clés étrangères. Cela valide cette restauration locale; stockage S3 distant et reprise après sinistre ne sont pas vérifiés. |
| Médias et inscription fidèle | Retirés de l'app active | Anciennes migrations/sources historiques restent dans l'historique versionné; elles ne sont pas des routes runtime. L'inscription des responsables est conservée sous forme de demande inactive. |

## Migrations et conservation

`paroisse` avait 16 migrations en attente. Les migrations `20261019000000_replace_legacy_community` et `20261026000000_presence_only_simplification` retirent les anciens modèles/tables communautaires; leurs contenus ne sont pas convertis en messages privés. Une sauvegarde a été restaurée et comparée sans afficher le contenu, puis les 16 migrations ont été appliquées à un clone isolé : elles ont toutes réussi et le diff final Prisma était vide. Après cette vérification, elles ont aussi été appliquées à `paroisse` avec succès. Une archive chiffrée restaurée préserve les données pré-migration consultables; l'application n'a pas fusionné les anciens contenus dans les présences ou les messages. Aucune vérification sur base vide n'a été effectuée dans cette passe.

## Dépendances

- Historique au 11 octobre : les anciens chiffres de cette première vérification sont remplacés par la section « Mise à jour » ci-dessous; Swagger et sa dépendance ont été retirés depuis.
- `npm audit` complet : **38 avis, dont 32 hauts et 6 modérés**. Chaînes principales rapportées : `braces` via `micromatch`/Jest (haut), `deepmerge-ts` via Prisma (haut), `js-yaml` (modéré), `sprintf-js` via `argparse`/Istanbul (modéré). L'audit complet signale des correctifs forcés vers Jest 30, version majeure; aucune mise à jour ni override n'a été appliqué.
- La sortie tronquée de l'audit complet ne permet pas d'attribuer avec certitude chaque avis à chaque chemin; récupérer `npm audit --json` sur une machine autorisée au réseau, sans publier la sortie brute si elle contient des métadonnées privées, avant décision de mise à jour.

## Résultats de vérification actuels

- `npm.cmd run lint` : réussi.
- `npm.cmd test` : **33 tests réussis, 0 échoué** (8 outils et 25 unitaires API).
- `npm.cmd run build` : build API et Angular réussis.
- `npx.cmd playwright test` : **0 réussi, 11 échoués** parce que le navigateur Chromium headless attendu n'est pas installé dans cet environnement; le build courant a toutefois été compilé pendant global setup.
- `npm.cmd run test-db:diagnose` confirme une cible `localhost:5432/paroisse_test` sans afficher les identifiants. Son statut est à jour après migration 27; le diff Prisma est vide.
- `prisma migrate deploy` : les 16 migrations en attente ont réussi sur `paroisse`. Les routes `/health` et `/ready` de l'API déjà active ont répondu `200`; la route de disponibilité a confirmé PostgreSQL disponible. Un second démarrage a été stoppé par `EADDRINUSE` sur le port 3000, montrant qu'une instance API est déjà lancée.
- API E2E sur `paroisse_test` : **18 réussis, 0 échoué**. E2E sur clone historique : non démarrés, car l'exécution d'outil a été refusée avant le lancement.
- Le P2022 relevé à la connexion et au rafraîchissement de session est cohérent avec les 16 migrations manquantes dans `paroisse`; le serveur Nest peut démarrer alors que ces requêtes échouent.
- `npm.cmd run lint`, build API et build Angular : réussis. `npm.cmd audit --omit=dev` et `npm.cmd audit` conservent les comptes antérieurs (5 et 38 avis); aucun correctif de dépendance n'a été appliqué.
- Playwright : 0 réussi, 13 échoués car Chromium absent. Docker, DNS, HTTPS/HSTS, envoi réel Resend, stockage distant et droits de production : non vérifiés.

## Risques résiduels et décision

**Pas prêt pour la production.** L'API locale et PostgreSQL répondent; l'archive chiffrée restaurée préserve la copie avant migrations et `paroisse` a reçu les migrations. Il faut garder la clé d'archive hors de cette machine, vérifier le parcours connexion réel dans le navigateur, installer/lancer Chromium pour Playwright, traiter ou accepter formellement les avis npm et effectuer les tests de réseau, HTTPS, e-mail et déploiement avant production.

## Mise à jour sécurité — 10 octobre 2026

Cette section remplace les anciens nombres de tests et statuts navigateur ci-dessus pour le code actuellement présent. Aucun changement de dépendance ni migration n'a été appliqué à la base de développement pendant cette passe. La vérification E2E a confirmé que `paroisse_test` avait déjà ses 33 migrations; elle a utilisé uniquement cette base.

| Contrôle | Statut actuel | Preuve et limite |
|---|---|---|
| Cookies, CORS et configuration production | Vérifié par tests unitaires/configuration | Les options imposent HttpOnly, Secure en production et SameSite Strict; CORS prend l'origine APP_PUBLIC_URL. Aucun essai derrière le vrai Nginx/TLS n'a eu lieu. |
| Documentation API, erreurs et en-têtes | Vérifié localement | Swagger est retiré; l'E2E reçoit 404 pour les routes de documentation courantes. CSP Nginx garde `style-src 'unsafe-inline'`, jamais dans `script-src`. |
| Sessions et réauthentification | Vérifié sur base de test | 30 minutes d'inactivité et durée absolue, révocation de toutes les sessions et preuve récente sur les actions sensibles sont couvertes par l'E2E. Une infrastructure de production n'a pas été testée. |
| Hors-ligne et IndexedDB | Vérifié au navigateur | 17/17 Playwright : pointage effacé après synchronisation, attente de plus de 7 jours purgée avec avertissement, déconnexion effaçant la base locale, et absence d'accès à la file si la session est refusée. |
| Anonymisation et audit | Vérifié unitairement | Le test de rétention confirme l'anonymisation des noms, la conservation des totaux et le seuil de 36 mois pour l'audit; aucun chron n'a été exécuté en production. |
| Entrées, CSRF et journaux | Vérifié localement | E2E : CSRF, corps de requête trop grand, caractères spéciaux et nom trop long; test automatisé vérifiant l'absence de noms, jetons et mots de passe dans les journaux capturés. |
| Moindre privilège PostgreSQL | Script disponible, non appliqué | `scripts/db-least-privilege.cjs` sépare le rôle applicatif du rôle migrations, mais n'a pas été exécuté : il crée/modifie des rôles DB et demande une base/schéma dédiés et un opérateur autorisé. |
| Secrets et chaîne d'approvisionnement | Scan ciblé réussi | `npm run security:scan` ne détecte aucun secret manifeste. La CI existante appelle npm ci, le scan, Dependabot et les audits npm; le résultat du registre courant reste vulnérable (ci-dessous). |

### Tests relancés

- Lint API et web : réussis.
- Build API (génération Prisma, Nest et copie du client Prisma) et build Angular : réussis.
- `npm test` : **10 suites API, 39 tests réussis, 0 échoué**; tests outils : **8 réussis, 0 échoué** (47 tests cumulés).
- `npm run test:e2e` sur `TEST_DATABASE_URL` : **1 suite, 24 réussis, 0 échoué**. Aucune migration en attente sur `paroisse_test`.
- `npm run test:playwright` : **17 réussis, 0 échoué**. La compilation du frontend courant a réussi avant le lancement des tests.
- `npm run security:scan` : réussi; 0 secret manifeste détecté.

### Audit npm courant

**Mise à jour du 11 octobre 2026 — remplace les chiffres et statuts npm ci-dessus après retrait de Swagger.** `npm audit --omit=dev` : **3 avis hauts, 0 modéré, 0 critique** (code de sortie 1). Les trois lignes du rapport correspondent au même avis `GHSA-ggr8-5vv4-36mx` dans le chemin `deepmerge-ts` → `@prisma/config` → `prisma`; `prisma` est déclaré en `devDependencies`, mais npm le compte encore via son peer optionnel dans l'arbre de l'audit production. Les avis modérés associés à Swagger ne sont plus dans l'arbre de production après retrait de cette dépendance. Le contrôle CI `npm run audit:production` réussit uniquement avec l'exception précise ci-dessous; il échouera aux avis critique/haut inconnus, expirés ou sans justification. Réexamen et expiration : **2026-11-10**.

| Paquet | Gravité / avis | Chemin et exploitabilité réelle | Décision / réexamen |
|---|---|---|---|
| `deepmerge-ts` (<8.0.0), `@prisma/config` (6.13.0-dev.1–8.1.0-dev.4), `prisma` (6.13.0-dev.1–8.1.0-dev.4) | Haut — `GHSA-ggr8-5vv4-36mx` (stack exhaustion sur graphes récursifs) | `node_modules/deepmerge-ts` ← `@prisma/config` ← CLI `prisma`. Le CLI n'est pas une dépendance déclarée de production et le runtime API est construit avec `npm ci --omit=dev`; l'avis pourrait être exploité si un opérateur lance le CLI sur une configuration/schema contrôlé par un attaquant. L'audit npm le compte néanmoins dans l'arbre production via le peer optionnel. Le test de build Docker contient une garde qui échoue si la CLI fuit dans l'image runtime. | Accepté temporairement par exception CI bornée, justification et liste exacte des trois paquets dans `.github/audit-production-exceptions.json`. Expire et doit être réexaminé le **2026-11-10**; rechercher alors une mise à niveau compatible du CLI. |

`npm audit --json` complet : **37 avis : 32 hauts, 5 modérés, 0 critique** (code de sortie 1, rapport conservé comme artefact CI informatif). Ils sont dans les outils de développement : dépendances Jest 29 via `micromatch`/`braces` (hauts), configuration de couverture Istanbul via `js-yaml` et `sprintf-js`/`argparse` (modérés), ainsi que la chaîne Prisma CLI ci-dessus. La correction suggérée par npm remplace Jest par 30.5.2, une mise à niveau majeure; Jest n'a pas été modifié dans cette passe. Le rapport complet CI reste informatif et n'autorise aucune exception implicite.

### Risques résiduels

- Pas de preuve de déploiement HTTPS, HSTS, CORS/Nginx, rotation de secrets, e-mail, TURN/WebRTC ou restauration à partir d'un stockage S3 réel.
- CSP : `script-src 'self'` ne contient ni `unsafe-inline` ni `unsafe-eval`, dans Helmet et Nginx. Nginx conserve `style-src 'unsafe-inline'` pour Angular; risque résiduel de styles HTML injectés, sans exécution de script. Plan : inventorier et éliminer les styles inline, puis adopter des nonces ou des hash après test CSP en navigateur.
- L'audit de production garde une exception élevée temporaire et expirante pour le CLI Prisma; le runtime final doit être construit avec la garde de dépendances dev. L'audit complet des outils de développement reste informatif; Jest 29 n'a pas été mis à niveau.
- Le script de rôles PostgreSQL n'est pas validé sur une base dédiée vide; le démarrage Docker avec volume existant ne rejoue pas l'initialisation.
- Des personnes doivent encore créer les comptes opérateurs, approuver les contacts d'incident, choisir le domaine/hébergeur et tester une restauration réelle de production.

**Décision : non prêt pour une mise en production avec des données réelles tant que les avis hauts, l'environnement TLS et la procédure opératoire PostgreSQL/sauvegarde n'ont pas été traités et vérifiés.**

### Vérifications de la passe du 11 octobre 2026

- `npm run lint` : réussi (API et web).
- `npm run build` : réussi (API/Prisma et Angular).
- `npm test` : outils **15/15**, API **9 suites, 38/38**; **53 réussis, 0 échoué** au total.
- `npm run test:e2e` : **1 suite, 24/24** sur `paroisse_test`; aucune migration en attente. Le wrapper a vérifié la séparation d'avec `DATABASE_URL`.
- `npm run audit:production` : réussi avec l'exception ci-dessus; audit sous-jacent **3 hauts**, 0 critique.
- `npm audit --omit=dev` brut : **3 avis hauts**, code 1.
- `npm audit --json` complet : **37 avis** (32 hauts, 5 modérés), code 1, développement surtout; pas de dépendances mises à niveau.
- Playwright : **non exécuté dans cette passe**. Docker/Compose : **non testé**, la commande `docker` n'est pas disponible dans cet environnement.
- E2E de non-publication Swagger/OpenAPI : inclus dans les **24/24** E2E réussis.

### Mise à jour audit checklist — 12 octobre 2026

Les résultats de cette section remplacent les compteurs historiques précédents pour le code actuel.

- L’auto-inscription publique a été retirée : `/auth/register` répond 404 et n’insère aucune ligne; les comptes sont créés par ADMIN/SUPER_ADMIN avec mot de passe temporaire et changement obligatoire. E2E dédié et test Playwright de la redirection.
- Les secrets de test codés en dur dans le runner E2E ont été remplacés par des valeurs aléatoires générées au démarrage.
- Le seed initial SUPER_ADMIN ne fait plus d’upsert de mot de passe et ne réactive pas un compte existant. `npm run test:bootstrap` a créé le premier compte dans un schéma aléatoire de `TEST_DATABASE_URL`, vérifié login/2FA, contrôlé qu’une seconde exécution préserve le mot de passe, le rôle, l’état, le 2FA et la version de session, puis confirmé la suppression du schéma.
- Le limiteur de débit nettoie les entrées expirées dès que sa capacité maximale est atteinte; test unitaire ajouté.
- L’exception production Prisma a été retirée. `npm audit --omit=dev --omit=optional` et `npm run audit:production` : **0 avis**; exceptions CI : liste vide. L’audit complet reste à **37 avis (32 hauts, 5 modérés, 0 critique)** dans l’arbre de développement/test; la mise à niveau majeure Jest proposée n’a pas été appliquée.
- `npm run security:scan` : aucun élément détecté dans sources, bundle et historique Git local. Le binaire gitleaks n’est pas disponible ici; contrôle indépendant humain requis.
- Validation locale : lint réussi; tests outils **23/23**; tests unitaires API **44/44**; E2E PostgreSQL de test **25/25**; Playwright **36/36**; `test:bootstrap` réussi avec schéma temporaire supprimé; build NestJS et Angular réussi. Aucun changement de migration ou de `DATABASE_URL`.
- Nginx, Docker, TLS réel, OWASP ZAP, restauration hors site et scans sur serveur public n’ont pas été exécutés. L’API n’est **pas prête pour de vraies données en production** avant ces preuves et la validation des blocages consignés dans `CHECKLIST_AUDIT.md` et `BLOCAGES.md`.

## Revue complémentaire — 12 octobre 2026

### Correction appliquée

Une vérification des écritures sans cookie a relevé un risque de login CSRF : une soumission HTML intersite ne déclenche pas nécessairement CORS et les routes de connexion/récupération n'ont pas encore de cookie CSRF. `CsrfGuard` exige désormais en production un en-tête `Origin` exactement égal à `APP_PUBLIC_URL` pour toute méthode d'écriture, avant la vérification double-cookie. Les requêtes sans origine et d'une origine étrangère sont refusées. Test unitaire dédié dans `apps/api/src/guards.spec.ts`.

### Résultats de cette revue

- `npm.cmd test` : outils **23/23**, API **45/45** (11 suites), total **68/68** après le test de refus d'origine intersite.
- `npm.cmd run lint` : réussi pour TypeScript API et Web.
- E2E PostgreSQL `paroisse_test` : 25/25; audit production 0 avis critique/haut non accepté; audit complet 37 (32 hauts, 5 modérés, 0 critique) dans l'arbre dev/test et Prisma CLI. Playwright, Docker, Nginx et test réseau/TLS non exécutés pendant cette revue.
- Aucune migration ni commande de base de données exécutée.

### Risques encore ouverts

- Le limiteur et le délai progressif sont en mémoire : un redémarrage ou plusieurs instances modifient les limites.
- Nginx/TLS, l'origine réellement transmise par le proxy, les en-têtes, le pare-feu et les secrets ne sont pas vérifiés sur une machine de production.
- Les scénarios E2E, navigateur, purge PostgreSQL, restauration de sauvegarde et démarrage Compose doivent être relancés dans leurs environnements dédiés.
- Aucun audit indépendant/pentest n'a été réalisé. Un pourcentage de sécurité (« 99 % ») n'est pas démontrable par des tests locaux; l'application n'est pas certifiée prête pour des données réelles.

### Complément de preuves — revue du 12 octobre 2026

Depuis l'ajout de la vérification stricte d'`Origin` en production, les vérifications exécutées sont : tests outils 23/23, tests API 45/45 (11 suites), E2E PostgreSQL sur `paroisse_test` 25/25, lint API/Web réussi, builds NestJS/Angular réussis, scan local des secrets réussi. Le contrôle `npm run audit:production` conclut à 0 avis critique/haut non accepté. `npm audit --omit=dev --omit=optional` : 0 avis (189 dépendances prod). L'audit complet : 37 avis (32 hauts, 5 modérés, 0 critique), dans l'arbre dev/test et la CLI Prisma; le correctif proposé par npm est une mise à niveau majeure Jest, non appliquée.

Les résultats ne valent pas certification : aucun test navigateur n'a été relancé après le changement Origin; aucun test de conteneur, Nginx/TLS, pentest indépendant, téléphone ou production n'a eu lieu. La limite de débit est mono-processus. Ne pas utiliser cette application pour des données réelles avant les vérifications humaines listées dans `docs/CHECKLIST_AUDIT.md` et `docs/CHECKLIST_PRODUCTION.md`.

## Préparation Cloudflare Tunnel — revue locale mise à jour le 12 octobre 2026

- Compose sans ports publiés avec `postgres`, `api`, `web` (Angular + reverse proxy API), `cloudflared` et `migrate` à la demande. `data`, `app` et `tunnel-origin` sont internes; seul `cloudflared` rejoint aussi le réseau sortant `tunnel`. Le jeton provient de `CLOUDFLARED_TOKEN` et est fourni à cloudflared par la variable runtime `TUNNEL_TOKEN`.
- Nginx fait confiance à `CF-Connecting-IP` uniquement depuis `172.33.0.3` sur `tunnel-origin`, remplace XFF/CF-Connecting-IP vers l'API par l'adresse contrôlée; l'API ne fait confiance qu'au pair web `172.31.0.2`. Un vrai serveur Express local a reçu des en-têtes XFF/CF forgés : `req.ip` reste loopback et le quota ne change pas; 10 requêtes sont admises, la 11e reçoit 429.
- Middleware API global : `Cache-Control: no-store`, `Pragma: no-cache`; un intercepteur E2E vérifie ces deux valeurs sur chaque requête d'API émise par la suite. Seuls les noms d'assets hachés (y compris le format Angular `main-<hash>.js`) ont cache immutable dans Nginx; autres ressources et HTML sans cache. Les règles Nginx masquent les en-têtes API redondants avant d'ajouter une seule politique de sécurité d'origine.
- Préparation locale ne constitue pas validation de production : Docker, `nginx -t`, Cloudflare dashboard/tunnel réel, domaine, règles WAF/cache/Access/limitation, HSTS et mobile hors réseau paroissial sont non testés. La procédure et les commandes exactes sont dans `docs/DEPLOIEMENT_CLOUDFLARE.md`.
- Cloudflare termine TLS public et voit le trafic en clair à son entrée; l'information de confidentialité doit le dire.

### Résultats d'exécution locale — même revue

- `npm.cmd run lint` : réussi (TypeScript API et web).
- `npm.cmd run build` : réussi (génération Prisma, build NestJS et copie du client, build Angular).
- `npm.cmd test` : outils **26/26** et API **47/47** (12 suites), soit **73/73**; `npm.cmd run test:tools` relancé après le dernier changement Nginx : **26/26**.
- `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run test:e2e` : **26/26** sur `paroisse_test`; 33 migrations trouvées, aucune en attente. Le test vérifie `no-store` pour chaque requête API effectuée pendant la suite. Aucune migration n'était à appliquer; `DATABASE_URL` n'a pas été modifiée.
- `npm.cmd run test:playwright` : reconstruction Angular actuelle puis **36/36** Chromium.
- **Non testés** : Docker/Compose (`docker` absent), Nginx (`nginx` absent), vrai tunnel/domaine, règles du tableau Cloudflare et en-têtes/cookies vus depuis Internet. Les cookies de production et politiques Helmet ont des tests unitaires; cela ne prouve pas le chemin TLS réel. Commandes Linux : `docker compose --env-file .env -f infra/compose.yaml config --quiet`, `docker compose --env-file .env -f infra/compose.yaml build --pull`, `docker compose --env-file .env -f infra/compose.yaml up -d`, `docker compose --env-file .env -f infra/compose.yaml exec web nginx -t`, puis `curl -sSI https://<DOMAINE>/health` et essais externes selon `docs/DEPLOIEMENT_CLOUDFLARE.md`.
