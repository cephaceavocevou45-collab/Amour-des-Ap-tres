# Audit de sécurité — Paroisse Amour des Apôtres

**État :** audit initial et première vague de corrections réalisés le 5 octobre 2026. Les statuts ci-dessous distinguent les corrections du code des vérifications encore nécessaires sur la base et l’infrastructure. **Ne pas utiliser avec des données réelles tant que les risques résiduels et migrations ne sont pas traités.**

## Périmètre et limites

Audit statique ciblé sur l’API NestJS, Prisma/PostgreSQL, le frontend Angular, les conteneurs et la configuration visible. Le dossier examiné ne contient pas de métadonnées Git (`git rev-parse --show-toplevel` échoue) : l’historique ne peut donc pas être vérifié et aucun commit par correctif ne peut être créé à cet emplacement. Aucune valeur de `.env` n’a été affichée ou copiée dans ce rapport ; la commande de validation Prisma a chargé les variables sans les afficher. Les commandes `npm audit --omit=dev --json` et `npm audit --json` ont échoué faute d’accès au point de terminaison d’audit npm ; la vulnérabilité des dépendances demeure inconnue. Les tests d’autorisation nécessitant une base de test dédiée ne sont pas réputés exécutés par la seule lecture du code.

L’application ne comporte pas de route d’upload HTTP dans le périmètre inspecté. `photoUrl` est une donnée d’URL et non un téléversement ; les contrôles de fichiers sont donc **non applicables à l’implémentation actuelle**, mais deviendront nécessaires avant tout ajout d’upload.

## Constats

