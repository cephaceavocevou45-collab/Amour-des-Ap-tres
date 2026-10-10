# Déploiement portable à budget minimal

Cette procédure prépare un déploiement transférable sur un serveur Linux standard. Elle ne crée aucun compte fournisseur, n’active aucun service et ne constitue pas une preuve de fonctionnement en production. **Déploiement réel : non testé.**

## Cible matérielle

La configuration limite les services applicatifs à environ 2 cœurs et 5 Gio de mémoire : PostgreSQL 2,5 Gio / 0,60 cœur, API 2 Gio / 0,75, site 128 Mio / 0,10 et Nginx 256 Mio / 0,25. Cela laisse une marge au système et aux tâches de maintenance sur une machine 12 Gio. Pendant une restauration, ne pas lancer plusieurs services de maintenance en parallèle. Ces limites Docker ne garantissent pas les performances.

## Choix de services et budget

| Besoin | Option de départ | Limite à surveiller / passage au payant |
|---|---|---|
| Serveur | Offre d’essai ou petite instance Linux chez un fournisseur avec palier gratuit | CPU/RAM, veille automatique, trafic sortant, stockage persistant ; payer avant que les limites compromettent disponibilité ou données |
| DNS | Zone gratuite chez un fournisseur DNS | Nombre de zones, DNSSEC, assistance et disponibilité |
| HTTPS | Certificats Let's Encrypt, renouvelés automatiquement | Aucun certificat payant requis au départ ; surveiller les renouvellements et limites d’émission |
| Courriels | Resend gratuit, plafond applicatif conservateur de 100/jour | Volume, domaine expéditeur et délivrabilité ; passer au payant quand le quota bloque les messages légitimes |
| Sauvegardes | Stockage compatible S3 avec petit quota gratuit, distinct du serveur | Capacité, requêtes, trafic de restauration et durée de rétention ; conserver 35 jours au minimum |
| Application | Présentation, comptes responsables et présences; aucun média communautaire | Augmenter les ressources si sauvegardes, rapports ou périodes de saisie saturent CPU, RAM ou disque |

**Tarifs et limites à vérifier chez le fournisseur.** Les offres gratuites changent, peuvent exiger une carte bancaire ou supprimer les ressources inactives. Ne jamais traiter un palier gratuit comme une sauvegarde ou une garantie de disponibilité.

## Préparer le serveur Linux

1. Choisir une région proche des fidèles et vérifier les règles locales de protection des données.
2. Installer Docker Engine et le plugin Compose depuis les dépôts officiels de la distribution, avec les mises à jour de sécurité activées. Aucun service distant n’est installé ou activé par cette documentation.
3. Configurer le DNS du domaine vers l’adresse du serveur. Au pare-feu, n’autoriser en entrée que SSH depuis des adresses d’administration connues, TCP 80 et TCP 443. Ne pas ouvrir PostgreSQL (5432), l’API (3000) ni le site (8080).
4. Copier le dépôt dans un répertoire de déploiement non public, puis créer un fichier de variables dédié à la production à partir de `.env.example`. Compléter les valeurs localement dans un gestionnaire de secrets ou un éditeur sécurisé. Ne pas envoyer ni coller le fichier `.env` dans un rapport. Utiliser des secrets aléatoires distincts pour PostgreSQL, JWT, TOTP et les sauvegardes. `POSTGRES_APP_PASSWORD` entre dans une URL PostgreSQL : le générer avec un alphabet compatible URL (par exemple base64url) pour éviter les erreurs d’encodage. Le compte DB applicatif n’est pas superutilisateur ; les migrations sont lancées séparément.
5. Le fichier Compose ne démarre pas les migrations automatiquement. Examiner le statut et les SQL de migration, sauvegarder la base, puis exécuter explicitement la commande de migration documentée dans `MIGRATION_PROCEDURE.md`. Ne jamais appliquer directement les migrations historiques en attente sans revue et restauration vérifiée.

