# Les deux images qui manquent

## `cockpit.jpg` — obligatoire

La photographie du poste de pilotage, **1280 × 800**. C'est le chrome de
l'interface : le métal, les rivets, les biseaux, les mains gantées, les
manches. Rien de tout cela n'est dessiné en CSS, et c'est délibéré — un
cockpit redessiné coûte des milliers de lignes, ne ressemble jamais tout à
fait à l'image, et se casse au premier changement de police.

Sans ce fichier, l'interface affiche ses écrans sur du noir et le dit
franchement plutôt que de faire semblant.

    desk/src/trading_desk/ui/cockpit/assets/cockpit.jpg

Depuis un Mac :

```bash
cd ~/dashboard/desk
cp ~/Downloads/cockpit.jpg src/trading_desk/ui/cockpit/assets/cockpit.jpg
git add src/trading_desk/ui/cockpit/assets/cockpit.jpg
git commit -m "Photo du cockpit"
git push
```

## `pilot-foreground.png` — vient ensuite

Un PNG transparent de la même taille, découpé **depuis** `cockpit.jpg` :
seulement les avant-bras gantés, les deux manches, le quadrant des gaz et les
genoux. Tout le reste en alpha 0.

Il se pose au-dessus des écrans du bas, pour que les mains passent devant
`LIVE FEED`, `AUTO-PILOT` et le bas du graphique — comme sur la photo. Sans
lui, les widgets recouvrent les mains, ce que le brief interdit à juste
titre : ce sont les mains qui donnent la profondeur.

Il n'existera qu'après `cockpit.jpg`, puisqu'il s'en découpe. L'interface
tourne sans, simplement à plat.

## `space-loop.mp4` — déjà là

La boucle du hublot, 20 s, H.264. En son absence, un champ d'étoiles en
canvas 2D prend le relais, avec la même perspective : l'observateur avance en
ligne droite, les étoiles s'écartent du point de fuite. Des points, jamais
des traînées — une croisière, pas un saut en hyperespace.
