# Blocages et actions humaines

## Diagnostic mémoire e2e — 8 octobre 2026 (résolu)

- Diagnostic : le hook Nest `app.close()` existait, mais `PrismaService` ne possédait pas `OnModuleDestroy`; ajout du hook `$disconnect()`, teardown rendu robuste même si le nettoyage échoue. Le collecteur de journaux e2e pouvait grossir sans borne : il est désormais limité à 2 000 entrées puis tronqué par moitié, et vidé au teardown. Le limiteur de débit en mémoire est plafonné à 10 000 compartiments avec suppression des compartiments expirés; aucune boucle de création de données non nettoyée n’a été trouvée.
- Le runner configure `NODE_OPTIONS=--max-old-space-size=4096`, lance chaque fichier e2e dans un processus Jest neuf avec `--runInBand`, et attend sa fermeture avant le suivant. Une suite précédente unique comptait 29 cas. 16 migrations vérifiées sur `paroisse_test`; aucune en attente.
- Résultat final de la relance propre : **29 e2e réussis, 0 échoué, 0 non exécuté**. Les nouvelles vérifications couvrent limite d’inscription par IP et par adresse e-mail, CAPTCHA désactivé par défaut puis jeton absent/invalide/valide, quotas 24 h (3 publications, pas de photo, pas de partage), et refus des fonctions sensibles pour un compte FIDELE non confirmé.
- Contrôles après corrections : **29/29 tests unitaires API**, **3/3 tests outils**, lint API et build API réussis.
- Deux tentatives précédentes ont échoué respectivement avec `heap out of memory` puis avec erreur transitoire d’allocation; elles sont supersédées par le passage complet vert obtenu ensuite. Aucune assertion n’a été affaiblie.
- Commande à relancer par un humain sous PowerShell si nécessaire : `npm.cmd run test:e2e` depuis la racine `D:\exeeller\mes traveaux\paroisse-amour-apotres`. Le script charge les variables localement, impose `TEST_DATABASE_URL` et refuse la cible égale à `DATABASE_URL`; ne pas saisir ou partager les valeurs de connexion.

## État antérieur — 8 octobre 2026 (avant la relance ciblée ci-dessus)

- Modération, profil/paramètres et interface V1 vérifiés : **25/25 e2e**, **28/28 unitaires API**, **14/14 Playwright** (écrans 360 px, menu clavier et XSS), lint/typecheck et builds API/web réussis. E2e uniquement sur `paroisse_test`; `DATABASE_URL` développement non touchée.
- **Audit npm bloqué par le réseau** : `registry.npmjs.org` a répondu `ENOTFOUND`. Dernier relevé antérieur : 3 hauts + 2 modérés côté production, 32 hauts + 6 modérés au total, aucun critique après mises à jour compatibles. Résultat frais requis sur réseau avec registre.
- La génération normale du moteur Prisma sous Windows a échoué une fois sur verrouillage `EPERM`; types générés sans moteur. Fermer tous les `node.exe`, relancer `npm.cmd run prisma:generate --workspace @paroisse/api` avant livraison locale.
- Photos toujours désactivées. S3 privé, ClamAV et TLS ne sont pas testés avec des services réels. Ne pas activer le flag avant cette validation.
- L’interface est uniquement en français ; le catalogue multilingue Angular n’est pas implémenté. Une validation manuelle d’accessibilité avec lecteur d’écran et téléphone réel reste à faire.
- Humain requis : rejouer les audits npm, valider textes/règles de modération, configurer et tester services de production, faire une restauration réelle de sauvegarde, valider mentions/charte/confidentialité et accepter les risques résiduels avant données réelles.

## Dernier état — 7 octobre 2026

Les résultats plus anciens archivés ci-dessous sont supersédés : 20/20 e2e PostgreSQL, 30/30 tests API, 3/3 tests utilitaires, 1/1 Playwright XSS, lint et build réussis. Les noms de présence sont protégés par jour (Option A). Le test Playwright doit aussi être contrôlé dans la CI par un humain. Les audits npm, Docker/TLS et la restauration réelle de sauvegarde restent à valider avant des données réelles.