Variables obligatoires du Compose : `POSTGRES_PASSWORD`, `POSTGRES_APP_PASSWORD`, `POSTGRES_APP_DATABASE`, `FRONTEND_ORIGIN`, `JWT_ACCESS_SECRET`, `TOTP_ENCRYPTION_KEY`, `RESEND_API_KEY`, `MAIL_FROM` et `TLS_CERT_DIR`. Les opérations S3/maintenance exigent aussi `BACKUP_KEY_HEX`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY` et `S3_SECRET_KEY`. Compose échoue volontairement si une variable obligatoire manque. Ne pas inclure les véritables valeurs dans un terminal partagé ou une capture d’écran.

## TLS Let's Encrypt

Créer ou récupérer le certificat avec Certbot sur l’hôte (méthode webroot ou standalone), avant l’exposition publique. Le dossier de certificats doit contenir `live/paroisse/fullchain.pem` et `live/paroisse/privkey.pem`; pointer `TLS_CERT_DIR` sur le répertoire racine Let's Encrypt afin que les liens symboliques restent résolus. Le renouvellement doit lancer `docker compose ... exec -T nginx nginx -s reload` après un renouvellement réussi. Tester le renouvellement à blanc avant le premier renouvellement automatique. HSTS inclut les sous-domaines : n’utiliser ce domaine qu’après vérification que tous ses sous-domaines sont aussi en HTTPS.

## Démarrage contrôlé

Depuis la racine du dépôt, après configuration humaine des valeurs et du certificat, les commandes à exécuter sont :

```sh
docker compose --env-file .env.production -p amour-des-apotres -f infra/compose.yaml config --quiet
docker compose --env-file .env.production -p amour-des-apotres -f infra/compose.yaml build
docker compose --env-file .env.production -p amour-des-apotres -f infra/compose.yaml up -d postgres
docker compose --env-file .env.production -p amour-des-apotres -f infra/compose.yaml ps
```

Après revue et sauvegarde, les migrations se lancent séparément avec le fichier de maintenance :

```sh
docker compose --env-file .env.production -p amour-des-apotres -f infra/compose.yaml -f infra/compose.maintenance.yaml run --rm migrate
docker compose --env-file .env.production -p amour-des-apotres -f infra/compose.yaml up -d api web nginx
```

N’exécuter ces commandes que sur une machine préparée et après revue des migrations. Vérifier localement les routes `/health` et `/ready`, les journaux sans les publier, le renouvellement TLS, les e-mails de récupération et la restauration sur une base isolée. **Ces commandes n’ont pas été exécutées sur une vraie machine : déploiement non testé.**

## Sauvegardes chiffrées

Le service de maintenance utilise `infra/backup-s3.cjs` : `pg_dump` custom est chiffré en flux avec AES-256-GCM (32 octets aléatoires fournis en hexadécimal), puis envoyé par HTTPS vers le stockage S3-compatible distinct. Le fichier temporaire local est chiffré; le dump en clair n’est pas écrit lors de la création distante. Le serveur distant doit aussi activer son chiffrement au repos. La clé AES doit être conservée séparément du serveur et du compartiment, idéalement dans deux emplacements de récupération contrôlés. Perdre cette clé rend les archives inutilisables.

Une tâche planifiée humaine peut exécuter périodiquement :

```sh
docker compose --env-file .env.production -p amour-des-apotres -f infra/compose.yaml -f infra/compose.maintenance.yaml run --rm backup
```

La rétention est `BACKUP_RETENTION_DAYS`, défaut 35. La purge supprime uniquement les objets sous le préfixe géré par ce script après confirmation de l’horodatage; vérifier le bucket et la politique avant activation. La restauration exige une base vide nommée avec `restore` ou `archive`, une confirmation explicite, et n’utilise aucune option de nettoyage. Définir `RESTORE_DATABASE_URL`, `RESTORE_CONFIRM=RESTORE_TO_EMPTY_DATABASE` et `S3_BACKUP_KEY`, puis lancer :

```sh
docker compose --env-file .env.production -p amour-des-apotres -f infra/compose.yaml -f infra/compose.maintenance.yaml run --rm restore
```

Avant de considérer la sauvegarde valide, créer une base isolée vide sur un serveur/base de test, restaurer une archive, comparer les tables, les nombres de lignes et les relations, puis exécuter les vérifications applicatives. La restauration de production n’a pas été testée ici.

Le test automatisé `npm run backup:restore-test` est réservé à deux bases PostgreSQL de test distinctes dont les noms contiennent `test`; il refuse une source ou une cible identique à `DATABASE_URL` et refuse toute cible déjà peuplée. Lancer uniquement après avoir vérifié `TEST_SOURCE_DATABASE_URL` et `TEST_RESTORE_DATABASE_URL` sans afficher leurs identifiants. Il n’a pas été exécuté ici.

### Changer de serveur

1. Préparer un nouveau serveur avec la même version PostgreSQL/Docker et les ports minimaux.
2. Copier le dépôt et la configuration sans exposer `.env.production`; recréer les mêmes secrets depuis le gestionnaire sécurisé. Conserver la clé de sauvegarde d’origine.
3. Créer une base d’archive vide sur le serveur cible, appartenant au rôle applicatif (`docker compose --env-file .env.production -p amour-des-apotres -f infra/compose.yaml exec -T postgres createdb -U postgres --owner=paroisse_app paroisse_archive`), puis restaurer l’archive chiffrée vers cette cible. Le script refuse une cible qui n’est pas vide. Comparer tables, totaux, liens et pièces jointes externes avant toute bascule DNS.
4. Contrôler les migrations en attente; appliquer uniquement celles approuvées après sauvegarde restaurée et test. Les migrations ne remplacent jamais la restauration.
5. Faire les essais de santé, connexions, courriels, sauvegarde et restauration, puis basculer DNS. Garder l’ancien serveur intact et en lecture seule jusqu’à validation. Ne pas supprimer l’ancien volume comme étape de migration.

## Resend, quota et surveillance

Le compteur `EmailDailyUsage` borne les envois à 100 par jour UTC même si plusieurs instances tentent d’envoyer en parallèle. À 80 (configurable via `RESEND_ALERT_AT`), une notification interne est remise une fois aux comptes ADMIN/SUPER_ADMIN. Les notifications de responsabilité et rappels non urgents sont mis en file; au plafond, leur prochaine tentative est décalée au jour UTC suivant. Les liens urgents de réinitialisation ne sont pas différés avec un jeton expirant : l’utilisateur reçoit une réponse uniforme lui demandant de réessayer le lendemain si le plafond a été atteint. Les courriels non urgents sont représentés par un identifiant de modèle et l’identifiant du compte, pas par une copie du message.

Surveiller quotidiennement le statut Compose, l’espace disque, la mémoire, le certificat TLS, les échecs e-mail, le compteur quotidien, les sauvegardes et l’âge de la dernière restauration test. Configurer des alertes de coût côté fournisseur pour la carte, le calcul, le stockage, le trafic et le courrier, avec seuils à 50 %, 75 % et 90 % du budget mensuel; une offre gratuite ne garantit pas l’absence de dépassement. N’activer ni autoscaling ni ressources payantes sans décision du responsable.

Les journaux Docker sont limités à 10 Mio × 5 fichiers pour les services permanents et 10 Mio × 3 pour les tâches ponctuelles. L’accès aux journaux reste restreint au serveur; ne pas y copier le contenu des requêtes ou des variables secrètes. `/health` donne un statut minimal de processus et `/ready` confirme seulement que PostgreSQL répond. N’exposer aucun autre diagnostic public.

## À faire par un humain avant production

- Acheter/enregistrer et contrôler le domaine de la paroisse, puis vérifier DNS et HTTPS.
- Créer les comptes fournisseurs au nom de la paroisse et donner l’accès à au moins deux administrateurs humains distincts avec MFA.
- Préparer de façon sécurisée le premier compte administrateur : Compose ne lance pas le seed et ne crée pas automatiquement de compte privilégié. Faire provisionner ce compte selon la procédure d’administration approuvée, puis enrôler sa 2FA avant ouverture du site. Créer et tester un second compte administrateur distinct.
- Vérifier l’exigence de carte bancaire, limites de dépenses et alertes budget; la carte ne doit pas être un compte personnel isolé.
- Choisir la région du serveur et valider latence, résidence des données, sauvegarde et récupération.
- Générer, enregistrer hors machine et faire tourner tous les secrets (DB, JWT, TOTP, Resend, S3, sauvegarde); ne jamais réutiliser un secret de test.
- Tester la restauration chiffrée sur une base vierge, comparer les données sans afficher les noms, puis consigner le résultat et l’opérateur.
- Vérifier l’identité du domaine expéditeur, les messages de récupération et les limites effectives du compte Resend.
- Tester sur de vrais téléphones : navigation 360 px, connexion sous les rôles prévus, cookies HTTPS et saisie/synchronisation des présences.
- Faire examiner les migrations de développement encore en attente, l’audit npm et les procédures 2FA avant tout transfert de données réelles.

## État vérifiable

Configuration préparée; **non testée sur une vraie machine Linux**. Pour le contrôle statique sans démarrer de conteneur, lancer la commande `docker compose ... config --quiet` ci-dessus avec toutes les variables fictives; pour un vrai test, suivre l’ordre de démarrage sur une VM jetable avec une base de test neuve. Ne pas utiliser la base de développement pour valider ce déploiement.
