# État réel, blocages et vérifications

## Audit de sécurité selon la checklist — 12 octobre 2026

- `POST /api/v1/auth/register` et l’auto-inscription UI ont été désactivés, conformément à la règle retenue ici que l’administration crée les comptes. L’E2E vérifie 404 et absence de création en base de test. À confirmer par un responsable dans `DECISIONS_A_VALIDER.md`.
- Le seed `apps/api/prisma/seed.ts` a été rendu non réinitialisant : il n’écrase plus le mot de passe/l’état d’un SUPER_ADMIN existant et refuse une configuration partielle ou une collision e-mail sans administrateur. E2E `never resets or reactivates an existing SUPER_ADMIN when the seed is rerun` passe sur `paroisse_test`. Le chemin de création sur une base vide n’a pas été exécuté cette passe : le vérifier sur une base jetable, jamais directement sur la base de développement/production.
- L’inventaire d’entrées reste partiel : plusieurs `@Req()`, `@Res()` et paramètres de route sont typés `any` ou sans DTO de format; `SubmitDto.reason` n’a pas de limite métier. Les limites générales JSON sont 64 Kio.
- Audit npm vérifié sur registre le 12 octobre 2026 : `npm audit --omit=dev --omit=optional` renvoie 0 avis (le job `audit:production` a réussi). L’audit complet renvoie 37 avis : 32 hauts et 5 modérés, tous dans la chaîne de développement/test (Jest et CLI Prisma). La mise à niveau proposée pour Jest est majeure (30.5.2) et n’a pas été appliquée. Réexaminer avant exposition du pipeline de développement.
- `npm run security:scan` a couvert le code, les bundles textuels et l’historique Git local; aucun élément détecté. Gitleaks n’est pas installé ici : une vérification indépendante avec gitleaks demeure à effectuer par une personne.
- Playwright et e2e PostgreSQL ont été exécutés localement; voir `CHECKLIST_AUDIT.md` pour les nombres exacts. Docker et Nginx ne sont pas installés : `docker compose config`, `nginx -t`, démarrage Compose, TLS réel et test réseau externe restent **non exécutés**.
- Aucun scan OWASP ZAP sur un serveur réel, rotation effective de secrets, ni restauration récente par un humain n’a été fait dans cette passe. Le déploiement n’est donc pas prêt pour de vraies données.

## Images et affichage mobile — 12 octobre 2026

- Les originaux fournis sont conservés dans `docs/design/sources/`; seuls les dérivés WebP sont utilisés à l’affichage. L’image remise comme Bible en goun ne permet pas, à elle seule, de vérifier la langue de l’édition : confirmation du propriétaire requise.
- Les droits d’utilisation des deux images jointes restent à confirmer par le propriétaire et l’image de Jésus-Christ doit être validée par le dirigeant avant publication.
- Le débordement mobile a été corrigé à la source : le héros et ses textes se replient, l’en-tête et les formulaires ont des colonnes réellement réductibles et le lien du programme se place sous son titre sur tablette. Aucun `overflow-x: hidden` n’est appliqué à la page.
- Playwright : les 7 routes publiques testées passent aux largeurs 320, 360, 390, 412 et 768 px, en paysage (568×320 et 844×390), ainsi qu’avec les tailles de texte simulées à 200 %. Les mesures vérifient `scrollWidth <= clientWidth` sur `documentElement` et `body`.
- Les captures `accueil-320.png`, `accueil-360.png`, `accueil-412.png` et `accueil-1440.png` ont été générées dans `docs/design/captures/`.

## Accueil — 11 octobre 2026

