# Checklist avant utilisation avec des données réelles

- [ ] Revue des décisions ouvertes dans `DECISIONS_A_VALIDER.md`, en particulier suppression des anciennes données communautaires et traitement des comptes de rôles retirés.
- [ ] Faire une sauvegarde chiffrée de chaque base ayant de la valeur et réussir une restauration dans une base neuve isolée; vérifier schéma, relations et nombres de lignes.
- [ ] Valider la migration de simplification sur une base de test vide et une copie historique; vérifier que comptes actifs nécessaires, présences, programme, sessions, 2FA et audit sont conservés.
- [ ] Relancer lint, typecheck, tests unitaires, builds, e2e sur PostgreSQL isolé et Playwright sur le code exact destiné au déploiement.
- [ ] Traiter les avis npm critiques/hauts ou documenter l'acceptation par le responsable sécurité. Audit actuel indisponible en ligne? Voir `BLOCAGES.md` pour les nombres réellement observés.
- [ ] Scanner le dépôt de secrets et confirmer que `.env`, dumps et sauvegardes ne sont pas suivis par Git.
- [ ] Configurer le domaine, HTTPS, certificat et renouvellement, HSTS après HTTPS complet, origine CORS, pare-feu et proxy fiable.
- [ ] Garder PostgreSQL sur réseau privé, séparer utilisateur applicatif et migrations, vérifier privilèges minimaux et chiffrement du stockage.
- [ ] Générer et faire tourner tous les secrets; enrôler deux administrateurs avec 2FA et vérifier procédure de secours CLI.
- [ ] Régler le quota Resend et vérifier la réponse en cas de plafond. Tester les e-mails de récupération sans exposer les codes.
- [ ] Tester la saisie et la synchronisation hors ligne, limites horaires, cloisonnement des jours, consultation nominative motivée et audit, uniquement avec données fictives.
- [ ] Vérifier la politique de rétention/anonymisation et les alertes de sauvegarde.
- [ ] Obtenir la validation du chargé paroissial, la désignation des responsables et la revue juridique/confidentialité adaptée au Bénin.

**Ne pas ouvrir l'application aux vraies données si une case relative à la restauration, aux migrations ou à la sécurité reste non vérifiée.**
