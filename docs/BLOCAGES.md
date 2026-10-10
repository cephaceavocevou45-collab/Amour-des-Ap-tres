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

À la date de cette note historique, les médias et profils complets restaient à construire. La communauté a depuis été remplacée par une messagerie privée et a reçu des stories textuelles et des directs à faible capacité; voir l’état vérifié du 9 octobre 2026 en fin de fichier. Les médias de story, photos de profil, appels téléphoniques, place de marché et paiements restent absents ou désactivés.

### Blocage e2e du profil — 7 octobre 2026

La modification du profil est implémentée, mais le test e2e ne démarre pas : le moteur Prisma renvoie `Schema engine error` pendant `migrate deploy` vers `paroisse_test`, sans détail exploitable. La configuration cible est vérifiée comme `localhost:5432/paroisse_test`, sans afficher d’identifiants. Réessayer après diagnostic local du moteur Prisma/Windows; ne pas lancer de migration sur la base de développement. Lint et compilations API/web réussissent; l’e2e de confidentialité et de droits n’a pas pu s’exécuter.

### Résolution — 7 octobre 2026

Le premier échec Prisma venait de l’isolation réseau du bac à sable : connexion à `localhost:5432` impossible. Une requête en lecture seule a ensuite confirmé la connexion à `paroisse_test`; la migration du profil a été appliquée uniquement sur cette base. La seconde exécution e2e est verte : **20/20**. Elle couvre maintenant la confidentialité et les autorisations du profil.

Le premier passage a aussi révélé le défaut de tolérance horaire hebdomadaire. La correction serveur a rétabli l’application de la tolérance configurable; l’e2e n’a pas été modifié et passe désormais. La base de développement est restée intacte.

### Actualités — photos sécurisées — 8 octobre 2026

La migration média et les parcours d’envoi/lecture sont vérifiés sur `paroisse_test` : **21/21 e2e verts**, dont une image réencodée, une lecture authentifiée, le refus d’accès à une publication privée et le rejet d’un SVG falsifié. Builds et lint finaux sont exécutés dans cette passe.

L’envoi de médias reste désactivé localement tant qu’un stockage S3 privé et ClamAV ne sont pas configurés. Voir `docs/MEDIA_CONFIGURATION.md`. Les stories textuelles, la messagerie privée et les directs WebRTC ont été ajoutés depuis cette note; leurs limites sont consignées plus bas. L’envoi de photos/vidéos et la suppression d’images restent bloqués par l’absence d’un pipeline média réel.

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
- Cette entrée décrit l’état antérieur au remplacement du fil; depuis, les messages privés, groupes, stories textuelles et directs WebRTC sont livrés avec les limites consignées ci-dessous. Les médias en stories et la diffusion de grande audience restent indisponibles. Aucune fausse commande visuelle ne doit être présentée comme active.
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
## Messagerie securisee : limites restantes (9 octobre 2026)

- **WebSocket/temps reel absent :** seul le rafraichissement HTTP periodique est livre. Aucun test de cookie de connexion, d'abonnement IDOR ni de coupure de socket ne peut passer tant qu'aucun transport temps reel n'existe. Ce n'est pas une fonction active.
- **Annonces de dirigeants absentes :** pas d'API ni d'interface d'annonce; aucun badge d'annonce n'est donne automatiquement. Le role et le jour du dirigeant sont controles depuis la base, mais cela ne cree pas une publication d'annonce.
- **Groupes mixtes mineur/adulte :** aucun workflow de groupe approuve par l'administration n'existe. Par precaution, les groupes a tranche d'age inconnue ou mixte sont refuses, y compris pour un dirigeant. L'age demeure calcule cote serveur.
- **Demande de contact acceptee :** ce modele n'existe pas. Les directs sont autorises entre membres dont l'age est connu et dans la meme tranche d'age; les autres demandes sont refusees. Les anciens resultats de test des dirigeants/groupe commun decrivent le code anterieur et sont remplaces par le retest du 9 octobre ci-dessous.
- **File hors ligne :** messages en IndexedDB, partitionnes par compte, mais en clair dans le profil du navigateur. Eviter les appareils partages et effacer les donnees locales apres deconnexion sur appareil partage.
- **Audit des logs :** le test inspecte les journaux applicatifs structures et non les journaux de l'OS, proxy ou fournisseur d'hebergement.
- **Dependances :** refaire `npm audit --omit=dev` et `npm audit` sur un poste pouvant joindre le registre; le dernier resultat connu etait bloque par le reseau et ne constitue pas un audit sans avis.