## Résultat e2e — 7 octobre 2026 (mise à jour)

- **Résultat exécuté : 19/19 e2e réussis** sur `paroisse_test`; `npm run lint --workspace @paroisse/api` réussit aussi. Les 12 migrations sont à jour; aucune opération n’a visé la base de développement.
- **Décision d’accès appliquée :** tout EDITEUR, même avec `GESTION_COMPTES`, reçoit 403 sur la liste; sans authentification, 401. Les routes de validation et de permissions refusent aussi les rôles insuffisants en 403. Voir `docs/DECISIONS_A_VALIDER.md`.
- Les e2e couvrent les refus inter-jour/inter-feuille sur lecture, ajout, suppression, soumission, correction et accès nominatif; le refus sur cours/historique d’un autre jour; les horaires injectés de Porto-Novo avec tolérance; la révocation immédiate à la suspension; le 2FA/code de secours et la limitation d’essais; blocage mutuel et contrôles de débit Actualités; absence de jetons/mots de passe/noms sentinelles dans les logs observés.
- **Signalements / profils/modération non testables :** routes absentes et fonctionnalités délibérément non ajoutées avant validation de toutes les garanties. L’endpoint de signalement n’existe pas, donc sa limitation de débit est non vérifiée.
- Le changement de secret 2FA par CLI n’a pas fait l’objet d’un e2e d’intégration; l’API d’enrôlement/remplacement HTTP retourne 404 et les codes de secours à usage unique ainsi que la limitation des essais sont testés.

**État des noms de présence : ne le sont pas encore au regard de l’exigence combinée jour et zone.** Les noms sont masqués à l’ADMIN sans consultation motivée et les responsables ne voient que leur jour; un cloisonnement Temple/Salle de vision par compte reste à construire et tester.

## Migrations PostgreSQL de test

- `prisma migrate deploy` a appliqué les 12 migrations à la base vide `paroisse_test`.
- Test historique réussi dans un schéma temporaire isolé **au sein de la même base `paroisse_test`** : état historique jusqu’à la migration 006, ancien compte FIDELE, refresh token actif et feuille/ligne de présence synthétiques; migrations restantes déployées. Le compte est devenu PENDING inactif, le refresh token a été révoqué, et la feuille avec sa ligne a été conservée. Le schéma temporaire a été supprimé après vérification.
- `migrate deploy` n’a pas requis de base fantôme et aucun privilège `CREATEDB` n’a été nécessaire. `DATABASE_URL` et la base de développement n’ont pas été utilisées pour ces opérations.

## Contrôles d’exploitation encore bloqués

- `npm audit --omit=dev --audit-level=high` et l’audit complet n’ont pas pu joindre le registre npm lors du dernier essai; aucun résultat d’avis n’est disponible.
- Docker CLI n’est pas disponible ici. `docker compose config`, le démarrage des conteneurs, TLS/HSTS et une restauration réelle de sauvegarde PostgreSQL restent non vérifiés.
- Ajouter les tests de signalement seulement après autorisation de reprendre la modération; aujourd’hui cette route est volontairement absente.
- Garder les identifiants PostgreSQL et clés de service locaux; ne pas les coller dans la conversation.

Le projet reste **non prêt pour des données réelles**. Les e2e ne sont pas verts, l’audit npm n’est pas disponible, et l’exploitation/sauvegarde n’a pas été validée.

## État au 7 octobre 2026

