# Blocages et actions humaines

## Relance ciblée — 8 octobre 2026

- `npm run prisma:generate --workspace @paroisse/api` échoue deux fois avec `EPERM` au renommage du moteur Prisma Windows, y compris une tentative avec droits élevés. Diagnostiquer le verrou du fichier (processus/antivirus) sur la machine; ne pas supprimer de moteur tant qu’un processus peut l’utiliser.
- `npm run test:e2e` a validé la cible dédiée `paroisse_test`; les 16 migrations sont déjà appliquées, dont les migrations 20261008000100 et 20261009000000. Les 29 cas du fichier e2e n’ont pas démarré : Jest/Node a terminé sur `heap out of memory` (code 134), même lancé seul avec limite mémoire augmentée. Résultat e2e de cette session : 0/29 exécuté, aucun résultat de scénario.
- `npm audit --omit=dev` et `npm audit` sont indisponibles : `getaddrinfo ENOTFOUND registry.npmjs.org`, `audit endpoint returned an error`. Aucun avis frais ne peut être inventorié. Le dernier résumé historique compte 3 hauts + 2 modérés en production, 32 hauts + 6 modérés au total; détails paquet/avis/exploitabilité à confirmer en réseau. Voir `docs/SECURITY_AUDIT.md`.
- Succès de cette session : 29 tests unitaires API + 3 outils; lint API/web; builds API/web. La génération Prisma reste bloquée malgré le succès de ces compilations.
- Action humaine : libérer assez de mémoire, résoudre le verrou Windows du moteur Prisma, puis relancer génération, e2e sur `TEST_DATABASE_URL`, audits npm dans un environnement avec accès au registre. Examiner les avis réels avant toute mise en production.

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
