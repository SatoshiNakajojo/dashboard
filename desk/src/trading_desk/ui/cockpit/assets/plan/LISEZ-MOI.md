# Le plan au trait du poste

Déposer ici le dessin au trait du cockpit, sous le nom **`plan.png`**.

## Pourquoi il vaut mieux que la photo

Les angles des panneaux sont relevés sur la photo par suivi d'arête : pour
chaque colonne, la ligne de plus fort gradient. Sur un biseau métallique
éclairé, ce maximum saute d'un détail à l'autre — vis, reflet, ombre — et
l'écart résiduel monte à cinq ou onze pixels. Deux mesures voisines donnent
alors +10,8° et −7,5° là où l'œil voit deux degrés.

Un dessin au trait n'a ni texture, ni reflet, ni ombre : **une arête y est
une ligne d'un pixel**. La même mesure y devient exacte, et la perspective
de tout le poste peut être relevée d'un coup plutôt que panneau par panneau.

## Ce qu'il faut respecter

**Le même cadrage que `../cockpit.jpg`**, au pixel près : mêmes bords, même
centre, même échelle. C'est la seule condition — le plan sert de calque de
mesure sur la photo, et un décalage de cadrage décalerait tout ce qu'on en
tire. La résolution peut être différente ; le rapport largeur/hauteur, non
(actuellement 1792 × 1008, soit 16:9).

Fond blanc, traits noirs, pas d'aplat de gris : c'est ce qui rend la
détection triviale.

## Ce qu'on en tire

Les quatre coins de chaque panneau et de chaque dalle, donc l'homographie
qui plaque une pièce dessus — et, pour les étiquettes, la base du plan de
leur panneau : rotation, cisaillement et échelle d'un seul coup, au lieu
d'une rotation devinée.
