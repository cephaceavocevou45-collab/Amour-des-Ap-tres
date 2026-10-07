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
