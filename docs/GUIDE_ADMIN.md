# Guide de l'administration paroissiale

## Créer et gérer les responsables

Les comptes responsables sont créés par ADMIN/SUPER_ADMIN dans **Comptes responsables**. L’auto-inscription publique est désactivée : la route historique `/auth/register` renvoie 404 et l’ancien lien redirige vers la connexion. Le téléphone ne vérifie pas qu’un numéro est actif sur WhatsApp.

1. Connectez-vous à l'espace administrateur sur un appareil de confiance.
2. Depuis **Comptes responsables**, saisissez le nom, l'adresse e-mail, le rôle et un motif précis. Choisissez un jour (lundi à dimanche) pour un président.
3. Pour un sous-administrateur, cochez uniquement les accès nécessaires. `GESTION_COMPTES` permet de gérer les comptes selon les restrictions du serveur; `PROGRAMME_BIBLIQUE` autorise la préparation du cours.
4. Transmettez le mot de passe temporaire affiché une seule fois par un canal privé sûr. Le titulaire doit le remplacer à sa première connexion. Ne le copiez pas dans un e-mail ou une conversation non protégée.
5. Toute désactivation, réactivation, modification de rôle/jour ou permission demande un motif; elle est auditée et révoque les sessions de l'utilisateur.

La création de comptes est réservée à ADMIN/SUPER_ADMIN. Le mot de passe temporaire aléatoire est montré une seule fois par l’interface et doit être transmis par un canal privé sûr; l’utilisateur doit le changer au premier accès. Les changements de rôle, jour, activation ou permission exigent un motif, une nouvelle authentification et invalident les sessions. `EDITEUR` est le nom technique conservé pour le sous-administrateur.

### Premier compte SUPER_ADMIN

Le dépôt ne contient aucun compte administrateur par défaut. `apps/api/prisma/seed.ts` peut créer le premier `SUPER_ADMIN` si `BOOTSTRAP_ADMIN_EMAIL` et `BOOTSTRAP_ADMIN_PASSWORD` sont fournies dans l’environnement serveur. Le script ne met plus à jour un SUPER_ADMIN existant et refuse une configuration partielle ou une collision d’adresse sans administrateur. `npm run test:bootstrap` vérifie les migrations, le seed, la connexion par e-mail et mot de passe ainsi que la réexécution sans altérer le compte dans un schéma temporaire de `TEST_DATABASE_URL`, supprimé à la fin. Avant le premier usage de production, injecter les secrets hors ligne, amorcer le compte puis retirer les variables de l’environnement.

## Présences

- Le secrétaire saisit la feuille du cours biblique du lundi, dans les heures configurées.
- Le président saisit le groupe de semaine pour le jour qui lui est attribué, Temple et Salle de vision comprises, pendant la plage horaire configurée.
- La saisie hors ligne est gardée localement puis synchronisée avec un identifiant idempotent. Vérifiez le statut de synchronisation avant de fermer l'appareil.
- L'administrateur peut examiner les feuilles et les totaux. Les noms sont cachés par défaut; sélectionnez un motif valable avant la consultation nominative, qui est journalisée. Ne téléchargez ni ne partagez des listes nominatives sans nécessité.
- Les totaux sont conservés après anonymisation des noms à `DATA_RETENTION_MONTHS` (12 par défaut). La conservation des journaux d'audit est configurée à au moins 36 mois.

## Connexion et récupération du compte

La connexion utilise uniquement l’adresse e-mail et le mot de passe. La récupération du mot de passe utilise un code temporaire envoyé par e-mail; ce code ne fait pas partie de la connexion normale. Les anciennes clés et données de double vérification sont supprimées par la migration de base de données.

## Sauvegarde et incidents

Les sauvegardes sont chiffrées avant envoi hors du serveur. Vérifiez régulièrement la restauration dans une base vide distincte et comparez schéma et nombres de lignes. Une sauvegarde n'est pas considérée comme fiable avant restauration testée. Après perte d'appareil ou départ d'un responsable, désactivez immédiatement le compte et vérifiez l'audit des accès.

Les outils de fil communautaire, messagerie, groupes, stories, directs, médias, signalements et modération ne font plus partie de l'application active.
# Sécurité de session et actions sensibles

Les sessions expirent après 30 minutes d'inactivité et au plus tard après 30 jours (réglables par `SESSION_IDLE_MINUTES` et `SESSION_ABSOLUTE_DAYS`). Dans l'espace de présence, **Déconnecter tous les appareils** révoque l'ensemble des sessions du compte et déconnecte aussi l'appareil actuel.

La consultation nominative, la création/désactivation d'un compte et les changements de rôle ou permissions demandent une nouvelle confirmation du mot de passe actuel. Cette confirmation est contrôlée par l'API; elle ne se limite pas à une invite de l'interface. Les changements restent soumis aux autorisations et au motif d'audit requis.
