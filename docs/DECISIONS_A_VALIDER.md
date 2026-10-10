# Décisions de sécurité

## Liste et gestion des comptes

Décision arrêtée le 7 octobre 2026 : la liste des comptes est réservée à ADMIN et SUPER_ADMIN. Tout EDITEUR, avec ou sans `GESTION_COMPTES`, reçoit `403` sur cette liste ; aucune liste expurgée n'est renvoyée. Un appel sans authentification reçoit `401`. Un compte authentifié sans le rôle requis reçoit `403`.

Les mêmes refus `403` s'appliquent aux décisions de validation, à la gestion des sous-administrateurs/permissions et à la suspension lorsqu'un rôle non autorisé les demande. Aucun endpoint de détail de compte n'est défini actuellement ; le chemin inexistant retourne `404` et aucune donnée de compte n'est révélée.

Ce choix ne donne aucun accès supplémentaire pour faire réussir les tests. Les tests d'autorisation doivent vérifier `401` sans session, puis `403` avec une session authentifiée insuffisamment autorisée.

## Décision validée — périmètre des présences (7 octobre 2026)

**Option A retenue : l’isolation est par jour.** Chaque responsable hebdomadaire affecté à un jour consulte et gère les présences Temple et Salle de vision de ce jour. Le secrétaire de présence accède seulement au cours biblique du lundi; il n’accède pas aux feuilles du groupe de semaine. L’administrateur supervise les totaux; la consultation des noms reste une action nominative explicite, avec motif et journal d’audit.

Le rôle historique `RESPONSABLE_SALLE_VISION` a déjà été renommé en `RESPONSABLE_SEMAINE` par la migration `20261005000300_responsable_semaine`. Le rôle historique n’existe donc plus dans l’énumération Prisma/PostgreSQL, le code, les seeds ni l’interface. `RESPONSABLE_SEMAINE` reste utilisé pour les présidents affectés à un jour; le désactiver en bloc couperait aussi ces comptes valides. La migration de conversion historique a été vérifiée sur base vide et avec données historiques selon le journal d’exécution de `docs/BLOCAGES.md`.

Test de garde : l’e2e vérifie que `RESPONSABLE_SALLE_VISION` est absent des rôles générés et que les responsables X/Y ne peuvent pas franchir les jours ni les feuilles, y compris entre Temple et Salle de vision.

## Inscription fidèle sans confirmation par e-mail

**Décision intentionnelle, selon la demande de la paroisse :** le compte FIDELE devient utilisable dès son inscription, sans lien de confirmation. L’adresse e-mail est demandée et sert à la récupération du mot de passe. Les demandes de secrétaire ou de président sont différentes : elles restent en attente de la validation du chargé paroissial.

Compensations techniques ajoutées : limitation de débit d’inscription par IP et par adresse (8/10 minutes pour les comptes à responsabilités, 4/10 minutes pour les comptes fidèles), CAPTCHA Turnstile désactivé par défaut mais activable avec `CAPTCHA_ENABLED=true` et les deux clés; message explicite de l’état du CAPTCHA dans l’inscription. Les nouveaux comptes sociaux (moins de 24 heures) sont limités à trois publications par période glissante de 24 heures, ne peuvent pas partager ni déposer des photos. Le serveur applique ces limites ; les e2e couvrent l’IP et l’adresse, la configuration CAPTCHA et les quotas de compte récent.

Risque accepté jusqu’à décision contraire de la paroisse : une adresse e-mail n’est pas vérifiée au moment de l’inscription ; une faute de saisie peut donc empêcher la récupération du compte. Le CAPTCHA n’étant pas activé par défaut, les limites d’inscription doivent rester configurées et observées.

## Décisions appliquées — messagerie de la communauté (9 octobre 2026)

