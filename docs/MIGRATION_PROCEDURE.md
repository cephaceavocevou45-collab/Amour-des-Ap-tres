# Procédure de migration PostgreSQL

## Préparation — environnement isolé

1. Vérifier les URL avec `npm run test-db:diagnose` sans copier les valeurs dans un ticket ou une conversation.
2. Sur Windows, utiliser `pg_dump.exe` et `pg_restore.exe` depuis l’installation PostgreSQL. Créer une sauvegarde avant toute migration et contrôler le code de sortie :

```powershell
pg_dump.exe --format=custom --no-owner --file="sauvegarde-avant.dump" "$env:DATABASE_URL"
if ($LASTEXITCODE -ne 0) { throw "La sauvegarde a échoué" }
pg_restore.exe --list "sauvegarde-avant.dump" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "La sauvegarde n'est pas lisible" }
```

Ne pas employer `>` pour un dump binaire sous PowerShell. Stocker la sauvegarde dans un emplacement protégé, chiffré et exclu de Git.

3. Restaurer le dump dans une base distincte nommée explicitement `paroisse_test_restore`, puis lancer `npm run prisma:deploy --workspace @paroisse/api` avec `DATABASE_URL` temporairement défini dans le processus vers cette cible isolée. Vérifier une base vide et une copie historique contenant rôles fidèles, sessions et feuilles.
4. Exécuter les tests e2e contre `TEST_DATABASE_URL`. Le lanceur vérifie que le nom contient `test` et que la cible ne correspond pas à `DATABASE_URL`.
5. Comparer la structure, les comptes de lignes, les sessions, les totaux figés et l’historique d’audit avant/après. Vérifier spécifiquement l’anonymisation éventuelle des noms.

## Retour arrière

Les migrations Prisma sont vers l’avant. Le retour arrière opérationnel consiste à restaurer la sauvegarde validée dans une nouvelle base isolée, comparer les données et faire basculer l’application selon la procédure d’exploitation. Ne jamais supprimer des tables ni lancer de SQL correctif directement sur une base réelle sans revue et sauvegarde vérifiée.

## Mise en production

L'application des migrations sur la base de développement ou de production est une action humaine distincte. Elle exige une sauvegarde restaurée avec succès, une fenêtre de maintenance, une validation de l'audit et un contrôle des données historiques. Cette documentation n'autorise pas Codex à migrer ces bases.