- Le domaine public `APP_PUBLIC_URL` manque localement : canonique et Open Graph/Twitter restent en chemins relatifs jusqu’à validation d’un domaine HTTPS. La personne responsable doit fournir le domaine avant publication.
- Les captures Playwright 360/768/1440 px et les mesures locale de chargement doivent être générées lors de `npm run test:playwright`. Elles ne prouvent pas la performance d’un serveur de production.
- La photo reçue du chargé paroissial est utilisable, mais un original portrait en meilleure résolution améliorerait l’affichage sur écran large. Le message d’accueil du dirigeant reste à approuver.
- La précédente illustration de Jésus-Christ a été remplacée par le fichier fourni par le propriétaire ; sa source et ses droits d’utilisation restent à confirmer avant publication.
- Validation de cette passe sur le code courant : `npm run lint` réussi ; `npm run build` (NestJS + Angular) réussi ; `npm test` outils 15/15 et API **42/42** (10 suites) ; `npm run test:playwright` **27/27**. Les e2e API contre PostgreSQL n’ont pas été lancés pendant cette passe : l’accueil et ces changements ne nécessitaient aucune migration ni écriture de base.
- Playwright a produit les captures `docs/design/captures/accueil-360.png`, `accueil-768.png`, `accueil-1440.png`. Mesure réseau simulée : LCP 1 680 ms, CLS 0,000 à 1,6 Mbit/s/150 ms. Ce résultat ne certifie pas les performances sur une machine ou un téléphone réel.
- Docker et le binaire Nginx ne sont pas installés dans cet environnement. La règle gzip de `infra/web-static.conf` n’a pas été validée par `nginx -t` ni dans le conteneur ; le serveur de test Playwright applique bien gzip et les transferts compressés ont été mesurés par Chromium.
- Vérifications supplémentaires réussies : contraste AA de chaque nœud de texte visible de l’accueil, reduced-motion, navigation clavier et menu mobile, horaires du cours à 19 h 29 / 19 h 30 / 21 h 29 / 21 h 30 et le mardi, textes XSS rendus sans balise active.
- La route du dirigeant fournit également l’orthographe **Vénérable Suprême Évangéliste SEWADE KOUESSI Lucien** et la nouvelle image WebP. La suite vérifie au point 06 l’ajout, la modification et le retrait d’un intervenant par l’administration.

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

## Passe accueil : pied de page, images et responsive — 12 octobre 2026

Cette section remplace les résultats Playwright historiques ci-dessus pour le code courant.

- Pied de page : lien accessible « Développement technique : cephacemacevo@gmail.com » ouvrant Gmail dans un nouvel onglet, plus un lien `mailto:` de secours pour l’application locale. L’avertissement de confidentialité est présent ; contraste vérifié à au moins 4,5:1, focus clavier visible et retour à la ligne des adresses longues.
- Débordement : corrigé à la source dans les grilles, formulaires, en-tête, titres longs et lien du programme. Aucun `overflow-x: hidden` global n’a été ajouté. Playwright vérifie document et body sur 7 routes publiques à 320, 360, 390, 412 et 768 px, en paysage et avec texte agrandi à 200 %.
- `npx.cmd playwright test` : **36 réussis, 0 échoué**. La commande reconstruit Angular avant les tests. Les captures pleine page `docs/design/captures/accueil-320.png`, `accueil-360.png`, `accueil-412.png` et `accueil-1440.png` ont été générées.
- `npm.cmd run lint` : réussi. `npm.cmd run build` : API Nest et Angular réussis. `npm.cmd test` : outils **15/15**, API **42/42** (10 suites). `npm.cmd run test:e2e` avec `NODE_OPTIONS=--max-old-space-size=4096` et `TEST_DATABASE_URL` : **24/24**, base de test à jour. Aucune migration et aucune modification de `DATABASE_URL` dans cette passe.
- Bundle Angular initial : avant **371,85 kB brut / 99,41 kB estimés transférés** ; après **375,98 kB brut / 100,18 kB estimés** (différence +4,13 kB brut et +0,77 kB transféré). Mesure du build local courant, non représentative d’un serveur de production.
- Bible : original JPEG **1 178 172 octets**; WebP mobile 480 px **26 652 octets** et WebP 720 px **43 070 octets**. Aucune version antérieure de cette image n’était servie par la page, donc pas de comparaison ancien/nouveau équivalente. Jésus : original WebP fourni **64 264 octets**; dérivés 480 px **28 802 octets** et 720 px **48 406 octets**. Les deux images remplacent les anciennes ressources correspondantes; chaque dérivé est inférieur à 120 Ko. Les dimensions sont intégrées au HTML, sans recadrage ni filtre.
- Le test des images différées fait défiler chaque image avant d’attendre `naturalWidth`, puis vérifie qu’elles sont réellement chargées. Aucun test n’a été sauté.
- Reste à faire par un humain : confirmer que la photo fournie représente bien une Bible en langue goun, confirmer les droits d’utilisation des deux images et faire valider l’illustration de Jésus-Christ par le dirigeant avant publication.
