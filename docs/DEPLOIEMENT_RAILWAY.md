# Préparation du déploiement Railway

**État : préparation seulement. Aucun service ni domaine Railway n’a été créé ou testé.** Les tarifs, régions et sauvegardes à vérifier chez Railway. Railway termine TLS à son réseau d’entrée, voit le trafic en clair à cette entrée et héberge la base et les autres données : l’information de confidentialité destinée aux personnes doit le dire.

## Configuration Railway du service API

Le message Railpack `No start command detected` s'explique par les manifestes précédents : le dépôt racine n'avait pas de script npm `start`, et `apps/api/package.json` ne déclarait que `start:dev` (Railpack ne traite pas ce nom comme commande de démarrage). Le Dockerfile API est situé dans `infra/Dockerfile.api`, pas à la racine; Railway ne le sélectionne donc pas automatiquement. Le journal fourni confirme que le déploiement a choisi Railpack. Cela n'exclut pas d'autres erreurs ultérieures : le Build Log du prochain déploiement doit être relu.

La voie de production prévue est le Dockerfile `infra/Dockerfile.api`, pas Railpack. Les scripts npm `start` restent présents comme secours de détection/diagnostic, mais ne remplacent pas la configuration de l’image de production :

1. **Chemin recommandé, image de production prévue :** dans les paramètres Build du service `api`, sélectionner le builder Dockerfile et le chemin `infra/Dockerfile.api`, avec la racine du dépôt comme contexte. Cette image exécute le build Nest, installe seulement les dépendances de production dans son runtime et démarre `node apps/api/dist/apps/api/src/main.js`. Ne configurez pas une commande qui lance une compilation au redémarrage.
2. **Secours temporaire uniquement :** si Railpack est imposé pour diagnostiquer l’ancienne erreur, le script racine `npm start` délègue à `npm run start:prod --workspace @paroisse/api`; le workspace API démarre le fichier compilé `dist/apps/api/src/main.js`. Le Build Command doit alors être `npm run build --workspace @paroisse/api`. Ne retenez pas ce chemin pour la production : il ne fournit pas les garanties de l’image runtime multi-étapes, qui sépare les dépendances d’exécution de la CLI Prisma et des outils de build.

Pour le service API Railway, garder la racine `/` (contexte partagé du monorepo), définir `PORT=3000`, et ne lui attribuer aucun domaine public. Avec le Dockerfile de production, ne configurez pas de Build Command ou Start Command Railpack personnalisé : son `CMD` est le point d’entrée. Le script racine `build` compile API **et** web; il n’est pas nécessaire lorsque Railway construit `infra/Dockerfile.api`.

Pour le service web, sélectionner séparément `infra/Dockerfile.web.railway` et conserver son domaine public unique. Ne configurez pas un fichier Railway global qui imposerait le Dockerfile API au service web. Les chemins Build/Start doivent être vérifiés dans les paramètres du déploiement et dans ses détails; le dépôt ne peut pas modifier la configuration déjà enregistrée dans le tableau Railway.

## Architecture cible

Créer un projet Railway avec trois services dans le même environnement :

| Service | Image / source | Réseau et exposition |
|---|---|---|
| `web` | `infra/Dockerfile.web.railway` | Seul service avec domaine public. Nginx sert Angular et relaie `/api/` vers `api.railway.internal:3000`. Port d’écoute `8080`. |
| `api` | `infra/Dockerfile.api`, cible finale `runtime` | Aucun domaine public. Écoute le port `3000`, accessible depuis le réseau privé uniquement. |
| PostgreSQL | PostgreSQL géré Railway | Connexion privée référencée par `DATABASE_URL`; aucun TCP Proxy public. |

Les services ponctuels `ops` (`infra/Dockerfile.ops.railway`) et `backup` (`infra/Dockerfile.backup.railway`) sont également internes, sans domaine ni port public. `ops` est lancé uniquement pour les commandes d'exploitation puis arrêté; `backup` est un Cron Job. L'environnement `staging` utilise une application et une base Railway distinctes.

Le navigateur et l’API partagent l’origine du domaine `web`; la configuration du frontend continue d’appeler `/api/v1`. Le fichier `infra/railway-web.conf.template` n’accepte qu’une variable de substitution `API_PRIVATE_HOST`, afin que `envsubst` ne modifie pas les variables Nginx. Sur Railway, définir `API_PRIVATE_HOST` à l’aide de la référence privée Railway `api.railway.internal:3000`. Le service API écoute sur `0.0.0.0` et Railway fournit `PORT`; vérifier que sa valeur reste `3000` pour correspondre au routage privé. Nginx utilise ce nom dans une variable de proxy et transmet `$request_uri` afin que le résolveur privé renouvelle l’adresse après un redéploiement de l’API; un `proxy_pass` statique pourrait conserver une ancienne IP.