| ID | Gravité | Fichiers concernés | Scénario d’attaque et constat | Correctif proposé | Statut |
|---|---|---|---|---|---|
| SEC-01 | **Critique** | `apps/api/src/auth.ts`, `apps/api/src/auth-token.ts`, `apps/api/src/auth.guard.ts`, `apps/api/prisma/schema.prisma` | Le jeton d’accès embarque le rôle et le guard fait confiance à ces claims sans relire l’état actif/le rôle en base. Après retrait de rôle, désactivation ou changement de responsabilité, un jeton déjà délivré reste exploitable jusqu’à expiration (10 min), notamment pour les routes d’administration. Des permissions changées en base ne sont pas immédiatement effectives. | Vérifier à chaque requête la révocation et le rôle actuel en base (ou une version de session révocable), réduire la durée de vie, et invalider les sessions lors des changements de rôle/désactivation/réinitialisation. | Corrigé dans le code (tests ajoutés) |
| SEC-02 | **Haute** | `apps/api/src/auth.ts`, `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`, `apps/web/src/app/admin.component.ts`, `apps/web/src/app/auth.component.ts`, migrations | `FIDELE` demeure un rôle utilisable dans le schéma, le seed, les règles d’administration et l’interface. Les demandes en attente reçoivent une session/jeton lors de l’inscription et sont enregistrées comme `FIDELE`. Ce rôle ne donne pas normalement accès à la présence, mais contredit l’absence de droits/sessions en attente et multiplie les chemins d’accès hérités. | Retirer le rôle et ses branches UI/API/seed, créer les comptes sans droit (`active=false`/état en attente explicite), ne délivrer aucune session avant approbation. Prévoir une migration non destructive désactivant les comptes historiques et révoquant leurs sessions ; sauvegarder avant migration. | Corrigé par migration à appliquer après sauvegarde |
| SEC-03 | **Haute** | `apps/api/src/auth.ts`, `apps/api/src/app.module.ts`, `apps/api/package.json`, `apps/web/src/app/auth.component.ts` | Aucun rate limiter n’est branché. Les endpoints login, inscription, récupération/réinitialisation et 2FA peuvent être bombardés ; le verrouillage après 5 échecs est uniquement par compte et peut permettre un déni de service ciblé. Les réponses de connexion varient aussi selon compte inconnu, verrouillé, mot de passe et configuration 2FA. | Ajouter un limiteur distribué par IP et par identifiant normalisé, politique de verrouillage temporisée non exploitable pour bloquer un tiers, et réponses publiques uniformes. Couvrir les endpoints concernés. | Partiellement corrigé : limiteur mémoire, pas distribué |
| SEC-04 | **Haute** | `apps/api/src/auth.ts`, `apps/api/prisma/schema.prisma` | Le reset utilise bien un token aléatoire de 32 octets haché et expirant après 30 min, mais deux requêtes concurrentes peuvent toutes deux valider le même token : lecture puis mise à jour `usedAt` ne sont pas conditionnelles/atomiques. La réinitialisation ne révoque ni `RefreshToken` ni les jetons d’accès déjà émis. | Consommer le token par mise à jour conditionnelle atomique dans une transaction et n’accepter qu’une ligne modifiée ; révoquer toutes les sessions/refresh tokens, ajouter une version de session pour invalider les access tokens existants. Ajouter test usage concurrent/réutilisé/expiré. | Corrigé dans le code (atomicité et révocation) |
| SEC-05 | **Haute** | `apps/api/src/auth.ts`, `apps/api/src/auth.guard.ts`, `apps/api/src/auth-token.ts` | `POST /auth/admin/2fa/new-secret` est public, accepte un objet non validé et renvoie un nouveau secret TOTP sans authentifier l’administrateur. `POST /auth/admin/2fa/setup` n’est pas limité et permet, avec les seules informations e-mail/mot de passe, d’enregistrer le secret choisi par l’appelant et donc de remplacer le second facteur. Les codes de secours n’existent pas. | Protéger l’initialisation par une procédure de bootstrap hors ligne ou une session d’enrôlement courte après premier facteur, interdire le remplacement sans re-authentification/ancien facteur, limiteur d’essais, DTO strict et journalisation. Ajouter et hacher des codes de secours à usage unique si requis. Vérifier que toute session admin exige le TOTP côté serveur. | Partiellement corrigé : codes de secours absents |
| SEC-06 | **Haute** | `apps/api/src/auth.ts`, `apps/api/src/auth.guard.ts`, `apps/web/src/app/auth.component.ts` | L’authentification remet le JWT d’accès au code Angular, qui le conserve dans `sessionStorage`. Une XSS sur l’origine permet de le lire. Le modèle Prisma contient `RefreshToken`, mais aucun flux de rotation/hash/détection de réutilisation n’est implémenté. Les cookies HttpOnly/Secure/SameSite et une défense CSRF correspondante ne sont pas utilisés. | Mettre les tokens dans des cookies HttpOnly, Secure, SameSite=Strict ; implémenter refresh rotatif stocké haché avec familles et détection de réutilisation/révocation ; protection CSRF pour les requêtes authentifiées par cookie. En développement HTTP local prévoir une configuration distincte. | Corrigé dans le code (cookie, rotation, CSRF) |
| SEC-07 | **Haute** | `apps/api/src/attendance.ts`, `apps/api/src/auth.ts`, `apps/api/prisma/schema.prisma` | Les gardes et contrôles d’accès existent sur les routes de présence, et le président est limité au jour assigné en base. Toutefois plusieurs contrôles sensibles reposent sur le rôle du JWT plutôt que le rôle courant en base (SEC-01). `week()` autorise l’ADMIN/SUPER_ADMIN à lire toutes les dates passées/futures fournies par `start`, alors que le périmètre demandé est la supervision ; cela expose les noms à tout compte admin sans limite de période. Aucun test IDOR/croisé entre jours, zones, feuilles, comptes et endpoints admin ne couvre ces garanties. | Centraliser des policies deny-by-default, recharger rôle/jour/zone depuis la base, borner l’historique admin et documenter la rétention ; ajouter tests d’intégration d’accès croisés pour chaque route et tests de rôle admin. | Partiellement corrigé : tests de routes incomplets |
| SEC-08 | **Haute** | `apps/api/src/attendance.ts`, `apps/api/prisma/schema.prisma` | L’ajout vérifie le statut de feuille et les doublons avant l’écriture, sans verrou/verrouillage transactionnel. Une requête concurrente peut passer après la soumission (course entre vérification et insertion), ou deux noms identiques être insérés simultanément. Le champ `ATTENDANCE_GRACE_MINUTES` existe dans Compose mais n’est pas appliqué. Aucune correction admin avec motif et audit n’est implémentée. | Faire les contrôles et mutations dans une transaction sérialisable ou conditionnelle, garantir l’unicité métier en base, appliquer la tolérance configurable, journaliser les corrections administratives avec motif et auteur. Tester heure hors plage et course de soumission. | Partiellement corrigé : verrou et audit ajoutés, tests concurrence à faire |
| SEC-09 | **Moyenne** | `apps/api/src/auth.ts`, `apps/api/src/attendance.ts` | Les DTO d’authentification et d’entrée sont validés par `ValidationPipe` global avec whitelist/forbidNonWhitelisted. En revanche le corps de `PUT /attendance/course/:date` est `any`, les valeurs ne sont pas bornées/validées par décorateurs, et `new-secret` prend un objet TypeScript brut qui n’est pas validé à l’exécution. L’action de décision n’est contrôlée que par `IsString`. | Définir des DTO explicites (longueurs, formats, tableaux, enums, champs optionnels), interdire propriétés inconnues et ajouter tests de rejet. | Corrigé dans le code (DTO stricts) |
| SEC-10 | **Moyenne** | `apps/api/src/main.ts`, `infra/nginx.conf`, `infra/compose.yaml` | Helmet est activé pour l’API et CORS utilise une seule origine configurée. La CSP Nginx autorise `style-src 'unsafe-inline'` ; le frontal n’ajoute pas HTTPS, HSTS ou redirection TLS et Compose publie le service web en HTTP. Avec cookies futurs, aucune protection CSRF n’existe (SEC-06). | CSP avec nonce/hash et suppression progressive d’unsafe-inline, déploiement derrière TLS avec HSTS, CORS exact par environnement, CSRF avant cookies. Vérifier Swagger en production et ne pas l’exposer sans décision explicite. | Partiellement corrigé : TLS de production externe requis, CSP inline restant |
| SEC-11 | **Moyenne** | `apps/api/src/auth.ts`, `apps/api/prisma/schema.prisma`, `apps/api/src/app.module.ts`, `.env.example` | Le paramètre `DATA_RETENTION_MONTHS=12` est déclaré mais aucune tâche de purge des noms/présences n’est présente. Les noms sont conservés dans `AttendanceEntry`. L’interface utilise aussi IndexedDB pour les saisies hors ligne, sans durée d’expiration/effacement automatique. | Implémenter purge configurable et auditée côté serveur ; ajouter expiration/effacement IndexedDB, éviter journaux contenant des données personnelles, définir une politique de conservation et de sauvegarde cohérente. | Partiellement corrigé : purge serveur + navigateur, restauration/sauvegardes à vérifier |
| SEC-12 | **Moyenne** | `infra/compose.yaml`, `infra/Dockerfile.web`, `infra/Dockerfile.api`, `infra/backup.sh` | Le conteneur API finit en utilisateur `node`, mais le conteneur Nginx part de l’image standard sans configuration non-root. `POSTGRES_USER=paroisse` initialise le compte propriétaire comme superutilisateur PostgreSQL, et `change-me` est la valeur de repli. La base n’a pas de port publié, ce qui est favorable. Le script chiffre les sauvegardes mais aucun test de restauration n’est fourni ; le chiffrement CBC seul n’authentifie pas l’intégrité. | Utiliser rôle bootstrap distinct et rôle runtime à privilèges minimaux, supprimer les mots de passe de repli, exécuter Nginx non-root, chiffrer avec mode authentifié ou enveloppe éprouvée et automatiser un test de restauration périodique. | Partiellement corrigé : compose non-root/rôle minimal; restauration et volume existant à traiter |
| SEC-13 | **Moyenne** | `.gitignore`, `.dockerignore`, `.env`, `.env.example`, dépôt Git absent | `.env` est ignoré par les fichiers visibles et `.env.example` contient des champs vides/valeurs d’exemple. Il est impossible de confirmer si `.env` a déjà été suivi ou si un secret a été commité, car aucun `.git` n’est présent. Les images Docker copient l’arbre de projet puis filtrent selon `.dockerignore`, qui exclut `.env`. | Vérifier dans le dépôt source réel `git ls-files` et tout l’historique avec un scanner de secrets ; si exposition, révoquer/rotater les secrets. Garder `.env` hors Git et des contextes d’image ; utiliser un gestionnaire de secrets en production. | Non vérifiable : aucun dépôt Git dans ce dossier |
| SEC-14 | **Moyenne** | `package.json`, `package-lock.json`, `.github/workflows/ci.yml` | `npm audit` complet et production n’ont pas pu obtenir les avis npm (échec réseau du registre). CI utilise `npm install` plutôt que `npm ci`, et le seuil `high` bloque en principe hauts/critiques uniquement quand npm peut joindre le registre. Aucune matrice d’exploitabilité ou chemin de dépendance n’a pu être établie. | Relancer `npm audit --omit=dev` et complet en CI connectée, enregistrer avis, chemins et exploitabilité, mettre à niveau sans `--force`, utiliser `npm ci`; ajouter Dependabot et job bloquant critiques/hautes. Ne pas conclure à une absence de vulnérabilité avant résultat valide. | Non vérifiable : npm audit sans réseau; Dependabot/CI ajoutés |
| SEC-15 | **Basse** | `apps/api/src/public.ts`, `apps/api/src/attendance.ts`, `infra/*` | Aucun endpoint d’upload n’est défini. Le modèle `Person.photoUrl` ne prouve pas à lui seul une réception de fichier. Les contrôles magic bytes, limite de taille, nom aléatoire, ré-encodage Sharp/suppression EXIF et interdiction d’exécutable ne s’appliquent donc pas au code actuellement identifié. | Si une fonction d’upload est ajoutée : valider magic bytes, taille et dimensions, décoder/réencoder via Sharp sans métadonnées, nom aléatoire hors webroot et servir comme contenu statique non exécutable. | Non applicable : aucun upload présent |

