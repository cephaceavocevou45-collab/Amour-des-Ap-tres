# Blocages et actions humaines

## Résultat e2e — 7 octobre 2026

- **Résultat : 13 scénarios réussis sur 14; la suite n’est pas verte.** Un scénario e2e échoue dans `keeps editor account contacts private and blocks self-validation` : il attend HTTP 200 pour la liste de comptes d’un EDITEUR sans permission `GESTION_COMPTES`, alors que le code renvoie 401. Le scénario suivant du même fichier attend explicitement 401 pour cette même route avec un EDITEUR sans permission. Les deux attentes sont incompatibles pour la même règle d’autorisation.
- **Décision de sécurité :** conserver la vérification de permission. Ne pas accorder l’accès à tous les sous-admins et ne pas modifier les assertions pour obtenir artificiellement une suite verte. Une décision métier est nécessaire sur l’accès en lecture à la liste expurgée des coordonnées. Si cette lecture est autorisée sans permission, il faudra corriger le scénario contradictoire et documenter la permission effective; si elle exige `GESTION_COMPTES`, le scénario qui attend 200 doit être corrigé selon cette décision. Cette contradiction empêche une correction sûre du code seul.
- **Couverture manquante dans la suite actuelle :** IDOR des zones et de chaque endpoint individuel; limites horaires réelles de cours et semaine (le scénario de concurrence remplace l’horloge par une fenêtre ouverte); remplacement 2FA avec code actuel/secours; blocage mutuel; contrôle de débit social; XSS dans un vrai rendu navigateur. Les e2e existants ne prouvent pas ces protections.
- Aucun média, profil ou module de modération supplémentaire n’est entrepris avant que les e2e soient verts et que ces trous de couverture soient traités.

## Migrations PostgreSQL de test

- `prisma migrate deploy` a appliqué les 12 migrations à la base vide `paroisse_test`.
- Test historique réussi dans un schéma temporaire isolé **au sein de la même base `paroisse_test`** : état historique jusqu’à la migration 006, ancien compte FIDELE, refresh token actif et feuille/ligne de présence synthétiques; migrations restantes déployées. Le compte est devenu PENDING inactif, le refresh token a été révoqué, et la feuille avec sa ligne a été conservée. Le schéma temporaire a été supprimé après vérification.
- `migrate deploy` n’a pas requis de base fantôme et aucun privilège `CREATEDB` n’a été nécessaire. `DATABASE_URL` et la base de développement n’ont pas été utilisées pour ces opérations.

## Contrôles d’exploitation encore bloqués

- `npm audit --omit=dev --audit-level=high` et l’audit complet n’ont pas pu joindre le registre npm lors du dernier essai; aucun résultat d’avis n’est disponible.
- Docker CLI n’est pas disponible ici. `docker compose config`, le démarrage des conteneurs, TLS/HSTS et une restauration réelle de sauvegarde PostgreSQL restent non vérifiés.
- Relancer `npm run test:e2e` après résolution de la règle contradictoire. Les identifiants PostgreSQL et clés de service doivent rester locaux; ne pas les coller dans la conversation.
- Vérifier chaque scénario absent de la couverture listée ci-dessus sur `paroisse_test`, sans assouplir les contrôles ni viser `DATABASE_URL`.

Le projet reste **non prêt pour des données réelles**. Les e2e ne sont pas verts, l’audit npm n’est pas disponible, et l’exploitation/sauvegarde n’a pas été validée.
