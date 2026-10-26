# Plan de réponse aux incidents

Ce guide concerne les comptes de présence et les données nominatives. Il ne remplace pas le signalement légal applicable au pays d'hébergement. Avant l'ouverture publique, la paroisse doit inscrire dans sa copie contrôlée les noms, numéros directs et suppléants des contacts ci-dessous.

## Contacts à compléter par la paroisse

| Rôle | Personne titulaire | Suppléant | Canal privé |
|---|---|---|---|
| Responsable de l'incident (administrateur principal) | À renseigner | À renseigner | À renseigner |
| Responsable technique / hébergeur | À renseigner | À renseigner | À renseigner |
| Responsable paroissial des données | À renseigner | À renseigner | À renseigner |

Ne publiez pas les coordonnées directes des personnes concernées dans un canal public. Ne transmettez jamais de mot de passe, code 2FA, code de secours, jeton ou fichier de sauvegarde non chiffré.

## Compte compromis

1. Prévenir le responsable de l'incident par le canal privé convenu et noter l'heure, le compte concerné et les faits observés, sans copier de mot de passe ni de nom de personne présente.
2. Depuis un compte administrateur sain, désactiver le compte compromis dans l'administration. Cette action révoque ses sessions et incrémente la version de session.
3. Si le compte compromis est administrateur, demander au second administrateur de suspendre ce compte; ne pas réutiliser la session suspecte.
4. Révoquer également les sessions restantes par `POST /api/v1/auth/account/sessions/revoke-all` pour un compte récupéré, puis réinitialiser son mot de passe et contrôler les journaux d'audit autour de l'heure concernée.
5. Réactiver le compte seulement après vérification de l'identité et rotation du mot de passe/2FA. Conserver les éléments d'enquête dans un stockage privé à accès restreint.

## Téléphone perdu ou volé

1. Le titulaire contacte immédiatement un administrateur depuis un autre canal.
2. L'administrateur désactive temporairement le compte ou révoque toutes ses sessions. Une déconnexion locale seule ne suffit pas pour un appareil perdu.
3. Le titulaire récupère son numéro/SIM auprès de son opérateur, puis change le mot de passe depuis un appareil sûr et réenrôle le 2FA si nécessaire.
4. Vérifier l'activité d'audit et les pointages en attente. Les éléments IndexedDB sont chiffrés uniquement par les protections du navigateur/appareil; l'application les efface à la déconnexion et les purge après sept jours, mais un appareil compromis peut les exposer avant cela.

## Fuite suspectée

1. Alerter les trois rôles de contact ci-dessus; consigner la portée connue, l'heure de détection et les systèmes impliqués.
2. Protéger les preuves et les journaux, puis retirer temporairement l'accès public ou isoler l'instance si la fuite continue. Ne pas effacer les journaux ni restaurer par-dessus la base en service.
3. Révoquer/faire tourner les secrets potentiellement exposés (JWT, fournisseur e-mail, PostgreSQL, stockage de sauvegarde) selon la procédure de déploiement. La rotation JWT invalide aussi les secrets TOTP et impose le ré-enrôlement par codes de secours selon `EXPLOITATION.md`. Révoquer toutes les sessions après rotation JWT.
4. Comparer les journaux d'audit et les sauvegardes chiffrées; faire examiner l'incident par la personne responsable de la protection des données et vérifier les obligations de notification applicables.
5. Restaurer uniquement dans une base isolée pour enquête. La reprise en production exige validation de l'intégrité et décision documentée du responsable d'incident.

## Après l'incident

Noter les actions et leurs heures, les comptes/sessions révoqués, la cause établie ou encore inconnue, les données concernées et les correctifs appliqués. Prévenir les personnes concernées lorsque le responsable des données et les obligations locales l'exigent. Faire un retour d'expérience sans publier de données personnelles.
