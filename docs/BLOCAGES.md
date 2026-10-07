# Blocages et actions humaines

## PostgreSQL de test

- **État :** le diagnostic local confirme la cible distincte `localhost:5432/paroisse_test`. La dernière tentative d’e2e a échoué au démarrage du moteur Prisma avant l’application de migration ; PostgreSQL n’a pas pu être authentifié/atteint avec la configuration courante.
- **Impact :** les migrations sur base vide/historique et les e2e PostgreSQL ne sont pas exécutables ; aucune migration n’a été appliquée à la base de développement.
- **Action :** corriger localement `TEST_DATABASE_URL` ou utiliser `npm run test-db:setup` avec `PG_ADMIN_URL` temporaire, `PAROISSE_TEST_DB_PASSWORD` facultatif et `psql` installé. `psql` n’est pas disponible dans l’environnement de travail actuel. Ne pas transmettre de secret dans le chat.
- **Diagnostic :** `npm run test-db:diagnose` masque les identifiants et vérifie que la cible est dédiée.

## Services de déploiement

- Docker CLI n’est pas installé/disponible ici ; `docker compose config`, l’exécution des conteneurs et la restauration n’ont pas été testés. L’installation Docker Desktop et un domaine/certificat valides nécessitent une intervention humaine.
- Les fonctions textuelles de publication, commentaires/réponses, réactions, partage, favoris, masquage, blocage et réglage des notifications sont codées en phase 2/3. Elles passent la compilation et les tests unitaires ciblés, mais restent non vérifiées par e2e PostgreSQL. Les médias, profils éditables, signalements et console complète de modération (phases 4 à 7) restent à réaliser.
- `npm audit --omit=dev --audit-level=high` et `npm audit --audit-level=high` n’ont pas pu joindre `registry.npmjs.org` (endpoint bulk indisponible). Aucun résultat d’avis n’a été obtenu ; relancer avec accès réseau.