## Résumé par domaine vérifié

- **Inscription/approbation :** DTO whitelist globale présente, mais `requestedRole` reste choisi par le client comme demande (et non droit actif) ; l’inscription ouvre malgré tout une session et le rôle FIDELE existe. La décision d’accès crée une notification, mais aucun journal `AuditLog` n’est écrit.
- **Autorisation/IDOR :** routes de présence protégées par guard au niveau contrôleur ; autorisation jour/zone serveur présente en partie. Aucun test IDOR ciblé n’existe. Les claims de rôle ne sont pas rafraîchis depuis la base.
- **Authentification/2FA/récupération :** Argon2id, JWT signé avec expiration 10 min, secret TOTP AES-256-GCM et jeton de reset de 32 octets haché/30 min sont présents. Rotation refresh, codes de secours, limitation globale, révocation complète des sessions et atomicité du reset manquent.
- **Entrées/sorties :** aucune occurrence de `$queryRaw` concaténé, `innerHTML` ou `bypassSecurityTrust` trouvée dans les sources inspectées. Validation globale active mais exceptions `any` à corriger.
- **Règles métier :** date de cours lundi et plages horaires locales présentes ; tolérance configurable inutilisée, écriture concurrente non atomique, audit/correction admin avec motif absent.
- **Données sensibles :** routes publiques identifiées ne retournent pas les listes de présence. Programme biblique et effectifs sont protégés ; listes d’administration incluent des coordonnées et sont accessibles aux rôles ADMIN/SUPER_ADMIN/EDITEUR. Politique de purge inexistante.
- **Infrastructure :** API non-root et base non publiée par Compose ; base runtime probablement superutilisateur, frontal HTTP sans TLS, Nginx non configuré non-root, sauvegarde sans preuve de restauration.
- **Git/dépendances :** `.env` ignoré par les fichiers présents et modèle sans secret connu, mais historique Git impossible à auditer. Audit npm bloqué par le réseau ; aucun avis ne peut être déclaré absent.

