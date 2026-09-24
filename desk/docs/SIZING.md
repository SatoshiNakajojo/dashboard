# Taille de position — ce qui est réglé, et ce que personne n'avait choisi

> **Mis à jour le 24 septembre 2026.** Le risque par trade est passé de 0,5 %
> à **3,75 %**, et la perte journalière maximale de 2 % à **8 %**. La fraction
> du capital par position vaut donc les **25 %** que la validation suppose, au
> lieu de 3,3 %. Ce document décrit ci-dessous l'état d'avant et le
> raisonnement qui a mené là ; les trois sections finales disent ce que le
> changement a réellement coûté.

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


---

## Ce que le passage à 3,75 % a réellement changé

### Un plafond a dû suivre, sinon le desk devenait inerte

À 3,75 % de risque, **une seule position sortie au stop coûte 3,75 % du
capital**. Avec une perte journalière plafonnée à 2 %, le desk ouvrait une
position qu'il n'avait pas le droit de voir échouer, et s'arrêtait au premier
stop — au vert, sans que rien ne le dise. Ce n'est pas un cas rare :
l'écart-type de la règle vaut 1 131 bps par position, donc le stop à 15 % est
à 1,3 écart-type.

C'est le défaut déjà payé sur `max_stop_distance_bps`, dont le plafond à
500 bps rendait le desk structurellement inerte. `max_daily_loss_pct` est
donc passé à **8 %**, ce qui laisse les deux positions simultanées sortir au
stop le même jour avant l'arrêt. Un `model_validator` interdit désormais que
le risque par trade dépasse la perte journalière : l'incohérence est
impossible, pas seulement surveillée.

### Le dimensionnement par le risque n'est plus actif partout

La fourchette de stop par défaut d'un mandat va de 30 à 500 bps. À 3,75 %,
même son stop le plus large — 5 % — réclamerait 75 % du capital, et le
plafond de notionnel le ramène à 50 %. **Pour un mandat ordinaire, c'est
donc toujours le notionnel qui borne**, jamais le budget de risque ; celui-ci
ne redevient décisif qu'à partir d'un stop de 7,5 %.

Ce n'est pas dangereux — un plafond ne fait que réduire, et la perte au stop
passe sous le budget au lieu de le dépasser — mais c'est un changement de
régime. La règle des déblocages, elle, pose son stop à 15 % et obtient bien
ses 25 %.

### Mesurer et trader ne sont plus le même dimensionnement

Tout le corpus enregistré — `baselines/`, le registre de l'atelier, la
bibliothèque, chaque `net_usd` — a été mesuré à 0,5 %. Si les backtests
lisaient le réglage déployé, ce seul changement aurait multiplié par 7,5 tous
les résultats déjà écrits, et deux mesures prises à six mois d'écart ne
seraient plus comparables : on ne saurait plus si une stratégie s'est
améliorée ou si l'on a simplement grossi les positions.

`backtest.engine.limites_de_mesure()` épingle donc le dimensionnement de
mesure à 0,5 %, et c'est le pupitre qui applique la taille réelle. Un
backtest rend l'edge d'une stratégie, qui est sans échelle en pourcentage.

### Ce qui mordra au prochain palier de capital

Les plafonds sont en **dollars** (`max_position_notional_usd = 500`,
`max_gross_notional_usd = 1 000`) et la taille en **fraction du capital**.
À 1 000 $ d'équité, 25 % font 250 $ et rien ne mord. À 10 000 $, ils feraient
2 500 $ et le plafond ramènerait la position à 5 % du capital — le réglage à
3,75 % deviendrait sans effet, silencieusement.

C'est la prochaine décision à prendre, et elle dépend du capital réellement
engagé.
