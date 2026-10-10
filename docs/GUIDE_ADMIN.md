# Guide de l'administration paroissiale

## Créer et gérer les responsables

Les candidats peuvent envoyer une demande d'accès depuis **Demander un accès** sur l'écran de connexion responsable. Ils ne peuvent choisir que « Secrétaire des présences — cours biblique » ou « Président d'un jour — présences de la semaine »; le président choisit un jour parmi lundi et dimanche. La demande demande nom, adresse e-mail, numéro au format international (présumé WhatsApp, sans vérification automatique) et mot de passe. Elle ne donne aucun accès tant qu'elle n'est pas approuvée.

Dans **Comptes responsables**, les demandes en attente portent l'indication **Demande en attente de validation**. Vérifiez l'identité et le rôle demandé, saisissez un motif, cochez **Accès actif**, puis enregistrez. L'accès s'ouvre alors et la demande passe à l'état validé; toute modification est auditée et les sessions précédentes sont révoquées. Les demandes non retenues peuvent rester désactivées.

1. Connectez-vous à l'espace administrateur sur un appareil de confiance.
2. Depuis **Comptes responsables**, saisissez le nom, l'adresse e-mail, le rôle et un motif précis. Choisissez un jour (lundi à dimanche) pour un président.
3. Pour un sous-administrateur, cochez uniquement les accès nécessaires. `GESTION_COMPTES` permet de gérer les comptes selon les restrictions du serveur; `PROGRAMME_BIBLIQUE` autorise la préparation du cours.
4. Transmettez le mot de passe temporaire affiché une seule fois par un canal privé sûr. Le titulaire doit le remplacer à sa première connexion. Ne le copiez pas dans un e-mail ou une conversation non protégée.
5. Toute désactivation, réactivation, modification de rôle/jour ou permission demande un motif; elle est auditée et révoque les sessions de l'utilisateur.

La création directe de comptes et l'approbation sont réservées à ADMIN/SUPER_ADMIN. Les demandes publiques ne peuvent pas créer ni promouvoir un compte administrateur ou sous-administrateur. Les responsables et sous-administrateurs ne peuvent pas s'approuver eux-mêmes. `EDITEUR` est le nom technique conservé pour le sous-administrateur.

## Présences

- Le secrétaire saisit la feuille du cours biblique du lundi, dans les heures configurées.
- Le président saisit le groupe de semaine pour le jour qui lui est attribué, Temple et Salle de vision comprises, pendant la plage horaire configurée.
- La saisie hors ligne est gardée localement puis synchronisée avec un identifiant idempotent. Vérifiez le statut de synchronisation avant de fermer l'appareil.
- L'administrateur peut examiner les feuilles et les totaux. Les noms sont cachés par défaut; sélectionnez un motif valable avant la consultation nominative, qui est journalisée. Ne téléchargez ni ne partagez des listes nominatives sans nécessité.
- Les totaux sont conservés après anonymisation des noms à `DATA_RETENTION_MONTHS` (12 par défaut). La conservation des journaux d'audit est configurée à au moins 36 mois.

## Récupération 2FA

Les comptes ADMIN/SUPER_ADMIN doivent avoir une application TOTP. Conservez les codes de secours hors ligne et séparément du mot de passe. L'enrôlement ou la récupération s'effectue par les scripts serveur `admin:enroll-2fa` / `admin:reset-2fa`, jamais depuis une route publique. La récupération de compte exige une intervention d'un autre administrateur déjà protégé et révoque les sessions. Ne transmettez pas les clés ou codes au support par courriel.

`2FA_REQUIS_RESPONSABLES` contrôle l'exigence pour les secrétaires et présidents; la valeur par défaut demeure désactivée jusqu'à décision et test par la paroisse.

## Sauvegarde et incidents

Les sauvegardes sont chiffrées avant envoi hors du serveur. Vérifiez régulièrement la restauration dans une base vide distincte et comparez schéma et nombres de lignes. Une sauvegarde n'est pas considérée comme fiable avant restauration testée. Après perte d'appareil ou départ d'un responsable, désactivez immédiatement le compte et vérifiez l'audit des accès.

Les outils de fil communautaire, messagerie, groupes, stories, directs, médias, signalements et modération ne font plus partie de l'application active.
# Sécurité de session et actions sensibles

Les sessions expirent après 30 minutes d'inactivité et au plus tard après 30 jours (réglables par `SESSION_IDLE_MINUTES` et `SESSION_ABSOLUTE_DAYS`). Dans l'espace de présence, **Déconnecter tous les appareils** révoque l'ensemble des sessions du compte et déconnecte aussi l'appareil actuel.

La consultation nominative, la création/désactivation d'un compte et les changements de rôle ou permissions demandent une nouvelle confirmation du mot de passe actuel ou du code TOTP actuel. Cette confirmation est contrôlée par l'API; elle ne se limite pas à une invite de l'interface. Les changements restent soumis aux autorisations et au motif d'audit requis.
