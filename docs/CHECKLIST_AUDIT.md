# Audit de sécurité — checklist avec preuves

Date : 12 octobre 2026. Périmètre : application présence Angular/NestJS/Prisma, CI et fichiers de déploiement présents. Les statuts portent sur les preuves disponibles, pas sur une production non exécutée.

## Résumé

| Statut | Nombre |
|---|---:|
| Conforme | 15 |
| Partiel | 12 |
| Non conforme | 0 |
| Non vérifié | 4 |
| **Total** | **31** |

## Constats

| # | Constat | Preuve vérifiable | Statut | Action | Date |
|---:|---|---|---|---|---|
| 1 | Secrets de production lus côté serveur; valeurs d’exemple refusées au démarrage; réponses d’erreur neutres. | `apps/api/src/runtime-config.ts`; tests `runtime-config.spec.ts` et E2E erreur neutre. | Conforme | Garder le test en CI; injecter les secrets depuis le gestionnaire du futur serveur. | 2026-10-12 |
| 2 | Scan de secrets du code, bundle compilé et modifications de l’historique local. | `npm run security:scan` : aucun secret détecté; `.env` absent de l’index et de `git log --all -- .env`. Scanner local `scripts/secret-scan.cjs`. | Partiel | Gitleaks indépendant non installé; lancer le contrôle humain avant production. | 2026-10-12 |
| 3 | `.env.example` ne contient pas de secret réel; les URL utilisent des valeurs de démonstration/placeholders. | Inspection des seuls noms de variable et résultat `security:scan`; `.gitignore` ignore `.env`. | Conforme | Ne jamais remplacer les placeholders par des identifiants réels dans ce fichier. | 2026-10-12 |
| 4 | Le navigateur ne reçoit pas de clé fournisseur; les e-mails partent du serveur. | `email-quota.service.ts`; scanner des fichiers source et `apps/web/dist`; appels navigateur vers l’API locale uniquement. | Partiel | Répéter une recherche indépendante du bundle final de production après chaque changement d’architecture. | 2026-10-12 |
| 5 | Procédures de rotation et inventaire des secrets documentés. | `docs/EXPLOITATION.md` : DB, JWT (incluant la dérivation TOTP), e-mail, sauvegarde, S3 et amorçage. Aucune rotation réelle n’a eu lieu. | Partiel | Le propriétaire doit faire tourner les secrets avant production et vérifier chaque service. | 2026-10-12 |
| 6 | Liste blanche et validation des corps. | `main.ts`: `whitelist`, `forbidNonWhitelisted`, `transform`; DTOs dans `auth.ts` et `attendance.ts`; E2E corps invalide, corps trop gros et champs inattendus. | Conforme | Conserver les DTO stricts pour toute nouvelle écriture. | 2026-10-12 |
| 7 | Validation de tous les paramètres de route, query et types TypeScript. | Inventaire complet dans `docs/API.md`; plusieurs `@Param()` n’ont pas de DTO de format et des handlers utilisent `req:any`/`response:any`. | Partiel | Remplacer progressivement les types `any`, ajouter DTO UUID/date/identifiant et E2E sans modifier les autorisations. | 2026-10-12 |
| 8 | Taille des corps HTTP limitée. | `main.ts`: JSON et urlencoded 64 Kio; `infra/nginx-edge.conf` limite corps à 64 Kio; E2E surcharge. | Conforme | Valider Nginx avec `nginx -t` sur le serveur cible. | 2026-10-12 |
| 9 | Requêtes SQL d’application sans concaténation brute. | `rg -n -F '$queryRaw' apps scripts packages infra`, `rg -n -F '$executeRaw' apps scripts packages infra`, `rg -n 'Unsafe' apps scripts packages infra` : aucune occurrence. Prisma est utilisé dans l’application. | Conforme | Relancer les recherches après toute nouvelle migration/outillage. | 2026-10-12 |
| 10 | Textes saisis échappés à l’affichage. | Angular interpolation dans les vues; Playwright hostile sur nom d’équipe et nom de présence : texte affiché, aucune balise active/exécution. | Partiel | Ajouter un cas navigateur si un nouveau champ texte public est ajouté; aucun `innerHTML` ou `bypassSecurityTrust` trouvé dans `apps/web/src`. | 2026-10-12 |
| 11 | Injection de formule dans export. | Aucune route CSV/Excel/PDF ni téléchargement d’export dans l’API active; recherche des contrôleurs/routes. | Conforme pour le périmètre actuel | Si un export est ajouté, protéger cellules `= + - @` et tester les en-têtes avant publication. | 2026-10-12 |
| 12 | Mots de passe hachés Argon2id avec sel unique. | `auth.ts`; `argon2` 0.41.x utilise mémoire 65536 KiB, 3 itérations, parallélisme 4, résultat 32 octets et sel aléatoire 16 octets (`node_modules/argon2/argon2.cjs`, defaults vérifiés). | Conforme | Rendre ces paramètres explicites lors d’une évolution contrôlée; benchmark sur le matériel de production. | 2026-10-12 |
| 13 | Comptes ordinaires créés par ADMIN/SUPER_ADMIN, mot de passe temporaire unique et premier changement forcé. | `auth.ts` admin creation; E2E `creates responsible accounts only through administration...`; `POST /auth/register` répond maintenant 404 sans insertion; Playwright vérifie l’absence d’auto-inscription. | Conforme | Valider la règle organisationnelle dans `DECISIONS_A_VALIDER.md`. | 2026-10-12 |
| 14 | Création initiale et réexécution du seed SUPER_ADMIN sûres. | `npm run test:bootstrap` crée un schéma aléatoire dans `TEST_DATABASE_URL`, applique les migrations, exécute le seed, teste la connexion sans et avec 2FA, réexécute le seed avec un autre mot de passe, vérifie hash/rôle/état/2FA/session inchangés et confirme la suppression du schéma. | Conforme dans le schéma de test isolé | Répéter le contrôle après toute modification du seed; ne jamais lancer sur une base autre que `TEST_DATABASE_URL`. | 2026-10-12 |
| 15 | Anti-énumération, hachage factice et frein progressif login. | E2E identifiants existants/inconnus, message identique, plancher 500 ms, délai croissant par IP/empreinte de compte sans verrouillage permanent. | Partiel | Exécuter une mesure statistique sur le serveur de préproduction et confirmer un seuil de latence adapté. | 2026-10-12 |
| 16 | Jetons et cookies de session. | 600 s access; refresh aléatoire dont le hash seul est persisté, rotation et détection de rejeu; cookies HttpOnly/Secure production/SameSite Strict; E2E aucun token en stockage navigateur. | Conforme | Contrôle TLS réel requis avant production. | 2026-10-12 |
| 17 | Inactivité, limite absolue et révocation. | 30 min / 30 jours par défaut dans `auth.guard.ts`; E2E inactivité, âge absolu, désactivation immédiate, changement de rôle, révocation de famille et tous appareils. | Conforme | Contrôler les valeurs d’environnement retenues par la paroisse. | 2026-10-12 |
| 18 | CSRF, CORS et proxy de confiance. | `csrf.guard.ts`, `runtime-config.ts`, `main.ts`; E2E écritures cookie sans preuve refusées; CORS production limité à `APP_PUBLIC_URL`; confiance proxy pour le peer Nginx attendu. | Conforme dans le code et les tests | Usurpation réelle d’en-tête à vérifier sur le réseau Nginx cible. | 2026-10-12 |
| 19 | 2FA et récupération de mot de passe. | AES-256-GCM; codes de secours Argon2id à usage unique; essais/reset 15 min/5; CLI; E2E remplacement, rejeu, expiry, concurrence et bypass. | Conforme selon E2E | Conserver les codes hors ligne; test de récupération humain nécessaire avant déploiement. | 2026-10-12 |
| 20 | Isolation des feuilles par jour/zone et visibilité nominative admin. | `attendance.ts`; E2E IDOR jour/zone/feuille pour lecture, saisie, correction, suppression, soumission, résumé et consultation nominative; consultation admin exige motif et journal. | Conforme selon matrice E2E | Toute route nouvelle de présence doit entrer dans la matrice avant fusion. | 2026-10-12 |
| 21 | Journaux d’audit et journaux applicatifs sans secrets/noms. | E2E canarie confirme que les journaux ne contiennent ni nom de présence, ni mot de passe, ni token; événements d’authentification/2FA/reset/permissions/consultation consignés. | Partiel | Tester accès, intégrité, alertes et rotation des logs sur un serveur réel. | 2026-10-12 |
| 22 | Limitation de débit côté application. | `RateLimitGuard`: 10 min, IP et compte hashés, Retry-After, caps login/reset/2FA/noms/saisie, mémoire bornée et purge corrigée au seuil; tests unitaires pour 429 et capacité. | Partiel | État mono-instance : redémarrage réinitialise les buckets et plusieurs instances multiplient le quota. Une stratégie distribuée serait nécessaire avant horizontal scaling. | 2026-10-12 |
| 23 | En-têtes API et documentation. | Helmet : CSP `script-src 'self'` sans `unsafe-inline` ni `unsafe-eval`, frame-ancestors none, HSTS en production, nosniff, Referrer-Policy; E2E Swagger/OpenAPI 404 et tests unitaires d’en-têtes. | Conforme côté API | Les en-têtes complémentaires du proxy doivent être validés par `nginx -t` et une sonde distante. | 2026-10-12 |
| 24 | Purge des noms et données hors ligne. | `RetentionService` anonymise les noms, fige les totaux, audit ≥36 mois; tests unitaires de durée; Playwright supprime le pointage après synchro, après 7 jours, à la déconnexion et masque la file sans session. | Partiel | Le test de purge unitaire utilise des mocks, pas une base PostgreSQL vieillie par horloge contrôlée. Confirmer la tâche planifiée en préproduction. | 2026-10-12 |
| 25 | Dépendances npm. | `npm audit --omit=dev --omit=optional`: 0 avis; `npm run audit:production`: 0 critique/haut; `npm audit`: 37 au total (32 hauts, 5 modérés), chaîne de tests/Jest et CLI Prisma dev. Correctif Jest proposé est une mise à niveau majeure 30.5.2; non appliquée. | Partiel | Réexaminer les dépendances dev; conserver le job de prod bloquant avec exceptions datées uniquement. | 2026-10-12 |
| 26 | Image Docker API réellement minimale et démarrage Compose. | Tests statiques vérifient image runtime `npm ci --omit=dev` et service migrate séparé. Docker absent; aucun démarrage de conteneur réalisé. | Non vérifié | Humain : `docker compose config`, puis build/start sur machine Linux non exposée et vérification des utilisateurs/ports. | 2026-10-12 |
| 27 | Rôles PostgreSQL réellement à privilèges minimaux. | Script `scripts/db-least-privilege.cjs` et tests de refus/configuration; aucun test de création/GRANT sur une base neuve dédiée dans cette passe. | Non vérifié | Humain DBA : créer sur instance jetable, prouver `paroisse_app` sans superuser/CREATEDB/CREATEROLE et vérifier que migrate utilise un rôle séparé. | 2026-10-12 |
| 28 | Sauvegarde chiffrée et restauration vérifiée. | Scripts AES-256-GCM/S3 et tests outils 23/23 incluent altération et absence de plaintext; archive de développement restaurée/comparée lors d’une passe antérieure, mais pas de restauration déclenchée dans cette passe. | Partiel | Répéter le test de restauration sur stockage et infrastructure préproduction; garder les clés séparément. | 2026-10-12 |
| 29 | Défenses Nginx contre débit et clients lents. | `infra/nginx-main.conf` et `nginx-edge.conf` : `limit_req`, `limit_conn`, délai en-têtes/corps/keep-alive et taille 64 Kio; tests statiques. Binaire Nginx absent. | Partiel | `nginx -t` non exécuté; Docker non installé. Vérifier les IP réelles et la configuration de proxy au déploiement. | 2026-10-12 |
| 30 | Test dynamique indépendant OWASP ZAP. | Aucun rapport ZAP ni serveur de préproduction ciblé. | Non vérifié | Humain : lancer ZAP sur environnement isolé, corriger et archiver le rapport sans données réelles. | 2026-10-12 |
| 31 | TLS public, DNS, pare-feu, restauration hors site et vrais appareils. | Aucune infrastructure de production fournie ou testée; aucun certificat ni téléphone sur réseau mobile testé. | Non vérifié | Humain : checklist de mise en production et tests réels dans `docs/DEPLOIEMENT.md` et `docs/EXPLOITATION.md`. | 2026-10-12 |