## Résultats de vérification initiaux

| Vérification | Résultat |
|---|---|
| Inspection du code et des configurations ciblées | Effectuée, constats ci-dessus |
| Recherche `$queryRaw` concaténé / `innerHTML` / `bypassSecurityTrust` | Aucune occurrence dans les sources inspectées |
| `npm audit --omit=dev` | Échec de connexion au registre npm ; aucun rapport exploitable |
| `npm audit` complet | Échec de connexion au registre npm ; aucun rapport exploitable |
| Historique Git / secrets commités | Impossible : dépôt Git absent du dossier de travail |
| Tests IDOR/API et restauration des sauvegardes | Non exécutés lors de l’audit statique initial |

## Risques résiduels et critères avant production

1. Compléter les points partiels SEC-03, SEC-05, SEC-07, SEC-08 et SEC-10, puis démontrer les contrôles par tests d’intégration avec deux comptes/jours/zones distincts. SEC-01, SEC-02, SEC-04 et SEC-06 sont corrigés dans le code, sous réserve des migrations et vérifications de déploiement indiquées ci-dessous.
2. Exécuter l’audit npm sur une machine/CI avec accès au registre ; mettre à niveau les avis exploitables et conserver le résultat JSON/texte.
3. Scanner l’historique Git réel et l’ensemble des secrets ; rotater tout secret exposé.
4. Déployer uniquement derrière TLS, avec secrets gérés hors image et hors dépôt, rôle PostgreSQL minimal, conteneurs non-root et sauvegardes restaurées avec succès.
5. Définir et vérifier la purge de données, y compris les copies hors ligne et sauvegardes, avant import des noms réels.
6. Effectuer une revue manuelle finale et une répétition de la checklist de mise en production sur l’environnement cible.

## Checklist de mise en production

- [ ] Aucun constat critique/haut ouvert ; risques acceptés approuvés et documentés.
- [ ] Inscription en attente sans session ni privilège ; aucun rôle FIDELE restant après migration contrôlée.
- [ ] Matrice d’accès deny-by-default testée sur chaque route, y compris IDOR, jours, zones et rôles admin/sous-admin.
- [ ] TOTP impossible à réinitialiser/contourner sans contrôle fort ; secrets chiffrés, secours hachés et essais limités.
- [ ] Cookies sécurisés, rotation/révocation des sessions et protection CSRF vérifiées.
- [ ] Tests reset token concurrent, réutilisé et expiré ; révocation des sessions confirmée.
- [ ] Contrôles horaires/timezone/tolérance, verrouillage atomique et audit des corrections testés.
- [ ] Purge à 12 mois configurée ; stockage hors ligne et sauvegardes inclus dans la politique de conservation.
- [ ] TLS/HSTS actif ; CORS/CSP revus ; logs sans tokens, secrets ou noms de fidèles.
- [ ] PostgreSQL non exposé, rôle applicatif minimal, secrets forts hors du dépôt et des images.
- [ ] `npm ci`, lint, tests, builds, audits npm prod/complet et Dependabot/CI réussis.
- [ ] Sauvegarde chiffrée restaurée sur un environnement isolé et résultat archivé.
- [ ] Vérification Git/secret-scan de l’historique effectuée sur le dépôt source canonique.
## Phase B — Corrections appliquées et limites

Les corrections suivantes ont été apportées dans le code de travail :

- Inscription créée en rôle `PENDING`, compte inactif, sans session ; une migration remplace le rôle historique `FIDELE` et désactive ses comptes. La migration n’a pas été exécutée sur la base de l’utilisateur.
- L’API relit le statut, le rôle et la version de session en base à chaque requête protégée. Les décisions d’accès, sous-administrateurs et corrections de présences écrivent un audit ; changements de rôle et reset révoquent les sessions.
- Authentification déplacée vers des cookies HttpOnly/SameSite Strict, Secure en production ; refresh token aléatoire haché, rotatif, avec détection de réutilisation ; vérification CSRF et rafraîchissement Angular.
- Configuration 2FA non réinitialisable par l’endpoint public après activation ; création de clé exige e-mail et mot de passe, DTO validés, et routes d’authentification limitées en débit.
- Reset de mot de passe consommé atomiquement, réponses login et reset uniformisées, sessions révoquées après reset.
- DTO de programme biblique borné, écriture de présence verrouillée à la feuille ouverte, contrôle horaire centralisé avec tolérance configurable, correction admin avec motif et journalisation.
- Purge quotidienne des présences et audits de correction à la durée configurée ; purge locale des saisies IndexedDB âgées de 12 mois et effacement local à la déconnexion.
- Conteneur Nginx configuré non-root, compte applicatif PostgreSQL distinct dans Compose et absence de port DB publié ; dépendances CI passées à `npm ci`, audits production/complet bloquants et Dependabot activés.

Les changements de schéma nécessitent une sauvegarde, l’arrêt de l’API, l’application contrôlée de la migration `20261005000700_pending_role_and_session_version` (`npm run prisma:deploy --workspace @paroisse/api`), puis la régénération du client Prisma et le redémarrage de l’API. Une génération locale du client a rencontré `EPERM` sur le moteur Windows, probablement verrouillé par un processus Node actif ; relancez-la après avoir arrêté l’API. Ne supprimez pas le volume PostgreSQL existant : il n’a pas été converti par la configuration Docker mise à jour.

