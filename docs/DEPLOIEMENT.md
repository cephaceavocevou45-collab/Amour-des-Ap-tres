# Déploiement — procédure à valider

L’infrastructure Compose se trouve dans `infra/compose.yaml`. Elle démarre PostgreSQL sur un réseau interne, une API NestJS non-root et Nginx non-root en TLS. PostgreSQL ne publie pas son port sur l’hôte. Nginx ne journalise pas les paramètres de requête.

Avant tout démarrage :

1. Installer Docker Desktop ou Docker Engine sur l’hôte prévu.
2. Générer des secrets indépendants pour PostgreSQL, JWT, TOTP et les sauvegardes ; les stocker dans un gestionnaire de secrets. Aucun secret par défaut n’est accepté par Compose.
3. Fournir un domaine, certificat complet et clé privée valides dans un dossier TLS non versionné, accessible en lecture seule au conteneur.
4. Vérifier `docker compose -f infra/compose.yaml config` sans publier sa sortie si elle contient des valeurs interpolées.
5. Construire, démarrer et vérifier les services sur un environnement fictif. Tester restauration et renouvellement du certificat avant exposition Internet.
6. Configurer un reverse proxy réseau explicite. L’API ne fait confiance qu’à l’adresse IP privée fixe du conteneur web déclarée dans le compose.

**État : non vérifié en conditions réelles.** Docker, certificats TLS, domaine, envoi e-mail et restauration doivent être validés par un humain. Ne pas ouvrir l’inscription ou utiliser des données réelles avant le feu vert de sécurité.

## Contrôles avant exposition

- Terminer TLS sur Nginx ou un proxy documenté. Le transfert vers l’API doit rester sur le réseau privé ; l’API ne doit jamais être publiée directement sur Internet. Utiliser HTTPS sur toutes les pages et rediriger HTTP vers HTTPS.
- Vérifier les en-têtes de sécurité (CSP, HSTS uniquement lorsque tout le domaine est HTTPS) et que `FRONTEND_ORIGIN` correspond exactement à l’origine publique du site. Les cookies de session doivent être `Secure`, `HttpOnly` et `SameSite=Strict` derrière TLS.
- N’autoriser le transfert d’IP qu’au proxy fixe déjà déclaré comme approuvé. Les valeurs `X-Forwarded-*` ne doivent être acceptées d’aucune autre source réseau.
- Garder PostgreSQL non exposé publiquement et limiter le rôle applicatif aux seules opérations nécessaires. Le rôle de migration ne doit pas servir à l’application en production.
- Fournir les variables secrètes depuis un gestionnaire de secrets ; ne jamais commiter `.env`, publier sa sortie ou insérer des valeurs réelles dans les exemples.
- Vérifier les journaux après un exercice complet : aucun nom de présence, mot de passe, jeton, secret e-mail, secret TOTP ou secret de stockage ne doit y apparaître.
- Configurer une sauvegarde chiffrée, puis prouver la restauration sur une base vide et comparer des comptages de lignes. Une tâche de sauvegarde réussie seule ne certifie pas la restaurabilité.
- Maintenir les photos coupées jusqu’à la validation manuelle de S3 privé, des permissions de compartiment, du scan ClamAV, des lectures authentifiées et de l’absence d’accès public direct.

Les chemins d’exploitation, la rétention et la restauration sont aussi décrits dans [MEDIA_CONFIGURATION.md](MEDIA_CONFIGURATION.md), [MIGRATION_PROCEDURE.md](MIGRATION_PROCEDURE.md) et [CHECKLIST_PRODUCTION.md](CHECKLIST_PRODUCTION.md). Les preuves d’exécution des validations locales ne sont pas une preuve de configuration du domaine, de Nginx ou des services de production.

La communauté V1 n’est pas prête à être exposée pour les nouveaux parcours demandés : permissions de lancement de direct/création de groupe sont côté serveur, mais les annuaires, demandes et rôles de groupes, l’histoire, les contenus versionnés et les notifications générales restent à construire. Les tests de signalisation WebRTC ne remplacent pas un essai sur appareils avec HTTPS/TURN.