Derniere verification locale : lint et build reussis; 29/29 tests unitaires API, 3/3 tests outils, 29/29 e2e sur `paroisse_test`, 20/20 Playwright. Les suites existantes ont toutes termine sans test omis. Les scenarios WebSocket et annonces n ont pas de test car ces fonctions et leurs endpoints n existent pas.

## Suite du contrôle messagerie — 9 octobre 2026

- E2E exécutés sur `TEST_DATABASE_URL` (`paroisse_test`) : **31 réussis, 0 échoué** (9 messagerie, 22 sécurité). Les migrations de cette base étaient déjà à jour; aucun changement n’a ciblé la base de développement.
- Après correction d’un scénario CAPTCHA auquel manquait le numéro devenu obligatoire : retest sécurité **22/22**.
- `npm test` : **29/29 tests unitaires API + 3/3 tests outils**; `npm run lint` et `npm run build` (API + Angular) réussis.
- Playwright après build Angular frais et les derniers changements d’interface : **20/20 réussis**, dont les flux communautaires XSS et les tests mobile à 360 px.
- Numéro WhatsApp : l’inscription exige un numéro E.164, mais aucun code SMS/WhatsApp ni service de vérification de compte n’est configuré. L’application ne peut donc pas certifier l’appartenance à WhatsApp.
- Code d’invitation de groupe : code aléatoire, empreinte seule stockée, mais pas d’expiration ni de renouvellement/révocation dans l’interface. La migration `20261020000000_group_invite_codes` a été appliquée à la base test par le script e2e, pas à la base de développement.
- L’administration peut voir le contenu de tous les fils en lecture seule; chaque consultation est journalisée. Elle ne peut pas écrire dans les fils par cette fonction de supervision.

## Stories, directs et annuaire — 9 octobre 2026

### Retest final — 9 octobre 2026

- Les e2e messagerie/sécurité passent **34/34** sur `paroisse_test`; aucune migration en attente parmi les 27 trouvées. Le statut de migration n’a touché que la base de test.
- `npm test`: API **29/29**, outils **3/3**. `npm run lint`, `nest build`, build Angular et Playwright après build frais (**24/24**) réussissent.
- `npm run build --workspace @paroisse/api` échoue après la compilation Nest, au script de copie Prisma (`EPIPE`, répertoire `apps/api/dist/apps/api/src/generated/prisma` occupé). Un second essai échoue pareil. Plusieurs processus Node existent sur le poste; leur propriétaire n’a pas pu être établi sans ambiguïté. Aucun processus inconnu n’a été arrêté. Réessayer après fermeture manuelle des serveurs/terminaux Node du projet.
- `DATABASE_URL` identifie `paroisse` (`localhost:5432`). Seul `prisma migrate status` en lecture seule a interrogé cette cible : **11 migrations en attente sur 27**, aucune migration appliquée. `TEST_DATABASE_URL` identifie `paroisse_test` (`localhost:5432`), 27/27 appliquées. `PRODUCTION_DATABASE_URL` est absente du `.env`; la cible prod doit être confirmée sur l’hébergement.
- Bloqueurs humains : appel caméra/micro entre appareils non testé; HTTPS et TURN réels requis sur réseaux restrictifs; audit npm, Docker, sauvegarde/restauration, configuration de production et revue des migrations historiques restent à faire. L’outbox navigateur est en clair; les messages ne sont pas chiffrés de bout en bout.
- Audit npm relancé avec accès au registre : production **5 avis (3 hauts, 2 modérés)**; arbre complet **39 avis (1 critique, 32 hauts, 6 modérés)**. Le rapport nomme notamment `handlebars` (critique), `braces` (haut, correctif proposé par npm exigeant le saut majeur Jest 30 avec `--force`), `deepmerge-ts`, `js-yaml` et `sprintf-js`. Aucun correctif de dépendance n’a été appliqué; traiter et retester avant production.
- Après `npm audit fix` sans `--force`, un paquet a été mis à niveau et l’avis critique `handlebars` a disparu. Nouvel état : production **5 (3 hauts, 2 modérés)**; arbre complet **38 (0 critique, 32 hauts, 6 modérés)**. Le reste est documenté dans SECURITY_AUDIT.md et doit être trié avant production. Toutes les suites (e2e 34/34, Playwright 24/24, unitaires 29+3) ont été relancées après cette mise à niveau; le build API bute toujours sur l’EPIPE de copie Prisma.
- La reconnexion hors ligne a exposé une course UI; l’envoi de l’outbox est maintenant séquencé avant le rechargement de l’historique. Test ciblé et suite navigateur complète réussis.