Railway documente les en-têtes d’entrée `X-Real-IP` et `X-Forwarded-Proto`, et les noms privés au format `<service>.railway.internal` ([en-têtes réseau](https://docs.railway.com/networking/public-networking/specs-and-limits), [réseau privé](https://docs.railway.com/networking/private-networking)). Nginx relaie `X-Real-IP` comme `X-Forwarded-For` vers l’API et efface `CF-Connecting-IP`. L’API ne fait confiance qu’au nombre de sauts déclaré. Pour cette chaîne `Railway edge → Nginx web → API`, définir `TRUST_PROXY_DEPTH=1` : du point de vue de l’API, Nginx est son seul proxy direct et n’a réécrit `X-Forwarded-For` qu’à partir du `X-Real-IP` d’entrée fourni par Railway.

## Construire et configurer les services

1. Dans Railway, créer un compte/projet au nom de la paroisse, activer MFA et désigner au moins deux administrateurs humains. Créer séparément les environnements production et test; ne jamais brancher le service test sur la base production.
2. Ajouter le service de base PostgreSQL gérée. Utiliser les variables de connexion privées référencées par Railway dans l’API et dans le job de migration. Ne pas activer le TCP Proxy/public networking de PostgreSQL.
3. Sur la base vide, provisionner l’utilisateur applicatif et le rôle de migration séparé depuis le service interne `ops` avec `node scripts/db-least-privilege.cjs` et un `PG_ADMIN_URL` privé temporaire. Le script refuse une base `public` non vide. Ne lancez pas cette commande sur le poste local et ne donnez jamais `PG_ADMIN_URL` à l’API.
4. Créer `api` depuis le dépôt, Dockerfile `infra/Dockerfile.api`, cible de production `runtime`; retirer tout domaine public. Définir `PORT=3000`, `APP_PUBLIC_URL` avec l’origine HTTPS exacte du domaine web, et `TRUST_PROXY_DEPTH=1`. Définir les autres secrets API dans l’espace de variables Railway, jamais dans le dépôt.
5. Créer `web` depuis le même dépôt avec `infra/Dockerfile.web.railway`, port cible `8080`, et `API_PRIVATE_HOST` comme référence au domaine privé et port de l’API. Attribuer à `web` seul le domaine `*.up.railway.app` pour les essais puis le domaine de la paroisse. Le build web utilise les dépendances de développement seulement dans l’étape de compilation; l’image finale est Nginx non-root avec les seuls fichiers Angular statiques.
6. Vérifier le domaine et le certificat HTTPS Railway. Forcer HTTPS, n’accepter aucun accès public HTTP à l’API ou à la base, et vérifier la redirection/les cookies Secure depuis un vrai navigateur.
7. Configurer les limites d’usage et alertes Railway avant d’ouvrir le domaine aux fidèles. Fixer une limite de dépense adaptée et alerter les administrateurs avant de l’atteindre; surveiller aussi les volumes PostgreSQL, CPU, mémoire, erreurs et disponibilité.

### Image et migration

L’image runtime API est assemblée dans `infra/Dockerfile.api` après `npm ci --omit=dev --omit=optional`, et sa garde vérifie que Prisma CLI, Nest CLI et Jest ne s’y trouvent pas. Prisma Client demeure une dépendance d’exécution. `npm run test:production-deps` installe aussi l’espace de travail API dans un répertoire temporaire avec ces mêmes options, vérifie un hachage Argon2id, puis démarre le moteur Prisma contre un port local volontairement fermé (sans toucher à une base). Ce test prouve l'installation sur le système local, mais pas l'image Alpine/Docker; Docker n’est pas disponible ici, donc le moteur Linux de production reste **non testé**.

Les migrations sont distinctes du démarrage API : `infra/Dockerfile.migrate.railway` est une image/job ponctuel non public, non-root, qui garde la CLI Prisma dans son environnement isolé. Configurer son `DATABASE_URL` avec la référence privée PostgreSQL et le compte migrateur (distinct du compte applicatif), puis exécuter une seule fois `npm run prisma:deploy --workspace @paroisse/api` avant le déploiement applicatif qui dépend du nouveau schéma. Ne pas lancer `migrate dev` en production et ne pas démarrer ce job à chaque redémarrage de l’API. Faire une sauvegarde et vérifier son intégrité avant toute migration. `infra/Dockerfile.api` garde aussi sa cible de migration Compose pour l’exploitation Docker existante.

La migration `20261106010000_responsible_profiles_and_faithful_details` ajoute le sexe aux profils, les champs grade/fonction/sexe au registre partagé et le jeton temporaire de complétion des profils responsables. Elle doit être appliquée avant de déployer ces parcours; sans elle, le registre et les demandes responsables peuvent échouer sur une base plus ancienne. Les demandes antérieures à cette migration restent approuvables sans photo; la photo est exigée pour les nouvelles demandes.

## Variables d’environnement

Les noms ci-dessous sont les seuls à configurer pour ce déploiement. Les valeurs secrètes ne doivent être créées, partagées et renouvelées que dans le coffre de variables Railway. L’application existante refuse le démarrage en `NODE_ENV=production` si un secret requis est absent, trop court, d’exemple, ou si `APP_PUBLIC_URL` n’est pas une origine HTTPS exacte. Le nouveau `TRUST_PROXY_DEPTH` est également requis et doit être un entier entre 1 et 5.

| Nom de variable | Où la définir |
|---|---|
| `NODE_ENV` | Service API production et service API de test, avec environnements distincts |
| `DATABASE_URL` | API production (connexion privée, rôle applicatif); job migrate (connexion privée, rôle migrateur distinct) |
| `TEST_DATABASE_URL` | Runner e2e de test uniquement; base isolée avec données fictives |
| `JWT_ACCESS_SECRET` | Secret aléatoire d’au moins 32 octets, propre à chaque environnement. |
| `RESEND_API_KEY`, `MAIL_FROM` | API production; service/valeurs de test séparés sans adresse réelle de fidèle |
| `APP_PUBLIC_URL`, `TRUST_PROXY_DEPTH`, `PORT` | API production; variable proxy requise seulement en production |
| `API_PRIVATE_HOST` | Service web seulement, référence au DNS privé du service API |
| `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_DAYS` | API production et environnement de test séparé |
| `RESEND_DAILY_LIMIT`, `RESEND_ALERT_AT` | API production et valeurs de test isolées |
| `ATTENDANCE_GRACE_MINUTES`, `DATA_RETENTION_MONTHS`, `AUDIT_RETENTION_MONTHS` | API production et valeurs de test isolées |
| `PG_ADMIN_URL` | Provisionnement ponctuel de rôles sur une base vide; jamais dans les services runtime |
| `PAROISSE_APP_DATABASE`, `PAROISSE_APP_USER`, `PAROISSE_APP_PASSWORD` | Provisionnement; la paire utilisateur/mot de passe applicative est ensuite référencée dans l’API |
| `PAROISSE_MIGRATION_USER`, `PAROISSE_MIGRATION_PASSWORD` | Provisionnement; identifiants séparés utilisés seulement par le job migrate |

Ne definir aucune URL de base production sur le service web. Garder les environnements Railway et les secrets separes. Definir DATABASE_URL independamment sur API et job migrate, par references privees vers la meme base, mais avec leurs roles PostgreSQL propres. Aucun secret admin ou migration dans le conteneur API.

La migration `20261029000000_week_program_and_treasury` ajoute les rôles secrétaire de programme et trésorier ainsi que leurs tables. Avant déploiement, effectuer et vérifier une sauvegarde restaurable, puis déployer l’API avec les migrations. Les utilisateurs ne peuvent se connecter à ces espaces qu’après validation administrative. Les liens photo/justificatif doivent être HTTPS; aucun stockage de fichiers n’est configuré.

## Adresse IP, limiteur et capacité

`infra/nginx-main.railway.conf` calcule également ses limites Nginx avec la valeur Railway `X-Real-IP`; la configuration refuse les écritures `/api/` si ce champ d’entrée est absent. `infra/railway-web.conf.template` transmet cette adresse en `X-Forwarded-For`; Express n’accepte qu’un saut proxy et `RateLimitGuard` utilise `request.ip`. Le client ne peut pas contacter l’API directement si son service n’a aucun domaine public et reste dans le réseau privé. **La garantie que Railway remplace un en-tête client du même nom doit être confirmée lors d’un déploiement réel**; la vérification locale prouve le rejet de l’usurpation directe sur l’API, pas le comportement du proxy distant.

Le limiteur applicatif est une `Map` dans le processus API. Avec une instance API unique, le compteur s’applique à cette instance, mais il est perdu au redémarrage/redéploiement. Ne pas lancer plusieurs réplicas en pensant obtenir une limite globale : chaque instance aurait son propre compteur, un attaquant pourrait répartir ses requêtes, et les contrôles de taux deviendraient incohérents. Garder une instance API unique au départ et surveiller les redémarrages. (Nginx a ses propres zones temporaires, elles aussi limitées à l’instance web.)

Si plusieurs instances deviennent nécessaires, concevoir et tester une migration vers un stockage partagé atomique (PostgreSQL avec compte/transactions et table dédiée ou autre service adapté), avec fenêtres et clés compatibles; ne pas simplement partager une Map. Évaluer également la purge planifiée pour s’assurer que le verrou transactionnel partagé est utilisé par chaque replica.

Les tests locaux vérifient déjà que `X-Forwarded-For` et `CF-Connecting-IP` falsifiés sur une connexion directe ne changent pas l’IP ni ne contournent le limiteur lorsque le proxy n’est pas dans la liste de confiance. Le test unitaire ajouté valide que la profondeur est requise et bornée en production. **Non testé :** comportement réel des en-têtes Railway, Nginx, l’API privée et l’adresse du visiteur dans le service déployé; vérifier les logs de test sans journaliser les en-têtes ni IP nominatives, puis lancer des requêtes directes falsifiées et confirmer le même 429 pour une seule adresse observée.

## Tâches de purge

`RetentionService` est exécuté dans le service API par Nest Schedule, une fois par jour à 02:00 Africa/Porto-Novo. Une transaction PostgreSQL tente un verrou consultatif avant d’anonymiser les noms anciens, figer les totaux, purger les journaux selon la conservation configurée (minimum 36 mois), supprimer les refresh tokens expirés et supprimer les jetons de réinitialisation expirés ou utilisés. Le verrou est libéré par PostgreSQL à la fin de transaction, y compris en cas d’erreur; une tâche concurrente retourne sans refaire la purge. Les opérations sont idempotentes.

Les tests unitaires couvrent conservation des totaux, seuil d’audit et refus de double exécution par absence de verrou. Ils ne prouvent pas l’ordonnancement réel ou le comportement de verrous de PostgreSQL Railway. En production, contrôler l’exécution via les métriques agrégées et les journaux sans données personnelles, puis vérifier une première fois le résultat sur une base restaurée et fictive.

## Sauvegarde et restauration

Utiliser un stockage chiffré distinct de Railway et de la base, avec clés dans un gestionnaire de secrets séparé. Le dépôt possède les scripts `infra/backup.sh`, `infra/backup-restore-test.sh` et le flux chiffré S3 configuré par variables (`BACKUP_DATABASE_URL`, variables `S3_*`, `BACKUP_KEY_HEX`, `BACKUP_RETENTION_DAYS`). La sauvegarde PostgreSQL est au format custom (`pg_dump -Fc -f`), puis chiffrée avec authentification avant transfert; conserver la rétention configurée (35 jours par défaut), vérifier le code retour et l’authenticité avant tout usage.

Procédure humaine avant mise en production :

1. Exécuter une sauvegarde de production vers le stockage distinct et confirmer qu’elle est chiffrée et présente.
2. Créer une nouvelle base de restauration isolée, sans remplacer ni vider une base existante; définir explicitement la cible de restauration et exiger une confirmation séparée.
3. Déchiffrer dans un répertoire temporaire protégé, vérifier l’authenticité, restaurer la sauvegarde sur la base neuve, puis comparer tables, lignes, contraintes, totaux et accès applicatif sans afficher les noms.
4. Documenter la durée de restauration et supprimer le support temporaire chiffré seulement après validation et selon la politique approuvée. Une sauvegarde n’est pas considérée vérifiée tant qu’une restauration réelle n’a pas réussi.

Ne jamais prendre la connexion publique `DATABASE_PUBLIC_URL` ou une adresse TCP Proxy pour l’application; utiliser la référence privée du service PostgreSQL. Vérifier chaque mois les résultats de sauvegarde et au moins trimestriellement effectuer une restauration isolée. Aucune sauvegarde/restauration Railway réelle n’a été faite par moi.

## Jobs internes d'exploitation

Ne donnez aucun domaine public aux services `ops` et `backup`. Le job `ops` se construit avec `infra/Dockerfile.ops.railway` : il contient Prisma CLI, le client généré, les commandes d'administration et `psql`, tourne sous `node` et reste uniquement sur le réseau privé Railway. Il est prévu comme service opérateur temporaire (commande de démarrage en attente, sans port publié); arrêtez/supprimez ce service une fois les tâches finies. Railway SSH exige une clé enregistrée et exécute la commande dans le conteneur distant, donc les URL privées ne sont pas utilisées depuis le poste local ([Railway SSH](https://docs.railway.com/cli/ssh)). Un service sans domaine public peut nécessiter le `Service Instance ID` comme cible SSH; utiliser « Copy SSH Command » depuis le menu du service/instance si `--service ops` ne résout pas la cible.

Exemples de commandes à lancer depuis un terminal local connecté au bon projet et environnement Railway :

```powershell
railway ssh --environment production --service ops -- npm run admin:bootstrap --workspace @paroisse/api -- --email=adresse-du-responsable@domaine-paroissial.example
railway ssh --environment production --service ops -- node scripts/db-least-privilege.cjs
railway ssh --environment production --service ops -- npm run prisma:deploy --workspace @paroisse/api
```

Pour `admin:bootstrap`, le terminal distant demande deux fois le mot de passe sans l'afficher. Le script ne produit aucun mot de passe, ne change rien s'il existe déjà un SUPER_ADMIN et marque le compte `mustChangePassword`; aucune donnée de compte existant n'est réinitialisée. À la première connexion, le titulaire doit immédiatement remplacer le mot de passe temporaire. Exécuter le bootstrap une seule fois avec une adresse de responsable vérifiée. La commande est sérialisée par verrou consultatif et recontrôle le compte dans la transaction.

La connexion à l’application utilise uniquement l’adresse e-mail et le mot de passe. Aucun code de double vérification n’est demandé.

Pour les rôles PostgreSQL, fournir temporairement au seul service `ops` `PG_ADMIN_URL` (URL Railway privée d'administration), `PAROISSE_APP_DATABASE`, `PAROISSE_APP_USER`, `PAROISSE_APP_PASSWORD`, `PAROISSE_MIGRATION_USER` et `PAROISSE_MIGRATION_PASSWORD`. Les deux mots de passe sont générés indépendamment dans le coffre Railway. Lancer `node scripts/db-least-privilege.cjs` sur une base vierge; le script refuse un schéma public non vide. Il crée/modifie les attributs de moindre privilège sans remplacer les mots de passe de rôles déjà créés; il accorde à l'app les opérations CRUD et les séquences, et au migrateur la création d'objets. Il ne rend aucun rôle superutilisateur et ne transfère pas la propriété de la base. Une fois les URL de connexion app et migration créées, retirer immédiatement `PG_ADMIN_URL` et les variables temporaires de mots de passe du job, puis vérifier les droits par connexion. Ne jamais activer le TCP Proxy.

Pour une migration approuvée, affecter au job `ops` la connexion privée du rôle migrateur dans sa variable `DATABASE_URL`, puis exécuter la dernière commande ci-dessus. `api` garde sa propre `DATABASE_URL` avec le rôle applicatif. Ne pas utiliser `railway run` depuis le PC pour ces URL privées; la commande doit être lancée par `railway ssh` dans le service privé.

## Sauvegarde planifiée et restauration

Créer `backup` depuis `infra/Dockerfile.backup.railway`, sans domaine public. Ce conteneur non-root embarque `pg_dump` et installe uniquement les dépendances de production (`npm ci --omit=dev --omit=optional`). Sa commande de démarrage est `node infra/backup-s3.cjs create`. Dans Settings → Deploy → Cron Schedule, définir `10 1 * * *` (UTC; cible indicative 02:10 à Cotonou), et affecter à ce service une URL PostgreSQL privée de lecture/sauvegarde et les variables du stockage S3 compatible. Railway lance la commande selon le planning UTC et ignore une occurrence si la précédente tourne encore; le processus doit finir et quitter ([Cron Jobs Railway](https://docs.railway.com/cron-jobs)).

Le script lance un dump PostgreSQL `--format=custom`/`-Fc`, chiffre le flux avec AES-256-GCM authentifié, envoie le seul objet chiffré vers l'endpoint S3 HTTPS externe à Railway, puis supprime les objets plus vieux que `BACKUP_RETENTION_DAYS` (35 par défaut), y compris les versions historiques et marqueurs expirés. Accorder à l'identité S3 uniquement l'écriture, la lecture du préfixe de sauvegarde, `ListBucket`, `ListBucketVersions`, `DeleteObject` et `DeleteObjectVersion`; aucun accès à d'autres buckets n'est requis. Les erreurs de pg_dump, chiffrement, upload ou suppression donnent un code de sortie d'échec; la sortie ne contient ni noms, ni URL, ni clé. Variables à configurer uniquement sur `backup` : `BACKUP_DATABASE_URL`, `BACKUP_KEY_HEX`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `BACKUP_RETENTION_DAYS`.

Pour tester la restauration, créer temporairement un service `restore-once` depuis la même image, sans domaine, avec la commande de démarrage `node infra/backup-s3.cjs restore "$S3_BACKUP_KEY"`, les variables source/S3 requises, et `RESTORE_DATABASE_URL` pointant vers une base neuve. Ajouter temporairement un Cron Schedule pour ce service, puis le déclencher immédiatement avec `railway cron run --environment production --service restore-once` ([Railway cron CLI](https://docs.railway.com/cli/cron)); après le résultat, retirer le service ou son planning. Définir `RESTORE_CONFIRM=RESTORE_TO_EMPTY_DATABASE`. Le script refuse une base avec tables, vues, séquences ou autres objets publics, vérifie l'authenticité GCM, exécute `pg_restore` sans `--clean`/`--create`, puis compte les lignes de toutes les tables restaurées et affiche uniquement le nombre de tables et le total de lignes. Il ne touche jamais à la source. Les variables de destination ne sont présentes que pendant ce job. Le script local `npm run backup:restore-test` vérifie en plus un dump frais contre la source isolée. Une sauvegarde historique n'est validée qu'après restauration réussie sur une base vide et examen des comptages sans exposer de noms.

Les sauvegardes intégrées Railway, leurs limites de rétention, leur chiffrement, leur granularité, leur disponibilité par région, leurs coûts et leur méthode de restauration sont **à vérifier chez Railway**; elles ne remplacent pas l'archive chiffrée indépendante ni le test de restauration. Aucun dump ou restore Railway réel n'a été exécuté ici.

## Environnement staging

Créer un environnement Railway `staging` distinct, avec un service PostgreSQL distinct et ses propres secrets. Ne réutiliser aucune référence ni aucun secret de production; seules des données fictives y sont admises. Construire le web depuis `infra/Dockerfile.web.railway.staging`. Le build Angular remplace l'environnement par `environment.staging.ts` et affiche une bannière rouge « ENVIRONNEMENT DE TEST — DONNÉES FICTIVES UNIQUEMENT »; Nginx envoie `X-Robots-Tag: noindex, nofollow, noarchive`. Le diagnostic proxy reste désactivé par défaut.

Le script `scripts/seed-staging-fake.cjs` ne lit pas `DATABASE_URL`; il se connecte uniquement à `STAGING_DATABASE_URL`, exige `APP_ENVIRONMENT=staging`, un hôte privé Railway marqué staging/test, puis insère/upsert deux personnes aux noms manifestement fictifs `TEST-FICTIF-001/002`. Il ne crée aucun utilisateur ni aucune donnée réelle. Depuis le service `ops` de staging :

```powershell
railway ssh --environment staging --service ops -- node scripts/seed-staging-fake.cjs
```

Variables requises de staging : `APP_ENVIRONMENT`, `STAGING_DATABASE_URL`, ainsi que des secrets indépendants `JWT_ACCESS_SECRET` (au moins 32 octets), `RESEND_API_KEY`, `MAIL_FROM`, `APP_PUBLIC_URL`, `TRUST_PROXY_DEPTH`. La base de staging et ses secrets doivent être inventoriés distinctement des valeurs production. `TEST_DATABASE_URL` reste réservée au runner de tests locaux/CI et ne doit pointer ni sur staging ni sur production.

La rotation de `JWT_ACCESS_SECRET` invalide les anciens jetons d’accès. Après la rotation et le redéploiement, vérifier `/ready` et effectuer une connexion normale par adresse e-mail et mot de passe.

## Calibration sûre de l'adresse IP

La configuration web ne contient aucune liste d'adresses source Railway figée. Elle s'appuie uniquement sur le `X-Real-IP` posé au point d'entrée Railway, l'envoie comme valeur unique `X-Forwarded-For` à l'API, et retire `CF-Connecting-IP`. Les limites Nginx et NestJS se basent sur cette IP. Cela évite de casser lors d'un changement de plages d'entrée, mais fait dépendre l'identité client de l'en-tête Railway : ce comportement doit être confirmé avant production. En cas de 400 sur les écritures, vérifier sans recopier d'en-têtes complets que `X-Real-IP` est présent à l'entrée, que le service web est derrière le domaine Railway, et que le service API reste privé; ne pas assouplir la règle ni faire confiance à une IP de client.

Pour tester la chaîne en staging seulement, générer un jeton aléatoire de 32 octets en hexadécimal avec `openssl rand -hex 32`, le définir comme secret `PROXY_DIAGNOSTIC_TOKEN`, puis activer `PROXY_DIAGNOSTICS_ENABLED=1`. L’endpoint Nginx `/__ops/proxy-check` exige l’en-tête `X-Proxy-Diagnostic-Token` contenant `1-<jeton>`. Le contrôle exige le préfixe correspondant au flag et exactement 64 caractères hexadécimaux; en production, le flag `0` et le jeton `disabled` rendent la route inaccessible. Cette route n’est pas une route API et ne journalise pas les accès. La réponse donne uniquement le nombre d’éléments `X-Forwarded-For` reçu par Nginx et l’IP `X-Real-IP` qu’il transmettra. Ne jamais envoyer le jeton dans une URL; le révoquer et remettre le flag à `0` après essai.

Pour la vérification physique, connecter un téléphone à la 4G, consulter son IP publique via un fournisseur de confiance, puis faire depuis ce téléphone un GET HTTPS sur l'endpoint staging avec le jeton dans l'en-tête et comparer `resolved-ip` à l'IP publique observée. Faire un deuxième essai depuis un autre réseau. Vérifier ensuite qu'une rafale de requêtes API depuis un seul réseau déclenche la limite, tandis qu'un second réseau a son propre compteur; envoyer en plus de faux `X-Real-IP`, `X-Forwarded-For` et `CF-Connecting-IP` et confirmer qu'ils ne changent pas l'IP retenue. À l'API, Nginx est le seul saut de confiance; `TRUST_PROXY_DEPTH=1` reste donc la valeur attendue. La profondeur externe affichée sert à vérifier les en-têtes reçus par Nginx, elle ne doit pas conduire à augmenter arbitrairement la confiance Express. Refaire ces essais après tout changement de proxy Railway.

## Variables supplémentaires et séparation des environnements

Noms à configurer sans valeurs réelles dans le dépôt : `PROXY_DIAGNOSTICS_ENABLED`, `PROXY_DIAGNOSTIC_TOKEN`, `STAGING_NOINDEX`, `APP_ENVIRONMENT`, `STAGING_DATABASE_URL`, `BACKUP_DATABASE_URL`, `BACKUP_KEY_HEX`, `BACKUP_RETENTION_DAYS`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `RESTORE_DATABASE_URL`, `RESTORE_CONFIRM`, `S3_BACKUP_KEY`, `PG_ADMIN_URL`, `PAROISSE_APP_DATABASE`, `PAROISSE_APP_USER`, `PAROISSE_APP_PASSWORD`, `PAROISSE_MIGRATION_USER`, `PAROISSE_MIGRATION_PASSWORD`. Ces variables sont affectées uniquement au job concerné et à l'environnement correspondant; les variables de production, de staging et de tests sont distinctes. Les valeurs de `PG_ADMIN_URL`, des clés S3 et des mots de passe de rôle ne doivent jamais être copiées dans les journaux ou les tickets.

## État de validation de cette préparation

**Non testé** : toutes les commandes SSH et cron Railway, création/rôles d'une vraie base managée, permissions effectives de cette offre, job backup/restore S3, en-têtes réels d'un téléphone, diagnostic staging, certificats, noindex navigateur et retour arrière. Ces opérations exigent des services/domaine et des secrets créés par un humain. Docker n'est pas disponible dans cet environnement; les Dockerfiles et la configuration Nginx sont seulement soumis aux tests statiques. Après création d'un environnement staging, commande humaine de vérification : `railway ssh --environment staging --service ops -- node scripts/seed-staging-fake.cjs`; pour un test complet de l'image, construire et lancer les services via le déploiement Railway staging puis restaurer une sauvegarde sur une base vide distincte.

Commandes de build à lancer sur une machine où Docker est installé :

```sh
docker build -f infra/Dockerfile.api --target runtime -t paroisse-api:production .
docker build -f infra/Dockerfile.ops.railway -t paroisse-ops:production .
docker build -f infra/Dockerfile.backup.railway -t paroisse-backup:production .
docker build -f infra/Dockerfile.web.railway.staging -t paroisse-web:staging .
```

## Domaine, retour arrière et sortie de Railway

Attacher le domaine détenu par la paroisse uniquement à `web`, vérifier le certificat HTTPS, la redirection sécurisée, HSTS, CSP, cookies HttpOnly/Secure/SameSite=Strict, CORS limité à `APP_PUBLIC_URL` et les réponses `/api/*` en `Cache-Control: no-store` et `Pragma: no-cache`. Ajouter des règles edge de limitation pour la connexion et la récupération du mot de passe sans remplacer le contrôle API. Vérifier que seule l’API et PostgreSQL n’ont pas de domaine public.

Pour revenir à la version précédente, redéployer l’image immuable précédente de `web` et `api`. Ne pas restaurer automatiquement la base ni annuler une migration : les migrations peuvent être irréversibles. Si une migration doit être compensée, arrêter l’écriture, prendre une sauvegarde, appliquer une migration corrective explicitement conçue, ou restaurer dans une nouvelle base isolée puis basculer après comparaison approuvée. Conserver l’ancien déploiement tant que santé, connexion et feuilles de présence sont vérifiées.

Pour quitter Railway, exporter PostgreSQL chiffré et authentifié, restaurer et vérifier sur le serveur Docker cible, installer les mêmes versions d’images, reporter les secrets par un coffre, lancer les migrations avec le compte migrateur dédié, puis contrôler `/health`, `/ready`, connexion, confidentialité des noms, tâches planifiées et sauvegardes. Basculer DNS uniquement après le test de restauration et les essais de réseau/TLS. Garder l’environnement Railway et sa base intactes jusqu’à validation finale.

## Compatibilité des images avant le premier build Railway

Les images API, migration, ops, sauvegarde et compilation web utilisent `node:22-alpine`; le serveur web final utilise `nginxinc/nginx-unprivileged:1.27-alpine` (Alpine, sans Node dans l'image finale). Node 22 correspond à la version configurée dans la CI (`actions/setup-node`, `node-version: 22`) et à l'image API. La machine locale peut avoir une version Node différente : le build et le smoke test Docker restent à exécuter avant le premier déploiement. Les tags Alpine sont mobiles; pour des builds reproductibles, relever puis épingler un digest approuvé après le premier build vérifié.

Le client Prisma déclare `native` et `linux-musl-openssl-3.0.x`. La génération et le runtime API utilisent Alpine avec `openssl` installé, donc le moteur musl/OpenSSL 3 est disponible. Le runtime écoute sur `PORT` fourni par Railway (fallback local 3000); en production, `PORT` a priorité sur le port Playwright. Le Nginx web écoute sur le même `PORT` Railway, avec 8080 uniquement comme valeur locale de secours. La variable `API_PRIVATE_HOST` doit être une référence Railway vers le domaine privé et le port du service API, par exemple `${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}`.

Le proxy Nginx utilise un `proxy_pass` dynamique et le résolveur DNS privé IPv6 de Railway (`[fd12::10]`) avec revalidation toutes les 10 secondes. Ainsi, Nginx peut démarrer avant l'API et re-résoudre une adresse privée après redéploiement. Ce résolveur précis vient d'une [discussion de configuration Nginx/Railway](https://station.railway.com/questions/nginx-with-private-networking-upstream-8d7ce3c3), pas d'une garantie contractuelle : il doit être confirmé en staging. L'adressage privé est géré par Railway; les nouveaux environnements peuvent retourner A et AAAA, les anciens environnements IPv6 seulement ([documentation Railway sur les domaines privés](https://docs.railway.com/networking/domains/working-with-domains), [fonctionnement du réseau privé](https://docs.railway.com/networking/private-networking/how-it-works)). Si Nginx retourne 502, vérifier dans l'environnement staging que le nom privé et le port se résolvent depuis le conteneur web, que l'API écoute sur `PORT`, et que les deux services appartiennent au même projet et environnement. Ne pas remplacer le DNS par une IP privée copiée à la main.

Contrôles de santé : API `GET /ready` (le test de disponibilité inclut PostgreSQL), web `GET /healthz` (indépendant de l'API). L'image ops possède un contrôle de processus. Les services `migrate`, `backup` et `restore-once` sont des jobs ponctuels : leur état de santé est leur code de sortie et leur statut de job, pas une route HTTP persistante. PostgreSQL géré utilise son contrôle de disponibilité Railway.

### Smoke test dans la vraie image API

Le smoke test déjà exécuté dans un répertoire temporaire vérifie l'installation de production sur l'OS local; il ne prouve pas la compatibilité Alpine/native de l'image. Le test `npm run test:railway-image` construit le vrai stage `runtime` de `infra/Dockerfile.api`, puis exécute dans ce conteneur un hash/vérification Argon2id et l'initialisation du moteur Prisma vers un port local volontairement fermé. Il n'emploie aucune base ni variable d'URL de base. **Non exécuté par moi : Docker n'est pas installé dans cet environnement.** À lancer sur une machine avec Docker :

```powershell
npm.cmd run test:railway-image
```

### Erreurs probables au premier build et leur correction

| Symptôme | Cause probable | Vérification ou correction |
|---|---|---|
| Prisma ne trouve pas un moteur pour Alpine/OpenSSL | Client généré pour un autre OS ou bibliothèque OpenSSL absente | Garder `linux-musl-openssl-3.0.x` et `apk add --no-cache openssl` dans les étapes de génération et d'exécution; lancer `npm run test:railway-image`. |
| Argon2 échoue au chargement de son module natif | binaire natif d'un autre OS/architecture ou dépendance facultative omise | Reconstruire l'image sur sa plateforme cible et exécuter le smoke test Alpine; ne pas copier `node_modules` depuis Windows/Linux glibc. |
| Nginx échoue avec « host not found in upstream » | nom API résolu au démarrage via un upstream statique | Conserver `proxy_pass` avec variable, le résolveur Railway et `valid=10s`; vérifier la référence `API_PRIVATE_HOST` et le réseau privé commun. |
| Nginx sert le site mais les routes API répondent 502/504 | API redéployée et ancienne adresse privée mise en cache par un proxy statique, ou mauvais port/référence | `GET /healthz` vérifie uniquement Nginx; tester `/health` et `/ready` à travers le domaine web pour vérifier l’API proxifiée, puis contrôler le nom privé, le port et les journaux DNS sans copier d’URL secrète. |
| Railway affiche une erreur de port ou le service ne devient jamais prêt | processus écoutant sur un port fixe au lieu de `PORT` | Vérifier que `PORT` est défini par Railway, que NestJS et Nginx écoutent cette valeur, puis configurer le healthcheck web `/healthz` ou API `/ready`. |
| `npm ci --omit=dev --omit=optional` échoue | lockfile/manifests non synchronisés, dépendance native ou plateforme | Reproduire avec Node 22 Alpine dans le stage runtime; mettre à jour le lockfile uniquement avec une modification explicite et retester les builds/tests. |
| Build local Windows échoue avec `EPERM` sur `query_engine-windows.dll.node` | Un processus Node actif tient le moteur Prisma pendant `prisma generate` | Identifier le terminal/API/watch/test du projet qui utilise ce client, l’arrêter proprement, puis relancer `npm.cmd run build --workspace @paroisse/api`; ne pas supprimer la DLL en cours d'utilisation. |

Le premier build et le smoke test de l'image Alpine sont **non testés** ici : Docker n'est pas disponible. Commande exacte à exécuter avant le premier déploiement : `npm.cmd run test:railway-image`. Le DNS, `PORT` injecté et les healthchecks doivent ensuite être vérifiés dans un vrai service Railway de staging.

## État des tests de déploiement

**Non testé :** création des services Railway, réseau privé, variable d’en-tête Railway, domaine et certificat, comportement TLS et cookies derrière proxy, disponibilité/région, migrations via rôle distant, sauvegardes/restauration gérées, coûts et limites. Ces contrôles exigent un compte, une région, un domaine et une vraie base dédiés; aucune ressource n’a été créée.

Commandes locales de contrôle applicatif :

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd test
$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run test:e2e
npm.cmd run test:playwright
npm.cmd run test:production-deps
npm.cmd run test:railway-image
```

Tests manuels après déploiement, avec des données fictives : ouvrir le domaine public et vérifier qu’il n’existe qu’un point d’entrée public; appeler `/health` et `/ready` via le domaine web pour confirmer le proxy privé vers l’API (`/healthz` ne vérifie que Nginx), puis vérifier `no-store` et les en-têtes de sécurité; envoyer de faux `X-Forwarded-For`/`CF-Connecting-IP` depuis un client et confirmer que les requêtes restent limitées par la véritable IP; vérifier l’accès privé PostgreSQL depuis API/migration et son refus depuis Internet; exécuter une migration approuvée sur environnement de préproduction; faire et restaurer une sauvegarde sur une nouvelle base isolée.

Vérifications locales exécutées le 20 octobre 2026 : lint/typecheck réussi; tests outils 37/37; tests unitaires API 49/49; E2E PostgreSQL de test 26/26; Playwright 37/37; builds API/web et Angular staging réussis; smoke `npm run test:production-deps` réussi (Argon2id et moteur Prisma sur l'OS local). Le premier build API a rencontré une erreur transitoire `EPERM` au renommage de `query_engine-windows.dll.node`; la génération Prisma et le build complet ont réussi au nouvel essai, sans arrêt de processus. Le détenteur initial du verrou n'a pas pu être identifié. Le build d'image Docker/Alpine et `npm run test:railway-image` sont **non exécutés** car Docker est indisponible. Aucune migration ni sauvegarde distante Railway n’a été exécutée. Ces résultats locaux ne remplacent pas les contrôles Railway/Docker indiqués « non testé » ci-dessus.