## Statut de validation après correction

- Tests API : réussis — 3 suites, 14 tests. Ils sont unitaires/mockés ; aucun test e2e PostgreSQL ni test concurrent en environnement isolé.
- Lint web et build web : réussis.
- Lint API et build API : réussis.
- `npm audit --omit=dev` et complet : non concluants, registre npm inaccessible depuis cet environnement.
- Validation Prisma : réussie. La validation Compose n’a pas pu être faite car Docker est absent ici. Migration, TLS/HSTS public et restauration à vérifier au déploiement.
- Pas de commits individuels créés : le dossier de travail ne contient aucun dépôt Git (`.git`).

## Risques résiduels bloquants pour les données réelles

1. L’audit des dépendances et de l’historique/secret-scan doit être rejoué sur le dépôt canonique avec accès réseau.
2. Le limiteur actuel est en mémoire par instance : il se réinitialise au redémarrage et ne partage pas ses compteurs entre plusieurs instances. Pour un service multi-instance, le remplacer par Redis ou un limiteur distribué.
3. Les codes de secours 2FA hachés ne sont pas implémentés ; prévoir une procédure de récupération admin contrôlée avant déploiement.
4. La CSP conserve `style-src 'unsafe-inline'` pour le rendu Angular. Réduire cette exception après validation par nonce/hash du build.
5. Le proxy TLS public, HSTS réellement servi en HTTPS, certificats, sauvegarde/restauration chiffrée, rotation des secrets et volumes PostgreSQL déjà initialisés n’ont pas été exercés ici.
6. Les tests ajoutés sont unitaires/mockés pour les protections ciblées ; ils ne remplacent pas les tests e2e IDOR de chaque endpoint avec des comptes réels de jours/zones distincts.

---

## Addendum — état après le lot de durcissement du 5 octobre 2026

**Cet addendum remplace les descriptions de statut et les résumés antérieurs lorsqu’ils divergent.** Il décrit le code présent et les vérifications effectivement lancées dans cet environnement. « Corrigé dans le code » ne signifie pas que les migrations ou la configuration de production ont été déployées.

| Domaine | Statut actuel | Preuve / limite |
|---|---|---|
| Enrôlement et récupération 2FA | **Corrigé dans le code, migration/client non appliqués** | Les routes HTTP d’enrôlement et de changement de secret ont été supprimées. Le CLI `admin:enroll-2fa` exige le mot de passe du compte et un second facteur actuel pour tout changement après enrôlement ; affiche 10 codes aléatoires une seule fois, en conserve uniquement les hachages Argon2id, consomme chaque code une fois, et permet la récupération contrôlée par un autre SUPER_ADMIN. Régénération HTTP des codes protégée par TOTP/secours. Nécessite la migration `20261005000800_admin_2fa_recovery_codes` et une génération Prisma réussie avant usage. La génération locale antérieure a rencontré un fichier moteur verrouillé sous Windows ; l’API n’a pas été arrêtée de force. |
| Ralentissement des échecs de connexion et proxy | **Partiellement corrigé** | Hachage Argon2id factice pour comptes inconnus, réponse générique, plancher de 500 ms, délai exponentiel mémoire par IP et empreinte de compte, journal d’événement sans e-mail en clair. Nginx est l’unique proxy de confiance configuré (`172.30.0.2`) ; le test HTTP de comparaison de latence est écrit mais dépend d’une base de test et n’a pas été exécuté. Le limiteur et le délai restent locaux à une instance, sans Redis ni garantie distribuée. |
| Noms, totaux et accès admin | **Corrigé dans le code, e2e non exécutés** | Résumé admin sans noms, totaux globaux/par zone ; endpoint nominatif séparé avec motif contrôlé et journalisation. L’interface n’affiche pas les noms avant cette action. EDITEUR ne reçoit pas les coordonnées des comptes. `/attendance/week` est borné de 366 jours passés à 90 jours futurs. L’affectation d’un président est par jour ; il n’existe pas de modèle de zone affectée individuellement, les zones permises étant déterminées par rôle et type de feuille. |
| Sous-admin | **Partiellement couvert** | La décision sur soi-même est refusée ; EDITEUR ne peut nommer un sous-admin ; les rôles ADMIN/SUPER_ADMIN ne peuvent pas être attribués par le flux de validation, limité aux deux responsabilités métier. Tests HTTP e2e préparés, mais pas de campagne complète de matrice des endpoints admin. |
| Journal d’audit | **Partiellement corrigé** | Connexions réussies/échouées, demandes/utilisations de reset, changements d’accès/2FA, soumission, consultations de totaux et accès nominatif sont journalisés. Les noms et secrets ne sont pas ajoutés aux événements nouveaux ; les anciennes données de correction contenant éventuellement des noms sont nettoyées par migration 008. Vérifier les journaux du fournisseur mail, reverse proxy et plateforme d’hébergement en production. |
| Rétention | **Corrigé dans le code, exécution à vérifier** | Tâche serveur quotidienne anonymisant les noms après `DATA_RETENTION_MONTHS` (défaut 12) et figeant les totaux homme/femme/zone ; purge AuditLog configurable avec minimum 36 mois. Cela ne purge pas les copies déjà présentes dans sauvegardes hors ligne, exports externes ou appareils restés hors connexion. |
| Sauvegardes et Compose | **Partiellement corrigé** | Compose rend les secrets requis via `${VAR:?}` sans mot de passe de repli, n’expose pas PostgreSQL, et prévoit rôle applicatif non-superutilisateur. Scripts de sauvegarde/restauration authentifiées AES-256-GCM, rétention par défaut 35 jours et test scripté source/cible « test » distinctes ; test cryptographique local réussi. Aucun test PostgreSQL de restauration n’a pu être lancé. Compose, Nginx et certificats n’ont pas été validés par Docker ici. |
| Tests e2e | **Écrits en partie, non exécutés** | Suite HTTP Nest/Jest avec `fetch` natif couvrant inscription/rôle, égalité du message et délai minimal, jour/feuille, accès EDITEUR, compte désactivé, absence des routes publiques 2FA, codes secours, reset concurrent/réutilisé/expiré, refresh réutilisé, ajout/soumission concurrents et stockage navigateur. Ce n’est pas Supertest : sa dépendance n’a pas pu être installée depuis le registre inaccessible. Plusieurs cas demandés (notamment matrice complète IDOR zones/feuilles/endpoints d’administration, saisie hors plage en HTTP et impossibilité d’escalade sous-admin complète) restent à compléter. Le lanceur refuse explicitement de démarrer sans `TEST_DATABASE_URL` dont le nom contient `test`, et refuse une cible identique à `DATABASE_URL`. |
| Dépendances, dépôt, hébergement | **Non vérifié / reste à faire** | `npm audit` n’a pas produit de rapport exploitable à cause du réseau ; le dossier n’a pas de `.git`, donc historique/secrets et commits correctifs non vérifiables. CSP `style-src 'unsafe-inline'` subsiste. HTTPS/HSTS, secrets, TLS, sauvegardes, purges et limites du stockage ont besoin d’une revue humaine et d’une répétition sur la cible. |