- Les comptes actifs restent trouvables par nom et peuvent ouvrir une conversation directe. Les numéros WhatsApp ne sont pas exposés aux autres membres; seul le format du numéro est actuellement vérifié, pas son appartenance à WhatsApp. Une vérification réelle nécessiterait un prestataire et un parcours OTP autorisés.
- Stories livrées : texte seul, 500 caractères, expiration 24 h, filtrage par tranche d’âge et blocage, signalement et décisions de modération auditées. Médias de story désactivés tant que stockage privé et analyse antivirus ne sont pas disponibles.
- Directs livrés en WebRTC mesh, un hôte et quatre spectateurs au maximum, avec autorisations d’accès et file de signalisation vérifiées par e2e. Aucune vidéo n’est conservée par le serveur. Le test API couvre l’autorisation et la signalisation, pas le bon fonctionnement caméra/micro entre appareils réels.
- Limites du direct : HTTPS obligatoire hors localhost, navigateur compatible et accès caméra/micro; STUN seul est fourni par défaut. Il faut configurer un service TURN réel pour les réseaux restrictifs. Cette capacité ne convient pas à une diffusion de grande audience; un SFU et des tests de charge sont nécessaires pour cela.
- Vérifications du 9 octobre : e2e PostgreSQL de test **34/34**; Playwright **24/24** (build Angular frais, stories/directs à 360 px, XSS story); lint passé; `nest build` et `ng build` passés séparément. `npm run build` a compilé Nest mais échoué à l’étape de copie du client Prisma (EPIPE / fichier utilisé), alors que l’API du poste était active sur le port 3000. Rejouer le build racine après arrêt contrôlé des serveurs locaux.
- La migration de modération des stories `20261022000000_story_moderation` a été appliquée à `paroisse_test` seulement; ne pas appliquer les migrations à `DATABASE_URL` sans sauvegarde et revue humaine.
- Restent à faire par un humain : vérifier les directs avec plusieurs téléphones/réseaux, configurer HTTPS/TURN avec des secrets de courte durée, confirmer la politique de visibilité publique des noms et vérifier les numéros par un canal WhatsApp autorisé si cette preuve est exigée. Les téléphones ne doivent pas être rendus publics par défaut.

## Stabilisation Windows et audits — 9 octobre 2026

- **EPIPE diagnostiqué et corrigé pour les builds idempotents.** `npm.cmd run build --workspace @paroisse/api` échouait dans `copy-prisma-client.cjs`, après `nest build`. L’inventaire des modules chargés a identifié `query_engine-windows.dll.node` chargé par le processus Node PID 19576 depuis le dossier cible `apps/api/dist/apps/api/src/generated/prisma`. Les 27 fichiers du client généré source et cible étaient identiques ; deux copies expérimentales vers de nouveaux dossiers ont réussi. `fs.cpSync(..., {force:true})` tentait donc de réécrire le DLL que Windows avait verrouillé. Le script copie maintenant uniquement les fichiers dont le contenu diffère. Le build API complet passe pendant que le DLL inchangé est chargé. Si une future génération modifie le moteur natif, fermer d’abord le serveur API du projet puis regénérer et reconstruire ; le script ne contourne pas un verrou sur un binaire différent.
- **Résultats frais après le correctif :** build API complet réussi ; build Angular réussi ; lint réussi ; tests unitaires API 29/29 et outils 3/3 ; e2e PostgreSQL de test 34/34 ; Playwright 24/24. Le test e2e a confirmé 27 migrations appliquées sur `paroisse_test`.
- **Audit npm frais (registre autorisé) :** `npm audit --omit=dev` rapporte 5 avis (3 hauts, 2 modérés) ; `npm audit` rapporte 38 (32 hauts, 6 modérés, 0 critique). `npm audit fix --dry-run` n’a proposé aucun changement compatible immédiat ; les changements forçant Jest 30 ont été écartés. Voir `SECURITY_AUDIT.md` pour les chemins.
- **Migrations en lecture seule :** la base de développement `paroisse` a 11 migrations en attente sur 27 ; `paroisse_test` est à jour (27/27). Aucune migration n’a été appliquée. La production n’est pas configurée sur ce poste.
- **Blocages humains de production :** corriger ou accepter formellement les avis npm restants ; valider le certificat et le domaine TLS réels, TURN et les directs sur plusieurs appareils/réseaux ; tester une vraie sauvegarde chiffrée et restauration isolée ; revoir les 11 migrations dev, surtout le remplacement historique de communauté, avec sauvegarde restaurée et accord sur la perte des anciennes publications/groupes. Aucun déploiement ni changement de base n’a eu lieu.

