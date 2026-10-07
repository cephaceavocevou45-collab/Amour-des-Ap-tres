# Amour des Apôtres · Sainte-Cécile

Application paroissiale en français : site public, ressources bibliques, création de compte et saisie des présences.

## Voir le site sur votre ordinateur

Depuis le dossier du projet, lancez le frontend :

```powershell
npm.cmd run dev:web -- --port 4201
```

Le site est disponible sur `http://localhost:4201`. Pour utiliser les comptes, l’API et PostgreSQL doivent aussi fonctionner. Avec Docker Compose :

```powershell
Copy-Item .env.example .env
# Renseignez les secrets nécessaires dans .env
```

Le site Docker est disponible sur `http://localhost:8080`, l’API sur `http://localhost:3000/api/v1` et Swagger sur `http://localhost:3000/api/docs`.

Les migrations doivent d’abord être vérifiées sur une base PostgreSQL dédiée nommée, par exemple, `paroisse_test`, configurée dans `TEST_DATABASE_URL`. La suite e2e applique les migrations à cette base seulement. N’utilisez jamais `DATABASE_URL` de développement pour les tests. Toute migration distincte sur la base de développement doit être précédée d’une sauvegarde et d’une décision explicite du responsable de la base.

```powershell
npm.cmd run test:e2e
```

Si PostgreSQL signale des identifiants invalides, ne remplacez jamais `TEST_DATABASE_URL` par `DATABASE_URL`. Le diagnostic n’affiche aucun mot de passe :

```powershell
npm.cmd run test-db:diagnose
```

Pour provisionner une base `paroisse_test` et un rôle de test dédié, installez les outils PostgreSQL, définissez temporairement `PG_ADMIN_URL` dans votre session PowerShell vers une base système sûre, puis lancez `npm.cmd run test-db:setup`. Le script crée ou actualise `paroisse_test_user`, crée la base si elle manque, et écrit l’URL dédiée dans `.env` sans afficher le mot de passe. Retirez ensuite `PG_ADMIN_URL` de la session. N’exécutez pas le script avec une URL d’administrateur pointant sur la base paroissiale de développement.

Le test e2e peut appliquer les migrations uniquement à `TEST_DATABASE_URL`. Pour sauvegarde, restauration et validation des migrations, voir [docs/MIGRATION_PROCEDURE.md](docs/MIGRATION_PROCEDURE.md).

La configuration initiale d’un compte administrateur se fait avec `BOOTSTRAP_ADMIN_EMAIL` et `BOOTSTRAP_ADMIN_PASSWORD` dans `.env`. La double authentification est enrôlée par la commande serveur `admin:enroll-2fa` ci-dessous ; aucune route HTTP ne permet d’activer ou remplacer le secret avec le seul e-mail et mot de passe.

En terminal serveur sécurisé, `npm.cmd run admin:enroll-2fa -- --email=administrateur@exemple.org` initialise la 2FA : le propriétaire du compte saisit son mot de passe, scanne la clé avec une application TOTP, saisit un code à 6 chiffres, puis conserve hors ligne les 10 codes de secours affichés une seule fois. Un changement de secret exige le mot de passe et le code TOTP/secours actuels. En cas de perte, un autre SUPER_ADMIN actif déjà protégé confirme son identité : `npm.cmd run admin:reset-2fa -- --email=compte-a-recuperer@exemple.org --actor-email=super-admin@exemple.org --confirm=RESET-2FA`. Le titulaire fournit son mot de passe et son second facteur au terminal ; toutes ses sessions sont révoquées. Il faut ensuite relancer l’enrôlement. Ne lancez pas ces commandes avant génération du client Prisma et configuration correcte de la base ciblée.
## Fonctionnalités visibles

- Accueil avec emblème ECC, présentation de la paroisse, horaires, équipe et contacts cliquables (appel et WhatsApp).
- Liens vers trois traductions bibliques en français, l’Ancien et le Nouveau Testament.
- Rubriques pour les 12 préceptes, les 11 ordonnances et les 4 sacrements. Les 11 ordonnances restent à valider avec la paroisse avant publication détaillée.
- Les demandes de secrétaire de présence et de président d’un jour restent soumises à validation administrative.
- Pages de présence et d’administration.

Les demandes de Secrétaire de présence et de Président de semaine sont validées depuis l’administration. Un candidat président choisit un jour précis (lundi à dimanche) ; son accès est limité à la feuille de ce jour pendant la semaine en cours. La saisie du cours biblique est réservée au secrétariat le lundi de 19 h 30 à 21 h 30, et la feuille du jour au président désigné de 10 h à 18 h.

La récupération du mot de passe envoie un lien à usage unique, valable 30 minutes, avec Resend. Configurez `RESEND_API_KEY`, `MAIL_FROM` et `APP_PUBLIC_URL` dans `.env`. `MAIL_FROM` doit être une adresse autorisée par votre compte d’envoi ; `APP_PUBLIC_URL` doit être l’adresse du site accessible au fidèle qui ouvre le lien. Sans ces valeurs, l’API ne peut pas envoyer les e-mails de récupération.

Le programme du lundi conserve le résumé précédent, le passage biblique, le thème et les intervenants choisis dans la liste des personnes et de leurs grades.

Le nouveau compte FIDELE s’inscrit séparément, confirme son adresse par un lien unique valable 30 minutes, et n’obtient aucun accès avant confirmation. Il ne peut pas accéder aux présences ou à l’administration. L’administrateur peut suspendre ou réactiver un compte fidèle avec motif ; la suspension invalide les sessions et est journalisée. Le premier écran Actualités précise que le fil n’est pas encore construit.

## Architecture

`apps/web` : Angular · `apps/api` : NestJS et Prisma · `packages/shared` : types et règles partagés · `infra` : Docker Compose et Nginx.

Les feuilles de présence, les affectations de rôles, les notifications et les demandes de réinitialisation sont enregistrées dans PostgreSQL.

Pour activer l’inscription fidèle, configurez RESEND_API_KEY, MAIL_FROM, APP_PUBLIC_URL, SOCIAL_MIN_AGE, SOCIAL_CHARTER_VERSION et SOCIAL_CHARTER_TEXT. Si Turnstile est utilisé, renseignez ensemble CAPTCHA_SITE_KEY et CAPTCHA_SECRET_KEY. Sans la charte finale, l’âge retenu ou le service d’e-mail, l’API laisse l’inscription désactivée. Ces valeurs, les modérateurs, le fournisseur de stockage et les mentions légales nécessitent une confirmation paroissiale avant mise en service.

La classification des routes et leurs contrôles sont décrits dans [docs/API.md](docs/API.md). Cette phase ne remplace pas les rôles de présence existants et n’associe jamais les noms saisis sur une feuille à un compte du réseau social.
