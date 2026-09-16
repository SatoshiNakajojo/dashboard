# La règle des déblocages — la seule que ce dépôt ait validée

## Ce qu'elle fait

Elle ne regarde aucun prix. Elle regarde un **calendrier**.

Un déblocage de jetons est une date publique, annoncée des mois à l'avance :
ce jour‑là, une tranche de l'offre d'un jeton cesse d'être verrouillée et
devient vendable. L'hypothèse testée est que le marché anticipe cette offre à
venir, et que le mouvement se produit **avant** la date, pas après.

| paramètre | valeur |
|---|---|
| fenêtre d'entrée | J−7 → J−1 |
| durée de détention | 6 jours |
| bande de taille | 2 % – 25 % de l'offre |
| stop | 15 % du prix d'entrée |
| dédoublonnage | un événement par fenêtre |
| sens | vente à découvert |

## Ce qui a été mesuré

**852 événements.** La fenêtre J−7 → J−1 rend **+236 bps** là où un tirage au
hasard de mêmes dates en rend +75. Après correction de Benjamini–Hochberg sur
l'ensemble des hypothèses déclarées, **p = 0,0010**.

La réponse est **monotone en taille de déblocage** : plus la tranche libérée
est grosse, plus l'effet est marqué. C'est exactement la forme qu'aurait un
vrai mécanisme d'offre, et pas celle qu'aurait un artefact.

## Pourquoi la bande 2 % – 25 %

En dessous de 2 %, aucun des six contrôles ne survit. Au‑dessus de 25 %, on
entre dans le domaine des événements rares et extrêmes, où la moyenne est
portée par quelques points. La borne haute est celle qui résiste à l'épreuve
des dénominateurs : n = 832, +223,1 bps, p = 0,0025.

## Le stop n'est pas validé, et il faut le savoir

La règle mesurée n'en comporte pas : elle entre à J−7 et sort à J−1, point.
Mais `size_position` a besoin d'une distance au stop pour donner une taille,
et une position sans stop est refusée par les invariants.

Le stop à 15 % est donc **un garde‑fou opérationnel, pas une composante de
l'edge**. Assez large pour ne pas couper la stratégie mesurée, assez serré
pour borner la perte d'un jeton qui s'effondre. Il rend le résultat live
légèrement différent du backtest, et il faut en tenir compte en comparant les
deux.

## Les deux versions, et celle qui est branchée

La validation mesure la vente à découvert **nue** et la même position
**adossée** à un achat de BTC pour le même notionnel :

| version | Sharpe | repli |
|---|---|---|
| nue | 1,80 | 15,3 % |
| adossée | 2,46 | 7,9 % |

L'adossée est la seule dont le résultat soit **attribuable aux déblocages** :
la nue est courte sur des alts pratiquement chaque semaine de la période, donc
son résultat contient une exposition courte permanente au marché, qui a
rapporté ou coûté indépendamment de tout déblocage.

Le desk déployé ne passe que la jambe courte. La couverture est branchable —
`DESK_DEBLOCAGES_ADOSSES` — et fausse par défaut parce qu'elle double le
nombre de positions ouvertes.

## Le journal hors échantillon, et pourquoi il existe

`scripts/journal_unlocks.py` inscrit les positions **avant les faits**, dans
un fichier en ajout seul. Le pilote ne redécide rien : il lit ce journal.

Recalculer les entrées dans le pilote ouvrirait la porte à un désaccord
silencieux entre ce qui a été prédit et ce qui est tradé — et c'est exactement
ce désaccord qui transforme une validation hors échantillon en illusion.

Un déblocage découvert aujourd'hui et tradé aujourd'hui ne serait pas hors
échantillon. Le pilote refuse ce qu'il ne trouve pas dans le journal, et il
le dit.

## Sa limite, et elle est d'accès

L'étendre à d'autres calendriers demande des sources que le réseau de cette
machine n'atteint pas : seul `api.hyperliquid.xyz` répond. **Ce n'est pas un
résultat négatif, c'est une limite d'accès** — la piste n'est ni confirmée ni
infirmée au‑delà de ce qui est déjà mesuré.

## Ce qui reste à faire

- **Archiver le calendrier à chaque collecte.** Sans archive, on ne peut pas
  rejouer une décision passée contre le calendrier tel qu'il était.
- **Mesurer le stop de 15 % sur les 852 événements historiques**, pour
  chiffrer l'écart qu'il introduit entre le backtest et le live.
- **Compter ce que coûte le plafond de deux positions simultanées**, qui
  devient contraignant dès que la couverture est branchée.
