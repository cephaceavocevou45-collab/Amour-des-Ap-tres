# Activer les photos des Actualités

Le dépôt des photos est désactivé tant que le stockage privé et l’antivirus ne sont pas configurés. L’interface masque alors le bouton d’envoi; aucun fichier n’est accepté par l’API sans ces deux services.

## Services requis

- Un stockage compatible S3 avec un compartiment privé, sans accès public anonyme. Créez une clé dédiée limitée à ce compartiment et aux opérations Put/Get/Delete nécessaires.
- ClamAV joignable depuis l’API. Les envois sont refusés si le scanner est indisponible ou détecte un fichier dangereux.
- Des valeurs locales dans `.env` pour `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY`, `MEDIA_S3_SECRET_KEY` et `CLAMAV_HOST`. Pour un endpoint local HTTP, l’API n’accepte que `localhost` ou une adresse loopback; utilisez TLS pour les services distants.

## Traitement appliqué

L’API limite chaque fichier à 10 Mo et chaque publication à quatre images. Elle inspecte les signatures JPEG, PNG et WebP, les décode avec Sharp, rejette les images animées et les images dépassant 40 mégapixels, les réoriente, les réduit à 2 400 pixels et les réencode en WebP sans recopier les métadonnées EXIF. Le stockage utilise le chiffrement serveur AES-256 lorsqu’il est offert par le fournisseur. Les identifiants des objets ne sont jamais renvoyés au navigateur; la lecture passe par l’API après vérification de la session, du statut du compte, de la visibilité, du masquage et des blocages.

La migration `20261008000100_social_post_media` crée les métadonnées, avec des contraintes sur le type de sortie, la taille et les dimensions. Elle a été appliquée à `paroisse_test` par les tests e2e. Les secrets de stockage ne doivent jamais être ajoutés au dépôt ou envoyés dans une conversation.

## Vérification

Les e2e remplacent le scanner et le client S3 par des doubles contrôlés. Ils valident le réencodage, l’absence de clé d’objet dans la réponse, la lecture d’une image publique à un membre, le refus de lire une image privée par un autre membre et le rejet d’un SVG falsifié.

Ces tests ne remplacent pas un test d’exploitation avec un véritable compartiment privé et un vrai démon ClamAV. Avant d’activer les photos, un opérateur doit configurer ces services, vérifier qu’aucune URL publique ne permet de lire un objet, puis réaliser un dépôt et une lecture manuels avec deux comptes.
