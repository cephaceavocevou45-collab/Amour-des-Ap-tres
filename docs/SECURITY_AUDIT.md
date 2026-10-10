# Audit de sécurité — Paroisse Amour des Apôtres

## État courant — 8 octobre 2026

La suite PostgreSQL e2e est à **33 réussis, 0 échoué, 0 non exécuté**; les tests unitaires API sont à **29/29**. Lint/typecheck API, builds API et Angular réussis. Les migrations de groupes, sondages et événements sont appliquées sur `paroisse_test` uniquement; aucune migration de développement n’a été lancée. L’API de prévisualisation actuellement démarrée utilise `TEST_DATABASE_URL`. L’audit npm n’a pas été relancé dans cette étape; Playwright n’a pas été relancé. Les médias restent désactivés sans stockage privé et antivirus réels.

## Communauté — extension groupes et médias — 8 octobre 2026

- Le fil affiche les liens HTTP(S) saisis dans une publication comme des liens externes, sans récupérer les pages distantes côté serveur. Les protocoles non HTTP(S) et les URL contenant identifiants/mots de passe ne sont pas affichés comme liens.
- Les groupes comprennent création, adhésion publique, demande privée, validation par le propriétaire, départ et suppression par le propriétaire. Les routes sont authentifiées, limitées aux rôles communautaires, protégées par le rate limiter et les actions de création/validation/suppression sont auditées. Ces nouvelles routes n’ont pas encore été couvertes par des e2e.
- Les médias comprennent images réencodées, vidéos MP4/WebM et PDF en pièce jointe. Le dépôt reste conditionné au stockage S3 privé et à ClamAV. Les fichiers sont privés, contrôlés côté serveur, limités à 10 Mo et ne sont pas servis depuis un bucket public. PDF est forcé en téléchargement.
- **Risque résiduel média :** les vidéos sont conservées telles quelles après signature et antivirus et peuvent contenir des métadonnées de localisation. Le transcodage/suppression des métadonnées reste requis avant ouverture générale. Le drapeau de médias doit rester désactivé jusqu’à configuration et validation de S3/ClamAV.
- **Vérifications de cette étape :** lint API/web et builds API/web réussis. La validation Prisma du schéma passe. Prisma Client n’a pas pu être régénéré (`EPERM` sur le moteur Windows); `migrate deploy` n’a pas pu se connecter au serveur d’essai et aucune nouvelle migration n’a été appliquée. La base de développement n’a pas été ciblée.
- **État de mise en service :** groupes et nouveaux médias ne sont pas certifiés opérationnels avant génération du client Prisma, application de migrations sur `paroisse_test` et e2e dédiés.

## Relance e2e après diagnostic mémoire — 8 octobre 2026

- **E2E PostgreSQL : 29 réussis, 0 échoué, 0 non exécuté** sur `paroisse_test`; 16 migrations appliquées, aucune en attente. Le runner exécute chaque fichier dans un nouveau processus avec `--runInBand` et plafond Node de 4096 Mo.
- Les tests couvrent limites d’inscription par IP/e-mail, CAPTCHA (absent/invalide refusés, jeton de test valide accepté), quotas nouveaux comptes (3 publications/24 h, photo et partage refusés) et refus d’accès sensible au compte FIDELE non confirmé.
- **Cause mémoire corrigée :** Prisma se déconnecte au teardown Nest (`OnModuleDestroy`), les journaux e2e sont bornés à 2 000 entrées et vidés en fin de suite, et le limiteur mémoire reste borné à 10 000 compartiments avec purge des entrées expirées. Aucun cycle de création non nettoyé identifié.
- Vérifications après ces modifications : unitaires API 29/29, tests outils 3/3, lint API et build API réussis.
- Deux essais antérieurs de cette session ont rencontré des erreurs d’allocation; ils ne sont pas comptés comme résultat final. Le passage propre de 29/29 est la référence.

## Vérifications ciblées — 8 octobre 2026 (session actuelle)

- **Correctifs code/tests :** `SocialModerationStatus[]` est utilisé pour les états ouverts, sans changement de logique. Les mocks unitaires couvrent `userNotification` et `socialPostMedia`. Le test d’inscription vérifie désormais le texte exact du message d’accueil (Psaume 119:105). Un test garantit que Swagger n’est pas monté en production.
- **Unitaires et outils :** 29/29 tests API et 3/3 tests utilitaires réussis. Lint API et web réussis. Build API et web réussis lorsqu’ils sont lancés séparément.
- **Génération Prisma :** échec confirmé, y compris en nouvelle tentative avec droits élevés : `EPERM` pendant le renommage de `query_engine-windows.dll.node`. Cela bloque la génération et empêche de certifier l’état des artefacts Prisma.
- **E2E :** `migrate deploy` a visé uniquement `TEST_DATABASE_URL` (`paroisse_test`), a trouvé 16 migrations et signalé aucune migration en attente. Le fichier e2e contient 29 cas; aucun n’a démarré, car Node a échoué par manque de mémoire avant l’exécution (`heap out of memory`). Résultat de cette session : 0/29 exécuté, ni succès ni échec d’assertion. Les nombres e2e historiques en haut de ce document ne décrivent pas cette relance.
- **Audit des dépendances :** `npm audit --omit=dev` et `npm audit` ont échoué sur `getaddrinfo ENOTFOUND registry.npmjs.org`; aucun avis actuel n’a été reçu. Le dernier état historique consigné le 8 octobre mentionnait 3 avis hauts et 2 modérés en production, ainsi que 32 hauts et 6 modérés dans l’arbre complet. Ce résumé est ancien et ne permet pas d’associer de façon fiable chaque avis à un paquet ni d’évaluer son exploitabilité actuelle. Ne pas le présenter comme le résultat des commandes actuelles.

### Dépendances restantes — statut reporté, à confirmer en réseau

L’arbre local aide à préciser les chemins, mais ne donne pas les avis npm (ID, plage corrigée ni vecteur d’attaque). Les noms ci-dessous sont ceux relevés dans le dernier état historique et les chemins sont ceux de l’arbre local présent; gravité/exploitabilité par paquet non déterminables hors ligne. Décision : **reporté**, aucun paquet modifié sur la base d’une supposition.

| Paquet | Gravité connue pour ce paquet aujourd’hui | Chemin local | Exploitabilité réelle | Décision |
|---|---|---|---|---|
| `deepmerge-ts` | non déterminable sans avis actuel; ancien résumé global signale des avis hauts en production | `@paroisse/api > prisma > @prisma/config > deepmerge-ts` | non déterminable sans ID/plage/advisory; dépend d’un chemin de configuration Prisma atteignable | Reporté, relancer `npm audit --omit=dev` avec accès registre |
| `js-yaml` | non déterminable par version/avis; ancien résumé global signale des avis hauts et modérés | `@nestjs/swagger > js-yaml@5.3.0`; `@nestjs/cli > fork-ts-checker-webpack-plugin > cosmiconfig > js-yaml@4.3.2`; `ts-jest > ... > js-yaml@3.15.2` | non déterminable; les usages YAML transitifs ne suffisent pas à prouver une entrée contrôlable par attaquant | Reporté, relancer l’audit complet avec accès registre |
| `braces` | non déterminable sans avis actuel; ancien résumé global signale des avis dans l’arbre de développement | `jest > @jest/core > micromatch > braces@3.0.3` | dépend des motifs et entrées effectivement fournis à l’outillage de test; non exposé directement aux requêtes de production selon le chemin local relevé | Reporté, relancer l’audit complet et vérifier l’avis et sa plage |
| `argparse` | non déterminable par version/avis actuel | `@nestjs/swagger > js-yaml > argparse@2.0.1`; `ts-jest > ... > js-yaml@3.15.2 > argparse@1.0.10` | non déterminable sans advisory; dépend de l’appel des parseurs CLI transitifs | Reporté, ne pas changer sans avis confirmé et tests |

**Décision inscription :** l’absence de confirmation e-mail pour le compte fidèle est intentionnelle selon la demande métier; l’e-mail reste nécessaire à la récupération. Les compensations codées sont la limite d’inscription par IP/adresse, le CAPTCHA Turnstile activable (désactivé par défaut avec message d’état) et les limites des comptes de moins de 24 h (3 publications glissantes par 24 h, sans photo ni partage). Les e2e correspondants n’ont pas pu être validés lors de cette relance mémoire-limitée.

