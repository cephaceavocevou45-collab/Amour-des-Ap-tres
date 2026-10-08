# Checklist avant production

- [ ] Relancer `npm audit --omit=dev` et `npm audit` depuis un réseau qui joint le registre npm ; corriger les vulnérabilités critiques/hautes sans mise à niveau forcée aveugle et valider les changements.
- [ ] Sauvegarder puis restaurer dans une base vide ; comparer les comptes de lignes.
- [ ] Valider migrations sur base vide et copie de données historiques.
- [ ] Configurer TLS, HSTS, domaine, `FRONTEND_ORIGIN`, cookies Secure et sauvegardes chiffrées.
- [ ] Générer et stocker hors dépôt les secrets PostgreSQL, JWT, TOTP, Resend et de sauvegarde ; révoquer les valeurs de test.
- [ ] Faire valider l’âge, la charte, la confidentialité, les mentions légales, les durées de rétention et les droits de modération.
- [ ] Désigner administrateurs, modérateurs et responsables ; tester les autorisations avec des comptes fictifs.
- [ ] Exécuter plusieurs semaines avec des données fictives, puis un seul jour et un seul responsable.
- [ ] Vérifier audit npm, scan de secrets, restauration et procédures d’incident.
- [ ] Confirmer l’e-mail de récupération (Resend), l’âge minimum, la charte et les textes de confidentialité avec la paroisse.
- [ ] Garder les médias coupés tant que S3 privé, ClamAV et les essais de dépôt/lecture ne sont pas validés. Ne pas activer par le seul flag.
- [ ] Vérifier les parcours de modération, la procédure d’appel et les notifications réellement livrées avant de traiter des signalements réels.
- [ ] Parcourir à la main chaque écran avec clavier et lecteur d’écran, confirmer les libellés, contrastes, états vides/erreur/chargement et vérifier la traduction attendue.
- [ ] Confirmer que le français est la seule langue actuellement supportée ; planifier un catalogue multilingue avant de promettre d’autres langues.
- [ ] Faire une répétition générale sur données fictives et obtenir l’accord du chargé paroissial avant l’ouverture publique.
