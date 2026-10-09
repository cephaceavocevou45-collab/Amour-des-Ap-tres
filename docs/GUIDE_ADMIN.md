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