### Vérifications effectuées pour cet addendum

| Vérification | Résultat |
|---|---|
| Lint API (`tsc --noEmit`) | Réussi |
| Lint web | Réussi |
| Tests unitaires API | Réussi : 3 suites, 17 tests |
| Build API et build web | Réussis |
| `prisma validate` sur le schéma | Réussi ; aucune migration appliquée |
| Compilation TypeScript du fichier e2e | Réussie |
| Tests de chiffrement AES-256-GCM | Réussi : aller-retour et détection de modification |
| Garde-fou `npm run test:e2e` sans `TEST_DATABASE_URL` | Refus attendu avant toute migration : URL de test absente |
| E2e PostgreSQL / Supertest | Non exécutés : aucune base dédiée `TEST_DATABASE_URL`; Supertest non installé |
| `npm audit`, Docker Compose et restauration PostgreSQL | Non vérifiés : réseau/outil/base absents |
| Base de développement | Intacte par cette tâche : aucune connexion de migration ni de test ne lui a été faite |

### Procédures et travail humain restant

1. Créer une base PostgreSQL **distincte**, nommée par exemple `paroisse_test`, définir uniquement `TEST_DATABASE_URL` vers elle et vérifier qu’elle ne correspond pas à `DATABASE_URL`. Le script `npm run test:e2e` applique les migrations à cette cible dédiée avant les tests ; lire le garde-fou avant lancement.
2. Après arrêt contrôlé de l’API locale, régénérer le client Prisma, puis exécuter les e2e. Compléter la suite avec Supertest et la matrice exhaustive jour/zone/feuille/compte/admin, saisie hors plage, sous-admin et tests temporels stables. Ne jamais remplacer `TEST_DATABASE_URL` par la base de développement.
3. Tester `admin:enroll-2fa` sur un environnement isolé après migration 008 ; conserver les codes de secours hors ligne. Confirmer qu’au moins deux SUPER_ADMIN distincts disposent chacun de codes récupérables avant de généraliser la procédure.
4. Avec Docker disponible, valider `docker compose config`, démarrer un environnement jetable, vérifier les certificats et en-têtes TLS/HSTS/CSP réels, exécuter `backup-restore-test.sh` entre deux bases de test distinctes et archiver le résultat. Vérifier aussi que l’ancienne base/volume n’a pas été initialisé avec un autre compte ou d’anciens secrets.
5. Depuis le dépôt canonique connecté, exécuter `npm audit --omit=dev` et `npm audit`, examiner les chemins/exploitabilités, scanner tout l’historique Git et rotater tout secret qui aurait été commité. Pas de commit par correctif possible depuis ce dossier sans métadonnées Git.
6. Faire approuver par le responsable de traitement la rétention, l’anonymisation et les sauvegardes, puis tester la purge sur données synthétiques. Mettre un limiteur partagé (par exemple Redis) si plusieurs instances API sont utilisées et retirer `unsafe-inline` de la CSP après adaptation du build Angular.

**Décision de mise en production : reportée.** Les corrections de code présentées ici ne suffisent pas à autoriser des données réelles avant migrations contrôlées, e2e PostgreSQL réussis, audit npm, restauration vérifiée et validation humaine de l’infrastructure.

## Addendum — séparation des espaces et autorisations sous-admin

