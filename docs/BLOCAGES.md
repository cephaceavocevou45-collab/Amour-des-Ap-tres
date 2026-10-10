# État réel, blocages et vérifications

Dernière passe locale : 10 octobre 2026, après diagnostic de l'erreur Prisma P2022 en développement. Ne pas confondre les résultats historiques de versions antérieures et ceux-ci.

## Résultats exécutés sur le code présent

- `npm.cmd run lint` : réussi (API TypeScript et web TypeScript).
- `npm.cmd test` : **33 réussis, 0 échoué** (8 tests outils, 25 tests unitaires API), incluant la normalisation des URL PostgreSQL sans divulgation, le stockage inactif d'une demande responsable et les limites d'inscription par IP et par adresse.
- `npm.cmd run build` : réussi pour l'API et Angular.
- `npm.cmd audit --omit=dev` : registre contacté; **5 avis** (3 hauts, 2 modérés). Code de sortie 1.
- `npm.cmd audit` : **38 avis** (32 hauts, 6 modérés). Plusieurs correctifs suggérés imposeraient une mise à niveau majeure de Jest; aucune mise à niveau automatique effectuée.
- `npm.cmd run test-db:diagnose` : valide la configuration sans identifiants et indique la cible `localhost:5432/paroisse_test`.
- API e2e sur `paroisse_test` : **18/18 réussis** après correction des droits de la liste des comptes.
- Base `paroisse_test` : statut Prisma à jour après la migration de schéma `20261027000000_attendance_role_registration`; un diff en lecture seule entre la base et le schéma a confirmé que cette migration n'ajoute/modifie aucune donnée.
- Sauvegarde chiffrée de `paroisse` restaurée dans une nouvelle base d'archive : vérification sans afficher les contenus, **27 tables sur 27**, sommes de lignes égales, **35 clés étrangères sur 35**, colonnes/contraintes/index/types d'énumération identiques.
- Une seconde restauration isolée a servi de clone historique. Les **16 migrations** ont été déployées sur ce clone; elles se sont appliquées et le diff final Prisma est vide.
- Après validation de l'archive et du clone, les mêmes **16 migrations** ont été appliquées à `paroisse` avec `prisma migrate deploy`. Prisma a confirmé « All migrations have been successfully applied ».
- L'API déjà à l'écoute sur le port 3000 répond à `/health` avec `200` et à `/ready` avec `200` et `database: available`. Une seconde tentative de démarrage a rencontré `EADDRINUSE` car le service existe déjà; ne démarrez pas une seconde copie.

## Tests non exécutés

- E2E sur le clone restauré de données historiques : non exécutés. L'appel d'outil nécessitant une approbation a été refusé par le contrôle d'approbation avant le démarrage de la commande; aucun résultat n'est revendiqué pour ce test.
- Playwright : `npx.cmd playwright test --list` découvre **13 tests**. L'exécution actuelle donne **0 réussi, 13 échoués**, tous bloqués avant le lancement du navigateur par l'absence de Chromium (`Executable doesn't exist`). Le serveur a reconstruit Angular avec succès avant ces échecs. Une tentative d'installation de Chromium vers `.playwright-browsers` n'a fourni aucune progression après 60 secondes et a été interrompue; aucun binaire n'est présent dans ce dossier ni dans le cache Playwright du profil utilisateur.
- Migration de simplification : la chaîne a été vérifiée sur un clone restauré de la base historique, mais pas sur une base vide. La migration de développement reste non appliquée. L'archive chiffrée restaurée préserve l'ancien jeu de données indépendamment de la nouvelle structure; les contenus communautaires ne sont pas convertis en messages privés.
- Docker Compose, démarrage Linux, TLS réel, envoi e-mail et restauration distante : non exécutés ici.

L'application des migrations est terminée sur `paroisse`; l'archive antérieure conserve les anciennes données communautaires, sans conversion en messages privés. Il reste à confirmer le parcours de connexion avec un compte réel dans le navigateur. Pour Playwright, depuis la racine du projet, lancer `npx.cmd playwright install chromium`, puis `npx.cmd playwright test`; vérifier que les 13 scénarios passent avant de déclarer la phase validée.

## Simplification appliquée dans le code actif

