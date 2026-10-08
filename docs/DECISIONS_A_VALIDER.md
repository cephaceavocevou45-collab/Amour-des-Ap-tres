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