**Statut final de cette session :** pas de certification de sécurité; génération Prisma bloquée par EPERM, e2e bloqués par mémoire, audit npm bloqué par DNS/registre. Ne pas utiliser les nouvelles protections avec des données réelles avant relance réussie de ces contrôles et examen humain des avis npm.

## État actuel — 7 octobre 2026

Les constats historiques plus bas sont conservés comme trace d’audit; leurs statuts sont supersédés par cette synthèse finale. Résultats : 20/20 e2e PostgreSQL, 30/30 tests API, 3/3 tests utilitaires, 1/1 test Playwright XSS, lint et build réussis. **Les noms de présence sont protégés par jour : oui.** Option A donne au responsable affecté les deux zones de son jour; le secrétaire n’accède pas aux feuilles de semaine. L’administrateur voit les noms seulement après consultation nominative motivée et auditée. Les opérations CLI 2FA partagées ont été testées sur la base dédiée. Un humain doit vérifier la CI; npm audit, Docker/TLS et la restauration réelle restent à valider avant mise en production.

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
| E2E et infrastructure | 13/14 tests e2e passés, suite non verte | Une attente incohérente sur la liste des comptes EDITEUR est bloquante; détails et scénarios non couverts ci-dessous. Aucune migration de développement n’a été lancée. |
| Vérifications locales au 7 octobre | Réussies | `npm test`: 3 tests outil + 30 tests API (5 suites); lint API/web; build API/web; génération et validation Prisma; compilation TypeScript e2e; scan ciblé de secrets. |
| Dépendances et exploitation | Toujours non vérifiés | `npm audit`, Docker/Compose, TLS en production, restauration PostgreSQL et politique de rétention/sauvegardes nécessitent un environnement réseau et des outils indisponibles ici. |

Le projet reste **non prêt pour les données réelles**. Les tests unitaires et builds valident le code local, mais ne remplacent ni les e2e sur PostgreSQL isolé, ni l’approbation humaine de la charte/âge/modération, ni la validation de l’infrastructure et des restaurations.

### Vérification des migrations et résultats e2e — 7 octobre 2026

`prisma migrate deploy` a appliqué les 12 migrations sur la base vide `paroisse_test`. Un second essai historique isolé dans un schéma temporaire de cette même base a démarré à l’état de migration 006, inséré des données synthétiques (ancien compte FIDELE, refresh token actif, feuille/entrée de présence), puis déployé les migrations restantes avec `migrate deploy`. Résultat : le compte FIDELE est devenu PENDING inactif, la session active a été révoquée et la feuille ainsi que l’entrée ont été conservées. Le schéma temporaire a été supprimé. Aucune base fantôme ni privilège CREATEDB n’a été nécessaire. La base de développement n’a pas été visée.

### Mise à jour de sécurité et e2e — 7 octobre 2026

Cette section remplace les anciens résultats e2e ci-dessus pour les scénarios relancés. Tous les essais ont été exécutés avec `TEST_DATABASE_URL` (`paroisse_test`); `DATABASE_URL` n’a pas été lue ni modifiée par les commandes de migration/e2e.

| Contrôle exécuté | Résultat |
|---|---|
| Liste des comptes : ADMIN/SUPER_ADMIN autorisés; EDITEUR avec/sans permission refusé en 403; appel sans session en 401 | Réussi |
| Détails de compte | Aucun endpoint n’existe; chemin inconnu retourne 404 sans donnée révélée |
| Validation, permissions, suspension par rôle non autorisé | Refus 403 testé |
| IDOR présences : feuilles d’un autre jour, d’un autre responsable, résumés, ajouts, suppressions, corrections, soumissions et accès nominatif | Refus 403/404 testé sur les routes présentes |
| Fenêtres cours, lundi 19 h 30–21 h 30, et groupe hebdomadaire chaque jour 10 h–18 h | Frontières testées sur l’horloge injectée, avec tolérance configurée; uniquement la course ajout/soumission simule une fenêtre ouverte |
| Consultation nominative ADMIN | Sans motif refusée; avec motif autorisé et auditée; noms absents du résumé normal |
| 2FA | Enrôlement HTTP absent, code requis, code de secours consommé une seule fois, tentative limitée; aucune validation navigateur réelle du flux CLI de remplacement |
| Suspension FIDELE et responsable | JWT actif refusé immédiatement; refresh rejeté et sessions révoquées |
| Actualités | Confidentialité MOI_SEUL, blocage mutuel sur fil/commentaires, ownership de modification/suppression, réactions/partages/favoris/masquage et limites post/comment/réaction/partage testés |
| Signalements et profils | Routes absentes; aucun développement effectué conformément au périmètre différé |
| Logs e2e | Test automatisé avec capture des logs Nest/console; noms sentinelles, jetons et mots de passe absents |



Corrections apportées : refus 403 pour la liste des comptes à tout EDITEUR et pour l’attribution de permissions par un non-admin; suspension étendue aux comptes non-administrateurs et rejet des refresh tokens d’un compte suspendu. Aucune fonction média, profil ou signalement/modération n’a été ajoutée.

| Scénario e2e | Résultat observé |
|---|---|
| Inscription classique : rôle client refusé, compte PENDING sans session | Réussi |
| Création/confirmation FIDELE; absence d’accès aux présences et à l’administration | Réussi |
| Réponses et délais minimaux uniformes entre compte connu/inconnu | Réussi |
| Admin : totaux sans noms, consultation nominative avec motif journalisée, bornes de dates | Réussi |
| EDITEUR : liste des comptes sans coordonnées et refus d’auto-validation | **Échoué avant les assertions restantes** : test attend 200 pour un EDITEUR sans permission; le serveur renvoie 401 conformément au contrôle `GESTION_COMPTES` |
| Sous-admin : connexion distincte, pas d’élévation, permissions accordées par l’admin | Réussi dans son scénario, qui attend 401 pour l’EDITEUR sans permission sur la même route de liste; cette attente contredit la précédente |
| Compte désactivé : ancien JWT refusé | Réussi |
| 2FA : code requis, codes de secours hachés/usage unique, enrôlement HTTP public absent | Réussi; remplacement de secret avec code actuel/secours pas couvert par ce scénario |
| Reset concurrent, rejet du rejeu et expiration | Réussi |
| Réutilisation refresh : révocation de la famille | Réussi |
| Concurrence ajout/soumission et cohérence des totaux | Réussi avec fonction de fenêtre horaire simulée ouverte; vrais créneaux locaux non couverts |
| Absence de jeton en sessionStorage/localStorage | Réussi |
| Actualités : visibilité/ownership, idempotence, commentaires/réponses, réactions, partage, favoris, rôle, blocage unilatéral | Réussi pour les assertions présentes; blocage mutuel, IDOR par chaque action, limite de débit et XSS rendu navigateur non couverts |

**Bilan e2e : 13 réussis, 1 échoué sur 14.** Le conflit est dans les spécifications de deux tests : un EDITEUR sans `GESTION_COMPTES` est attendu autorisé à lire une liste expurgée dans un test et refusé dans l’autre. L’accès en lecture et le niveau de permission doivent être tranchés avant une modification; ouvrir l’accès par défaut pour faire passer le premier scénario contournerait le principe d’autorisation configurée. Aucun test n’a été modifié ni aucune protection désactivée.

Le fichier de configuration Jest avait une expression de recherche JSON invalide; les antislashs ont été correctement échappés. La suite e2e s’exécute maintenant et révèle le conflit d’autorisation ci-dessus.

## Vérification finale — 7 octobre 2026 (Option A)

**Décision confirmée :** l’isolation est par jour uniquement. Un président de jour et les responsables autorisés de ce jour gèrent Temple et Salle de vision ensemble. Le secrétaire de présence reste cantonné au cours biblique. Il n’existe pas de rôle ni de champ d’affectation par zone.

**Rôle historique retiré :** `RESPONSABLE_SALLE_VISION` a déjà été remplacé par `RESPONSABLE_SEMAINE` par la migration non destructive `20261005000300_responsable_semaine`; les migrations suivantes ont reporté les jours affectés depuis les dates hebdomadaires. Le rôle retiré n’existe plus dans le schéma ni le code actif. Aucune nouvelle migration de désactivation n’a été ajoutée : l’ancien rôle a été converti dans l’historique en rôle hebdomadaire encore utilisé, et le désactiver indistinctement désactiverait les présidents valides. La suite e2e confirme son absence dans l’enum Prisma. Les migrations ont été déployées sur la base dédiée vide et sur un jeu historique isolé (compte FIDELE, session active et feuille de présence conservée), sans toucher à la base de développement.

