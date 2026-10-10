# Guide de l’administration paroissiale

## Connexion et rôles

L’administrateur ouvre `/admin/connexion` ; le sous-administrateur ouvre `/sous-admin/connexion`. La double vérification TOTP est requise pour les comptes administrateurs. Ne partagez jamais les mots de passe, clés TOTP ni codes de secours par messagerie.

Dans **Administration → Comptes fidèles**, l’administrateur consulte les comptes, suspend ou réactive un membre avec un motif, et attribue les permissions prévues aux sous-administrateurs. Un sous-administrateur ne peut ni se donner un rôle, ni s’approuver lui-même, ni créer ou valider un administrateur. Les fidèles n’ont aucun droit de saisie des présences.

Les demandes de secrétaire de présence et de président d’un jour sont deux attributions distinctes. Le président choisit le jour de la semaine (lundi à dimanche) lors de sa demande. Après attribution, un responsable ne peut consulter ni modifier le jour d’un autre responsable. Le secrétaire de présence saisit le cours biblique du lundi ; le président gère les deux zones de son jour.

## Présences et totaux

Les présences du cours biblique sont saisissables le lundi de 19 h 30 à 21 h 30, fuseau `Africa/Porto-Novo`. Les feuilles de la semaine sont ouvertes pour ajout et correction de 10 h à 18 h, chacun des sept jours. La tolérance est paramétrée côté serveur. Les noms sont visibles au responsable du jour concerné ; l’administrateur voit les totaux. Une consultation nominative administrative doit être explicitement motivée et est auditée.

Une feuille présente les totaux par Temple et Salle de vision/Woli. L’administrateur peut parcourir les journées et les totaux. Il ne saisit pas les présences à la place des responsables. L’enregistrement conserve le total calculé côté serveur.

## Actualités et modération

La file `/admin/moderation` est accessible aux rôles de modération. Chaque décision nécessite un motif et laisse un historique audité. Le modérateur peut masquer un contenu, avertir un membre et prononcer une suspension temporaire (maximum 30 jours). L’administrateur peut supprimer un contenu, suspendre définitivement et statuer sur un appel. Un appel unique est examiné par un autre administrateur que celui qui a émis la sanction.

Les signalements de publications, commentaires et profils utilisent une liste de motifs fermée. Au seuil configuré, le contenu peut être masqué provisoirement automatiquement en attendant l’examen.

## Sondages et événements

Un membre connecté peut créer un sondage depuis **Actualités → Créer un sondage** : saisir la question, au moins deux choix distincts (six maximum), puis, si nécessaire, une date de clôture dans les 30 jours. Avant la clôture, un membre peut changer son vote; le total reste agrégé et le choix individuel n’est visible que par son auteur. La modification du vote est auditée sans enregistrer l’identité du votant dans cette trace. À la clôture, les nouveaux votes sont refusés.

Pour annoncer une rencontre, choisir **Créer un événement**, renseigner un titre, une date/heure future, puis le lieu et la description facultatifs. La date doit se situer entre cinq minutes et un an dans le futur; une heure de fin facultative doit suivre le début et rester dans les 24 heures. Les membres peuvent indiquer leur réponse avant le début. L’interface et l’API n’exposent que des totaux, sans liste nominative de participants. Les comptes récents sont soumis à des quotas renforcés.

Les événements et sondages signalés se traitent dans la file **Administration → Modération** selon le motif, l’historique et les permissions de l’agent. Les décisions exigent un motif et sont journalisées. Il n’existe pas d’action séparée de clôture manuelle : un sondage ferme à `closesAt`, un événement cesse d’accepter les réponses à son heure de début.

## Récupération 2FA par CLI

Effectuez la récupération depuis un terminal serveur protégé, après avoir confirmé la base et généré le client Prisma. Ne copiez pas les secrets affichés dans un terminal partagé ou dans un ticket.

