# Taille de position — ce qui est réglé, et ce que personne n'avait choisi

## Le défaut du desk

**100 à 500 $ par position**, conformément au briefing. En pratique le desk
plafonne à 500 $ par position (`max_position_notional_usd`) pour un notionnel
brut de 1 000 $ et deux positions simultanées.

## Le chiffre que personne n'avait posé

La taille réellement prise n'était réglée nulle part. Elle tombe d'une
division :

    fraction du capital = risque par trade / distance au stop
                  3,3 % =          0,5 %    /        15 %

Le budget de risque a été fixé à 0,5 % parce que c'est une prudence classique.
Le stop à 15 % parce que les jetons concernés bougent de plus de 5 % par jour.
**Ni l'un ni l'autre n'a été choisi en pensant à la taille**, et leur quotient
n'apparaissait dans aucun fichier de configuration.

C'est la forme la plus courante d'un réglage qui dérive : un nombre que
personne n'a posé et que personne ne relit.

`risk/fraction.py` le calcule et donne son inverse, qui est le chiffre
actionnable : **pour viser 25 % du capital avec un stop de 15 %, régler le
risque par trade à 3,75 %**. Aucun plafond ne mord à cette taille.

## Les 200 000 $ cités

Le briefing mentionne un ordre de grandeur de position de 200 000 $ sur
Hyperliquid. **C'est un plafond constaté, pas une cible.**

Ce qu'on en sait, mesuré : à 200 000 $ sur BTC, le glissement simulé contre le
carnet réel vaut encore **1,58 bps**, sous les 3,0 supposés par le modèle de
coûts. Il n'y a donc pas de mur de liquidité avant cet ordre de grandeur —
mais rien dans ce dépôt ne justifie d'y aller, et la taille déployée reste
celle du briefing.

Le seul actif dont le carnet soit mince est SOL : le fill est tronqué dès
50 000 $.

## L'ordre des changements, s'ils ont lieu

**La jambe de couverture d'abord, la taille ensuite.** Multiplier la taille
par 7,5 multiplie aussi le repli. Adossé, le repli mesuré est de 7,9 % ; nu,
de 15,3 %. Dans l'autre ordre on prend 15,3 % de repli à pleine taille, et
c'est le genre de semaine qui fait débrancher un desk qui marchait.

La couverture est branchable — `DESK_DEBLOCAGES_ADOSSES`, faux par défaut
parce qu'elle double le nombre de positions ouvertes et que le plafond est à
deux.