| Scénario | Résultat |
|---|---|
| Responsable X lit son jour, Temple et Salle de vision | Réussi |
| Responsable X essaie de lire ou modifier le jour Y dans Temple et Salle de vision | Refus 403/404 sur les feuilles, résumés, ajouts, suppressions, soumissions, corrections et consultations nominatives |
| Responsable Y tente de lire les noms du jour X via sa semaine | Réussi : la liste ne contient que son jour affecté |
| Secrétaire du jour Y tente les routes des feuilles de semaine ou des zones Temple/Salle de vision | Refusé ou liste vide, aucun nom divulgué |
| Accès inter-feuille | 403/404 pour le compte non responsable |
| Historique et export | Routes absentes : réponse 404 (aucune donnée exposée) |
| Admin sans consultation nominative | Noms masqués, totaux seuls |
| Admin avec motif | Noms renvoyés et consultation auditée |
| Enrôlement CLI 2FA | Opération partagée par la CLI intégrée à l’e2e sur `TEST_DATABASE_URL`; secret chiffré, 10 codes de secours hachés, audit vérifié |
| Remplacement 2FA | Refus sans facteur actuel; un code de secours permet une opération puis est consommé |
| Réinitialisation CLI 2FA | Confirmation littérale et facteur du SUPER_ADMIN requis; session famille révoquée et audit vérifié |

**Résultats locaux : 20/20 e2e PostgreSQL réussis, 30/30 tests API unitaires réussis, 3/3 tests d’outils réussis; lint API et Angular réussis.** La CI installe Chromium et exécute le test Playwright. L’audit npm, Docker et les sauvegardes ne font pas partie de cette exécution.

**Les noms de présence sont protégés par jour : oui.** Preuves principales :
- `denies cross-day, cross-sheet, cross-zone and named access across attendance routes` — refus inter-jour X/Y pour les deux zones, lecture/écriture, filtrage du récapitulatif hebdomadaire, secrétaire et route admin nominative.
- `limits president reads to own day/sheet and prevents cross-role writes on each attendance route` — propriétaire de feuille, accès au cours et refus de rôle croisé.
- `shows totals only by default; named admin access requires a reason and is logged` — masquage administratif par défaut et trace de la consultation explicite.
- `does not write attendance names, tokens, or passwords to application logs` — noms canaris et secrets absents des journaux capturés.


### Résultat final XSS — 7 octobre 2026

Correction de l’état Playwright indiqué dans les sections précédentes : Chromium était disponible localement. Le test du rendu d’une publication et d’un commentaire contenant des scripts, balises HTML et attributs d’événement a réussi (**1/1**). L’absence d’exécution JavaScript et l’absence de nœuds HTML injectés ont été vérifiées dans le navigateur. Le test est aussi relié au workflow CI avec installation de Chromium.

**Bilan de vérification de ce tour : 20/20 e2e PostgreSQL; 30/30 tests API; 3/3 tests utilitaires; 1/1 Playwright; lint et build API/Angular réussis.**

### Actualités — incrément interface du fil mobile — 7 octobre 2026

L’écran communautaire expose maintenant les actions déjà prises en charge par l’API : recherche textuelle (paramètre `q`, longueur limitée à 100 caractères), modification des publications de l’utilisateur, panneau de notifications, consultation/déblocage des comptes bloqués et insertion immédiate du repartage dans le fil affiché. Ces fonctions ne créent aucun droit serveur supplémentaire. Lint TypeScript et compilations API/web réussissent après correction d’une erreur de template détectée au premier essai. Les quatre tests unitaires ciblés existants du fil passent; les nouveaux contrôles n’ont pas encore été validés par e2e.

État historique de cette passe : à ce moment, les photos/vidéos et profils éditables étaient absents et les fonctions de messagerie privée, stories et directs n’étaient pas encore incluses. Leur état actuel est décrit dans la mise à jour du 9 octobre 2026 en fin de document; les pièces jointes photo/vidéo et profils personnalisés restent absents ou désactivés.

### Extension au périmètre social — profil membre — 7 octobre 2026

Ajout d’une présentation textuelle de profil (500 caractères maximum), modifiable par le membre connecté, avec affichage du nom selon la règle de confidentialité des mineurs. Aucun téléphone, e-mail ou date de naissance n’est renvoyé. Le profil est accessible par `GET/PATCH /social/profile`, sans identifiant de compte fourni par le client. Migration ajoutée : `20261009000000_social_profile_bio`.

Lint et build API/web réussis; Prisma Client regénéré. Le scénario e2e a été ajouté pour confidentialité, limite de longueur et refus d’un rôle sans accès social. Son exécution est bloquée avant les tests : `prisma migrate deploy` sur la base de test `paroisse_test` retourne `Schema engine error` sans détail, même après vérification non sensible de la configuration. La base de développement n’a pas été utilisée. La migration n’est donc pas déclarée appliquée et l’e2e n’est pas certifié.

### Résolution e2e — profil et horaires — 7 octobre 2026

Le diagnostic a montré que Prisma ne pouvait pas joindre `localhost:5432` depuis le bac à sable. Après accès contrôlé à la seule base `paroisse_test`, la migration `20261009000000_social_profile_bio` a été appliquée et la suite e2e a réussi : **20/20**. Le contrôle vérifie aussi l’absence d’e-mail, téléphone et date de naissance dans le profil, la limite de 500 caractères et le refus d’un compte ADMIN sur cette route réservée aux membres sociaux. Aucun accès/migration sur `DATABASE_URL`.

L’e2e a trouvé un autre défaut réel : la tolérance `ATTENDANCE_GRACE_MINUTES` n’était pas appliquée aux groupes de semaine. Le calcul serveur a été corrigé pour respecter la tolérance valide configurée (0 à 120 minutes) pour les deux types de séance; l’e2e réel a ensuite réussi sans modifier son assertion.

### Actualités — dépôt privé de photos — 8 octobre 2026

Ajout d’un premier parcours d’images : JPEG, PNG et WebP signés, contrôle antivirus ClamAV, décodage et réencodage Sharp en WebP, stockage S3 privé, lecture via une route authentifiée avec les mêmes contrôles de visibilité, de compte actif, de masquage et de blocage que la publication. Les métadonnées d’objet ne sont jamais renvoyées au navigateur. La configuration absente désactive la fonctionnalité et refuse l’envoi.

Migration `20261008000100_social_post_media` appliquée par le script e2e à `paroisse_test` uniquement. Vérifications : **21/21 e2e réussis**; scénario média inclus (réencodage, pas de clé d’objet divulguée, lecture publique authentifiée, lecture d’une publication privée refusée, SVG déguisé rejeté). Lint API/web et builds ont été relancés après l’ajout du scénario final.

Limite opérationnelle de cette passe antérieure : S3/ClamAV n’étaient pas validés et le support des vidéos ainsi que l’édition/suppression d’images restaient absents. Les stories textuelles et la messagerie sont maintenant décrites dans l’état du 9 octobre; l’envoi de médias demeure désactivé.

### Contrôle des dépendances — 8 octobre 2026

`npm audit --omit=dev --audit-level=high` retourne encore **3 avis hauts et 2 modérés**, dans `deepmerge-ts` transitif de Prisma et `js-yaml` sous Prisma/Nest Swagger. L’audit complet après `npm audit fix` non forcé compte **38 avis (32 hauts, 6 modérés, aucun critique)**; 10 paquets compatibles ont été actualisés. Les avis Jest/braces et js-yaml/argparse restants demandent le passage à Jest 30 (changement majeur) selon npm; ce changement n’a pas été forcé. Risque résiduel à traiter avant production, en qualifiant d’abord une montée majeure du runner et les correctifs du graphe Prisma/Swagger.

### Contrôle de reprise V1 — 8 octobre 2026

Lors de la dernière tentative, `npm audit --omit=dev` et `npm audit` n’ont pas pu joindre `registry.npmjs.org` (`getaddrinfo ENOTFOUND`). Aucun résultat frais n’a donc été obtenu et aucune dépendance n’a été changée dans cette étape. Le dernier relevé exploitable ci-dessus reste le point de comparaison (3 hauts/2 modérés en production; 32 hauts/6 modérés au total), mais il peut être périmé. Relancer les deux audits sur un réseau avec accès au registre puis traiter les vulnérabilités sans `--force` aveugle.