Le dernier changement ajoute la migration `20261005000900_subadmin_permissions`, qui crée une liste de permissions vide par défaut pour chaque compte. Elle n’a pas été appliquée à une base. Les seules permissions disponibles sont `GESTION_COMPTES` et `PROGRAMME_BIBLIQUE`; le rôle `EDITEUR` ne reçoit aucun droit implicite. La connexion sous-administrateur est distincte (`/sous-admin/connexion`, endpoint dédié avec TOTP), et l’API recharge les permissions actuelles depuis PostgreSQL pour protéger la gestion des demandes et le programme biblique. Seul ADMIN/SUPER_ADMIN peut nommer/retirer un sous-admin ou lui attribuer ses permissions. Chaque changement révoque les sessions de ce compte.

Le menu mobile utilise désormais un bouton actionnable et affiche connexion fidèle, création de compte, connexion admin et connexion sous-admin. L’API continue de refuser au secrétaire les feuilles de groupe de semaine et au président les feuilles du cours biblique ; la suite e2e contient maintenant des cas croisés pour ces deux types de feuille, en plus de l’IDOR entre jours.

La suite e2e inclut également des vérifications de connexion EDITEUR séparée, absence d’accès sans autorisation, octroi/retrait des permissions, réauthentification après révocation, absence de coordonnées exposées à EDITEUR et refus d’auto-attribution. Ces nouveaux scénarios sont écrits mais non exécutés sur PostgreSQL ; ils ne sont pas comptés parmi les tests réussis.

Les lint, builds API/web, tests unitaires (17 tests), validation Prisma et compilation TypeScript e2e ont réussi après ces modifications. La suite e2e PostgreSQL reste non lancée faute de `TEST_DATABASE_URL`; la base de développement n’a pas été migrée. La prochaine exécution des e2e doit inclure la migration 009 et vérifier le cycle d’octroi/retrait de permissions sous-admin sur une base dédiée. L’écran e2e emploie `fetch` natif, pas Supertest, en raison du registre npm inaccessible lors de la tentative d’installation. La procédure reste bloquée avant `prisma:generate` : 13 processus `node.exe` sont encore actifs, et il n’est pas sûr de fermer indistinctement des processus potentiellement liés à d’autres travaux.

## Addendum — Actualités, phase 1 : comptes fidèles

Migration préparée : `20261007000000_social_accounts_phase1` (rôles `FIDELE`/`MODERATEUR`, date de naissance, confirmation de charte, suspension et jetons d’e-mail hachés). **Elle n’a pas été appliquée.** L’inscription publique passe par `/auth/social/register`, n’accepte aucun rôle client, calcule l’âge côté serveur, exige l’acceptation de la version de charte en vigueur, bloque les domaines jetables configurés et utilise Turnstile lorsque les deux clés sont définies. Les liens de confirmation sont aléatoires, stockés hachés, à usage unique et expirent après 30 minutes. La connexion et le guard refusent les comptes non confirmés et les comptes suspendus. Suspension/réactivation ADMIN/SUPER_ADMIN exige un motif pour suspendre, révoque les sessions et inscrit l’action dans `AuditLog`. Le rôle MODERATEUR est présent au schéma, mais son attribution et ses pouvoirs restent différés jusqu’à décision sur les personnes et droits de modération.

L’inscription fidèle demeure volontairement désactivée tant que `SOCIAL_MIN_AGE`, la version et le texte définitifs de la charte, `RESEND_API_KEY`, `MAIL_FROM` et `APP_PUBLIC_URL` ne sont pas fournis. Le seuil de 13 ans proposé n’a pas été choisi par le code comme valeur par défaut. Le formulaire annonce clairement cette indisponibilité et n’autorise pas l’envoi. L’espace Actualités confirme l’accès, mais précise que le fil n’est pas encore construit; aucune publication simulée n’est affichée. Les phases publications, interactions, médias, profil/paramètres et modération ne sont pas commencées.

| Vérification de la phase 1 | Résultat |
|---|---|
| Lint API / web | Réussis |
| Build API / web | Réussis |
| Tests unitaires API | Réussis : 4 suites, 25 tests |
| Génération Prisma | Réussie depuis le schéma; aucune connexion base requise |
| E2E PostgreSQL | **Bloqués avant migration** : `TEST_DATABASE_URL` vise bien `paroisse_test`, mais l’authentification PostgreSQL échoue (P1000) avec les identifiants actuellement configurés. Aucun e2e n’a été compté comme réussi et aucune migration n’a été appliquée. |
| Base de développement | Intacte; aucun test ni aucune migration ne l’a visée |

Avant de reprendre la phase 1, un humain doit remplacer localement les identifiants d’exemple de `TEST_DATABASE_URL` par un compte PostgreSQL qui a accès à la base `paroisse_test` (ne pas coller de mot de passe dans le chat), puis relancer `npm run test:e2e`. Les décisions humaines restantes : âge minimum légal et pastoral, charte finale, liste des domaines jetables, activation éventuelle de Turnstile, désignation des modérateurs/droits et procédure d’appel. Ne pas lancer les migrations sur la base de développement dans le cadre du présent contrôle.

### Vérification finale du 7 octobre 2026