## Corrections communautaires — état initial du 9 octobre 2026

- Phase A : aucun fichier PDF n’est présent sous `docs/sources/` (le répertoire lui-même est absent). L’accueil contient des listes intitulées « 12 préceptes », 11 ordonnances et 4 sacrements ; il ne contient pas la liste des 10 commandements demandée. La comparaison PDF/contenu existant est donc impossible. Ne pas importer ni publier de nouveau contenu doctrinal avant réception et relecture des sources.
- Vérification en lecture seule des migrations : `paroisse_test` est à jour (27 migrations) ; `paroisse` a 11 migrations en attente, dont `20261019000000_replace_legacy_community`. Aucune migration n’a été appliquée pendant cette vérification.
- Les scripts de sauvegarde/restauration ont été inspectés au tour précédent : le dump temporaire est en clair et la restauration emploie `pg_restore --clean --if-exists`. Ne pas les utiliser pour préparer l’archive historique avant correction et revue de cette procédure.
- Le répertoire Git contient déjà de nombreux changements non commités antérieurs à cette phase. Les commits par phase ne peuvent pas être isolés proprement sans examiner et préserver ces changements.

### Permissions communautaires — première correction vérifiée

- Les permissions `PUBLIER_PROGRAMME`, `GERER_ETUDES`, `PUBLIER_HISTOIRE`, `LANCER_LIVE` et `CREER_GROUPE` sont ajoutées à la validation serveur des autorisations. Le guard recharge le compte et ses permissions en base à chaque requête. Leur attribution exige désormais un motif, crée une entrée `AuditLog`, incrémente la version de session et révoque les refresh tokens.
- La création de groupe est refusée sans `CREER_GROUPE`; un mineur ne peut pas créer de groupe même si la permission lui est attribuée. Un direct exige `LANCER_LIVE` et un compte adulte. L’interface d’administration permet d’attribuer ces permissions aux comptes actifs admissibles.
- Validation : `npm.cmd run build --workspace @paroisse/api` réussi ; lint API réussi ; lint et build web réussis ; tests unitaires API 29/29 réussis ; tests PostgreSQL sur `paroisse_test` 35/35 réussis (13 messagerie et 22 sécurité). Les tests WebRTC sont des tests de règles serveur, pas une validation audio/vidéo entre appareils.
- La commande enveloppe `npm.cmd run test:e2e` a d’abord échoué avant Jest avec `EPERM` au remplacement de `query_engine-windows.dll.node`, moteur verrouillé par un processus Node. Sans arrêter les serveurs potentiellement utilisés, le client généré déjà présent a permis de lancer Jest après vérification que la cible était `paroisse_test`, distincte de `paroisse`, et à jour. Le premier `prisma migrate deploy` contrôlé par l’enveloppe n’a trouvé aucune migration en attente. Les 35 tests ont ensuite passé.
- Le reste des phases A à D n’est pas terminé : aucune route ni interface d’événements/histoire/doctrine versionnée, aucun annuaire/demande/rôle de groupe, aucune visionneuse stories WhatsApp, aucune notification générale ni admission d’invités en direct n’a encore été ajouté. Ne pas annoncer la communauté finalisée.
- Playwright n’a pas été exécuté après ces changements. Les migrations de développement restent intactes ; `paroisse` a toujours 11 migrations en attente. Aucun commit de phase n’a été créé car le dépôt contenait déjà des changements non commités antérieurs.

## Suite des corrections communautaires — 10 octobre 2026