### V1 — modération — 8 octobre 2026

**Corrigé et validé sur TEST_DATABASE_URL.** Signalements POST/COMMENT/PROFILE avec motifs enum fermés et unicité fidèle/contenu; seuil et durée de masquage automatique configurables; file réservée aux MODERATEUR/ADMIN/SUPER_ADMIN; décisions avec motif obligatoire, historique et journal d’audit; sanctions transactionnelles; limites de pouvoir (MODERATEUR : suspension temporaire jusqu’à 30 jours; ADMIN : suppression, suspension définitive et appels); appel unique examiné par un autre administrateur que l’émetteur. Interface de signalement sur publications, commentaires et profils, et page de file dédiée.

`SOCIAL_PHOTOS_ENABLED=true` est exigé en plus de S3 privé et ClamAV; flag désactivé ou absent = envoi/lecture refusés. Porte étape 1 : **24/24 e2e PostgreSQL**, **28/28 tests unitaires API**, lint/typecheck API et web, builds API et web réussis. E2e dédiés : doublon de signalement, masquage au seuil et invisibilité dans le fil, file interdite au fidèle, décision interdite au fidèle, suspension temporaire révoquant immédiatement les sessions, recours interdit au modérateur, audit, contenu privé non signalable et limite par fidèle.

Risques opérationnels restants : valider l’intégration avec S3 et ClamAV réels avant toute activation; faire contrôler humainement le parcours des sanctions et appels. L’audit npm est réalisé à l’étape suivante.

### Version 1 — profils, interface et validation finale — 8 octobre 2026

Les paramètres de profil et de compte sont livrés : présentation textuelle et confidentialité, changement de mot de passe avec l’ancien requis, révocation des autres sessions, liste/révocation de sessions, export JSON et fermeture de compte avec délai de grâce de 14 jours. Les photos de profil sont désactivées lorsque les médias ne sont pas configurés.

Interface testée à 360 px : accueil, inscription, connexion fidèle, mot de passe oublié/réinitialisation, connexion admin et sous-admin, actualités, présences, administration, modération et programme biblique. Menu d’accueil utilisable au clavier. 14/14 tests Playwright passés, dont publication/commentaire/profil avec balises hostiles, attributs d’événement et liens `javascript:` rendus comme texte sans exécution. 25/25 e2e PostgreSQL sur TEST_DATABASE_URL, 28/28 unitaires API, lint et compilations API/web réussis.

La seule langue livrée est le français (`lang=fr`); aucun catalogue Angular multilingue n’est livré. Une revue humaine clavier/lecteur d’écran reste nécessaire.

Les noms de présence sont protégés par jour selon les e2e d’IDOR et de consultation nominative motivée. Les parcours d’activation photo/API refusent l’usage lorsque le flag est coupé; les tests d’activation utilisent des doublures S3/ClamAV. Ne pas activer les photos avant un essai avec stockage privé et scanner réels.

`prisma generate` standard a rencontré sous Windows un verrou `EPERM` en remplaçant le moteur natif. La génération de types sans moteur a permis la compilation et les e2e utilisent le client déjà généré. Fermer les processus Node puis régénérer le moteur natif avant une livraison Windows.

Après cette mise à jour, lint et builds API/Angular ont réussi, et la suite dédiée a été relancée : **21/21 e2e**. Le scénario concurrent a cette fois mis en évidence que l’ajout et la soumission ne verrouillaient pas explicitement la même ligne avant de compter. Les opérations ajout/soumission verrouillent maintenant la ligne AttendanceSheet dans leur transaction via un SELECT FOR UPDATE paramétré; l’assertion des totaux reste inchangée et le test passe.

### Communauté — groupes, conversations et médias — 8 octobre 2026 (état de ce tour)

Les migrations `20261012000000_social_groups`, `20261013000000_social_video_and_documents` et `20261014000000_social_group_discussions` ont été appliquées avec `prisma migrate deploy` à `paroisse_test` uniquement. Le client Prisma généré en staging reconnaît les tables; une lecture seule a confirmé que le modèle `SocialGroupPost` répond. La base de développement n’a pas été ciblée.

Les membres peuvent créer des groupes publics/privés, rejoindre ou demander l’accès, valider les demandes de leur propre groupe, quitter ou supprimer leur groupe, publier des messages textuels et commenter. L’API exige l’appartenance au groupe pour toute lecture/écriture; un groupe privé ne révèle ses échanges qu’à ses membres. Les blocages mutuels sont appliqués dans les échanges et commentaires. La suppression d’un échange est limitée à son auteur ou au responsable du groupe. Les actions du fil principal (texte, réactions, commentaires, liens et enregistrement) restent distinctes des groupes.

Dans le fil principal, l’interface prend en charge le texte et les pièces jointes photo, vidéo MP4/WebM et PDF, ainsi qu’un aperçu sûr de lien HTTP(S). Les médias restent désactivés tant que stockage S3 privé et ClamAV ne sont pas réellement configurés; aucune activation n’a été faite dans `.env`. Les vidéos sont analysées mais non transcodées et peuvent garder des métadonnées personnelles. Les PDF sont fournis en téléchargement. Les photos sont réencodées en WebP sans EXIF.

Vérification de ce tour : `tsc --noEmit` API/web et `nest build`/`ng build` réussis; `git diff --check` réussi après nettoyage du fichier staging. La suite e2e a été relancée après ajout d’un scénario d’accès aux groupes : 30/30 réussis sur PostgreSQL de test. Le nouveau scénario vérifie qu’un membre non accepté et un non-membre reçoivent 404, qu’un membre accepté peut publier/commenter, que la clé d’idempotence évite les doublons et que bloquer le responsable masque ses messages et commentaires. Les téléchargements médias réels et les limites de débit des groupes restent à valider. Il reste aussi à valider S3, ClamAV et le transcodage vidéo avec des services réels avant toute ouverture des médias.

À la date de cette vérification historique, les lives, stories et messages privés étaient absents. Ces fonctions ont depuis été ajoutées avec un périmètre paroissial réduit; voir l’état du 9 octobre en fin de document. Le partage de documents dans les groupes reste hors service tant que le pipeline média n’est pas validé.
### Communauté — sondages et événements — 8 octobre 2026

Ajout des sondages publics (2 à 6 choix, changement de vote, date de clôture facultative) et des événements paroissiaux (titre, date/heure, lieu facultatif, réponses « Je participe / Intéressé / Je ne peux pas »). Les réponses ne renvoient que des totaux agrégés et le choix propre au membre; aucune liste de participants n’est exposée. Les accès passent par l’authentification membre, les publications visibles, les blocages et les sanctions existantes. Idempotence et limites de débit par compte sont appliquées.

La migration `20261016000000_social_events` a été appliquée par `prisma migrate deploy` uniquement à `paroisse_test`. `DATABASE_URL` n’a pas été utilisée pour une migration. Vérifications après ces changements : lint API/typecheck, build API et build web réussis; e2e PostgreSQL de test : **33 réussis, 0 échoué**. Le test ajouté valide la date, les rôles, l’agrégation et la modification d’une réponse.

Les événements et sondages de cette version historique sont des fonctions paroissiales ciblées et ne constituent pas une parité avec une plateforme sociale généraliste. Les médias restent désactivés sans S3 privé et ClamAV réels. Les stories et directs ont été ajoutés plus tard selon l’état décrit le 9 octobre; une diffusion à grande audience reste hors périmètre.

Audit npm et vérification navigateur — 8 octobre 2026 : `npm audit --omit=dev` et `npm audit` ont échoué avant obtention d’avis avec `ENOTFOUND registry.npmjs.org`. Playwright a été lancé pour les écrans mobiles/XSS; son serveur éphémère sur le port 4300 n’a pas répondu avant expiration, donc 0 test navigateur exécuté dans cette mise à jour. Une vérification humaine sur réseau fonctionnel est nécessaire.

### Consolidation sécurité — résultat vérifié le 8 octobre 2026