Après les derniers ajustements de minimisation des données (téléphone facultatif et non demandé aux fidèles), lint et build de l’API et du web réussissent; les 4 suites unitaires API passent (25 tests). La base de test a été sondée sans appliquer de migration et a répondu P1000; cette vérification reste donc bloquée avant migration et avant exécution des e2e. La base de développement n’a pas été consultée ni modifiée pendant cette passe.

## Reprise autonome du 7 octobre 2026

Le dépôt a été initialisé avec un premier commit `c0da88b`. `.env`, `.env.*` (à l’exception de `.env.example`), `node_modules`, `dist`, `uploads`, et les formats de sauvegarde sont ignorés. Le scan ciblé des fichiers suivis n’a trouvé aucune clé Resend, clé privée ni URL PostgreSQL manifeste avec mot de passe ; ce contrôle statique n’est pas un audit exhaustif de l’historique futur.

Outils ajoutés : `npm run test-db:diagnose` ne révèle pas les identifiants ; `npm run test-db:setup` provisionne une base et un rôle de test distincts uniquement après fourniture locale de `PG_ADMIN_URL` et d’un client `psql`. La cible courante passe les validations de syntaxe/isolation mais l’authentification réelle retourne toujours P1000. Le script e2e masque les URL invalides et conserve son refus de cibler la base de développement.

| Contrôle repris | Statut constaté |
|---|---|
| Lint/build API et tests unitaires | Réussis : 30 tests API ; les tests des scripts DB passent : 3/3 |
| Build/lint web | Réussis après clarification du texte 2FA et ajout de l’interface Actualités |
| E2E PostgreSQL et migrations vide/historique | Bloqués au démarrage du moteur Prisma sur la base de test; aucune migration appliquée avec succès |
| `npm audit --omit=dev` et audit complet | Bloqués : l’endpoint bulk de `registry.npmjs.org` ne répond pas ; aucun nombre d’avis ne peut être déclaré |
| Docker Compose, TLS et restauration | Non testés : Docker CLI et psql ne sont pas disponibles dans cet environnement |
| CI/Dependabot | Configurés ; CI comprend install, lint/tests, e2e PostgreSQL, builds, scan local de secrets et audits à niveau haut |
| Migration de phase 1 et 2/3 Actualités | Schéma/migrations préparés et fil texte codé; migrations non appliquées, e2e non exécutés |
| Phases 4 à 7 Actualités | Médias, profils éditables, signalements, console complète de modération et contrôle de charge reportés |

Résidu critique : tant que la matrice e2e de présence n’est pas exécutée avec succès sur PostgreSQL isolé, la base dédiée n’est pas migrée/restaurée, et la configuration TLS/backup n’est pas testée, le projet est **pas prêt pour des données réelles**. `style-src 'unsafe-inline'` reste nécessaire au rendu actuel du build Angular et doit être validé dans un navigateur de production avant toute décision CSP.

## Mise à jour du 7 octobre 2026 — contrôles et Actualités phases 2–3

Les mentions antérieures qui indiquent que le fil social n’est pas commencé sont dépassées pour les fonctionnalités ci-dessous. Cette mise à jour décrit le code actuel; elle ne vaut pas validation en base ni autorisation de mise en production.

| Zone | Statut | Limites et risques restants |
|---|---|---|
| Fil social textuel | Implémenté au niveau API et UI, tests unitaires ciblés réussis | Publications texte, confidentialité publique/privée, fil paginé, édition/suppression propriétaire, commentaires avec une profondeur de réponse, réactions, partage, favoris, masquage, blocage et préférence de notifications. Pas d’e2e DB réussi. Anti-spam en mémoire locale; à distribuer avant multi-instance. |
| Confidentialité des mineurs | Le nom est remplacé par « Membre fidèle » si la date de naissance indique moins de 18 ans | Pas d’outils de profil ni de demande d’effacement/export; validation humaine de la politique d’âge et des règles d’accès nécessaire. Les identifiants techniques d’auteur restent renvoyés par l’API sociale. |
| Modération sociale | Épinglage ADMIN/SUPER_ADMIN journalisé | Pas de signalement, file de modération, contestation, gel/rétention des preuves ni actions de modérateur. Ne pas attribuer MODERATEUR avant définition des droits et tests e2e. |
| Médias et profils | Non implémentés | Aucun upload, stockage, scanner malware, traitement d’image, avatar ni modification de profil. |
| E2E et infrastructure | E2E non exécutés; blocage antérieur à toute migration | Le lanceur e2e a échoué au démarrage du moteur Prisma pour la cible distincte `paroisse_test`; aucune migration n’a été appliquée avec succès et la base de développement n’a pas été touchée. Refaire après correction locale de l’accès PostgreSQL. |
| Vérifications locales au 7 octobre | Réussies | `npm test`: 3 tests outil + 30 tests API (5 suites); lint API/web; build API/web; génération et validation Prisma; compilation TypeScript e2e; scan ciblé de secrets. |
| Dépendances et exploitation | Toujours non vérifiés | `npm audit`, Docker/Compose, TLS en production, restauration PostgreSQL et politique de rétention/sauvegardes nécessitent un environnement réseau et des outils indisponibles ici. |

Le projet reste **non prêt pour les données réelles**. Les tests unitaires et builds valident le code local, mais ne remplacent ni les e2e sur PostgreSQL isolé, ni l’approbation humaine de la charte/âge/modération, ni la validation de l’infrastructure et des restaurations.