- E2E PostgreSQL : **20 réussis, 0 échoué** sur `TEST_DATABASE_URL` (`paroisse_test`). Les migrations sont toutes appliquées; aucune modification n’a visé `DATABASE_URL`.
- Tests API unitaires : **30 réussis**; tests d’outils : **3 réussis**; lint API et Angular : **réussi**.
- Isolation Option A : par jour. Le président n’accède qu’au jour affecté, y compris pour les deux zones Temple et Salle de vision. Le secrétaire n’accède pas au groupe de semaine. Voir les tests décrits dans `docs/SECURITY_AUDIT.md`.
- `RESPONSABLE_SALLE_VISION` est déjà renommé historiquement en `RESPONSABLE_SEMAINE` par une migration conservant les comptes. Le rôle précédent n’existe plus dans le schéma/code/UI. On ne désactive pas tous les présidents actuels, car ils partagent le rôle hebdomadaire désormais valide.
- Risques non vérifiés par ce tour : audit des dépendances npm si le registre demeure indisponible, Docker/TLS et restauration réelle des sauvegardes. Le projet reste à valider avant utilisation avec des données réelles.

### Résultat Playwright — 7 octobre 2026

Chromium est disponible localement. Le scénario navigateur XSS publication/commentaire a été exécuté : **1/1 réussi**. Le même test est relié à la CI, qui installe Chromium. Il reste à un humain de contrôler le résultat CI avant la mise en production.

## Actualités — incrément d’interface du 7 octobre 2026

Actions ajoutées au fil : recherche, modification d’une publication personnelle, affichage volontaire des notifications (elles sont marquées lues uniquement à l’ouverture du panneau), liste/déblocage des comptes bloqués, et apparition immédiate d’un repartage dans le fil. Les lint TypeScript API/web, compilations API/web et quatre tests unitaires ciblés existants du fil réussissent. Les nouvelles interactions n’ont pas encore été validées par e2e.

Les médias (photo/vidéo), profils complets et outils de signalement/modération restent à construire selon la séquence de phases. Le module ne constitue pas un clone complet de Facebook Lite; les messages privés, groupes, pages, stories, directs, marketplace, appels et paiements ne sont pas prévus dans le cahier des charges paroissial actuel.

### Blocage e2e du profil — 7 octobre 2026

La modification du profil est implémentée, mais le test e2e ne démarre pas : le moteur Prisma renvoie `Schema engine error` pendant `migrate deploy` vers `paroisse_test`, sans détail exploitable. La configuration cible est vérifiée comme `localhost:5432/paroisse_test`, sans afficher d’identifiants. Réessayer après diagnostic local du moteur Prisma/Windows; ne pas lancer de migration sur la base de développement. Lint et compilations API/web réussissent; l’e2e de confidentialité et de droits n’a pas pu s’exécuter.

### Résolution — 7 octobre 2026

Le premier échec Prisma venait de l’isolation réseau du bac à sable : connexion à `localhost:5432` impossible. Une requête en lecture seule a ensuite confirmé la connexion à `paroisse_test`; la migration du profil a été appliquée uniquement sur cette base. La seconde exécution e2e est verte : **20/20**. Elle couvre maintenant la confidentialité et les autorisations du profil.

Le premier passage a aussi révélé le défaut de tolérance horaire hebdomadaire. La correction serveur a rétabli l’application de la tolérance configurable; l’e2e n’a pas été modifié et passe désormais. La base de développement est restée intacte.

### Actualités — photos sécurisées — 8 octobre 2026

La migration média et les parcours d’envoi/lecture sont vérifiés sur `paroisse_test` : **21/21 e2e verts**, dont une image réencodée, une lecture authentifiée, le refus d’accès à une publication privée et le rejet d’un SVG falsifié. Builds et lint finaux sont exécutés dans cette passe.

L’envoi reste désactivé localement tant qu’un stockage S3 privé et ClamAV ne sont pas configurés. Voir `docs/MEDIA_CONFIGURATION.md`. Ces services réels doivent encore être vérifiés manuellement avant activation. Les vidéos, stories, suppression d’images et messages ne sont pas encore développés.

### Audit npm et cohérence des totaux — 8 octobre 2026

Les mises à jour npm compatibles ont été appliquées sans `--force` (10 paquets). L’audit complet a baissé de 42 à 38 avis, et les 2 avis critiques ont disparu; il reste 32 hauts et 6 modérés, principalement dans le runner Jest/braces, Prisma/deepmerge-ts et js-yaml. L’audit production seul conserve 3 hauts et 2 modérés. Ne pas passer à la production avant résolution/acceptation documentée des avis restants.