- Les comptes FIDELE, SECRETAIRE_PRESENCE et RESPONSABLE_SEMAINE actifs apparaissent dans l’annuaire par leur nom affiché, sous réserve des règles de blocage et de protection des mineurs. Les coordonnées privées ne sont pas renvoyées.
- Deux membres dont l’âge est connu et appartient à la même tranche (mineur ou adulte) peuvent ouvrir une conversation directe. Toute conversation entre tranches différentes ou avec un âge inconnu est refusée tant qu’un processus de protection approuvé n’existe pas. Le serveur calcule l’âge depuis la date de naissance en base.
- Un groupe privé peut être créé pour des membres d’une même tranche d’âge; un code d’invitation permet de rejoindre le groupe. Seule l’empreinte du code est stockée.
- ADMIN et SUPER_ADMIN ont un accès de supervision en lecture seule à toutes les conversations actives. La liste et chaque lecture de contenu sont journalisées; ils ne peuvent pas envoyer de message comme membres.
- Le champ demandé à l’inscription vérifie le format téléphonique international E.164. Il ne prouve pas que le numéro est inscrit à WhatsApp. Aucune vérification de propriété via WhatsApp Business ou prestataire autorisé n’est configurée.
- La navigation vers les présences a été retirée de l’espace de messagerie. L’accès au module de présence demeure contrôlé séparément par les rôles approuvés.

## Confidentialité des coordonnées et fonctions de communauté

Les membres actifs apparaissent dans l’annuaire intégré par leur nom et peuvent ouvrir une conversation privée. Le numéro de téléphone n’est jamais exposé dans l’annuaire ni au fil des conversations : sa diffusion à tous les comptes créerait un risque de démarchage et de harcèlement, en particulier pour les mineurs. Les appels privés disponibles ici sont des messages écrits internes, pas des appels téléphoniques.

Les stories de cette version sont du texte et expirent après 24 heures; les stories avec photo/vidéo restent désactivées avec les médias. Les directs sont une diffusion WebRTC navigateur-à-navigateur, maximum quatre spectateurs, sans enregistrement; ils exigent HTTPS, autorisation caméra/micro et une configuration TURN pour les réseaux qui bloquent les connexions directes. Cette solution est à faible capacité, pas une plateforme de diffusion à grande audience.

## Corrections communautaires — décisions prudentes du 9 octobre 2026

- `À VALIDER` — Séparer les entrées « Programme » (programmes et événements) et « Études bibliques » (doctrine et thèmes hebdomadaires). La page `/programme-biblique` reste l’outil de préparation du lundi réservé aux rôles déjà autorisés.
- `À VALIDER` — Visibilité publique de l’histoire de la paroisse sur l’accueil : par défaut, lecture réservée aux comptes connectés jusqu’à décision du chargé paroissial.
- `À VALIDER` — Types de groupes, règles d’adhésion et titulaires du droit de création ; aucun accès mineur/adulte mixte ne sera ouvert sans approbation et contrôle serveur.
- `À VALIDER` — Permission `LANCER_LIVE` attribuée par l’administration ; ouverture aux autres adultes désactivée par défaut.
- Aucun texte doctrinal nouveau n’est publié sur la base du seul contenu existant de la page d’accueil. Le PDF de référence doit être comparé avant validation.

## État pratique des ajouts communautaires (10 octobre 2026)

- Les autorisations serveurs existantes cadrent la publication des programmes, la gestion des études, l’histoire, les directs et la création des groupes. L’administration attribue les droits avec motif/audit.
- L’âge inconnu/mixte et les groupes incluant des mineurs restent refusés; ne pas les ouvrir sans politique de protection formellement approuvée.
- Le PDF doctrinal annoncé par la paroisse n’a pas encore été fourni dans `docs/sources`. Les listes doctrinales restent vides; le rapport ne valide ni leur nombre exact ni leur contenu.
- Les appels `paroisse_test` ne répondaient plus le 10 octobre; aucune validation e2e n’a été faite sur le dernier code. Le lecteur stories garde ses marqueurs de vues dans la session locale seulement; une liste serveur de spectateurs nécessite une décision de confidentialité et un consentement affiché.
- Une notification de lancement de direct est une notification interne consultée par rafraîchissement périodique. Aucun push instantané ni réveil d’appareil hors ligne n’est promis.