- **Présences, comptes, authentification, quotas et modération :** 35/35 e2e réussis sur `TEST_DATABASE_URL` (`paroisse_test`); 21 migrations déjà appliquées, aucune migration exécutée vers la base de développement. Cela comprend votes uniques avec contrainte de base, journal d’un changement de vote sans identifiant de membre, sondages clôturés et privés/bloqués refusés, totaux sans liste de votants, quotas de comptes récents, dates et longueurs d’événements, refus RSVP d’un compte suspendu et limites de débit.
- **XSS navigateur :** un parcours Playwright vérifie les publications, commentaires, question et options de sondage, titre/lieu/description d’événement, nom affiché, présentation et motifs de signalement. Les balises et liens hostiles sont affichés comme texte sans exécution. Les motifs sont limités à cinq valeurs fixes et ne comportent pas de champ de texte libre. Le test inclut les charges `<script>`, attributs d’événement, `javascript:` et image `onerror`.
- **Présentation/accessibilité vérifiées :** 16/16 tests Playwright réussis; 12 routes sans débordement horizontal à 360 px, navigation menu au clavier sur téléphone et ordinateur, et contraste AA calculé pour les textes essentiels de la communauté. Cette vérification de contraste ne constitue pas un audit exhaustif de chaque composant de toutes les pages.
- **Validation code :** `npm run lint` (TypeScript API et web), `npm test` (29 tests unitaires API et 3 tests outils) et `npm run build` (Nest puis Angular, en série) réussis. Le lancement parallèle des builds épuisait la mémoire; le script racine a été rendu séquentiel.
- **Risque résiduel dépendances — reporté :** les deux commandes npm audit (`--omit=dev` et complète) échouent sur `ENOTFOUND registry.npmjs.org` avant de recevoir les avis. Aucune conclusion de sécurité des dépendances ne peut être tirée; relancer les audits sur un réseau ayant accès au registre puis traiter les avis critiques/hauts.
- **Risque résiduel opérationnel :** les médias restent désactivés tant que S3 privé et ClamAV ne sont pas réellement configurés et testés. HTTPS, restauration de sauvegarde, test d’exploitation externe, et revue humaine des contrastes et textes sur tous les écrans restent nécessaires avant la production.

## Profil membre public — 9 octobre 2026

Les fidèles découvrables peuvent maintenant être ouverts depuis le nom d’auteur d’une publication. La fiche présente le nom d’affichage, la présentation et au plus 20 publications publiques récentes. Elle n’inclut ni coordonnées privées ni publications « Moi seul ». L’API refuse les profils non découvrables, suspendus, masqués par une sanction de modération, et les profils bloqués dans l’un ou l’autre sens. La vue utilise l’interpolation Angular pour afficher le texte sans interpréter le HTML.

Le test e2e dédié a été ajouté pour la visibilité, la confidentialité des champs, les publications privées et le blocage. Il n’a pas pu être exécuté dans cet environnement : PostgreSQL local sur le port 5432 ne répond pas, Prisma a donc échoué avant le démarrage des scénarios. Résultat de cette tentative : **0 e2e exécuté, 0 réussi, 0 échoué**. Les 29 tests unitaires API, les typechecks et les builds API/web passent.

Les comptes ne peuvent pas définir un nom d’affichage libre ni ajouter une photo de profil; les avatars restent des initiales. Cette entrée précédait l’ajout des stories textuelles et directs du 9 octobre. Les médias d’actualité restent désactivés sans S3 privé, antivirus ClamAV et pipeline vidéo validés.

## Contrôles profils et groupes — 9 octobre 2026

Le profil public applique une limite de 30 lectures par membre sur 10 minutes. Les scénarios e2e couvrent maintenant les profils non découvrables, suspendus, masqués par la modération et bloqués dans chacun des deux sens; les réponses vérifient le filtrage des coordonnées, l’anonymisation du nom des mineurs, les 20 publications publiques les plus récentes et le refus sans authentification. Un scénario vérifie aussi la limite de débit.

La discussion privée de groupe est couverte par des cas d’accès lecture/écriture refusés pour les non-membres et demandes en attente, retrait d’adhésion, blocage entre membres, et transport de texte hostile. Le navigateur doit vérifier son rendu comme texte. Le profil et les discussions de groupe ont des cas Playwright XSS qui contrôlent le contenu rendu et les éléments HTML injectés.

Playwright exécute désormais `ng build` avant `ng serve`; un échec de compilation arrête le serveur de test au lieu de laisser l’exécution continuer. `npx playwright test --list` a reconnu 16 tests (liste uniquement; aucun test lancé).

Vérifications effectuées par Codex : lint/typecheck, `npm test` (29 tests API et 3 tests outils), `npm run build` (API et Angular), et compilation TypeScript du fichier e2e : réussis. La base locale n’étant pas joignable, les e2e et les tests navigateur ne sont **pas exécutés par moi**. Les 35 e2e annoncés par l’humain sont des résultats antérieurs et ne couvrent pas les nouveaux tests de profil/groupes.

## Remplacement de la communauté par la messagerie — 9 octobre 2026

À la demande du propriétaire du projet, l’ancienne communauté sous forme de fil de publications a été retirée du code actif. La migration `20261019000000_replace_legacy_community` supprime les anciennes tables de publications, commentaires, réactions, sondages, événements et groupes du modèle précédent; elle conserve les données de blocage nécessaires au contrôle des échanges. Elle a été appliquée uniquement à `paroisse_test`. Son application à une autre base supprimera les anciennes données communautaires : faire une sauvegarde et confirmer leur suppression avant déploiement.

Le module actuellement livré est une messagerie paroissiale avec conversations directes et groupes privés, texte, réponses, réactions, statut de lecture, blocage et signalement. Les contrôles serveur vérifient l’adhésion avant lecture/écriture; la modération est séparée. Les mises à jour du fil sont interrogées toutes les 15 secondes, il ne s’agit pas d’un transport temps réel WebSocket. Le contenu des messages n’est pas chiffré de bout en bout.

Vérification locale de cette consolidation : `npm test` (29 tests API + 3 tests outils), `npm run lint`, `npm run build`, e2e contre `TEST_DATABASE_URL` (26/26) et Playwright (16/16), incluant compilation Angular avant démarrage et écrans mobiles/XSS. Ces résultats décrivent le code local vérifié le 9 octobre 2026; ils ne certifient pas une installation de production ni l’audit des dépendances. `npm audit` doit être retenté avec accès au registre, son dernier résultat étant bloqué par DNS.

Limites de sécurité/fonctionnelles restantes à cette date du 9 octobre : les pièces jointes, photos et vidéos restent désactivées sans S3 privé, ClamAV et transcodage. Les stories textuelles et les directs WebRTC ont été ajoutés ensuite; les risques et tests sont consignés dans la section « Stories, directs et annuaire » ci-dessus. Avant usage réel, revoir la conservation des messages, confirmer les migrations sur la base cible, vérifier une restauration de sauvegarde et exécuter l’audit npm depuis un réseau autorisé.

### Retest final — 9 octobre 2026

Après correction de l’ouverture du panneau de détails sur petit écran, vérifications répétées sur la version courante : tests unitaires 29/29 API et 3/3 outils; `npm run lint` réussi; `npm run build` réussi; e2e contre `paroisse_test` 26/26 (4 messagerie + 22 sécurité); Playwright 17/17 après build Angular frais. Le 17e test vérifie que le panneau de détails s’ouvre à 360 px. L’application de ces migrations sur la base de développement ou la base de production n’a pas été testée ni effectuée.

Audit npm final, 9 octobre 2026 : `npm audit --omit=dev --audit-level=high` et `npm audit --audit-level=high` ont échoué avant l’analyse (`audit endpoint returned an error`, requête bulk au registre sans réponse exploitable). npm n’a pas non plus pu écrire son journal dans son dossier local de cache. Il n’y a donc aucun résultat de vulnérabilités exploitable pour cette exécution; recommencer depuis une machine avec accès au registre et un cache npm inscriptible.
## Messagerie paroissiale : exigences ciblees, controle du 9 octobre 2026

Resultats sur le code courant : 29/29 e2e API sur `TEST_DATABASE_URL` (`paroisse_test`), 29/29 tests unitaires API, 3/3 tests outils, 20/20 tests Playwright. `npm run lint` et `npm run build` reussissent. Aucun secret ni valeur de `DATABASE_URL` n'a ete affiche; aucune migration n'a ete envoyee sur la base de developpement.