## Résultats de commandes (code courant)

| Commande | Résultat observé |
|---|---|
| `npm.cmd run lint` | Réussi : génération Prisma, vérification TypeScript API et web. |
| `npm.cmd test` | Réussi : outils 23/23, API 44/44 (11 suites), total 67 réussis / 0 échoué. |
| `npm.cmd run build` | Réussi : build NestJS avec copie client Prisma et build Angular; bundle initial 375,98 kB brut / 100,18 kB estimés transférés. |
| `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run test:e2e` | Base ciblée : `paroisse_test`; aucune migration en attente; 25/25 E2E réussis, y compris auto-inscription 404 et non-réinitialisation du SUPER_ADMIN existant. |
| `npm.cmd run test:playwright` | 36/36 réussis après le retrait du parcours d’auto-inscription. |
| `npm.cmd run test:bootstrap` | Réussi : migrations et seed dans un schéma aléatoire de `TEST_DATABASE_URL`, connexion/2FA vérifiées, seed idempotent, journaux contrôlés, schéma supprimé. |
| `npm.cmd run audit:production` | Réussi : zéro avis critique/haut (commande interne `npm audit --omit=dev --omit=optional --json`). |
| `npm.cmd audit` | 37 vulnérabilités : 0 critique, 32 hautes, 5 modérées; avis restant dans outils développement/test, aucun correctif forcé appliqué. |
| `npm.cmd run security:scan` | Réussi : aucun secret détecté dans code/bundle/historique Git local. |
| `docker compose config`, `nginx -t`, OWASP ZAP | Non exécutés : outils/service non disponibles. |

