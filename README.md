# Paroisse Amour des Apôtres

Application de présentation de la paroisse Sainte-Cécile à Cotonou et de gestion des présences. L'espace communautaire et l'inscription publique des fidèles sont retirés. Les rôles gérés sont les administrateurs, sous-administrateurs, secrétaires de présence et présidents du jour.

## Développement local

Pré-requis : Node.js/npm, PostgreSQL et une base de développement configurée dans `.env`. Depuis la racine du dépôt :

```powershell
npm install
npm.cmd run dev:web
npm.cmd run dev:api
```

Le web s'ouvre sur `http://localhost:4200`; l'API écoute sur le port 3000. Le compte responsable et la base doivent être configurés séparément. Ne communiquez jamais le contenu de `.env`.

Les tests de base de données doivent employer exclusivement `TEST_DATABASE_URL`, vers une base dédiée dont le nom contient `test`. Vérifiez la cible avant les e2e avec `npm.cmd run test-db:diagnose`. Le runner e2e applique les migrations à cette cible; ne le lancez pas tant que `paroisse_test` n'est pas confirmée comme base jetable de test.

## Fonctionnalités conservées

- Accueil public : présentation, dirigeant, équipe des cours bibliques, liens bibliques et contenu doctrinal déjà publié.
- Programme biblique du lundi, selon les rôles et permissions attribués.
- Saisie hors ligne, contrôle, totaux, historique et exports de présences : cours biblique et groupe de semaine.
- Connexion des responsables, comptes créés par l'administration, changement obligatoire du mot de passe temporaire, récupération par code e-mail, 2FA et sessions.
- Administration, journal d'audit, limitation de débit, anonymisation des noms de présence à la durée configurée et sauvegardes chiffrées.

Les présences nominatives sont des données sensibles. L'administrateur consulte les totaux par défaut; l'accès aux noms exige un motif et est journalisé. Les présidents sont isolés à leur jour. La base de développement ne doit pas être migrée avant sauvegarde restaurée et approbation humaine.

## Documentation

- [Guide administrateur](docs/GUIDE_ADMIN.md)
- [API](docs/API.md)
- [Procédure de migration et de sauvegarde](docs/MIGRATION_PROCEDURE.md)
- [Déploiement](docs/DEPLOIEMENT.md) et [déploiement à budget limité](docs/DEPLOIEMENT_GRATUIT.md)
- [Checklist de production](docs/CHECKLIST_PRODUCTION.md)
- [Audit de sécurité](docs/SECURITY_AUDIT.md), [blocages](docs/BLOCAGES.md), [décisions à valider](docs/DECISIONS_A_VALIDER.md)

Les résultats de tests et de déploiement sont datés dans les documents de sécurité. Un succès antérieur ne prouve pas que le code courant ou une installation de production est validé.