La suite e2e a trouvé puis vérifié un défaut de concurrence ajout/clôture : verrouillage explicite de la ligne de feuille avant ajout ou calcul des totaux. État après correction : **21/21 e2e verts**, builds et lint API/web réussis après mise à jour npm. Toute la base touchée pour les migrations/e2e est `paroisse_test`.

### Modération — validation V1 — 8 octobre 2026

Phase 1 terminée et validée : **24/24 e2e, 28/28 unitaires, lint/typecheck API/web, builds API/web**. La migration de modération et les e2e ont touché uniquement `paroisse_test`. Aucun blocage technique actuel.

À faire par un humain avant production : tester S3 privé et ClamAV avec les vrais services; maintenir les photos désactivées jusque-là; examiner les règles locales de modération et désigner les administrateurs habilités à statuer sur les appels.

## Consolidation navigateur et stabilité — 8 octobre 2026 (résultat final)

- Le blocage Playwright est résolu. L’ancienne commande Angular était exécutée hors du dossier `apps/web`, puis utilisait une option CLI inconnue; le contrôle de base était aussi réévalué dans les processus enfants après transmission intentionnelle de `TEST_DATABASE_URL`. La configuration démarre maintenant l’API de test sur `3101` et Angular dans `apps/web` sur `4310`, sans réutiliser l’aperçu `3000/4200`. Dans le processus API temporaire, `DATABASE_URL` est remplacée par `TEST_DATABASE_URL`; l’URL de développement n’est pas transmise.
- Les 21 migrations de `paroisse_test` étaient à jour. Aucun changement de schéma n’a été nécessaire pendant cette consolidation. E2E : **35 réussis, 0 échoué, 0 non exécuté**.
- Playwright : **16 réussis, 0 échoué, 0 non exécuté**. Douze pages ont été contrôlées à 360 px; menu clavier mobile/ordinateur, contraste AA des textes essentiels de la communauté et parcours XSS sont couverts. Les motifs de signalement sont une liste fermée sans champ libre.
- `npm run lint` réussit (TypeScript API et web); tests : **29 unitaires API + 3 outils réussis**; les deux builds passent. Le build racine est maintenant séquentiel (API puis web) : son ancien lancement parallèle a dépassé la mémoire disponible.
- `npm audit --omit=dev` et `npm audit` ont échoué avec `ENOTFOUND registry.npmjs.org` avant de recevoir des avis. L’état de vulnérabilité des dépendances demeure inconnu jusqu’à ce qu’un humain les relance avec accès au registre.
- Aucun secret n’est reproduit ici. `DATABASE_URL` et la base de développement n’ont pas été touchées.
# Blocages — extension communauté — 8 octobre 2026

- `prisma generate` échoue sur Windows avec `EPERM` pendant le renommage de `query_engine-windows.dll.node`, même après vérification qu’aucun processus Node n’est visible dans cette session. Le build utilise donc le client préexistant; il ne confirme pas que les nouveaux délégués `socialGroup` sont présents à l’exécution.
- La tentative de `migrate deploy` a ciblé explicitement `TEST_DATABASE_URL` (`paroisse_test` distincte de `DATABASE_URL`) mais l’engine Prisma s’est arrêté avec `Schema engine error` sans détail. Le port PostgreSQL local 5432 ne répondait pas lors de la vérification; aucune migration de groupe ou média n’a été appliquée.
- Pour débloquer : démarrer le service PostgreSQL local; fermer toute application qui maintient le moteur Prisma verrouillé; relancer `npm.cmd run prisma:generate --workspace @paroisse/api`; puis exécuter `prisma migrate deploy` en fournissant uniquement l’URL `TEST_DATABASE_URL`. Vérifier ensuite les routes groupes/médias par e2e avant de démarrer l’API avec ces fonctions.
- Aucun secret ni valeur de connexion n’est consigné ici. La base de développement n’a pas été modifiée.

