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
| 2FA | Présent | TOTP administrateur obligatoire, secrets chiffrés, codes de secours, CLI; `2FA_REQUIS_RESPONSABLES` optionnel (off par défaut). Tests d'intégration à relancer. |
| Cookies et CSRF | Configuré | Cookies `HttpOnly`, `SameSite=Strict`, `Secure` en production et garde CSRF; HTTPS/proxy de production non testés. |
| Rate limiting | Présent en mémoire | Adapté à une instance locale/simple; plusieurs réplicas exigeraient un stockage partagé. Vérification opérationnelle non faite. |
| Autorisations de présence | Dans les contrôleurs/guards | Responsables limités à leur jour et rôles; 18 E2E réussis sur `paroisse_test`, mais un E2E historique n'a pas été exécuté. |
| Données nominatives | Protection par action | Admin voit les totaux; consultation nominative motivée/auditée. Les scénarios e2e actuels ne sont pas exécutés. |
| Rétention | Présente | Noms anonymisés à 12 mois par défaut, totaux conservés; audit au moins 36 mois. Cron/base pas testés en prod. |
| Journaux | Mesures en place | À contrôler avec scan automatisé des logs pendant e2e courants. |
| Santé | Présente | `/health` liveness et `/ready` teste DB sans renvoyer d'identifiants. |
| Swagger | Désactivé en production | Test unitaire dédié inclus; unité passée. |
| Sauvegarde | AES-256-GCM/S3 | Une archive chiffrée de `paroisse` a été restaurée dans une base neuve : 27 tables, sommes de lignes et schéma identiques, 35 clés étrangères. Cela valide cette restauration locale; stockage S3 distant et reprise après sinistre ne sont pas vérifiés. |
| Médias et inscription fidèle | Retirés de l'app active | Anciennes migrations/sources historiques restent dans l'historique versionné; elles ne sont pas des routes runtime. L'inscription des responsables est conservée sous forme de demande inactive. |

## Migrations et conservation

`paroisse` avait 16 migrations en attente. Les migrations `20261019000000_replace_legacy_community` et `20261026000000_presence_only_simplification` retirent les anciens modèles/tables communautaires; leurs contenus ne sont pas convertis en messages privés. Une sauvegarde a été restaurée et comparée sans afficher le contenu, puis les 16 migrations ont été appliquées à un clone isolé : elles ont toutes réussi et le diff final Prisma était vide. Après cette vérification, elles ont aussi été appliquées à `paroisse` avec succès. Une archive chiffrée restaurée préserve les données pré-migration consultables; l'application n'a pas fusionné les anciens contenus dans les présences ou les messages. Aucune vérification sur base vide n'a été effectuée dans cette passe.

## Dépendances

- `npm audit --omit=dev` exécuté avec le registre : **5 avis, dont 3 hauts et 2 modérés**. Avis identifiés : `deepmerge-ts` transitif via `@prisma/config`/Prisma (haut), `js-yaml` transitif via `@nestjs/swagger` (modéré; certaines résolutions de développement peuvent présenter la version vulnérable).
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
| Swagger, erreurs et en-têtes | Vérifié localement | L'E2E reçoit 404 pour la documentation en mode production; filtres et en-têtes ont des tests unitaires. Le CSP côté Nginx garde `style-src 'unsafe-inline'` pour les styles Angular; `script-src` ne l'autorise pas. |
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

Les deux commandes d'audit ont atteint le registre npm. `npm audit --omit=dev` rapporte **5 avis : 3 hauts, 2 modérés**; les chaînes affichées incluent `deepmerge-ts` via `@prisma/config`/Prisma et `js-yaml` via Swagger. `npm audit` complet rapporte **38 avis : 32 hauts, 6 modérés**; les principaux chemins sont `braces` via `micromatch`/Jest, `deepmerge-ts` via Prisma, `js-yaml` via Swagger/Istanbul et `sprintf-js` via `argparse`/Istanbul. L'audit propose une mise à niveau forcée vers Jest 30.5.2, majeure par rapport à Jest 29 utilisé ici. Aucune mise à niveau aveugle n'a été faite. Le code de sortie des deux audits reste 1 : ce résultat empêche de considérer la chaîne de dépendances comme assainie.

### Risques résiduels

- Pas de preuve de déploiement HTTPS, HSTS, CORS/Nginx, rotation de secrets, e-mail, TURN/WebRTC ou restauration à partir d'un stockage S3 réel.
- CSP conserve une exception `unsafe-inline` pour les styles dans Nginx; réduire cette exception demande de déplacer/adapter les styles inline et de retester les pages Angular.
- Les avis npm hauts restent à corriger dans une branche dédiée, avec mises à niveau compatibles et tests complets; le paquet Jest ne doit pas être forcé en version majeure sans validation.
- Le script de rôles PostgreSQL n'est pas validé sur une base dédiée vide; le démarrage Docker avec volume existant ne rejoue pas l'initialisation.
- Des personnes doivent encore créer les comptes opérateurs, approuver les contacts d'incident, choisir le domaine/hébergeur et tester une restauration réelle de production.

**Décision : non prêt pour une mise en production avec des données réelles tant que les avis hauts, l'environnement TLS et la procédure opératoire PostgreSQL/sauvegarde n'ont pas été traités et vérifiés.**
