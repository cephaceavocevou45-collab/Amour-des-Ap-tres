# Préparer le déploiement Cloudflare Tunnel

**État : préparation seulement — aucun domaine, compte Cloudflare, jeton, serveur ou conteneur n’a été configuré ni testé.** Cette architecture expose le site et l’API sous une origine unique, par exemple `https://paroisse.example.org`.

## Architecture et limites de confiance

```text
Navigateur -- HTTPS --> Cloudflare Edge -- Tunnel sortant --> cloudflared
                                                           |
                                                  réseau tunnel privé
                                                           |
                                   Nginx web : Angular + /api vers API
                                      | réseau app         |
                                     API -- réseau data -- PostgreSQL
```

- `infra/compose.yaml` n’a aucun `ports:` publié. Cloudflare Tunnel ne nécessite pas d’ouverture entrante sur le serveur. Le web et l’API n’ont aucune sortie Internet : Nginx ne joint que l’API par le réseau `app`; PostgreSQL n’est joignable que par l’API et le service de migration sur le réseau interne `data`.
- Le conteneur web sert Angular et relaie `/api/`, `/health` et `/ready` vers l’API. Il fait confiance à `CF-Connecting-IP` uniquement si le pair est l’adresse fixe du service `cloudflared` (`172.33.0.3`) sur `tunnel-origin`, un réseau interne Docker. Les valeurs `X-Forwarded-For` et `CF-Connecting-IP` destinées à l’API sont remplacées par Nginx avec l’adresse ainsi validée.
- Seul `cloudflared` rejoint aussi le réseau de sortie `tunnel` pour établir le tunnel vers Cloudflare. L’API accepte `X-Forwarded-For` uniquement depuis le pair Nginx `172.31.0.2`; l’API et PostgreSQL ne publient aucun port hôte. Ne rattachez aucun autre conteneur non fiable aux réseaux `app`, `tunnel-origin` ou `tunnel` et ne changez pas leurs adresses sans modifier ensemble les listes de confiance et les tests.
- Cloudflare termine TLS côté public et peut lire le trafic en clair à son entrée (y compris les données personnelles et le contenu des requêtes). Cette information doit être présentée aux personnes utilisant le service. Le trajet Cloudflare vers le serveur passe par le tunnel chiffré.
- Le service Cloudflare est épinglé sur `cloudflare/cloudflared:2026.10.0`; planifier les mises à jour de cette version et vérifier chaque nouvelle image avant déploiement. `TUNNEL_TOKEN` est injecté depuis `CLOUDFLARED_TOKEN` en environnement, jamais placé dans les arguments de processus; Cloudflare documente cette variable dans son [guide de déploiement de cloudflared](https://developers.cloudflare.com/tunnel/guides/kubernetes/).
- Le comportement de `CF-Connecting-IP` et les limites d’origine du header sont décrits dans la [référence officielle des headers Cloudflare](https://developers.cloudflare.com/fundamentals/reference/http-headers/); le tag épinglé correspond à la [version cloudflared publiée le 5 octobre 2026](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.0).

## Préparation du compte et du domaine

1. Créer le compte au nom officiel de la paroisse, activer la 2FA avec une clé de sécurité ou une application TOTP et conserver les codes de récupération hors ligne.
2. Ajouter au moins deux administrateurs de confiance; protéger chaque compte individuellement par 2FA. Ne partagez pas un même compte.
3. Ajouter le domaine détenu par la paroisse et suivre l’assistant Cloudflare pour les enregistrements DNS/nameservers. Vérifier le domaine et l’adresse de contact avant de basculer le trafic.
4. Dans **Networking → Tunnels**, créer un tunnel distant (managed remotely). Ajouter une route publiée pour le nom d’hôte choisi, avec le service d’origine `http://172.33.0.2:8080`. Nginx écoute sur cette seule adresse du réseau `tunnel-origin`; le service `cloudflared` est le seul pair qui peut l’atteindre. Il n’accepte que le jeton fourni par le tableau de bord via `CLOUDFLARED_TOKEN`.
5. Dans les paramètres SSL/TLS, activer **Always Use HTTPS**, sélectionner au minimum TLS 1.2 (TLS 1.3 si la compatibilité des clients le permet), et activer HSTS après validation complète du domaine et des sous-domaines. Vérifier que l’URL publique utilisée dans `APP_PUBLIC_URL` est l’origine HTTPS exacte, sans chemin final.
6. Activer les ensembles de règles gérées WAF disponibles pour le compte. Commencer en mode journalisation/observation, examiner les faux positifs, puis bloquer selon le résultat. Activer Bot Fight Mode si inclus dans l’offre et tester les connexions d’utilisateurs sur navigateur et téléphone.
7. Ajouter une règle Cloudflare de limitation de débit sur `POST /api/v1/auth/login`, `/api/v1/auth/admin/login`, `/api/v1/auth/subadmin/login`, `/api/v1/auth/password/forgot` et `/api/v1/auth/password/reset`. Commencer avec une limite conservatrice; éviter de verrouiller un établissement entier derrière une adresse IP partagée.
8. Optionnel : protéger la page `/admin*` avec Cloudflare Access, en autorisant les identités nominatives des administrateurs. Tester tout le flux de connexion, les cookies, le rafraîchissement et les requêtes API avant de l’imposer; cette couche ne remplace pas l’authentification et les permissions de l’application.

Les noms des réglages Cloudflare et leur disponibilité peuvent varier selon le compte. Consulter la documentation actuelle et les règles effectivement proposées dans le tableau de bord. **Tarifs et limites à vérifier chez Cloudflare.**

Voir aussi la documentation Cloudflare sur [Always Use HTTPS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/) et la [version TLS minimale](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/minimum-tls/).

## Cache

Dans Cloudflare **Rules → Cache Rules**, créer une règle prioritaire de contournement pour toutes les routes commençant par `/api/`, ainsi que `/health` et `/ready`. La configuration de l’origine ajoute aussi `Cache-Control: no-store` et `Pragma: no-cache` aux réponses API. Ne créez aucune règle « Cache Everything » couvrant `/api/`, les cookies, les pages d’administration ou `index.html`.

Ne mettre en cache que les fichiers statiques portant un nom haché de build (JavaScript/CSS et images/fonts versionnés), avec une durée longue et `immutable`. L’HTML et les ressources non hachées sont revalidés ou servis sans cache. Après toute modification, tester `CF-Cache-Status` et les en-têtes pour une page publique, une session authentifiée et un appel API; aucune réponse personnalisée ne doit être `HIT`.

Cloudflare documente l’action « Bypass cache » dans [les réglages Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/). La règle s’applique aux noms d’hôte proxyfiés et doit être contrôlée avec Cloudflare Trace.

## Préparer le serveur Linux

Prérequis : Linux maintenu, Docker Engine et Compose v2, au moins 2 cœurs/12 Go conseillés, stockage chiffré/disque surveillé et accès SSH par clé. N’ouvrir aucun port applicatif. Pour l’architecture Tunnel, le pare-feu entrant autorise SSH uniquement depuis les adresses d’administration; les connexions sortantes DNS/HTTPS nécessaires au tunnel, aux mises à jour, à l’e-mail et au stockage de sauvegardes doivent fonctionner.

1. Cloner/copier le dépôt sur le serveur et créer `.env` à partir de `.env.example` avec permissions `0600`. Générer des valeurs indépendantes pour les secrets DB, JWT et tunnel. Le secret JWT doit être aléatoire et faire au moins 32 octets. La connexion à l’application utilise uniquement l’adresse e-mail et le mot de passe. Ne jamais committer `.env`, coller un jeton dans une issue ou l’ajouter à la ligne de commande sauvegardée dans l’historique shell.
2. Renseigner `APP_PUBLIC_URL`, `CLOUDFLARED_TOKEN`, les mots de passe PostgreSQL, `JWT_ACCESS_SECRET`, `RESEND_API_KEY`, `MAIL_FROM` et les paramètres d’envoi. Toutes les valeurs obligatoires sont vérifiées par Compose avec `${VAR:?}`; aucun secret d’exemple n’est fourni. Pour les mots de passe DB intégrés à `DATABASE_URL`, utiliser des caractères URL-sûrs (par exemple hexadécimaux) ou encoder les caractères réservés pour URL avant de les placer dans `.env`. La rotation du secret JWT invalide les sessions conformément à `EXPLOITATION.md`.
3. **Avant démarrage**, créer et tester une sauvegarde chiffrée hors du serveur et confirmer une restauration réelle sur une base vide isolée. Ne lancez jamais une restauration vers la base active.
4. Vérifier la syntaxe sans afficher l’environnement interpolé : `docker compose --env-file .env -f infra/compose.yaml config --quiet`.
5. Construire puis démarrer : `docker compose --env-file .env -f infra/compose.yaml build --pull` puis `docker compose --env-file .env -f infra/compose.yaml up -d`.
6. Vérifier l’état : `docker compose --env-file .env -f infra/compose.yaml ps` et les logs expurgés : `docker compose --env-file .env -f infra/compose.yaml logs --since=10m api web cloudflared`. Ne jamais copier les valeurs d’environnement ni le jeton dans le rapport.
7. Après avoir sauvegardé et validé la cible DB, appliquer une migration à la demande : `docker compose --env-file .env -f infra/compose.yaml --profile maintenance run --rm migrate`. Ce service utilise le rôle de migration distinct; ne pas lancer `migrate dev` sur le serveur.
8. Tester la configuration web dans son conteneur : `docker compose --env-file .env -f infra/compose.yaml exec web nginx -t`.
9. Tester l’origine publique sans inclure de données d’authentification dans le terminal : `curl -sSI https://<DOMAINE>/health`. Confirmer HTTPS, CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Cache-Control: no-store` et `Pragma: no-cache`. Tester ensuite `/ready`, connexion/déconnexion, expiration/rafraîchissement de session, rôles, cache et adresse IP vue par le limiteur depuis au moins un téléphone hors du Wi-Fi paroissial. Vérifier les attributs de cookies dans les outils de développement du navigateur sans copier leur valeur.

Ces commandes sont une procédure à exécuter par un humain sur le serveur. Le fichier Compose et le routage Cloudflare sont **non testés** ici; les images officielles, le réseau Docker et le tunnel réel n’ont pas démarré.

## Protection des comptes, jeton et disponibilité

- Révoquer/faire tourner le jeton du tunnel dans le tableau de bord si un administrateur quitte l’équipe, si le serveur est perdu, si `.env` fuit ou à la rotation périodique. Modifier `CLOUDFLARED_TOKEN`, redémarrer le service puis vérifier le tunnel avant de révoquer l’ancien jeton. Ne pas exposer le jeton dans une commande ou un ticket.
- Surveiller `/ready`, l’espace disque, les sauvegardes, les erreurs 5xx, l’échec e-mail et l’état du tunnel. Configurer des alertes budgétaires Cloudflare et chez l’hébergeur; **tarifs et limites à vérifier chez Cloudflare**.
- Cloudflare indisponible : le domaine public peut ne pas joindre le serveur, et le tunnel ne peut pas être contourné car aucun port hôte n’est publié. Consulter la page de statut du fournisseur depuis un canal distinct, conserver les données localement, ne pas ouvrir temporairement PostgreSQL/API sur Internet, puis reprendre lorsque le service revient. Maintenir des sauvegardes chiffrées dans un stockage distinct et un second compte de récupération.
- La rotation du secret n’est pas une sauvegarde : conserver la clé de chiffrement des archives séparément et documenter les personnes autorisées à la récupérer.

## Contrôles humains indispensables avant ouverture

- [ ] Compte Cloudflare paroissial protégé, deux administrateurs nominatifs avec 2FA et récupération hors ligne.
- [ ] Domaine détenu, tunnel distant et hostname `http://172.33.0.2:8080` configurés; aucun port entrant applicatif.
- [ ] `docker compose ... config --quiet`, build, démarrage, migrations à la demande, utilisateurs Linux/DB et réseau contrôlés.
- [ ] Le test anti-usurpation d’IP exécuté derrière tunnel réel : en-têtes forgés envoyés par client ne changent ni les journaux réseau expurgés ni le quota appliqué.
- [ ] Cache Cloudflare et origine vérifiés; API et réponses authentifiées jamais mises en cache.
- [ ] HTTPS, TLS minimum, HSTS, WAF, règles de débit, Bot Fight Mode et éventuel Access testés sans bloquer les paroissiens légitimes.
- [ ] Sauvegarde chiffrée hors machine restaurée dans une nouvelle base, comparée et documentée; procédure incident et rotation du tunnel testées.
- [ ] Avis de confidentialité mis à jour : Cloudflare termine le HTTPS et voit le trafic en clair à son entrée.

**Aucun déploiement n’est déclaré fonctionnel.** Docker et le domaine réel sont **non testés** ici. Sur le serveur Linux, l’humain doit lancer, dans cet ordre : `docker compose --env-file .env -f infra/compose.yaml config --quiet`, `docker compose --env-file .env -f infra/compose.yaml build --pull`, `docker compose --env-file .env -f infra/compose.yaml up -d`, puis `docker compose --env-file .env -f infra/compose.yaml exec web nginx -t` et les tests HTTPS décrits ci-dessus. Après démarrage, contrôler que `web` n’est relié qu’aux réseaux internes `app` et `tunnel-origin`, et que `cloudflared` seul rejoint aussi le réseau sortant `tunnel`.