- L’annuaire de groupes est relié aux contrôles serveur : visibilité ouverte sur demande ou privée par code, demandes d’adhésion, décision par les responsables du groupe, gestion du code, rôles, retrait de membres et transfert du créateur. Les groupes impliquant des âges inconnus, mixtes ou mineurs restent refusés jusqu’à une procédure de protection approuvée.
- La page Stories dispose désormais d’un lecteur vertical adapté au téléphone, d’une navigation entre stories et d’un indicateur « vu » stocké uniquement dans `sessionStorage`. Les vues ne sont donc pas synchronisées côté serveur et les auteurs ne disposent pas d’une liste fiable des personnes ayant vu leur story. Réponse à une story et masquage individuel ne sont pas implémentés. Les médias restent désactivés.
- Le lancement d’un direct crée une notification interne pour chaque compte paroissial actif éligible (FIDELE, SECRETAIRE_PRESENCE, RESPONSABLE_SEMAINE). L’écran Directs récupère les notifications lors de son rafraîchissement périodique. Il n’y a pas de diffusion push/websocket instantanée; le membre doit être connecté et consulter la rubrique pour les voir.
- Validation après ces modifications : lint web/API et builds web/API passés; tests unitaires API **29/29**. Les Playwright ont reconstruit le frontend frais, puis **5 tests ciblés n’ont pas démarré** : le binaire Chromium attendu n’est pas installé (0 corps de test exécuté). Les deux suites e2e API (38 scénarios) n’ont pas pu se connecter à `localhost:5432`; **0 exécuté avec succès dans cette dernière tentative**, aucune base n’a été modifiée. Un précédent run 38/38 précède l’ajout de la notification directe et ne valide pas cette modification.
- Pour vérifier les navigateurs sur le poste équipé : installer le navigateur requis avec `npx playwright install chromium`, puis lancer `npx playwright test tests/playwright/community-hardening.spec.ts`. Pour les e2e, démarrer PostgreSQL, vérifier que `TEST_DATABASE_URL` vise exclusivement `paroisse_test`, puis exécuter `npm run test:e2e --workspace @paroisse/api`; ne pas changer `DATABASE_URL`.
- Le contenu source PDF des règles doctrinales est toujours absent : les pages Études restent des structures vides et n’affirment pas le contenu des 12 interdits, 11 ordonnances, 10 commandements ou 4 sacrements. L’histoire n’est publiable que par les comptes dotés de `PUBLIER_HISTOIRE`, mais les versions antérieures ne sont pas conservées. Les groupes et notifications ne doivent pas être annoncés comme entièrement validés tant que les vérifications bloquées ne sont pas rejouées.
- Le dépôt reste pré-modifié avec des changements non commis avant cette phase. Aucun commit propre de phase n’a été créé afin de ne pas mélanger ou écraser ces changements.
- Correction de la livraison d’avis : la notification du direct est aussi exposée par `GET /community/lives/notifications`, qui relit les annonces des dernières 24 heures même si `/auth/notifications` les a déjà marquées lues. Le test e2e couvre ce cas, mais reste non exécuté tant que PostgreSQL ne répond pas.

### Reprise du lecteur Stories — 10 octobre 2026

- Le lecteur texte passe maintenant automatiquement à la story suivante après cinq secondes, affiche une progression temporelle, se met en pause pendant un appui et reprend au relâchement. Les flèches gauche/droite changent de story; Échap ferme le lecteur. L’ordre de lecture est chronologique.
- Ajout d’un Playwright couvrant pause puis progression automatique. Les six tests ciblés du fichier `tests/playwright/community-hardening.spec.ts` sont détectés (`--list`), mais **aucun n’a été exécuté** car le navigateur Chromium de Playwright est absent. Après installation de Chromium, lancer `npx playwright test tests/playwright/community-hardening.spec.ts`.
- Revalidation du code après cette modification : `npm.cmd run lint` réussi ; `npm.cmd run build` complet réussi (API, copie Prisma et Angular) ; tests unitaires API **29/29** ; tests outils **3/3** ; vérification `git diff --check` sans erreur de diff. La base PostgreSQL de test reste inaccessible sur `localhost:5432`, donc les e2e ne sont pas exécutés sur cet état.
- Le « vu » reste uniquement local au navigateur (`sessionStorage`) et ne représente pas une liste serveur consultable par l’auteur. Réponse, confidentialité sélective et suppression d’une story par son auteur restent à construire; aucun de ces éléments n’est simulé comme actif.

### Corrections interface communauté — 10 octobre 2026