1. Pour l’enrôlement initial : `npm.cmd run admin:enroll-2fa -- --email=administrateur@exemple.org`. Le titulaire authentifie son compte au terminal, lie une application TOTP, confirme avec le code courant et garde les 10 codes de secours hors ligne. Ils ne sont affichés qu’une fois.
2. Pour réinitialiser une 2FA perdue : un autre SUPER_ADMIN actif et déjà protégé doit confirmer son identité. Exécutez `npm.cmd run admin:reset-2fa -- --email=compte-a-recuperer@exemple.org --actor-email=super-admin@exemple.org --confirm=RESET-2FA`. Les preuves requises sont saisies dans le terminal ; la commande écrit une trace d’audit et révoque les sessions du compte concerné.
3. Relancez ensuite l’enrôlement. Le titulaire doit définir un nouvel appareil et conserver de nouveaux codes de secours.

La récupération CLI n’est pas une désactivation de la 2FA. Si l’opérateur ne peut pas prouver les identités requises, arrêtez la procédure et suivez la politique d’incident de l’organisation.

## Photos

La fonction est désactivée par défaut. Ne positionnez `SOCIAL_PHOTOS_ENABLED=true` qu’après configuration d’un stockage S3 privé et de ClamAV, puis après les essais d’exploitation décrits dans [MEDIA_CONFIGURATION.md](MEDIA_CONFIGURATION.md). Il n’existe pas d’activation sûre par simple bascule locale.

### Profils membres — 9 octobre 2026

Dans le fil communautaire, sélectionnez le nom d’un auteur pour ouvrir sa fiche publique. La fiche montre uniquement sa présentation et ses publications publiques récentes. Un profil non découvrable ou bloqué n’est pas accessible. Les photos de profil ne sont pas encore activées; l’avatar utilise les initiales. Le réglage « découverte du profil » contrôle la visibilité de cette fiche.

### Accès profil public et groupes — 9 octobre 2026

Le profil membre public est accessible depuis le nom sous ses publications, si le membre autorise sa découverte et qu’aucun blocage ou masquage de modération ne s’applique. Il n’affiche que sa présentation et ses 20 publications publiques les plus récentes. Les mineurs sont affichés comme « Membre fidèle ». Dans un groupe privé, une personne doit être acceptée comme membre pour lire ou publier; une personne retirée perd cet accès.

Les nouveaux e2e de ces règles attendent une base de test démarrée. Ne considérez pas le profil ou les contrôles récents de groupes comme vérifiés en base tant que `npm run test:e2e --workspace @paroisse/api` n’a pas été exécuté avec succès.

## Messagerie paroissiale

Les comptes actifs ouvrent **Messages** (routes `/messages` et `/actualites`). La liste permet de rechercher et filtrer les conversations. **Nouvelle conversation** permet de choisir un membre pour un échange direct ou de sélectionner au moins deux autres membres et nommer un groupe. L’adhésion autorise l’accès au contenu; une personne retirée d’un groupe perd cet accès. Sélectionnez une conversation pour écrire du texte, répondre à un message ou ajouter une réaction. Le panneau **Détails de la conversation** présente les membres. Le bouton de déconnexion termine la session.

Un message peut être signalé depuis son action de signalement; les motifs sont fermés. Un membre peut bloquer un contact. Les comptes autorisés à modérer traitent la file dédiée `/admin/moderation`; chaque action doit fournir un motif et est auditée. La suspension révoque les sessions du compte concerné.

Le service actualise les messages périodiquement (environ 15 secondes), plutôt que par connexion temps réel. Les messages sont stockés côté serveur sans chiffrement de bout en bout. Les stories textuelles et les directs WebRTC sont décrits dans la section suivante. Les pièces jointes, photos, vidéos et appels téléphoniques restent indisponibles tant que le stockage privé, l’analyse antivirus et les services nécessaires ne sont pas installés et vérifiés.