1. **Protection des mineurs : partiellement couverte.** L'age est calcule dans le service depuis la date de naissance en base, au fuseau `Africa/Porto-Novo`; un adulte ne peut pas ouvrir de conversation avec un mineur. Le role de dirigeant doit etre assigne par l'administration (jour affecte en base), mais ne suffit pas a autoriser une conversation adulte-mineur. Les tests e2e couvrent les deux sens adulte/mineur, dirigeant sans groupe approuve et groupe d'ages mixtes. Il n'existe pas de modele de groupe approuve par l'administration : les cas mixtes restent donc refuses (fermeture par defaut).
2. **Qui peut ecrire a qui : partiellement couvert.** Les directs sont permis entre membres ayant une tranche d'age connue et identique, et refuses entre mineur/adulte ou si l'age est inconnu. Les e2e couvrent les autorisations et refus. Le parcours de demande puis d'acceptation de contact n'existe pas.
3. **Consultation de moderation : couverte.** La file ne renvoie que le message signale; MODERATEUR/ADMIN peut demander explicitement jusqu'a dix messages de contexte (cinq de chaque cote), et cet acces est journalise avec identifiants et compte, sans corps de message. E2e : limite de contexte, journal d'audit, refus de lecture normale d'une conversation non signalee pour ADMIN/MOD.
4. **Temps reel : non applicable au code present.** Le transport est un rafraichissement HTTP periodique; aucun WebSocket/Gateway n'existe. Connexion sans cookie, abonnement a conversation etrangere et coupure d'une socket suspendue/revoquee : 0 test execute, car aucune socket n'est implementee.
5. **Envoi hors ligne : couvert par Playwright.** `setOffline` verifie la mise en file locale, la reprise en ligne, la cle d'idempotence stable et l'absence de doublon. La file IndexedDB n'est pas chiffree; elle est partitionnee par identifiant utilisateur et ne contient pas de jeton d'authentification. La protection des donnees au repos du profil navigateur reste un risque residuel.
6. **Conservation/export/suppression : couvert par e2e.** La purge est configurable (`COMMUNITY_MESSAGE_RETENTION_DAYS`, valeur par defaut 365 jours, bornes 1 a 3650) et conserve les messages plus recents. Export inclut les messages visibles des conversations du membre. La suppression definitive du compte supprime ses messages et conserve ceux des autres membres. Test de retention, export et suppression reussi.
7. **Annonces des dirigeants : non implemente.** Aucun endpoint/fonction d'annonce, ni badge d'annonce attribue par admin n'existe dans ce module. 0 e2e execute pour ce parcours; le role de dirigeant n'est pas presente comme un droit de publier une annonce.
8. **Logs/XSS : couvert partiellement.** Un e2e recherche le contenu sentinelle et les secrets dans les journaux d'audit applicatifs; il ne collecte pas les stdout/stderr de processus externes. Playwright verifie les titres de groupe, nom/donnees de signalement et contexte de message hostile comme texte, sans execution. Les champs regles et description de groupe n'existent pas et ne sont donc pas couverts.

Les anciens tests du code existant : 29/29 e2e et 20/20 Playwright. Le retest courant du 9 octobre est consigné dans « Messagerie de la communauté — retest ». Les fonctions absentes (WebSocket et annonces) restent indisponibles. L'audit `npm audit` reste bloque par l'acces au registre npm.

## Messagerie de la communauté — retest du 9 octobre 2026

Sur le code courant, les noms des comptes paroissiaux actifs figurent dans l’annuaire et les coordonnées privées ne sont pas incluses. Les directs sont autorisés entre membres de même tranche d’âge connue; direct adulte/mineur et âge inconnu sont refusés par le serveur. Les groupes sont privés et rejoignables par code, avec contrôles d’âge et de blocage à l’adhésion. Le code brut n’est pas stocké en base (empreinte SHA-256). ADMIN/SUPER_ADMIN peuvent consulter en lecture seule les conversations et messages; liste et consultation de contenu sont auditées. La navigation de présence a été retirée de l’interface de messagerie.

## Stories, directs et annuaire — vérification du 9 octobre 2026

- **Décision de confidentialité :** les comptes actifs peuvent être trouvés par nom et contactés en message privé. E-mail, téléphone et date de naissance ne sont pas exposés dans l’annuaire. Le numéro public de chaque membre n’est donc pas affiché; l’adresse privée est la conversation intégrée. Le numéro saisi n’est pas vérifié comme compte WhatsApp.
- **Stories :** texte uniquement, taille limitée, expiration à 24 h, filtrage d’âge et blocage. Les motifs de signalement sont fermés, la répétition d’un signalement est refusée, la file est réservée à la modération et chaque décision requiert un motif audité. E2E dédiés : publication, expiration, filtrage, quota, ID de signalement unique, permission de modération, masquage effectif et audit.
- **Direct vidéo :** WebRTC pair-à-pair avec quatre spectateurs maximum, adhésion persistante contrôlée côté serveur, interdiction d’accès cross-age, validation des cibles et des signaux, fin explicite/purge des signaux; supervision admin en lecture seule des métadonnées. E2E dédiés : lancement/rejoindre, filtrage âge, capacité, signalisation autorisée/refusée, fin de diffusion.
- Résultats du 9 octobre : `security-e2e.cjs` sur `TEST_DATABASE_URL` **34 réussis, 0 échoué**; Playwright **24 réussis, 0 échoué**; lint passé, `nest build` et Angular build passés. Le build racine a échoué uniquement à la copie du client Prisma vers `dist` (EPIPE pendant que le serveur local était encore lancé); retester après arrêt contrôlé des serveurs.
- **Risques résiduels importants :** les tests ne valident pas une liaison vidéo réelle entre téléphones/réseaux. STUN seul ne traverse pas toutes les politiques NAT; HTTPS et TURN sont requis pour la production. Le modèle mesh à quatre spectateurs n’est pas dimensionné pour un culte à grande échelle. Il n’y a pas de test de charge, d’enregistrement ni d’archivage vidéo. Les coordonnées privées ne sont pas incluses dans les conversations et les numéros ne sont pas vérifiés via WhatsApp.
- **Migration :** la migration `20261022000000_story_moderation` a été déployée par le harnais isolé sur `paroisse_test`; `DATABASE_URL` n’a pas été visée.

## Audit final de la messagerie communautaire — 9 octobre 2026

Cette entrée remplace les compteurs antérieurs qui divergent. Vérifications exécutées sur le code présent; seule la base `paroisse_test` a été consultée pour le statut de migration et les e2e.

- **Messagerie et IDOR :** les 12 tests de `community-messaging.e2e-spec.ts` réussissent. Ils couvrent recherche par nom, absence d’e-mail/téléphone/date de naissance, échange entre deux comptes, rejet de lecture/écriture par un tiers, absence d’une conversation d’autrui dans la liste, persistance du message après nouvel accès du membre, groupes privés, signalement/modération, âges, rétention/export/suppression et limites de rôles. Ce sont des requêtes HTTP réelles à Nest contre PostgreSQL de test, pas deux navigateurs indépendants.
- **État réseau UI :** un bandeau accessible indique interruption et reprise/synchronisation. Playwright vérifie la file IndexedDB, le renvoi idempotent sans doublon et la disparition de l’indicateur après reconnexion. La file est en clair dans le profil navigateur : éviter les appareils partagés.
- **Stories :** texte seulement, affichage pendant 24 h, masquage, signalement unique, file de modération et décisions avec motif/audit sont couverts par e2e. Une tâche planifiée supprime physiquement les stories expirées toutes les dix minutes. Aucun média de story n’est activé; S3 privé, ClamAV, validation/réencodage de fichiers et contrôle d’accès ne sont pas validés ensemble ici.
- **Directs :** les e2e vérifient les permissions, l’âge, la capacité, la signalisation et la fermeture métier, mais **aucun appel caméra/micro réel entre appareils ou réseaux n’a été établi durant cet audit**. HTTPS hors localhost et consentement caméra/micro sont requis. STUN par défaut ne couvre pas les NAT restrictifs; configurer et tester TURN. Le mesh hôte + quatre spectateurs ne convient pas à une grande audience. Aucun direct n’est enregistré.
- **Règles communautaires :** l’âge vient des données serveur; les directs sont limités à une tranche d’âge connue commune. Les âges inconnus ou mixtes sont refusés; aucun flux d’approbation admin pour groupes mixtes n’existe. Les numéros ne sont pas exposés et leur appartenance à WhatsApp n’est pas vérifiée. Les messages ne sont pas chiffrés de bout en bout.
- **Base :** `DATABASE_URL` cible `paroisse` (`localhost:5432`), `TEST_DATABASE_URL` cible `paroisse_test` (`localhost:5432`), et `PRODUCTION_DATABASE_URL` est absente du `.env`. `prisma migrate status` (lecture seule) a relevé 27 migrations, dont **11 en attente** sur `paroisse`; aucune n’a été appliquée. Le statut de `paroisse_test` indique 27 migrations et aucune en attente. La production n’est pas identifiable depuis ce poste; son environnement de déploiement doit être audité par l’opérateur.
- **Commandes/résultats :** `npm run test:e2e` — 34/34; `npm test` — 29/29 API + 3/3 outils; `npm run test:playwright` — 24/24 après build Angular frais; `npm run lint` — réussi; `npm exec --workspace @paroisse/api -- nest build` — réussi; build web — réussi. `npm run build --workspace @paroisse/api` a compilé Nest puis échoué à la copie Prisma (`EPIPE`, fichier utilisé dans `apps/api/dist/.../generated/prisma`). Le build racine complet n’est pas certifié réussi dans cette passe.
- **Migrations :** `20261022000000_story_moderation` est appliquée sur `paroisse_test` seulement. Aucun déploiement dev/prod; vérifier les conséquences des migrations historiques de remplacement de communauté avant application ailleurs.