- Ajout de pages Profil et Paramètres accessibles depuis la navigation de la communauté : présentation courte, coordonnées personnelles, changement de mot de passe, sessions ouvertes et export des données. Le profil utilise les coordonnées du compte existant; aucun nom public personnalisable n’a été ajouté.
- Le compositeur Story précise maintenant que seules les stories textuelles sont publiables actuellement. Les médias restent bloqués tant que stockage privé, analyse antivirus et routes d’envoi sécurisées ne sont pas configurés et vérifiés. Aucun bouton photo/vidéo inactif n’est présenté comme fonctionnel.
- Les cartes de lancement et de découverte des directs ont reçu une présentation verticale mobile adaptée. Cela ne change ni le transport WebRTC, ni la limite de spectateurs, et ne prouve pas la compatibilité de tous les réseaux.
- Les erreurs de messagerie 500 ne transmettent plus au fidèle le texte interne brut (« Internal server error »); l’interface propose un message clair. La cause de l’erreur serveur n’est pas diagnostiquée dans cette session : aucun serveur API n’écoute sur les ports locaux observés, et aucun journal serveur exploitable n’est disponible. Il faut relever l’exception Nest correspondante quand l’API et PostgreSQL sont démarrés pour corriger la cause racine.
- Vérifications : lint global passé avant la dernière correction du template; tests unitaires API 30/30. Build API réussi dans le build racine; build Angular échouait sur un typage de page, corrigé ensuite, build web isolé passé. Le build racine complet et le lint final sont à relancer. E2E non exécutés ici : la base de test locale n’est pas démarrée. Aucune migration ni écriture en base n’a été effectuée.
- Validation finale du 10 octobre après correction du typage de page et de la navigation : `npm.cmd run build` réussi (API + Angular), `npm.cmd run lint` réussi, tests unitaires API 30/30, tests outils 3/3, `git diff --check` réussi. E2E et navigateur toujours non exécutés dans cette session.
# Déploiement portable à budget minimal — 10 octobre 2026

- Préparés : Compose production API/web/PostgreSQL/Nginx et ClamAV facultatif; PostgreSQL non publié, réseau de données interne, conteneurs de service non-root, limites CPU/mémoire adaptées au profil de petite machine, rotation des journaux Docker; variables requises sans secrets par défaut; `/health` et `/ready`; quota Resend et outbox; sauvegarde S3 chiffrée AES-256-GCM, rétention et garde-fous de restauration; guide de déploiement et checklist humaine.
- Vérification Compose : `docker compose ... config --quiet` a validé les fichiers production et maintenance avec des valeurs fictives injectées uniquement dans le processus de vérification. Aucun conteneur n’a été construit ou démarré et aucun fournisseur contacté.
- Génération Prisma réussie; `npm.cmd run build` réussit (API, copie Prisma, Angular); `npm.cmd test` réussit avec **36/36 tests API** et **6/6 tests outils**; `npm.cmd run lint` passe (API et web). E2E, Playwright, audit npm et test sur PostgreSQL réel non exécutés dans cette phase.
- La migration `20261025000000_email_quota_and_queue` crée le compteur journalier et la file d’e-mails. Elle n’a pas été appliquée à aucune base. Tant que cette migration n’est pas approuvée puis appliquée par la procédure de migration, le nouveau compteur/outbox n’est pas opérationnel sur une base existante; les appels de file échouent de façon contrôlée et l’envoi du lien urgent de réinitialisation échoue fermé.
- Les variables `POSTGRES_APP_PASSWORD` doivent contenir un secret compatible URL, car Compose forme `DATABASE_URL` à partir de cette valeur. Ne pas utiliser un mot de passe contenant des caractères réservés URL sans encodage.
- Blocages humains avant mise en service : domaine et DNS; comptes fournisseur paroissiaux avec au moins deux administrateurs protégés par MFA; choix de région; carte/alertes de budget et vérification des quotas; génération/rotation et stockage hors serveur des secrets; provisionnement sécurisé du premier ADMIN (non effectué automatiquement par Compose); certificat et renouvellement; migration après revue/sauvegarde; restauration réelle depuis le stockage externe; contrôle réseau/pare-feu; essai e-mail; appel WebRTC/ TURN sur appareils réels.
- Déploiement réel : **non testé**. La validation YAML ne prouve ni construction d’image, ni démarrage PostgreSQL en volume neuf, ni TLS/DNS, ni livraison e-mail, ni sauvegarde/restauration. Commandes de test machine réelles et ordre de lancement : `docs/DEPLOIEMENT_GRATUIT.md`.
