# Préparation du déploiement Railway

**État : préparation seulement. Aucun service ni domaine Railway n’a été créé ou testé.** Les tarifs, régions et sauvegardes à vérifier chez Railway. Railway termine TLS à son réseau d’entrée, voit le trafic en clair à cette entrée et héberge la base et les autres données : l’information de confidentialité destinée aux personnes doit le dire.

## Architecture cible

Créer un projet Railway avec trois services dans le même environnement :

| Service | Image / source | Réseau et exposition |
|---|---|---|
| `web` | `infra/Dockerfile.web.railway` | Seul service avec domaine public. Nginx sert Angular et relaie `/api/` vers `api.railway.internal:3000`. Port d’écoute `8080`. |
| `api` | `infra/Dockerfile.api`, cible finale `runtime` | Aucun domaine public. Écoute le port `3000`, accessible depuis le réseau privé uniquement. |
| PostgreSQL | PostgreSQL géré Railway | Connexion privée référencée par `DATABASE_URL`; aucun TCP Proxy public. |

Le navigateur et l’API partagent l’origine du domaine `web`; la configuration du frontend continue d’appeler `/api/v1`. Le fichier `infra/railway-web.conf.template` n’accepte qu’une variable de substitution `API_PRIVATE_HOST`, afin que `envsubst` ne modifie pas les variables Nginx. Sur Railway, définir `API_PRIVATE_HOST` à l’aide de la référence privée Railway `api.railway.internal:3000`. Le service API écoute sur `0.0.0.0` et Railway fournit `PORT`; vérifier que sa valeur reste `3000` pour correspondre au routage privé.

