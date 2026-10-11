# Déploiement léger des présences

## Services

`infra/compose.yaml` contient PostgreSQL, l'API NestJS, le site Angular servi par Nginx et Nginx TLS en frontal. Le port PostgreSQL n'est pas publié; les conteneurs sont non-root, en lecture seule autant que possible, avec limites de ressources et journaux à rotation bornée. Compose exige les secrets et variables nécessaires.

Cette configuration est un modèle portable, pas une preuve de fonctionnement en production. Elle n'a pas été testée sur une machine Linux réelle.

## Mise en place

1. Préparer un serveur Linux maintenu, un domaine contrôlé par la paroisse et des comptes d'administration nominatifs avec MFA.
2. Installer Docker Engine/Compose depuis les sources officielles du système. Configurer pare-feu pour n'exposer que SSH restreint, HTTP et HTTPS; limiter SSH par clé et IP si possible.
3. Générer des secrets indépendants avec un gestionnaire de secrets. Créer `.env` sur le serveur, jamais dans Git. Renseigner `FRONTEND_ORIGIN`, les mots de passe de base, JWT, chiffrement TOTP, Resend et certificat TLS. Aucun secret d'exemple ne doit être réutilisé.
4. Obtenir le certificat Let's Encrypt avec un client ACME approprié. Monter le dossier TLS en lecture seule et tester renouvellement automatique. Ne servir les cookies que derrière HTTPS; HSTS seulement après validation HTTPS sur tout le domaine.
5. Exécuter `docker compose -f infra/compose.yaml config --quiet`, puis construire/démarrer dans un environnement de préproduction fictif. Lancer les contrôles `/health` et `/ready`, les e2e sur base séparée, et un essai de restauration.
6. Surveiller disponibilité, espace disque, CPU/mémoire, connexion PostgreSQL, échecs de sauvegarde et quota d'e-mail. Alerter avant les plafonds gratuits; tarifs et limites à vérifier chez le fournisseur.

La base PostgreSQL doit rester inaccessible depuis Internet. Séparer compte applicatif et compte de migration. Les paramètres proxy doivent approuver uniquement le proxy configuré. Les logs ne doivent contenir ni noms de présence ni secrets.

## Changer de serveur

1. Geler temporairement les écritures ou utiliser une sauvegarde cohérente documentée.
2. Copier le dépôt versionné et `.env` par un canal sécurisé; ne pas copier les caches, dumps non chiffrés ni journaux contenant des données.
3. Restaurer la dernière sauvegarde chiffrée dans une nouvelle base sur le serveur cible. Comparer les tables, lignes et totaux avec la source; garder l'ancienne machine intacte.
4. Exécuter `prisma migrate status` sur la cible explicitement confirmée. Les migrations destructives de communauté doivent être validées au préalable selon [MIGRATION_PROCEDURE.md](MIGRATION_PROCEDURE.md).
5. Rejouer uniquement les migrations approuvées après restauration/validation, déployer les conteneurs, vérifier `/health`, `/ready`, connexion, saisie de test fictive, e-mail de récupération et sauvegarde hors site.
6. Changer DNS après vérifications HTTPS. Conserver l'ancien serveur jusqu'à l'approbation opérationnelle.

## Actions humaines obligatoires

- Réserver le domaine, valider les comptes du fournisseur au nom de la paroisse et désigner au moins deux administrateurs.
- Choisir le lieu/région d'hébergement en fonction de la loi locale et des personnes concernées.
- Effectuer la rotation des secrets de test et vérifier les clés de récupération hors ligne.
- Tester une restauration complète, les renouvellements TLS, les quotas e-mail et le plan d'incident.
- Faire une revue de sécurité indépendante avant d'ajouter des données personnelles réelles.
# Migration Prisma en production

L'image `runtime` de l'API est construite avec `npm ci --omit=dev` : elle conserve `@prisma/client` et n'embarque pas la CLI Prisma. Les migrations se lancent à la demande dans le service `migrate`, construit depuis l'étape distincte du Dockerfile où la CLI et les dépendances de développement sont disponibles. Le conteneur s'exécute sous l'utilisateur Linux `node` et se connecte à PostgreSQL avec le rôle de migration `paroisse_migrator`, distinct du rôle applicatif `paroisse_app`.

Après une sauvegarde vérifiée et avant de démarrer une version applicative qui nécessite le nouveau schéma, depuis la racine du dépôt et avec le fichier d'environnement de production configuré :

```sh
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.maintenance.yaml --profile maintenance run --rm migrate
```

Cette commande démarre les dépendances déclarées, exécute `prisma migrate deploy`, puis retire le conteneur ponctuel. Elle ne lance pas `migrate dev` et ne crée pas de migration. Vérifier le code de sortie et l'état des migrations avant de redémarrer l'API. Ne pas démarrer `migrate` automatiquement à chaque lancement du service API. Le service de migration utilise uniquement `POSTGRES_MIGRATION_PASSWORD`; l'API continue d'utiliser `POSTGRES_APP_PASSWORD`.

**Docker : non testé dans l'environnement de développement courant.** Commande de validation à exécuter sur une machine avec Docker Compose :

```sh
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.maintenance.yaml --profile maintenance config
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.maintenance.yaml --profile maintenance build api migrate
```

Vérifier l'image finale avec `docker run --rm <image-api> npm ls prisma @nestjs/cli --depth=0` : la CLI ne doit pas y être installée. Vérifier que l'image de migration possède la CLI et qu'elle atteint la base avec le rôle migrateur avant la procédure réelle.