La migration de remplacement de l’ancien fil communautaire supprime ses anciennes publications, réactions, commentaires, sondages, événements et groupes lorsqu’elle est appliquée. Avant toute application à la base de production, l’administrateur doit effectuer et vérifier une sauvegarde et confirmer que l’abandon des anciennes données est accepté.

Contrôle mobile ajouté : le bouton « Détails de la conversation » ouvre le panneau des membres et liens de navigation sur téléphone. Il est testé à 360 px dans Playwright.

### Stories et directs

Dans **Messages**, une coupure réseau affiche un état de reconnexion. Les messages composés hors ligne sont conservés dans IndexedDB sur cet appareil et renvoyés lorsque le réseau revient, avec une clé d’idempotence. Cette file n’est pas chiffrée au repos par l’application : ne pas laisser un appareil partagé ouvert et effacer ses données locales après usage. Les conversations chargent l’historique depuis le serveur après reconnexion; les messages ne sont pas chiffrés de bout en bout.

Le direct WebRTC a été vérifié ici uniquement au niveau des autorisations serveur et de la signalisation automatisée. Avant de l’annoncer aux fidèles, tester un hôte et plusieurs spectateurs sur de vrais appareils, vérifier l’accès caméra/micro, l’arrivée du flux, le départ d’un spectateur, la fermeture par l’hôte et la coupure réseau. Le téléphone doit ouvrir le site en HTTPS (sauf `localhost` sur l’appareil); un lien HTTP vers l’adresse IP locale ne suffit pas pour caméra/micro. Configurer un TURN réel pour les réseaux restrictifs.

Les membres actifs trouvent les autres membres dans **Nouvelle conversation** et peuvent leur écrire en privé. L’annuaire ne montre ni téléphone, ni adresse e-mail. La sécurité du compte (et, pour les numéros, une future vérification WhatsApp réelle) ne doit pas être déduite du seul format saisi.

Dans le menu de la communauté, **Stories** permet de publier du texte limité à 500 caractères, visible 24 heures pour les membres de la même tranche d’âge. Une personne peut signaler la story; les rôles MODERATEUR/ADMIN la traitent dans la file de modération des stories avec un motif obligatoire. Les décisions et les consultations admin sont journalisées.

Dans **Directs**, un membre démarre une diffusion en donnant un titre et en autorisant caméra et micro; quatre spectateurs de sa tranche d’âge au maximum peuvent la rejoindre. Le direct n’est pas enregistré. L’admin voit seulement la liste des directs actifs et ne peut pas rejoindre la vidéo par l’interface de supervision. En production, configurer HTTPS et des identifiants TURN temporaires dans `LIVE_ICE_SERVERS_JSON`; ne pas mettre de secret TURN dans les journaux ou le dépôt. Sans TURN, certains réseaux mobiles et pare-feu empêcheront la connexion. Pour une audience plus large, il faut une infrastructure média de type SFU et des tests de charge avant d’annoncer cette capacité.

## Permissions communautaires (première étape)

Depuis l’espace d’administration, attribuez un droit uniquement à un compte actif admissible. Chaque changement demande un motif d’au moins huit caractères ; il est journalisé, invalide les sessions existantes et force une reconnexion. Les droits disponibles sont : gestion des comptes, préparation du cours biblique du lundi, publication du programme et des événements, gestion des études, publication de l’histoire paroissiale, lancement d’un direct et création de groupes. Les routes serveur contrôlent les permissions stockées en base ; une case cochée dans le navigateur ne suffit pas. Les mineurs ne peuvent pas créer de groupe ni lancer de direct. Les espaces Programme, Études, Histoire, répertoire/demandes de groupes, visionneuse stories et notifications généralisées ne sont pas encore livrés.

### État le plus récent — 10 octobre 2026

Les fonctions listées dans le dernier paragraphe ont depuis reçu des premières pages/API : Programme et événements, thèmes bibliques, structure doctrinale vide, histoire paroissiale, annuaire/demandes de groupes, lecteur de stories et notifications de début de direct. L’ancien paragraphe décrit l’état de la première étape et ne doit pas être lu comme l’état actuel.

