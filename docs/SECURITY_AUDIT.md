# Audit de sécurité — surface « présences uniquement »

Dernière vérification locale : 10 octobre 2026. Les statuts décrivent le code et les commandes de cette version, pas un hébergement réel.

## Réduction de surface observée

- `apps/api/src/app.module.ts` n'enregistre que présentation publique, présences, authentification et état de santé. Aucun contrôleur de communauté n'y est importé.
- Les routes Angular actives (`apps/web/src/main.ts`) sont accueil, connexion, récupération, première connexion, programme biblique, admin et présences. Les routes inconnues reviennent à l'accueil.
- `apps/api/prisma/schema.prisma` ne contient plus de modèles sociaux/messagerie/médias ni les rôles FIDELE/MODERATEUR/PENDING. `FIDELES` reste un libellé de zone pour les feuilles de cours, et `Person.photoUrl` sert à la présentation publique préexistante de l'équipe.
- Le script e2e contient une liste de routes communautaires et d'inscription à vérifier en 404, ainsi qu'un contrôle d'énumération des rôles. **Ces assertions n'ont pas été exécutées contre PostgreSQL dans cette passe.**

## Contrôles visibles dans le code

| Domaine | Statut de code | Preuve / limite |
|---|---|---|
| Validation des données et rôles | Présent | DTO whitelist et rôles pris depuis session/base; les e2e courants restent à exécuter. |
| Authentification et mots de passe | Présent | Argon2id, délai progressif, hash factice pour compte absent, version de session, mot de passe temporaire à changer. Revue et e2e non finalisées sur DB. |
| 2FA | Présent | TOTP administrateur obligatoire, secrets chiffrés, codes de secours, CLI; `2FA_REQUIS_RESPONSABLES` optionnel (off par défaut). Tests d'intégration à relancer. |
| Cookies et CSRF | Configuré | Cookies `HttpOnly`, `SameSite=Strict`, `Secure` en production et garde CSRF; HTTPS/proxy de production non testés. |
| Rate limiting | Présent en mémoire | Adapté à une instance locale/simple; plusieurs réplicas exigeraient un stockage partagé. Vérification opérationnelle non faite. |
| Autorisations de présence | Dans les contrôleurs/guards | Responsables limités à leur jour et rôles; les assertions API doivent être rejouées après migration. |
| Données nominatives | Protection par action | Admin voit les totaux; consultation nominative motivée/auditée. Les scénarios e2e actuels ne sont pas exécutés. |
| Rétention | Présente | Noms anonymisés à 12 mois par défaut, totaux conservés; audit au moins 36 mois. Cron/base pas testés en prod. |
| Journaux | Mesures en place | À contrôler avec scan automatisé des logs pendant e2e courants. |
| Santé | Présente | `/health` liveness et `/ready` teste DB sans renvoyer d'identifiants. |
| Swagger | Désactivé en production | Test unitaire dédié inclus; unité passée. |
| Sauvegarde | AES-256-GCM/S3 | Scripts et tests outils existent; une restauration réelle des données de cette base n'a pas été prouvée pendant cette passe. |
| Médias et inscription fidèle | Retirés de l'app active | Anciennes migrations/sources historiques restent dans l'historique versionné; elles ne sont pas des routes runtime. |

## Migration destructive en attente

`apps/api/prisma/migrations/20261026000000_presence_only_simplification/migration.sql` est une migration nouvelle et non exécutée. Elle désactive les anciens comptes FIDELE/MODERATEUR/PENDING, révoque leurs sessions, retire certaines colonnes utilisateur puis supprime les anciennes tables/types communautaires avec `CASCADE`. Les publications, commentaires, réactions, conversations, groupes, stories, directs, notifications et contenus associés à ces tables ne seront pas transférés et seront perdus. Les présences, programme, comptes restant, sessions/TOTP, réinitialisations et AuditLog sont visés comme conservés, mais cette hypothèse doit être validée sur test vide et historique avant toute base ayant de la valeur. `CASCADE` peut également supprimer des objets dépendants non répertoriés : analyser le catalogue de la copie de test avant approbation.

## Dépendances

- `npm audit --omit=dev` exécuté avec le registre : **5 avis, dont 3 hauts et 2 modérés**. Avis identifiés : `deepmerge-ts` transitif via `@prisma/config`/Prisma (haut), `js-yaml` transitif via `@nestjs/swagger` (modéré; certaines résolutions de développement peuvent présenter la version vulnérable).
- `npm audit` complet : **38 avis, dont 32 hauts et 6 modérés**. Chaînes principales rapportées : `braces` via `micromatch`/Jest (haut), `deepmerge-ts` via Prisma (haut), `js-yaml` (modéré), `sprintf-js` via `argparse`/Istanbul (modéré). L'audit complet signale des correctifs forcés vers Jest 30, version majeure; aucune mise à jour ni override n'a été appliqué.
- La sortie tronquée de l'audit complet ne permet pas d'attribuer avec certitude chaque avis à chaque chemin; récupérer `npm audit --json` sur une machine autorisée au réseau, sans publier la sortie brute si elle contient des métadonnées privées, avant décision de mise à jour.

## Résultats de vérification actuels

- `npm.cmd run lint` : réussi.
- `npm.cmd test` : **29 tests réussis, 0 échoué** (6 outils et 23 unitaires API), après correction d'un texte de réponse générique; résultat de la première tentative : 22 réussis, 1 échoué.
- `npm.cmd run build` : build API et Angular réussis.
- `npx.cmd playwright test` : **0 réussi, 11 échoués** parce que le navigateur Chromium headless attendu n'est pas installé dans cet environnement; le build courant a toutefois été compilé pendant global setup.
- `npm.cmd run test-db:diagnose` confirme une cible `localhost:5432/paroisse_test` sans afficher les identifiants. `prisma migrate status` forcé sur cette cible échoue avec `Schema engine error` vide.
- E2E API et migration de simplification : **non exécutés par moi**. Le runner appliquerait les migrations automatiquement; la base de test ne peut pas être inspectée actuellement et son contenu inconnu doit être préservé.
- Docker, DNS, HTTPS/HSTS, envoi réel Resend, restauration réelle, droits de production et analyse de logs en production : non vérifiés.

## Risques résiduels et décision

**Pas prêt pour de vraies données.** Les avis npm élevés, le blocage Prisma, la migration destructive non éprouvée, les tests navigateur non exécutables ici et l'absence de restauration prouvée sont des bloqueurs. Il faut : réparer PostgreSQL/Prisma de test, vérifier/restaurer une archive sûre, tester la migration sur base vide et historique, faire passer tous les e2e et Playwright avec navigateur installé, traiter ou accepter formellement les avis, puis faire revue professionnelle des règles d'accès et de sauvegarde.
