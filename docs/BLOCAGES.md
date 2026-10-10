# État réel, blocages et vérifications

Dernière passe locale : 10 octobre 2026. Ne pas confondre les résultats historiques de versions antérieures et ceux-ci.

## Résultats exécutés sur le code présent

- `npm.cmd run lint` : réussi (API TypeScript et web TypeScript).
- `npm.cmd test` : après correction du message générique de récupération, **29 réussis, 0 échoué** (6 tests outils, 23 tests unitaires API). La première exécution avant cette correction avait 22 réussis et 1 échec; le défaut a été corrigé dans le serveur, assertion inchangée.
- `npm.cmd run build` : réussi pour l'API et Angular.
- `npm.cmd audit --omit=dev` : registre contacté; **5 avis** (3 hauts, 2 modérés). Code de sortie 1.
- `npm.cmd audit` : **38 avis** (32 hauts, 6 modérés). Plusieurs correctifs suggérés imposeraient une mise à niveau majeure de Jest; aucune mise à niveau automatique effectuée.
- `npm.cmd run test-db:diagnose` : valide la configuration sans identifiants et indique la cible `localhost:5432/paroisse_test`.
- `prisma migrate status` strictement en lecture seule, avec la cible forcée sur `TEST_DATABASE_URL` : Prisma identifie `paroisse_test`, mais retourne `Schema engine error` vide. Pas de statut de migration disponible.

## Tests non exécutés

- API e2e PostgreSQL : **0 exécuté, résultat inconnu** (17 scénarios dans le fichier courant). Le runner `npm.cmd run test:e2e --workspace @paroisse/api` lance `migrate deploy` automatiquement; il a été retenu tant que la base et ses données de test ne sont pas lisibles, afin de ne pas détruire une éventuelle donnée d'essai inconnue.
- Playwright courant : deux exécutions ont chacune produit **0 réussi, 11 échoués** parce que l'exécutable Chromium attendu était absent. `npx.cmd playwright test --list` découvre bien les 11 scénarios, mais ne les exécute pas. Une tentative d'installation de Chromium vers `.playwright-browsers` n'a fourni aucune progression après 60 secondes et a été interrompue; aucun binaire n'est présent dans ce dossier ni dans le cache Playwright du profil utilisateur. L'installation et les tests navigateur sont donc **non exécutés avec succès par moi**; il ne faut pas interpréter la compilation du global setup comme une validation Playwright.
- Migration de simplification : **0 essai sur base vide et 0 essai sur base historique**. Ne l'appliquez pas au développement. Voir les étapes de test dans `MIGRATION_PROCEDURE.md`.
- Docker Compose, démarrage Linux, TLS réel, envoi e-mail et restauration distante : non exécutés ici.

Après correction du service PostgreSQL de test, l'humain doit d'abord confirmer que `paroisse_test` est une base isolée et jetable, faire une sauvegarde chiffrée vérifiée si elle contient des données utiles, puis lancer le statut et le protocole de tests de migration. Seulement ensuite : `npm.cmd run test:e2e --workspace @paroisse/api` avec `NODE_OPTIONS=--max-old-space-size=4096`. Pour Playwright, depuis la racine du projet, lancer `npx.cmd playwright install chromium`, puis `npx.cmd playwright test`; vérifier que les 11 scénarios passent avant de déclarer la phase validée.

## Simplification appliquée dans le code actif

- L'API n'enregistre plus de contrôleurs communautaires; les routes publiques d'inscription et les anciennes routes de messagerie/publications ne sont plus définies.
- Le schéma Prisma courant ne contient plus les modèles communautaires ni les rôles `FIDELE`, `MODERATEUR` et `PENDING`. Les générations de schéma historique restent conservées pour que Prisma puisse rejouer les anciennes migrations; elles ne sont pas du code runtime.
- La recherche de code courant conserve quelques occurrences justifiées : `FIDELES` est une **zone de feuille de présence**, `Person.photoUrl` correspond à la photo publique du dirigeant/équipe expressément conservée, et les noms d'anciennes tables/rôles sont nécessaires à la migration d'archivage/suppression. Aucun de ces éléments ne réactive le réseau communautaire.
- Les vieux fichiers d'e2e Playwright communautaires ont été supprimés; les tests de navigation restants ciblent accueil, connexion, récupération, présence, admin, programme et affichage texte du nom.

## Décision de mise en service

**Pas prêt pour de vraies données.** Il faut vérifier la migration destructive sur les deux bases de test, terminer les e2e et Playwright, traiter les avis npm, restaurer réellement une sauvegarde chiffrée et faire approuver par un humain les décisions listées dans `DECISIONS_A_VALIDER.md`.
