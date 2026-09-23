# Pré-enregistrement — les stratégies du desk Grok, reproduites

**Écrit le 23/09/2026, avant tout calcul.** Mêmes règles que pour le GSD : ce
fichier est commité avant les résultats pour qu'ils ne puissent pas déplacer la
cible.

## L'objet

Le desk « Stratégie Trading » (agent Grok) déclare deux stratégies PASS en
backtest, aujourd'hui en paper :

| stratégie | n | réussite | E[R] | PF | max DD |
|---|---:|---:|---:|---:|---:|
| **Supertrend V3-1B** | 120 | 55,8 % | +0,222 | 1,92 | −2,3 % |
| **Donchian B′** | 193 | 29 % | +0,106 | 1,24 | −3,7 % |

Backtest déclaré : bougies Hyperliquid 1h, BTC/ETH/SOL, ~208 jours, frais taker
3,5 bps par côté, stop plancher 0,40 %. Les scripts ne sont pas accessibles : la
reproduction se fait **à partir de la description des règles**, et c'est une
limite déclarée.

## Les données

Les bougies 1h BTC/ETH/SOL du cache de la campagne GSD : 5 001 barres, du
26/02/2026 au 23/09/2026, soit **208 jours** — la fenêtre même du backtest déclaré,
puisque c'est la profondeur maximale que sert l'API.

## Règles reproduites

**Supertrend V3-1B.** Supertrend(10, 3,0), sans filtre. Long au retournement
haussier à la clôture, court au retournement baissier. Stop = la ligne,
suiveuse. Sortie au stop, au retournement, ou après 72 barres. Stop initial sous
0,40 % → signal ignoré. Une seule position à la fois, tous actifs confondus ;
priorité BTC > ETH > SOL si plusieurs signalent sur la même barre.

**Donchian B′.** Clôture au-dessus du plus haut des 20 barres précédentes (sous
le plus bas pour un court), filtrée par l'EMA100 : long seulement au-dessus,
court seulement en dessous. Stop 2×ATR(14), plancher 0,40 %. À +1R, stop ramené
à l'entrée. Sortie au stop, à la cassure Donchian10 opposée, à 3R, ou après 48
barres. Même règle de position unique et de priorité.

## La question centrale : quand le stop suiveur est-il connu ?

La ligne Supertrend d'une barre se calcule avec le haut et le bas **de cette
barre**. Elle n'est donc connue qu'à sa clôture. Pendant la barre k, le seul stop
réellement en place est la ligne de la barre k−1.

Deux implémentations sont testées, et c'est leur écart qui constitue le test :

- **correcte** : pendant la barre k, le stop est la ligne de k−1 ;
- **à anticipation** : pendant la barre k, le stop est la ligne de k — calculée
  avec un haut et un bas qu'on ne connaît pas encore.

L'entrée se fait à la clôture de la barre de signal (conforme à la description)
et, en contrôle, à l'ouverture de la suivante.

## Prédictions, écrites avant de calculer

Je les écris parce que je me suis trompé deux fois aujourd'hui sur des
prédictions énoncées avec assurance. Les écrire d'abord est le seul moyen de
savoir, ensuite, si j'avais raison.

1. **L'implémentation correcte ne reproduit pas** 55,8 % et +0,222 R. Je prédis
   une réussite entre 35 et 45 % et un E[R] entre −0,1 et +0,1.
2. **L'implémentation à anticipation s'en approche nettement.**
3. **Contre le modèle nul**, l'implémentation correcte n'est pas
   significative.

Si la prédiction 1 échoue — si l'implémentation correcte reproduit les chiffres
déclarés — l'hypothèse d'une anticipation est réfutée et le résultat du desk
tient sur cette fenêtre. Ce sera dit tel quel.

## Le modèle nul

Pour Supertrend : même nombre de trades, entrées à des dates tirées au hasard,
**dans le sens de la tendance Supertrend en cours à cette date**, mêmes sorties.
Il répond à une seule question : **entrer au retournement vaut-il mieux
qu'entrer n'importe quand dans une tendance déjà en place**, avec le même stop
suiveur ? Si non, le rendement ne vient pas du signal mais du simple fait de
suivre une tendance dans une fenêtre qui en a eu.

Pour Donchian B′ : même nombre de trades, même sens, même distance de stop,
entrées tirées au hasard, mêmes sorties.

2 000 tirages ; plancher de p = 1/2001, affiché.

## Hors échantillon

Les mêmes règles, **sans aucun réglage**, sur les autres perps de la campagne
GSD — les 7 autres du bot et les 10 hors-échantillon — sur la même fenêtre de
208 jours. Des paramètres figés sur BTC/ETH/SOL qui ne tiennent nulle part
ailleurs ne décrivent pas un edge, ils décrivent BTC, ETH et SOL entre février et
septembre 2026.

## Coûts

Reproduction à **3,5 bps** par côté pour coller au backtest déclaré, puis rendu
à **4,5 bps** : c'est le taux que le compte réel a payé, mesuré sur ses
exécutions. Le financement, que la description ne mentionne pas, est ajouté sur
la part de la fenêtre que l'API couvre (~50 jours), en déclaré.

## Ce qui serait un succès pour le desk

L'implémentation correcte reproduit un E[R] clairement positif, bat son nul, et
garde son signe hors échantillon. Les trois ensemble.
