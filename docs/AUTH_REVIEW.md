# Revue de l’authentification

Mise à jour : 27 octobre 2026. Cette note remplace les constats antérieurs du 12 octobre, qui décrivaient un second facteur désormais retiré.

- Connexion : adresse e-mail et mot de passe uniquement.
- Les routes d’enrôlement et de validation d’un second facteur ne sont plus exposées.
- Les preuves de réauthentification des actions sensibles utilisent le mot de passe actuel.
- La récupération de mot de passe conserve un code à usage unique envoyé par e-mail; ce code ne fait pas partie de la connexion ordinaire.
- La migration `20261027000000_remove_two_factor_auth` supprime les anciennes données TOTP et les codes de secours. Elle ne touche pas aux comptes, aux mots de passe ni aux données métier.
- Les contrôles applicatifs, tests et documentation doivent être relancés et revus après cette simplification. Ne pas réutiliser les résultats de tests historiques décrivant l’ancien second facteur comme preuve de l’état courant.

Voir `docs/SECURITY_AUDIT.md`, `docs/GUIDE_ADMIN.md` et `docs/EXPLOITATION.md` pour les procédures actuelles.