Risques avant production : diagnostiquer le verrou Windows du build API complet; valider les cibles dev/prod sans divulguer d’URL; tester un vrai appel WebRTC sur deux appareils avec HTTPS/TURN; exécuter audit npm, validation TLS/HSTS, sauvegarde/restauration et revue humaine de la rétention/modération. Ceci n’est pas une certification de sécurité ni de disponibilité en production.

`npm audit --omit=dev --audit-level=high` a été relancé avec accès registre : **5 avis (3 hauts, 2 modérés)**, dont `deepmerge-ts` sous `prisma > @prisma/config` (haut) et `js-yaml` sous `@nestjs/swagger` (modéré). `npm audit --audit-level=high` complet : **39 avis (1 critique, 32 hauts, 6 modérés)**. Le rapport mentionne notamment `handlebars` (critique), `braces` (haut, chaîne Jest demandant un saut majeur avec `--force`), `deepmerge-ts`, `js-yaml` et `sprintf-js`; aucun paquet n’a été modifié dans cette passe. Ces vulnérabilités restent ouvertes : qualifier les mises à niveau compatibles et relancer tests/builds/audit, sans appliquer `--force` aveuglément.

### Retest après mise à niveau compatible — 9 octobre 2026

`npm audit fix` sans `--force` a modifié un paquet dans le lock et supprimé l’avis critique `handlebars` (chemin de développement via `ts-jest`). Nouvel audit complet : **38 avis (0 critique, 32 hauts, 6 modérés)**; audit de production : **5 avis (3 hauts, 2 modérés)**, mêmes chemins Prisma/Swagger. Aucun correctif majeur n’a été forcé. Après cette mise à jour : `npm test` 29/29 API + 3/3 outils, lint réussi, e2e 34/34 sur `paroisse_test`, Playwright 24/24 après build frais, build Angular réussi. Le build API complet compile Nest mais échoue toujours à la copie Prisma avec `EPIPE` sur le dossier de sortie occupé; le `nest build` intégré avant cette étape ne signale pas d’erreur.

Playwright a d’abord révélé une course lors de la reconnexion hors ligne (requête d’historique concurrente à l’envoi de l’outbox). L’UI séquence maintenant le renvoi puis la synchronisation; le faux serveur navigateur conserve ses messages persistés. Le test ciblé puis la suite Playwright complète réussissent. Le test d’expiration story vérifie désormais aussi la suppression physique par la tâche planifiée.

Vérification exécutée : les fichiers e2e ont passé **31/31 tests** sur `TEST_DATABASE_URL` (9 messagerie + 22 sécurité; migrations de test déjà à jour). Après correction du scénario CAPTCHA auquel manquait le numéro devenu obligatoire : `npm test` a passé **29/29 tests API et 3/3 tests outils**; `npm run lint` et `npm run build` (API et Angular) ont réussi.

Limites et risques restants : le format E.164 ne confirme pas que le numéro est un compte WhatsApp; le code de groupe n’expire pas et ne peut pas être révoqué/renouvelé depuis l’interface; l’administration principale peut lire tous les messages avec journalisation, donc ses comptes doivent être strictement désignés. Les messages ne sont pas chiffrés de bout en bout. La passe Playwright finale après les changements UI a passé **20/20**. L’audit npm reste bloqué par l’accès au registre. La migration de code de groupe n’a pas été appliquée à la base de développement/production.

## Vérification technique finale — 9 octobre 2026

### Build API / EPIPE

- Reproduction exacte de `npm.cmd run build --workspace @paroisse/api` : `prisma generate` puis `nest build` réussissaient ; `node scripts/copy-prisma-client.cjs` échouait dans `fs.cpSync` avec `EPIPE`/erreur Windows 32 sur `apps/api/dist/apps/api/src/generated/prisma`.
- Cause confirmée : le processus Node PID 19576 avait chargé `query_engine-windows.dll.node` depuis cette destination. Les 27 fichiers du client Prisma généré (source et destination) étaient identiques. Deux copies de contrôle vers des dossiers neufs, dont un sous le même parent `dist`, ont réussi. Windows empêchait donc la réécriture du binaire natif en cours d’utilisation ; il ne s’agissait pas d’une erreur TypeScript, d’une génération Prisma concurrente prouvée ou d’un fichier source absent.
- Correction : `copy-prisma-client.cjs` copie seulement les fichiers absents ou dont le contenu diffère. Le build API complet exécuté avec le moteur chargé passe (code 0). Si une future génération modifie le moteur natif, fermer l’API avant de générer/reconstruire ; un moteur différent toujours chargé restera verrouillé.

### Dépendances npm

Audits actualisés avec accès au registre le 9 octobre :

| Périmètre | Résultat | Principaux chemins et exploitabilité |
| --- | --- | --- |
| `npm audit --omit=dev` | 5 avis : 3 hauts, 2 modérés, 0 critique | `deepmerge-ts` via `prisma > @prisma/config` (haut, épuisement de pile sur graphes récursifs ; traitement de configuration Prisma en build/migration) ; `js-yaml` via `@nestjs/swagger` (modéré, déni de service CPU au parsing YAML ; Swagger est désactivé en production). Le décompte npm inclut les chemins affectés répétés. |
| `npm audit` | 38 avis : 32 hauts, 6 modérés, 0 critique | `braces` via Jest/micromatch (haut, motifs imbriqués ; chaîne de test/dev, fix npm exige Jest 30 majeur) ; `deepmerge-ts` via Prisma ; `js-yaml` via Swagger et `@istanbuljs/load-nyc-config` ; `sprintf-js` via `argparse`/Istanbul (modéré, spécificateur de précision non borné ; outil de test/dev). |

`npm audit fix --dry-run` a conclu « up to date » sans changement compatible immédiat. Aucun saut majeur, `--force` ou override n’a été appliqué. Les avis dev sont reportés jusqu’à une mise à niveau planifiée de Jest ; les avis Prisma/Swagger doivent être corrigés ou acceptés explicitement avant production. Les avis modérés d’outillage sont reportés et doivent être réévalués au prochain changement de lockfile.

### Configuration de sécurité observée et limites

- Présent dans le dépôt : Helmet/CSP au serveur et Nginx, HSTS à un an côté Nginx, redirection HTTP vers HTTPS, TLS 1.2/1.3, CORS credentials avec `FRONTEND_ORIGIN`, cookies HttpOnly/SameSite=Strict et Secure en production, garde CSRF double-submit, proxy de confiance limité au conteneur Nginx, Swagger désactivé avec `NODE_ENV=production`, rôle PostgreSQL applicatif sans superuser/CREATEDB/CREATEROLE, PostgreSQL sans port hôte publié, Nginx et API en utilisateur non-root. Les valeurs des secrets Compose n’ont pas été lues ni consignées.
- Non prouvé sur infrastructure réelle : validité/renouvellement du certificat TLS, DNS/pare-feu, secrets configurés sur l’hôte, exposition réseau effective, exécution Compose, sauvegarde chiffrée et restauration réelle. Le conteneur API copie encore tout le projet et les dépendances de développement depuis l’étape de build ; réduire le contenu de l’image finale est recommandé.
- Contrôles frais : build API complet code 0 ; Angular build code 0 ; lint code 0 ; unitaires 29/29 API + 3/3 outils ; e2e 34/34 sur `paroisse_test` ; Playwright 24/24.

