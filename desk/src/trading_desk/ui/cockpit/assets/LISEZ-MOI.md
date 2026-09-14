# `cockpit.jpg` n'est pas utilisé

Cette image a été envoyée le 12 septembre 2026. Elle **ne sert à rien dans
l'application** : le décor du poste est `../../poste/assets/poste.jpg`.

Le dossier `ui/cockpit/` est celui de l'ancien poste photographique, retiré
le 11 septembre. Un fichier qui y réapparaît ne veut pas dire que l'ancien
cockpit revient — rien dans le code ne lit ce dossier.

## Pourquoi elle n'a pas été adoptée

Ce n'est pas une version haute résolution du décor actuel : c'est une
**génération différente** d'un cockpit de même composition. Mesuré — on a
cherché le recadrage de `cockpit.jpg` qui reproduirait `poste.jpg`, sur
toutes les largeurs de 600 à 1776 px et toutes les positions :

| comparaison                     | écart moyen (sur 255) |
| ------------------------------- | --------------------- |
| meilleur recadrage trouvé       | 15,31                 |
| image entière, sans recadrage   | 14,74                 |

Une même image recadrée donnerait 2 à 5 (le bruit du JPEG et du
rééchantillonnage). À 15, aucun recadrage n'aligne les deux : ce sont deux
rendus distincts.

Or `poste.jpg` **est l'image sur laquelle la séquence d'embarquement se
termine** — pas une autre prise du même cockpit, la dernière image exacte de
la vidéo. C'est ce raccord image-pour-image qui rend l'arrivée au poste
invisible, et c'est la règle que `poste/poste.css` énonce en premier.
Changer le décor sans remonter la fin de la vidéo ferait sauter le raccord
au moment précis où tout l'effet repose dessus.

Le choix a été posé au propriétaire du dépôt le 11 septembre 2026, avec les
mesures ci-dessus : **garder le décor actuel**.

Pour l'adopter un jour, il faudra les deux à la fois — remplacer le décor
**et** remonter la fin de `poste/assets/embarquement.{mp4,webm}` pour
qu'elle se termine sur cette image, puis remesurer les quatre variables
`--verre-*` de `poste/poste.css` sur le nouveau cadrage.