## Risques résiduels et recommandation

La production n’est **pas prête pour de vraies données** : le parcours bootstrap est prouvé sur un schéma jetable de `TEST_DATABASE_URL`, mais doit être opéré humainement en production; les paramètres de requête et identifiants de route ne sont pas tous typés/validés strictement; les limites de débit sont en mémoire; Nginx/Docker/TLS, rôle PostgreSQL réel, scan ZAP, rotation effective et restauration hors site restent à prouver.

Avant production : corriger et tester l’amorçage initial sur `TEST_DATABASE_URL`, valider le contrat et les décisions d’accès, terminer le contrôle de paramètres, exécuter tests Docker/Nginx/TLS sur serveur jetable, scanner avec gitleaks et ZAP, changer les secrets, puis restaurer une sauvegarde chiffrée sur une base vide isolée.

### Mise à jour complémentaire — 12 octobre 2026

- Écriture intersite : `CsrfGuard` compare l'origine de chaque requête d'écriture à `APP_PUBLIC_URL` en production, y compris connexion, récupération, et routes sans cookie; tests unitaires refusent origine absente et origine étrangère, puis acceptent l'origine autorisée.
- Vérification après correction : tests outils 23/23, API 45/45, E2E PostgreSQL `paroisse_test` 25/25, lint et builds réussis. `npm audit --omit=dev --omit=optional` : 0; audit complet 37 (32 hauts, 5 modérés, 0 critique), outils de dev/test et CLI, mise à niveau Jest majeure non appliquée.
- La production n'est pas certifiée : Nginx/TLS/Compose, navigateur après cette correction, pentest indépendant et limites distribuées non vérifiés.
