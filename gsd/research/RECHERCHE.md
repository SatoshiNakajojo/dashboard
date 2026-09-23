# Journal de recherche du GSD

Ce que la campagne a établi, et ce qu'elle a coûté pour l'établir. Rien ici ne
décrit une stratégie retenue : ce journal sert à ne pas re-tester ce qui a déjà
été réfuté, et à se rappeler comment.

## Où en est le projet

**Les deux moteurs du GSD n'ont pas d'edge démontrable.** Cassure Donchian 20
et retournement Supertrend 10×3, portés à l'identique depuis `strats.ts` et
vérifiés causals, testés sur 80 cellules — 20 actifs × 4 échelles — contre un
modèle nul apparié en sens, en distance de stop et en rapport cible/stop.

```
cellules testées              74   (6 écartées par les seuils pré-enregistrés)
p brut ≤ 0,05                  3
attendu par pur hasard       3,7
survivantes après BH           0
corrélation moyenne         0,60   → 74 cellules ≈ 1,65 observation indépendante
```

Trois cellules sous 0,05 quand le hasard en produit 3,7 : le criblage trouve
**moins** que le bruit n'en fabrique.

## Sur les dix actifs que le bot trade réellement

C'est la question qui compte, puisque c'est l'univers dans lequel le bot vit.

```
40 cellules · 20 à R moyen positif — un pile ou face
R moyen médian            −0,009
taux de réussite médian   41,0 %   pour un équilibre à 40,0 %
R total cumulé            −13,6
survivantes                  0
```

Le taux d'équilibre vient de la géométrie de sortie, pas du signal : avec une
cible à 1,5 fois la distance du stop, il faut gagner 1/(1+1,5) = 40 % des
trades pour ne rien perdre avant frais. **La stratégie gagne 41 %.** Elle est à
l'équilibre à un point près, et les frais sont ce point.

## Le survivant qui n'en était pas un — deuxième du nom

À 2 000 tirages, **ARB 4h** passait Benjamini-Hochberg avec p = 0,00050 — soit
exactement le plancher du test, 1/2001. Un p au plancher n'est pas un p mesuré :
c'est tout ce que la résolution permettait de dire.

Relancé à 20 000 tirages, avec une graine distincte :

```
R moyen observé   +0,6529
nul, R moyen      +0,0080   (écart-type 0,1974)
tirages battus    15 sur 20 000
p                 0,00080   > seuil au rang 1 : 0,000676
```

Il ne survit pas. C'est à la décimale près ce qui était arrivé au desk avec
`tsmom BTC 1d` — p = 0,0005 à 2 000 tirages, 0,00105 à 20 000. La leçon était
écrite ; elle a servi.

Un effet à 3,3 écarts-types sur une cellule isolée, parmi 74 hypothèses
corrélées, c'est ce qu'on attend du hasard : 0,0008 × 74 ≈ 0,06 faux positif à
ce niveau. En voir un n'a rien de remarquable.

## Ce que le hors-échantillon a quand même montré

Les dix perps jamais réglés font mieux que les dix du bot : R total +40,7 contre
−13,6, R médian +0,055 contre −0,009. Aucune de leurs cellules ne survit, mais
l'asymétrie mérite qu'on la lise.

Elle ne vient pas d'un sur-ajustement : Donchian 20 et Supertrend 10×3 sont des
réglages de manuel, jamais optimisés sur ces actifs. Elle vient de *quels*
actifs ont chuté. ARB, INJ, OP, APE, DYDX ont perdu l'essentiel de leur valeur
sur la période ; un suiveur de tendance qui sait vendre à découvert en profite.
C'est le régime du marché, pas un talent de timing — et le nul apparié en sens
le confirme en ne laissant rien survivre.

**Additionner des R à travers des cellules n'est pas une courbe d'équité.**
Trente-quatre instances corrélées à 0,62 ne peuvent pas tourner ensemble sur un
compte, et « +40,7 » ne décrit aucun rendement atteignable.

## Le financement, et une erreur de ma part

`fundingHistory` d'Hyperliquid ne sert qu'une cinquantaine de jours ; les bougies
remontent à 2022. Le financement n'est compté que sur 36 % du temps en position.

J'avais prédit par écrit que ce trou **flattait** la stratégie, parce que le
moteur serait « structurellement long ». C'était faux. Mesuré sur 2 517 trades :
54 % des trades sont longs, mais **62 % du temps en position est court** — les
courts d'un marché baissier courent longtemps avant d'atteindre un stop lointain.
L'affirmation venait du compte live, 100 % long pendant les quatre jours
observés : un échantillon d'une semaine, généralisé.

Le signe de l'erreur n'est pas connaissable ici — le taux de 2026 appliqué aux
courts de 2022, année de financement souvent négatif, n'a pas de sens. Son
ordre de grandeur est borné à environ 6 R sur la grille, et il ne touche pas le
verdict : les p sont calculés contre un nul apparié en sens, soumis au même
traitement.

## Ce que la campagne a révélé du moteur lui-même

Sur ETH 12h : **355 signaux, 16 trades.** 95 % des signaux tombent pendant
qu'une position est déjà ouverte et sont ignorés. Les stops Donchian y sont à
19 % du prix en médiane, jusqu'à 67 % ; un trade a duré 1 297 barres — 648 jours.
Ce n'est plus du trading, c'est une détention avec un stop.

C'est aussi ce qui rend la règle de risque du bot incompatible avec la stratégie
telle qu'elle est écrite : `GSD_MAX_STOP_FRAC` refuse tout stop au-delà de 15 %,
et sur les échelles longues ce refus couvre la majorité des signaux.

## Méthode : ce qui est acquis

- **Les règles ont été commitées avant les chiffres** (`e1217ec`). Les deux
  addenda sont datés, et le second corrige le premier plutôt que de le réécrire.
- **Le port est vérifié causal**, par rejeu de `readEngines` sur la série
  tronquée : 400 indices, 43 signaux, zéro écart.
- **L'univers hors échantillon est calculé** depuis l'ordre de listing de
  l'exchange, jamais écrit à la main.
- **Un p au plancher se revalide** avant d'être appelé survivant.
- **La corrélation est rendue à côté du compte de cellules.**

## Ce qui reste ouvert

- Aucune variante du moteur n'a été testée — ni time-stop, ni autre rapport
  cible/stop, ni filtre de régime. Chaque variante ajoutée augmente le nombre
  d'hypothèses, donc de faux positifs attendus. Avant d'en tester une, se
  demander si elle a une raison économique d'exister, ou seulement l'espoir de
  faire apparaître une survivante.
- Le seul edge qui ait survécu dans l'un ou l'autre projet est celui du desk
  sur les **déblocages de jetons** : baisse anticipée entre J−7 et J−1, dose-
  réponse monotone avec la taille du déblocage, quatre cellules survivantes à
  Benjamini-Hochberg, et six contrôles tenus dont un décalage calendaire en bloc.
  Ce n'est pas le GSD, mais c'est la seule piste que les données soutiennent.