## Communauté — état du 8 octobre 2026

- Lint/typecheck API et web et builds API/web passent après l’ajout de conversations textuelles dans les groupes. Les trois migrations de groupes, médias et discussions sont appliquées à `paroisse_test` uniquement; un compte de lignes Prisma a confirmé la table de discussion. Aucune migration ni requête n’a ciblé la base de développement.
- Suite e2e rejouée sur paroisse_test : 30 réussis, 0 échoué. Le scénario ajouté couvre l’accès croisé aux groupes privés, l’acceptation, la publication/commentaire, l’idempotence et le blocage des messages/commentaires. Les limites de débit propres aux groupes et le dépôt/lecture avec vrais services médias restent à vérifier.
- Photos/vidéos/PDF restent désactivés dans l’application tant qu’un stockage S3 privé et ClamAV ne sont pas configurés. Le transcodage des vidéos n’est pas implémenté; ne pas ouvrir l’envoi au public avant retrait des métadonnées par un pipeline vidéo validé.
- Le fil, groupes, profil, commentaires, réactions, partage, enregistrements, liens, signalements, événements et sondages sont livrés. Les lives, stories, messagerie privée, partage de documents dans les groupes et contacts/amis ne sont pas livrés. Aucune fausse commande visuelle ne doit être présentée comme active.
- Avant usage réel : configurer puis essayer S3/ClamAV, faire vérifier le parcours sur téléphone et reprendre l’audit npm lorsque le registre est accessible.
## Communauté — mise à jour du 8 octobre 2026

- Sondages et événements ajoutés au fil : totaux agrégés, votes modifiables avant clôture, réponses événementielles modifiables avant l’heure de début.
- Migration d’événements appliquée à la base de test `paroisse_test` uniquement. Résultats de ce passage : 33 e2e réussis, 0 échoué; lint/typecheck API, build API et build Angular réussis.
- Les événements n’affichent pas les noms des répondants. Les comptes récents restent soumis aux limites quotidiennes; les créations et réponses ont des limites par compte.
- Limitation restante : la présence de groupes, sondages, événements et interactions ne remplace pas une suite complète de fonctions Facebook. Aucun live, story ou message privé n’a été ajouté ici.
- Les photos/vidéos/PDF restent désactivés tant que S3 privé et ClamAV ne sont pas configurés et testés. Aucun contenu média ne doit être présenté comme activé.
- Le moteur Prisma Windows était verrouillé pour la génération standard; le client TypeScript a été généré dans un répertoire staging puis copié en préservant la DLL verrouillée. Fermer les serveurs Node avant de régénérer normalement sur le poste.
## État courant — 8 octobre 2026

- Vérifications actuelles : 33 e2e réussis, 0 échoué, 0 non exécuté; 29 tests unitaires API réussis. Lint/typecheck et builds API/web réussis.
- L’API locale a été démarrée sur le port 3000 avec `TEST_DATABASE_URL`; le port web 4200 répond déjà (HTTP 200). Le port 3000 répond aussi (HTTP 200). Les identifiants de développement peuvent ne pas exister dans la base de test.
- Playwright et les audits npm n’ont pas été relancés dans cette étape. Le stockage S3 privé, ClamAV, test de restauration, HTTPS et mise en production attendent encore une vérification humaine.

- Audit des dépendances tenté le 8 octobre 2026 : `npm audit --omit=dev` et `npm audit` échouent tous deux avant analyse, car `registry.npmjs.org` ne résout pas (`ENOTFOUND`). Aucun avis nouveau ne peut être évalué; réessayer sur une connexion avec accès au registre.
- Vérification Playwright mobile/XSS tentée après l’ajout d’événements : serveur web de test demandé sur 4300, mais il n’a pas répondu en HTTP avant expiration; les tests navigateur n’ont donc pas démarré (0 exécuté). Les vérifications précédentes restent historiques, pas une preuve de l’interface mise à jour.

