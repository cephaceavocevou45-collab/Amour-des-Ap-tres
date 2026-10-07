# Checklist avant production

- [ ] Valider `docs/SECURITY_AUDIT.md` et compléter les scénarios e2e de présence sur PostgreSQL isolé.
- [ ] Sauvegarder puis restaurer dans une base vide ; comparer les comptes de lignes.
- [ ] Valider migrations sur base vide et copie de données historiques.
- [ ] Configurer TLS, HSTS, domaine, `FRONTEND_ORIGIN`, cookies Secure et sauvegardes chiffrées.
- [ ] Générer et stocker hors dépôt les secrets PostgreSQL, JWT, TOTP, Resend et de sauvegarde ; révoquer les valeurs de test.
- [ ] Faire valider l’âge, la charte, la confidentialité, les mentions légales, les durées de rétention et les droits de modération.
- [ ] Désigner administrateurs, modérateurs et responsables ; tester les autorisations avec des comptes fictifs.
- [ ] Exécuter plusieurs semaines avec des données fictives, puis un seul jour et un seul responsable.
- [ ] Vérifier audit npm, scan de secrets, restauration et procédures d’incident.
- [ ] Garder les inscriptions et les médias désactivés tant que les fournisseurs ne sont pas configurés.
