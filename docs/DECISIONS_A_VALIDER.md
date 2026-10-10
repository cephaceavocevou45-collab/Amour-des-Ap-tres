# Décisions à valider

Les choix prudents ci-dessous reflètent la demande de simplification. Une décision humaine reste requise avant d'utiliser des données réelles.

1. **Suppression des données communautaires historiques — À VALIDER.** La migration `20261026000000_presence_only_simplification` supprime définitivement les contenus et tables communautaires visés. Avant toute base ayant de la valeur, l'Église doit approuver la perte ou demander une archive chiffrée, restaurée et comparée. Aucun contenu communautaire n'est converti en message privé.
2. **Création de comptes — hypothèse retenue, À VALIDER.** ADMIN/SUPER_ADMIN créent les comptes des secrétaires, présidents et sous-administrateurs et transmettent un mot de passe temporaire par un canal sûr; le changement est exigé à la première connexion. L'invitation e-mail n'est pas implémentée.
3. **Sous-administrateur — hypothèse retenue, À VALIDER.** `EDITEUR` est conservé parce qu'il porte encore les permissions explicites `GESTION_COMPTES` et `PROGRAMME_BIBLIQUE`. Ses droits restent bornés par le serveur.
4. **2FA des responsables — À VALIDER.** `2FA_REQUIS_RESPONSABLES` est désactivé par défaut pour les secrétaires et présidents; il est recommandé de l'activer après test d'enrôlement et de récupération. ADMIN/SUPER_ADMIN gardent leur 2FA obligatoire.
5. **Comptes de rôles retirés — À VALIDER.** La migration désactive FIDELE/MODERATEUR/PENDING, retire leurs autorisations, révoque leurs sessions et remplace leur valeur d'énumération par un rôle inactif de secrétaire avant de supprimer l'ancien rôle. Il faut vérifier l'identité et le traitement de ces anciens comptes avant toute base réelle.
6. **Doctrine publique — À VALIDER.** Le contenu doctrinal existant de l'accueil est préservé. Les listes détaillées ne doivent être complétées qu'à partir d'un document de référence approuvé par la paroisse.