- L'API n'enregistre plus de contrôleurs communautaires. La route `/auth/register` sert uniquement aux demandes secrétaire de présence ou président d'un jour; le compte reste inactif jusqu'à l'approbation de l'administrateur. Les routes communautaires et d'inscription fidèle restent absentes.
- Le schéma Prisma courant ne contient plus les modèles communautaires ni les rôles `FIDELE`, `MODERATEUR` et `PENDING`. Les générations de schéma historique restent conservées pour que Prisma puisse rejouer les anciennes migrations; elles ne sont pas du code runtime.
- La recherche de code courant conserve quelques occurrences justifiées : `FIDELES` est une **zone de feuille de présence**, `Person.photoUrl` correspond à la photo publique du dirigeant/équipe expressément conservée, et les noms d'anciennes tables/rôles sont nécessaires à la migration d'archivage/suppression. Aucun de ces éléments ne réactive le réseau communautaire.
- Les vieux fichiers d'e2e Playwright communautaires ont été supprimés; les tests de navigation restants ciblent accueil, connexion, récupération, présence, admin, programme et affichage texte du nom.

## Décision de mise en service

**Pas prêt pour de vraies données.** Il faut vérifier la migration destructive sur les deux bases de test, terminer les e2e et Playwright, traiter les avis npm, restaurer réellement une sauvegarde chiffrée et faire approuver par un humain les décisions listées dans `DECISIONS_A_VALIDER.md`.

## Résultat de la passe de sécurisation — 10 octobre 2026

Les anciens nombres ci-dessus décrivent une exécution précédente et sont remplacés pour l'état courant par les résultats suivants :

- `npm run lint` — réussi pour API et web.
- `npm run build` — les deux builds ont été lancés séparément : API Nest + copie du client Prisma réussis, Angular réussi.
- `npm test` — outils **8 réussis / 0 échoué**; API **10 suites, 39 réussis / 0 échoué**.
- `npm run test:e2e` — **24 réussis / 0 échoué**, exécutés contre `paroisse_test`; le contrôle Prisma a vu 33 migrations et aucune en attente. Aucun changement ou migration n'a été fait à la base de développement lors de cette passe.
- `npm run test:playwright` — **17 réussis / 0 échoué** après reconstruction Angular; tests de présentation à 360 px, navigation clavier, XSS d'un nom de présence et comportement de la file IndexedDB.
- `npm run security:scan` — réussi, aucun secret manifeste détecté.
- `npm audit --omit=dev` — **5 avis, 3 hauts et 2 modérés**, code de sortie 1.
- `npm audit` — **38 avis, 32 hauts et 6 modérés**, code de sortie 1. Un correctif complet proposé imposerait Jest 30.5.2 (majeure); aucun correctif automatique n'a été appliqué.

La première tentative Playwright en environnement restreint avait échoué sur `ERR_NETWORK_ACCESS_DENIED` (17 tests bloqués avant navigation). La relance autorisée avec accès au serveur local et Chromium a exécuté les tests réellement; une assertion de visibilité d'options de liste, un mauvais horodatage déterminé depuis l'horloge hôte et l'amorçage IndexedDB ont été corrigés dans le test. Une nouvelle exécution a terminé **17/17**.

### À faire par une personne avant production

- Traiter les avis npm hauts sans `--force` aveugle; l'audit complet doit ensuite revenir à 0 avis hauts/critique ou chaque dérogation doit être acceptée et datée.
- Valider le script de rôles PostgreSQL sur une base d'essai neuve; ne pas le lancer tel quel sur `paroisse` sans sauvegarde et autorisation de l'administrateur DB.
- Installer/configurer HTTPS, Nginx, DNS, pare-feu, HSTS et les secrets en production, puis tester les en-têtes depuis l'extérieur.
- Renseigner les personnes à contacter dans `docs/PLAN_INCIDENT.md`, réaliser la rotation des secrets, vérifier les sauvegardes chiffrées distantes et effectuer une restauration réelle.
- Évaluer et retirer si possible `style-src 'unsafe-inline'` de la CSP Nginx sans casser les styles Angular.

Le serveur Docker, la base en production, les e-mails réels, les fournisseurs externes et l'accès depuis un réseau mobile n'ont pas été testés. Ne pas annoncer un déploiement opérationnel sur la seule base des tests locaux.