### État des bases et migration destructive

- `DATABASE_URL` cible la base locale `paroisse` : 27 migrations reconnues, **11 en attente**. `TEST_DATABASE_URL` cible `paroisse_test` : 27 reconnues, aucune en attente. La production n’est pas configurée localement. Résultats issus de `prisma migrate status` ; aucune migration n’a été appliquée pendant cet audit.
- `20261019000000_replace_legacy_community/migration.sql` supprime avec `CASCADE` les anciennes tables de publications, commentaires, réactions, sondages, événements, groupes de publications et de leur modération, ainsi que leurs anciens types. Les anciennes données de ces fonctionnalités seraient perdues à son application. Les tables plus récentes de messagerie/stories ne sont pas les cibles de ces suppressions. Il faut une sauvegarde restaurée, comparer les données et obtenir une décision écrite avant application.
- Procédure projet : fenêtre de maintenance et arrêt des écritures ; `npm.cmd run backup:create` depuis un hôte où `sh`, `pg_dump` et la clé de chiffrement AES-256-GCM sont configurés ; vérifier l’authenticité et restaurer dans une base isolée `paroisse_test_restore` par `infra/restore.sh` avec URL source et cible distinctes de la base de développement ; comparer schéma, comptes, feuilles, totaux et lignes historiques ; ensuite seulement planifier la migration. Dumps et clés restent hors Git et hors conversation.

## Permissions prévues pour les corrections communautaires — première étape

Les identifiants `PUBLIER_PROGRAMME`, `GERER_ETUDES`, `PUBLIER_HISTOIRE`, `LANCER_LIVE` et `CREER_GROUPE` sont permis dans la liste blanche de permissions stockée dans `User.permissions`. `JwtAuthGuard` relit le compte, son état et cette liste depuis PostgreSQL sur chaque requête. L’administration peut attribuer les droits à un compte actif admissible, avec motif audité ; le changement révoque les sessions. La création d’un groupe exige `CREER_GROUPE` et est refusée aux mineurs. Le lancement d’un direct exige `LANCER_LIVE` et l’âge adulte.

Vérifications réelles sur `paroisse_test` : `community-messaging.e2e-spec.ts` et `security.e2e-spec.ts`, **35/35 tests passés** après un échec préalable de régénération Prisma dû au verrou Windows. Unitaires API **29/29**, lint et builds API/web passés. Playwright et les appels WebRTC réels entre appareils n’ont pas été exécutés. Ces vérifications ne couvrent pas encore les pages de programme, doctrine, histoire, répertoire et adhésion des groupes, ni la visionneuse stories ou la notification globale de directs ; ces fonctions ne sont pas déclarées implémentées.

## Revalidation après corrections communautaires — 10 octobre 2026

- `PUBLIER_PROGRAMME`, `GERER_ETUDES`, `PUBLIER_HISTOIRE`, `LANCER_LIVE`, `CREER_GROUPE` sont des permissions attribuées par l’administration avec motif audité, rechargées depuis la base et vérifiées par service/route. La sécurité du contenu des groupes dépend de contrôles serveurs d’adhésion/gestion; l’UI n’est pas l’autorité. En revanche, les 38 e2e n’ont pas été validés après la dernière modification de notification : PostgreSQL `localhost:5432` était injoignable lors de la dernière exécution.
- Les stories s’affichent dans Angular par interpolation texte et sont filtrées serveur selon l’âge/blocage; la vue « consultée » ajoutée au lecteur est stockée côté navigateur seulement. Il n’y a pas encore de preuve serveur « vu par », réponse à une story ou masquage individuel. Les médias de stories demeurent désactivés.
- Une notification en base est créée pour les comptes paroissiaux actifs éligibles quand un direct commence; sa récupération se fait par l’endpoint authentifié de notifications. Aucun transport push/websocket n’assure une alerte instantanée aux appareils hors ligne.
- Contrôles exécutés le 10 octobre : lint et builds web/API réussis; tests unitaires API 29/29. Le build Playwright frais a réussi, mais 5 tests ciblés n’ont pas démarré car le binaire Chromium est absent. La nouvelle exécution e2e a échoué au setup de connexion de base; aucun des 38 scénarios n’est déclaré réussi par cette exécution. L’exécution antérieure 38/38 est antérieure aux notifications live et ne valide pas cette dernière modification.
- Aucune déclaration de mise en production n’est justifiée par ce passage. Restent à exécuter : Playwright après installation Chromium; e2e avec PostgreSQL de test actif; contrôle multi-appareils caméra/micro et TURN; audit npm lorsque le registre répond; restauration réelle de sauvegarde isolée; revue humaine des migrations destructives de développement.

### Revalidation du lecteur de stories — 10 octobre 2026

- Le nouveau lecteur ne rend que le texte via l’interpolation Angular. Ses vues marquées « consultées » restent une préférence locale de session; le serveur n’enregistre aucune consultation nominative. Il n’expose donc pas de données supplémentaires aux autres membres.
- Vérification après modification : lint, build API/web, tests unitaires API 29/29 et tests outils 3/3 réussis. Playwright a listé les six scénarios ciblés sans en exécuter le corps; Chromium est absent. Les e2e n’ont pas pu démarrer car PostgreSQL de test ne répond pas sur `localhost:5432`.
- Limite sécurité/produit : absence de « Vu par » côté serveur, réponse et réglages de confidentialité. La visibilité actuelle reste contrôlée par les filtres serveur d’âge, compte actif et blocage; les médias de story sont désactivés.
# Déploiement et e-mail — état préparé le 10 octobre 2026

- Compose fixe des limites de ressources et publie seulement Nginx; PostgreSQL est interne et sans port hôte. L’API et les images Nginx utilisent un utilisateur non-root, systèmes de fichiers en lecture seule et journaux Docker à rotation bornée. ClamAV reste sous profil optionnel `media`; les drapeaux de médias restent désactivés. `docker compose config --quiet` a passé avec des valeurs fictives, sans lancer de conteneur.
- `GET /health` retourne un statut de processus minimal; `GET /ready` exécute une requête DB et renvoie seulement l’état générique. Tests unitaires dédiés : inclus dans la suite API ci-dessous. Les routes ne constituent pas un contrôle de sécurité réseau; limiter leur accès public selon le besoin opérationnel.
- Le service e-mail réserve atomiquement un envoi dans `EmailDailyUsage` avec maximum 100/jour, et notifie une fois les administrateurs au seuil configuré. Les modèles de courriels différés et identifiants de compte sont dans `EmailOutbox`, sans destinataire ni corps copiés; les envois non urgents sont reportés au prochain jour UTC lorsque le quota est saturé. La migration de ces tables n’a pas été appliquée; protection configurée dans le code, mais non active sur une base tant que migration approuvée et appliquée. L’envoi urgent de récupération ne prétend pas être différé : il échoue fermé et la réponse invite à réessayer le lendemain si le plafond est atteint.
- Le script de sauvegarde distant chiffre le dump PostgreSQL en flux avec AES-256-GCM avant écriture fichier temporaire, impose S3 HTTPS et stockage distinct, vérifie une cible vide et n’utilise pas `pg_restore --clean`. Le script applique la rétention configurable (35 jours par défaut). Les tests outils couvrent la détection de modification AES-GCM, le HTTPS S3 et la séparation des paramètres d’authentification. **Une sauvegarde/restauration réelle n’a pas été effectuée**; clé, bucket, politique d’accès, restauration et nombre de lignes restent à vérifier par un humain. Protéger la clé AES indépendamment du serveur et du bucket.
- Contrôles de cette phase : génération Prisma réussie; build complet API + Angular réussi; lint API/web réussi; tests unitaires API **36/36**; tests outils **6/6**; Compose production et maintenance parsés par `config --quiet` avec variables fictives. E2E et Playwright non exécutés ici; aucune migration ni base n’a été modifiée.
- Limites résiduelles : Compose n’a pas été construit ou démarré sur Linux; l’image ClamAV et ses droits/ressources doivent être validés avant activation; pas de rotation automatique attestée des journaux applicatifs du système hôte; la file e-mail et quota requièrent la migration; le premier administrateur n’est pas créé par Compose; HTTPS, HSTS, DNS, pare-feu, sauvegardes, alertes financières et e-mail réel sont non testés. Le dépôt conserve les avis npm documentés plus haut, à réauditer sur un réseau qui joint le registre avant production.
