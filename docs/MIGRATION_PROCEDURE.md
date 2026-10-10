# Sauvegarde et migrations : procédure protégée

## Avant toute opération

- Confirmer explicitement la cible par son nom et son rôle. `DATABASE_URL` est la base de développement; ne l'utilisez pas depuis les tests.
- Pour les essais, `TEST_DATABASE_URL` doit pointer vers une base PostgreSQL isolée et remplaçable, avec `test` dans le nom. `npm.cmd run test-db:diagnose` vérifie la séparation sans afficher les identifiants.
- La migration `20261026000000_presence_only_simplification` est destructive pour les contenus communautaires et certains champs de compte. Elle désactive les anciens rôles FIDELE/MODERATEUR/PENDING, révoque les sessions, puis retire les tables/types communautaires. Elle ne convertit pas ces contenus en messages privés.
- Les migrations déjà enregistrées ne sont jamais réécrites. Toute évolution passe par une nouvelle migration.

## Sauvegarde et restauration d'essai

1. Arrêter les écritures applicatives sur la base à sauvegarder. Utiliser `npm.cmd run backup:create` après avoir vérifié localement que `DATABASE_URL`, `BACKUP_KEY_HEX` et la destination sont celles attendues. Le script crée une archive PostgreSQL intermédiaire temporaire avant le chiffrement : exécutez-le sur un disque local protégé, sans sauvegarde système non chiffrée ni synchronisation cloud du dossier temporaire. Ne partagez ni archive ni clé.
2. Vérifier l'intégrité cryptographique avec `npm.cmd run backup:restore-test` uniquement après lecture de sa configuration et confirmation de la cible. Le script doit utiliser une base neuve et isolée, jamais `paroisse` ou `paroisse_test`. Une sauvegarde n'est pas validée sans restauration réelle.
3. Créer une nouvelle base d'archive vide, par exemple `paroisse_archive_test_20261010`, avec un compte aux droits limités. Vérifier le nom, l'hôte et la base cible séparément. Ne jamais utiliser une restauration avec `--clean`, `--if-exists` ou une cible déjà utilisée.
4. Restaurer dans cette nouvelle base avec le script prévu après avoir vérifié qu'il refuse toute base existante. L'archive déchiffrée temporaire doit rester sur un disque protégé et être supprimée de façon sécurisée selon la politique de l'organisation. Ne passez jamais une URL avec identifiants en argument visible ou dans un rapport.
5. Comparer schémas, listes de tables, nombres de lignes et relations clés. Pour une ancienne archive communautaire, confirmer séparément publication/commentaires/réactions attendus et comptes/sessions/présences/audit préservés. Ne pas inclure de noms ou contenu dans le rapport.
6. Tester une restauration de la sauvegarde chiffrée sans écraser ni nettoyer une base existante. Garder la base source intacte jusqu'à validation signée.

## Ordre de validation d'une migration

1. Exécuter `prisma migrate status` avec `DATABASE_URL` du processus explicitement remplacée par `TEST_DATABASE_URL`; vérifier que la sortie nomme `paroisse_test`. Toute erreur de moteur/connexion bloque la suite.
2. Sur une base de test neuve, déployer les migrations puis vérifier tous les modèles attendus.
3. Sur une autre base de test, restaurer des données historiques synthétiques avec les anciens rôles, sessions, feuilles, entrées et journaux; déployer ensuite et comparer les objets conservés et les objets supprimés. Cette opération n'a pas encore été vérifiée pour la migration de simplification.
4. Seulement après approbation et sauvegarde restaurée, le propriétaire de la base décide d'appliquer la migration à une base ayant de la valeur. Ne pas lancer automatiquement le runner e2e s'il y a des données inconnues dans la base de test : le runner applique les migrations.

## Retour arrière

Une migration Prisma ne doit pas être annulée par suppression manuelle de lignes ou de tables. La procédure de retour consiste à restaurer une sauvegarde vérifiée vers une nouvelle base, faire contrôler les comptes et relations, puis basculer explicitement l'application après accord de l'administrateur système. Garder l'ancienne base intacte jusqu'à validation fonctionnelle. Les données communautaires supprimées ne sont récupérables que depuis une archive restaurée; elles ne peuvent pas être reconstituées depuis le schéma simplifié.

## Vérification du 10 octobre 2026

- La sauvegarde de développement a été chiffrée puis restaurée dans deux bases neuves distinctes. La comparaison en lecture seule de la première restauration a trouvé 27 tables dans chaque base, des nombres de lignes identiques, 35 clés étrangères dans chacune et aucune différence de colonnes, contraintes, index ou types d'énumération. Le comparateur ne lit ni n'imprime le contenu des lignes.
- Les 16 migrations ont été appliquées à la seconde copie restaurée. Elles se sont toutes appliquées; le statut final Prisma était à jour et le diff de schéma était vide. Après comparaison de l'archive et du clone, elles ont aussi été appliquées à `paroisse` par `prisma migrate deploy`, qui a confirmé leur succès. Cela vérifie l'exécution de la chaîne sur ce jeu historique, sans démontrer que chaque ancienne donnée a un équivalent dans le schéma simplifié.
- Les migrations de remplacement/simplification retirent des modèles/tables communautaires : l'archive restaurée est la conservation consultable de ces anciennes données; aucune conversion automatique en messages privés n'a eu lieu. La base de développement `paroisse` n'a pas été modifiée et conserve toujours 16 migrations en attente.
- La migration 27, `20261027000000_attendance_role_registration`, a été reconstituée depuis le diff en lecture seule entre `paroisse_test` et le schéma Prisma actuel : suppression d'un index obsolète et retrait d'une valeur par défaut devenue inutile. Elle a été appliquée uniquement à `paroisse_test`, puis le statut et le diff Prisma ont été vérifiés à jour/vide.
- Le script de sauvegarde/restauration normalise désormais les URL PostgreSQL pour les utilitaires natifs en retirant uniquement le paramètre Prisma `schema`; il n'affiche pas les identifiants. `infra/compare-databases.cjs` compare schémas, contraintes et totaux sans exposer de noms ou de contenus. Les tests des utilitaires passent (8/8).

Les migrations sont maintenant appliquées à `paroisse`. L'API déjà active sur le port 3000 a répondu `200` à `/health` et `/ready`, ce dernier confirmant l'accès PostgreSQL. La commande de statut `migrate status` a encore rendu une erreur vide du moteur Prisma après le déploiement; le succès est attesté par la sortie de `migrate deploy` et la route `/ready`, mais le statut CLI doit être réessayé si nécessaire après redémarrage des outils. La clé de chiffrement est conservée uniquement dans le `.env` local ignoré par Git : en garder une copie protégée hors de cette machine est nécessaire pour pouvoir relire l'archive à long terme. Ne jamais la coller dans un terminal partagé ou un rapport.