## Blocage de vérification — 9 octobre 2026

- L’API de test a refusé la connexion à `localhost:5432` (Prisma P1001). Le diagnostic a confirmé la cible locale `paroisse_test` sans révéler d’identifiants. La migration et les scénarios e2e n’ont donc pas démarré dans ce passage; aucune migration n’a été lancée vers la base de développement.
- Le serveur Playwright a échoué pour la même raison lors de son démarrage API; le nouveau parcours d’affichage du profil public n’a pas été validé dans un navigateur.
- À faire sur le poste : démarrer PostgreSQL, confirmer que `TEST_DATABASE_URL` vise `paroisse_test`, puis exécuter `npm.cmd run test:e2e` et `npm.cmd run test:playwright -- tests/playwright/social-xss.spec.ts`. Garder `DATABASE_URL` inchangée.

## Profils publics et XSS des groupes — 9 octobre 2026

- Corrigé le démarrage Playwright : build Angular complet avant le serveur Vite; un build invalide rend maintenant le démarrage du serveur en échec. La liste de tests Playwright a été chargée (16 tests), mais aucun test navigateur n’a été exécuté par moi.
- Ajouté les scénarios e2e profil (confidentialité, compte suspendu, masquage modération, blocage mutuel, coordonnées, nom mineur, 20 posts récents, authentification, limite de débit) et groupe (lecture/écriture hors adhésion, retrait, blocage).
- Les scénarios e2e et navigateur sont écrits et TypeScript e2e est compilé. Ils ne sont **pas exécutés par moi** car `localhost:5432` ne répond pas. Les 35 e2e verts rapportés par l’humain n’incluent pas ces nouveaux scénarios.
- Après avoir démarré le PostgreSQL local et vérifié la cible test, lancer dans PowerShell : `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm run test:e2e --workspace @paroisse/api` puis `npx playwright test`. Les deux s’appuient sur la configuration de base de test; ne pas modifier `DATABASE_URL`.

## Remplacement de la communauté — état vérifié le 9 octobre 2026

Le serveur Playwright de consolidation démarre désormais depuis le setup global après un build Angular, sur son port dédié; les 16 tests navigateur ont passé. Les e2e API ont passé 26/26 sur `TEST_DATABASE_URL` après migration. Les commandes racine `npm test`, `npm run lint` et `npm run build` ont passé au même état de code.

La migration `20261019000000_replace_legacy_community` retire les anciennes tables du fil communautaire lorsqu’elle est déployée. Elle n’a été appliquée qu’à `paroisse_test`. Avant de l’appliquer à une base contenant les anciennes publications, sondages, événements ou groupes, un humain doit sauvegarder cette base et confirmer que leur suppression est voulue. Les résultats locaux ne certifient pas l’infrastructure de production.

Toujours à faire par un humain avant mise en service : rejouer `npm audit --omit=dev` et `npm audit` quand le registre npm est accessible, vérifier la restauration d’une sauvegarde chiffrée, configurer HTTPS et les secrets de production, faire une revue de conservation des messages, et tester sur les appareils réels. Les pièces jointes restent indisponibles jusqu’à configuration et validation de S3 privé, ClamAV et traitement sûr des médias.

La relance finale du 9 octobre 2026 a réussi : 26/26 e2e, 17/17 Playwright (dont panneau des détails sur téléphone), 29 tests unitaires API + 3 tests outils, lint et builds API/web. La migration destructive de remplacement reste appliquée uniquement sur la base de test.

Audit npm final, 9 octobre 2026 : `npm audit --omit=dev --audit-level=high` et `npm audit --audit-level=high` ont échoué avant l’analyse (`audit endpoint returned an error`, requête bulk au registre sans réponse exploitable). npm n’a pas non plus pu écrire son journal dans son dossier local de cache. Il n’y a donc aucun résultat de vulnérabilités exploitable pour cette exécution; recommencer depuis une machine avec accès au registre et un cache npm inscriptible.
