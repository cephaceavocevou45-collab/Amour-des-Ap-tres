# Décisions à valider

## Gestion des comptes — audit du 12 octobre 2026

- **Création réservée à l’administration — À VALIDER.** Le parcours d’auto-inscription a été retiré pour respecter le modèle demandé : seul ADMIN/SUPER_ADMIN crée un compte responsable, avec mot de passe temporaire à usage unique et changement obligatoire à la première connexion. L’API historique `/auth/register` répond 404. Un responsable de la paroisse doit confirmer que cette règle est toujours celle souhaitée.
- **Amorçage initial SUPER_ADMIN — vérifié en test isolé.** `npm run test:bootstrap` a créé le premier compte dans un schéma temporaire de `TEST_DATABASE_URL`, vérifié la connexion par e-mail et mot de passe, prouvé l’idempotence du seed, puis supprimé le schéma. L’exploitation réelle du premier compte et le retrait des variables d’amorçage restent à la charge de l’humain.

## Images de l’accueil — 12 octobre 2026

- Source et droit d'utilisation des images à confirmer par le propriétaire ; image à faire valider par le dirigeant.
- La photographie de Bible est présentée comme « Bible en langue goun » selon la demande reçue ; confirmer que l’édition représentée correspond bien à cette langue avant publication définitive.

## Accueil professionnel — 11 octobre 2026

- Le nom officiel affiché dans le héros est **Vénérable Suprême Évangéliste SEWADE KOUESSI Lucien** (orthographe KOUESSI, selon la correction du propriétaire).
- La direction visuelle utilise bleu nuit, bleu encre, or clair/or profond et bleu pâle ; fontes locales Roboto Slab et Lato sous SIL Open Font License ; animation d’entrée brève et désactivée pour `prefers-reduced-motion`.
- Le prochain cours est calculé chaque lundi à 19 h 30, heure `Africa/Porto-Novo`; la période 19 h 30–21 h 30 affiche une séance en cours. Le texte « ouvert à tous » et les horaires doivent être confirmés par le dirigeant si le calendrier paroissial évolue.
- **Domaine de publication À VALIDER** : aucun `APP_PUBLIC_URL` n’est configuré. Les métadonnées de partage sont donc provisoires et relatives jusqu’à la fourniture du domaine HTTPS officiel.
- **Texte d’accueil et qualité portrait À VALIDER** : faire confirmer le message du dirigeant et demander un original haute résolution si la paroisse souhaite un rendu plus net sur grand écran.
- L’emblème ECC original du dépôt est réutilisé tel quel ; il n’a été ni redessiné ni recoloré.

Les choix prudents ci-dessous reflètent la demande de simplification. Une décision humaine reste requise avant d'utiliser des données réelles.

1. **Suppression des données communautaires historiques — À VALIDER.** La migration `20261026000000_presence_only_simplification` supprime définitivement les contenus et tables communautaires visés. Avant toute base ayant de la valeur, l'Église doit approuver la perte ou demander une archive chiffrée, restaurée et comparée. Aucun contenu communautaire n'est converti en message privé.
2. **Demandes d'accès aux présences — mise à jour selon la précision du propriétaire.** Les personnes peuvent demander un compte de secrétaire du cours biblique ou de président d'un jour. Une demande est inactive et ne permet ni connexion ni accès aux feuilles avant validation de l'administration; le président choisit un jour parmi lundi à dimanche. L'inscription demande un numéro au format international, mais l'application ne vérifie pas que ce numéro est enregistré à WhatsApp. Les administrateurs peuvent toujours créer directement un compte responsable avec mot de passe temporaire. Le lien d'invitation par e-mail n'est pas implémenté.
3. **Sous-administrateur — hypothèse retenue, À VALIDER.** `EDITEUR` est conservé parce qu'il porte encore les permissions explicites `GESTION_COMPTES` et `PROGRAMME_BIBLIQUE`. Ses droits restent bornés par le serveur.
4. **Connexion de l’application — décision appliquée.** La connexion utilise uniquement l’adresse e-mail et le mot de passe; les données historiques de second facteur sont supprimées par migration. Les codes reçus par e-mail restent réservés à la récupération du mot de passe.
5. **Comptes de rôles retirés — À VALIDER.** La migration désactive FIDELE/MODERATEUR/PENDING, retire leurs autorisations, révoque leurs sessions et remplace leur valeur d'énumération par un rôle inactif de secrétaire avant de supprimer l'ancien rôle. Il faut vérifier l'identité et le traitement de ces anciens comptes avant toute base réelle.
6. **Doctrine publique — À VALIDER.** Le contenu doctrinal existant de l'accueil est préservé. Les listes détaillées ne doivent être complétées qu'à partir d'un document de référence approuvé par la paroisse.