Railway documente les en-têtes d’entrée `X-Real-IP` et `X-Forwarded-Proto`, et les noms privés au format `<service>.railway.internal` ([en-têtes réseau](https://docs.railway.com/networking/public-networking/specs-and-limits), [réseau privé](https://docs.railway.com/networking/private-networking)). Nginx relaie `X-Real-IP` comme `X-Forwarded-For` vers l’API et efface `CF-Connecting-IP`. L’API ne fait confiance qu’au nombre de sauts déclaré. Pour cette chaîne `Railway edge → Nginx web → API`, définir `TRUST_PROXY_DEPTH=1` : du point de vue de l’API, Nginx est son seul proxy direct et n’a réécrit `X-Forwarded-For` qu’à partir du `X-Real-IP` d’entrée fourni par Railway.

## Construire et configurer les services

1. Dans Railway, créer un compte/projet au nom de la paroisse, activer MFA et désigner au moins deux administrateurs humains. Créer séparément les environnements production et test; ne jamais brancher le service test sur la base production.
2. Ajouter le service de base PostgreSQL gérée. Utiliser les variables de connexion privées référencées par Railway dans l’API et dans le job de migration. Ne pas activer le TCP Proxy/public networking de PostgreSQL.
3. Sur la base vide, provisionner l’utilisateur applicatif et le rôle de migration séparé avec `npm run db:least-privilege` (nécessite `psql` et un `PG_ADMIN_URL` privé d’administration à usage ponctuel). Le script refuse une base `public` non vide. Vérifier avec l’humain que les permissions de rôle nécessaires sont disponibles sur le plan PostgreSQL géré; ne jamais donner `PG_ADMIN_URL` à l’API.
4. Créer `api` depuis le dépôt, Dockerfile `infra/Dockerfile.api`, cible de production `runtime`; retirer tout domaine public. Définir `PORT=3000`, `APP_PUBLIC_URL` avec l’origine HTTPS exacte du domaine web, et `TRUST_PROXY_DEPTH=1`. Définir les autres secrets API dans l’espace de variables Railway, jamais dans le dépôt.
5. Créer `web` depuis le même dépôt avec `infra/Dockerfile.web.railway`, port cible `8080`, et `API_PRIVATE_HOST` comme référence au domaine privé et port de l’API. Attribuer à `web` seul le domaine `*.up.railway.app` pour les essais puis le domaine de la paroisse. Le build web utilise les dépendances de développement seulement dans l’étape de compilation; l’image finale est Nginx non-root avec les seuls fichiers Angular statiques.
6. Vérifier le domaine et le certificat HTTPS Railway. Forcer HTTPS, n’accepter aucun accès public HTTP à l’API ou à la base, et vérifier la redirection/les cookies Secure depuis un vrai navigateur.
7. Configurer les limites d’usage et alertes Railway avant d’ouvrir le domaine aux fidèles. Fixer une limite de dépense adaptée et alerter les administrateurs avant de l’atteindre; surveiller aussi les volumes PostgreSQL, CPU, mémoire, erreurs et disponibilité.

### Image et migration

L’image runtime API est assemblée dans `infra/Dockerfile.api` après `npm ci --omit=dev --omit=optional`, et sa garde vérifie que Prisma CLI, Nest CLI et Jest ne s’y trouvent pas. Prisma Client demeure une dépendance d’exécution. Cette variante n’a pas été exécutée dans Docker ici; il faut vérifier sur une image réelle que Prisma Client et son moteur natif fonctionnent avec cette omission d’optionnels avant de la promouvoir.

Les migrations sont distinctes du démarrage API : `infra/Dockerfile.migrate.railway` est une image/job ponctuel non public, non-root, qui garde la CLI Prisma dans son environnement isolé. Configurer son `DATABASE_URL` avec la référence privée PostgreSQL et le compte migrateur (distinct du compte applicatif), puis exécuter une seule fois `npm run prisma:deploy --workspace @paroisse/api` avant le déploiement applicatif qui dépend du nouveau schéma. Ne pas lancer `migrate dev` en production et ne pas démarrer ce job à chaque redémarrage de l’API. Faire une sauvegarde et vérifier son intégrité avant toute migration. `infra/Dockerfile.api` garde aussi sa cible de migration Compose pour l’exploitation Docker existante.

## Variables d’environnement

Les noms ci-dessous sont les seuls à configurer pour ce déploiement. Les valeurs secrètes ne doivent être créées, partagées et renouvelées que dans le coffre de variables Railway. L’application existante refuse le démarrage en `NODE_ENV=production` si un secret requis est absent, trop court, d’exemple, ou si `APP_PUBLIC_URL` n’est pas une origine HTTPS exacte. Le nouveau `TRUST_PROXY_DEPTH` est également requis et doit être un entier entre 1 et 5.

| Nom de variable | Où la définir |
|---|---|
| `NODE_ENV` | Service API production et service API de test, avec environnements distincts |
| `DATABASE_URL` | API production (connexion privée, rôle applicatif); job migrate (connexion privée, rôle migrateur distinct) |
| `TEST_DATABASE_URL` | Runner e2e de test uniquement; base isolée avec données fictives |
| `JWT_ACCESS_SECRET`, `TOTP_ENCRYPTION_KEY` | Secrets propres à l’API production; secrets indépendants pour test |
| `RESEND_API_KEY`, `MAIL_FROM` | API production; service/valeurs de test séparés sans adresse réelle de fidèle |
| `APP_PUBLIC_URL`, `TRUST_PROXY_DEPTH`, `PORT` | API production; variable proxy requise seulement en production |
| `API_PRIVATE_HOST` | Service web seulement, référence au DNS privé du service API |
| `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_DAYS`, `2FA_REQUIS_RESPONSABLES` | API production et environnement de test séparé |
| `RESEND_DAILY_LIMIT`, `RESEND_ALERT_AT` | API production et valeurs de test isolées |
| `ATTENDANCE_GRACE_MINUTES`, `DATA_RETENTION_MONTHS`, `AUDIT_RETENTION_MONTHS` | API production et valeurs de test isolées |
| `PG_ADMIN_URL` | Provisionnement ponctuel de rôles sur une base vide; jamais dans les services runtime |
| `PAROISSE_APP_DATABASE`, `PAROISSE_APP_USER`, `PAROISSE_APP_PASSWORD` | Provisionnement; la paire utilisateur/mot de passe applicative est ensuite référencée dans l’API |
| `PAROISSE_MIGRATION_USER`, `PAROISSE_MIGRATION_PASSWORD` | Provisionnement; identifiants séparés utilisés seulement par le job migrate |

Ne definir aucune URL de base production sur le service web. Garder les environnements Railway et les secrets separes. Definir DATABASE_URL independamment sur API et job migrate, par references privees vers la meme base, mais avec leurs roles PostgreSQL propres. Aucun secret admin ou migration dans le conteneur API.

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

## Domaine, retour arrière et sortie de Railway

Attacher le domaine détenu par la paroisse uniquement à `web`, vérifier le certificat HTTPS, la redirection sécurisée, HSTS, CSP, cookies HttpOnly/Secure/SameSite=Strict, CORS limité à `APP_PUBLIC_URL` et les réponses `/api/*` en `Cache-Control: no-store` et `Pragma: no-cache`. Ajouter des règles edge de limitation pour login, récupération du mot de passe et 2FA sans remplacer le contrôle API. Vérifier que seule l’API et PostgreSQL n’ont pas de domaine public.

Pour revenir à la version précédente, redéployer l’image immuable précédente de `web` et `api`. Ne pas restaurer automatiquement la base ni annuler une migration : les migrations peuvent être irréversibles. Si une migration doit être compensée, arrêter l’écriture, prendre une sauvegarde, appliquer une migration corrective explicitement conçue, ou restaurer dans une nouvelle base isolée puis basculer après comparaison approuvée. Conserver l’ancien déploiement tant que santé, connexion et feuilles de présence sont vérifiées.

Pour quitter Railway, exporter PostgreSQL chiffré et authentifié, restaurer et vérifier sur le serveur Docker cible, installer les mêmes versions d’images, reporter les secrets par un coffre, lancer les migrations avec le compte migrateur dédié, puis contrôler `/health`, `/ready`, connexion, confidentialité des noms, tâches planifiées et sauvegardes. Basculer DNS uniquement après le test de restauration et les essais de réseau/TLS. Garder l’environnement Railway et sa base intactes jusqu’à validation finale.

## État des tests de déploiement

**Non testé :** création des services Railway, réseau privé, variable d’en-tête Railway, domaine et certificat, comportement TLS et cookies derrière proxy, disponibilité/région, migrations via rôle distant, sauvegardes/restauration gérées, coûts et limites. Ces contrôles exigent un compte, une région, un domaine et une vraie base dédiés; aucune ressource n’a été créée.

Commandes locales de contrôle applicatif :

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd test
$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run test:e2e
npm.cmd run test:playwright
```

Tests manuels après déploiement, avec des données fictives : ouvrir le domaine public et vérifier qu’il n’existe qu’un point d’entrée public; appeler l’API via `/api/v1/health` et vérifier `no-store`, les en-têtes de sécurité, les cookies et CORS; envoyer de faux `X-Forwarded-For`/`CF-Connecting-IP` depuis un client et confirmer que les requêtes restent limitées par la véritable IP; vérifier l’accès privé PostgreSQL depuis API/migration et son refus depuis Internet; exécuter une migration approuvée sur environnement de préproduction; faire et restaurer une sauvegarde sur une nouvelle base isolée.
