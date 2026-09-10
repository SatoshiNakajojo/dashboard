# Mesurer la perspective du cockpit

Les pentes de `hotspots.json → plans` ne sont pas des réglages : ce sont des
mesures. Ces quatre outils sont ce qui les produit, et la raison pour
laquelle on peut les refaire plutôt que les retoucher à l'œil.

Il en faut deux, indépendants, parce qu'une seule méthode qui se trompe se
trompe silencieusement — c'est déjà arrivé : une mesure prise sur les
chanfreins de la photo avait donné +10,8° d'un côté et −7,5° de l'autre sur
deux panneaux **symétriques**, et ces valeurs-là sont parties en production.

## `skew.js` — l'angle du texte peint (référence)

Fait tourner une vignette de la photo et retient l'angle où l'encre se range
le mieux en lignes. C'est la référence : un titre que je pose doit se
coucher comme les titres du décor, pas comme un panneau que j'ai cru mesurer.

    node skew.js assets/cockpit.jpg '[{"nom":"secteurs","x":62,"y":780,"w":132,"h":20}]'

Piège corrigé une fois : si la fenêtre analysée dépasse la source, le bord
transparent de la vignette tournée est la transition la plus franche de
l'image et le score choisit toujours zéro degré — le détecteur mesure son
propre cadre. On échantillonne donc plus large que la fenêtre.

## `regions.js` — les arêtes du dessin au trait (contrôle)

Étiquette les faces closes du dessin (`assets/plan/`) et ajuste leurs quatre
arêtes par Theil-Sen, insensible aux coins arrondis. Le dessin donne **un
trait** par arête là où la photo donne six pixels de chanfrein dégradé.

    node regions.js plan.jpg 165 1200

## `calque.js` — vérifier que le dessin est bien calé sur la photo

Pose les quads relevés sur le dessin par-dessus la photo. Un chiffre juste
sur un dessin décalé ne vaut rien, et ça ne se voit que là.

## `angles.js` — trancher à l'œil quand les deux méthodes divergent

Dessine les angles candidats sur le texte peint.

## Dépendance

`playwright` (canvas hors écran) : `NODE_PATH=/opt/node22/lib/node_modules`.
Aucune bibliothèque d'image n'est installée côté Python dans cet
environnement — c'est la seule raison du détour par le navigateur.