- **Groupes :** l’autorisation paroissiale `CREER_GROUPE` permet de créer un groupe privé à code ou ouvert sur demande. Dans le panneau Détails, le créateur attribue/révoque les rôles d’administrateur, retire des membres, modifie le nom/description/règles, renouvelle/révoque le code et transfère la responsabilité. Le membre peut quitter le groupe; le créateur doit d’abord transférer la responsabilité. L’annuaire `/community/groups` présente les groupes ouverts et les demandes en attente. Un code privé est affiché à sa création/renouvellement; copiez-le à ce moment. Le serveur conserve son empreinte, pas le code. Les mineurs et les groupes dont la composition d’âge ne peut être vérifiée restent exclus.
- **Programme :** un compte autorisé par `PUBLIER_PROGRAMME` peut créer un programme ou un événement et choisir s’il est publié. Les membres connectés consultent les contenus publiés. La page n’offre pas encore tous les outils d’édition dans l’interface.
- **Études :** `GERER_ETUDES` permet d’enregistrer le thème hebdomadaire, sa référence et son résumé. Les rubriques des 12 interdits, 11 ordonnances, 10 commandements et 4 sacrements sont des espaces réservés; aucun texte n’est à publier avant réception et validation du PDF paroissial.
- **Histoire :** `PUBLIER_HISTOIRE` autorise la création/publication d’un fait vérifié. Pas de versionnage historique à ce jour; corriger une entrée ne conserve pas automatiquement son ancienne version.
- **Stories :** les stories sont textuelles et disparaissent au bout de 24 heures. Le lecteur de téléphone permet d’ouvrir/avancer et mémorise localement les stories consultées dans la session du navigateur. Cette vue n’est pas un registre serveur « vu par ». Les stories image/vidéo restent désactivées; masquage individuel et réponse directe à une story ne sont pas disponibles.
- **Directs :** lancement contrôlé par `LANCER_LIVE`, caméra/micro via WebRTC et limite de quatre spectateurs. Un message interne est créé pour les autres comptes paroissiaux actifs éligibles; l’écran Directs relit les annonces des dernières 24 heures même si un autre écran a marqué la notification générale comme lue. Le rafraîchissement est HTTP périodique, pas une alerte push instantanée. Testez le direct sur appareils réels, en HTTPS et avec TURN configuré.

La dernière vérification du 10 octobre a passé lint et build web/API ainsi que 29/29 tests unitaires API. Les 5 tests Playwright ciblés n’ont pas démarré faute du navigateur Chromium local; les 38 scénarios e2e n’ont pas pu se connecter au PostgreSQL local. Aucun de ces derniers résultats ne valide les modifications récentes : rejouez les tests sur le poste avec Chromium et PostgreSQL `paroisse_test` démarrés.
# Exploitation de la configuration portable

Pour le lancement, le renouvellement TLS, les quotas Resend et la procédure de sauvegarde/restauration, suivre [DEPLOIEMENT_GRATUIT.md](DEPLOIEMENT_GRATUIT.md). L’administration doit surveiller la notification interne de seuil e-mail (80 par défaut sur un maximum de 100/jour) et confirmer que les messages non urgents repris le lendemain sont délivrés.

Avant de créer un premier ADMIN en production, faire provisionner le compte via une procédure serveur sécurisée et distincte du seed de développement, puis enrôler la 2FA par CLI. Compose ne crée pas le compte administrateur initial et ne doit pas être ouvert au public tant qu’un second compte ADMIN indépendant n’a pas été créé et testé.

La nouvelle file e-mail nécessite la migration `20261025000000_email_quota_and_queue`. Elle n’a pas été exécutée automatiquement ni appliquée par cette préparation. Suivre la revue, sauvegarde restaurée et procédure de migration avant d’activer le déploiement sur une base existante.
