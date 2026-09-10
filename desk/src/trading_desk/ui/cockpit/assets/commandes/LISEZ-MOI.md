# Commandes photographiées

Les interrupteurs, boutons et voyants du poste peuvent être des **images**
plutôt que des dessins vectoriels. Une image photographiée se pose sur la
photo du cockpit sans jamais trahir qu'elle vient d'ailleurs ; un dessin,
lui, ne rejoint jamais tout à fait le grain et l'éclairage du décor.

## Ce que le cockpit attend

Chaque commande est une **paire** de PNG à fond transparent, cadrés
identiquement — même taille, même centre, même perspective. C'est ce qui
permet de les superposer et de basculer de l'un à l'autre sans que la pièce
bouge d'un pixel.

| fichier | rôle |
| --- | --- |
| `<nom>-off.png` | position repos |
| `<nom>-on.png` | position active |

L'état **clignotant** n'a pas besoin d'un troisième fichier : le cockpit
alterne les deux images. Un troisième cadre pour un clignotement, c'est un
fichier de plus à garder aligné avec les deux autres pour rien.

## Noms déjà câblés

| nom | où | remplace |
| --- | --- | --- |
| `inter` | les deux bascules sous « Exposition » | le levier vectoriel |

## Comment en ajouter un

1. Déposer la paire ici.
2. Dans `../../hotspots.json`, ajouter `"image": "<nom>"` sur l'élément.
3. Rien d'autre : si les fichiers manquent, l'élément retombe sur son dessin
   vectoriel et le cockpit reste utilisable. Une image absente ne doit
   jamais faire un trou dans le tableau de bord.

## Cadrage

Le PNG doit être **serré sur la pièce**, sans marge morte : le cockpit le
pose dans le rectangle donné par `hotspots.json`, et une marge transparente
décale la pièce par rapport à son socle peint.
