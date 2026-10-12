# Direction artistique — page d’accueil

## Intention

Une identité paroissiale calme, lumineuse et lisible : bleu nuit pour les espaces d’accueil, bleu encre pour la hiérarchie secondaire, or pour les accents, et fonds bleu pâle pour les sections de lecture. L’emblème ECC fourni par le projet est conservé sans retouche.

## Couleurs et typographie

Les variables centralisées se trouvent dans `apps/web/src/theme.tokens.css` :

| Rôle | Jeton | Valeur |
|---|---|---|
| Bleu nuit | `--blue-night` | `#0E2747` |
| Bleu encre | `--blue-ink` | `#1B3F6B` |
| Or clair | `--gold-light` | `#D4AF37` |
| Or profond | `--gold-deep` | `#7A5C10` |
| Bleu pâle | `--pale-blue` | `#F4F6FA` |
| Texte principal | `--text-main` | `#14213A` |
| Texte secondaire | `--text-secondary` | `#4A5A75` |

Les fichiers locaux Roboto Slab et Lato sont sous licence SIL Open Font License, avec les textes de licence rangés à côté des fontes. Les quatre fichiers WOFF2 (latin et latin étendu) pèsent ensemble 52 216 octets. Les fichiers déclarent leur vraie graisse 400 ; le navigateur synthétise les graisses visuelles plus fortes. Le poids reste sous la limite de 60 Ko demandée.

Échelle : texte courant 16 px / 1,55 ; texte de lecture limité à environ 65 caractères par ligne via une largeur maximale proche de 500 px ; titres de section 31–39 px et titre principal adaptatif de 36–54 px. Les légendes et labels secondaires restent plus petits et ne remplacent jamais l’information principale.

## Mouvement

Le seul mouvement décoratif de la page est l’entrée du nom et du portrait dans le héros, avec des durées et délais cumulés sous 1,2 seconde. Il n’y a ni carrousel automatique, ni animation répétée pour les versets, ni apparition animée des sections. Les transitions servent uniquement à signaler un état interactif, par exemple l’ouverture du menu et le défilement. La préférence système `prefers-reduced-motion: reduce` supprime animations, transitions et défilement fluide.

## Contenu et images

- Le héros affiche le nom complet **Vénérable Suprême Évangéliste SEWADE KOUESSI Lucien**, la photo fournie du chargé paroissial et l’emblème de l’Église.
- Le portrait du fondateur et l’icône de Jésus-Christ restent dans la section mémoire. L’icône est identifiée comme représentation artistique, pas comme photographie historique.
- Les sources JPEG sont gardées dans `apps/web/media-source/`, hors du dossier statique public. Le navigateur sert seulement des WebP responsives avec dimensions explicites, `srcset`, `sizes`, chargement différé pour les portraits sous le héros et priorité élevée pour le portrait principal.
- Tailles des WebP : portrait du responsable 20 588 / 32 730 octets (480 / 720 px) ; fondateur 29 388 / 39 334 octets (480 / 640 px) ; icône du Christ 49 804 / 71 012 octets (480 / 640 px). L’image de partage social fait 45 272 octets, 1200 × 630.
- `scripts/build-home-media.cjs` régénère les fichiers depuis les originaux de `apps/web/media-source/` avec les dépendances locales Playwright et canvas. Il n’altère pas les images sources.

## Partage social et éléments à fournir

Les balises Open Graph et Twitter utilisent actuellement des chemins relatifs, car aucun domaine public (`APP_PUBLIC_URL`) n’est configuré dans l’environnement. Avant publication, fournir le domaine HTTPS officiel et remplacer ces valeurs par des URL absolues correctes. Le responsable doit également approuver le texte d’accueil final et, si disponible, transmettre une photo portrait haute résolution sans compression de messagerie. Aucun fait biographique ou témoignage n’est ajouté sans validation.

## Validation visuelle

Les tests Playwright doivent produire `captures/accueil-360.png`, `accueil-768.png` et `accueil-1440.png`, vérifier l’absence de débordement horizontal, le contraste AA des textes principaux, l’affichage du nom hostile en texte, la navigation clavier, `reduced-motion` et le compte à rebours du lundi dans `Africa/Porto-Novo`. Les mesures Web Vitals, le budget des fontes et le poids des médias sont consignés par la suite de tests ; ils décrivent l’environnement local, pas les performances d’un hébergement de production.

Le serveur statique de production active gzip pour HTML, CSS, JavaScript, JSON et SVG (le test Playwright applique le même comportement). Une mesure Playwright avec réseau simulé à 1,6 Mbit/s et 150 ms de latence est bloquante : LCP < 2,5 s et CLS < 0,05. Elle n’émule pas un CPU lent et ne garantit pas les performances d’un hébergement ou téléphone réels.

## Mesures du 11 octobre 2026

- `ng build` : chunks initiaux 366,86 Ko bruts ; estimation Angular compressée 98,27 Ko (JS 87,71 Ko, CSS 10,55 Ko). Cette estimation ne compte ni les images ni les fontes.
- Référence du build précédent avant cette passe : 488,94 Ko bruts initiaux (données du build conservées dans le compte rendu antérieur). L’introduction de routes lazy réduit l’initial brut calculé malgré le compte à rebours et les tokens.
- Ressources d’images servies depuis `public` : 290 388 octets au total (icône SVG, six tailles WebP et carte Open Graph). Les quatre fontes représentent séparément 52 216 octets. Les JPEG sources et le PNG non utilisé de l’emblème sont conservés hors du dossier public, dans `media-source`.
- Test Chromium Playwright, 1,6 Mbit/s et 150 ms : LCP mesuré 1 680 ms ; CLS 0,000. Les captures et autres essais passent dans cet environnement local.
- Ces mesures sont des résultats de laboratoire local ; le DNS, TLS public, cache/CDN, compression réelle du fournisseur et téléphones physiques n’ont pas été vérifiés.
