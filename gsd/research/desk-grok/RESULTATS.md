# Les stratégies du desk Grok, reproduites — résultats

Règles et prédictions : `PRE-ENREGISTREMENT.md`, commité avant tout calcul.
Code : `reproduction.py`. Données : bougies Hyperliquid 1h BTC/ETH/SOL, 5 001
barres alignées, du 26/02 au 23/09/2026 — **208 jours, la fenêtre même du
backtest déclaré.**

## Supertrend V3-1B : ne se reproduit pas

| | n | réussite | E[R] | PF | max DD |
|---|---:|---:|---:|---:|---:|
| **déclaré par le desk** | 120 | 55,8 % | **+0,222** | 1,92 | −2,3 % |
| fidèle à la description, 3,5 bps | 146 | 37,0 % | **−0,105** | 0,74 | −7,7 % |
| à anticipation (ligne de la barre en cours) | 146 | 37,0 % | −0,105 | 0,74 | −7,7 % |
| entrée à l'ouverture suivante | 146 | 37,0 % | −0,106 | 0,74 | −7,7 % |
| 4,5 bps (taux réel du compte) | 146 | 36,3 % | −0,114 | 0,72 | −8,1 % |

Sur les mêmes 208 jours, avec les mêmes frais, les règles telles qu'elles sont
décrites **perdent**. Aucun des trois actifs n'est positif : BTC −0,106,
ETH −0,155, SOL −0,003.

**Contre son modèle nul, elle fait pire que le hasard.** Entrer à une date
aléatoire dans le sens de la tendance Supertrend en cours, avec le même stop
suiveur, donne +0,095 en moyenne (écart-type 0,254) ; la stratégie donne −0,105.
p = 0,77. Entrer *au retournement* est précisément le plus mauvais moment pour
entrer — c'est là que se concentrent les faux départs.

**Hors échantillon**, mêmes règles figées sur 16 autres perps : 7 positifs sur 16,
E[R] médian −0,020.

## Donchian B′ : se reproduit — et c'est ce qui valide la méthode

| | n | réussite | E[R] | PF | max DD |
|---|---:|---:|---:|---:|---:|
| **déclaré par le desk** | 193 | 29 % | **+0,106** | 1,24 | −3,7 % |
| fidèle à la description, 3,5 bps | 205 | 30,7 % | **+0,122** | 1,29 | −3,0 % |
| 4,5 bps (taux réel du compte) | 205 | 30,7 % | +0,105 | 1,24 | −3,2 % |

Les chiffres collent. La reproduction retrouve donc le résultat du desk quand la
description est fidèle — ce qui rend l'échec de V3-1B informatif : ce n'est pas
la méthode qui échoue, c'est V3-1B.

**Contre son nul, elle passe : p = 0,022.** C'est le premier p sous 0,05 sur une
stratégie du desk. Trois raisons de ne pas en faire un edge :

1. **La recherche qui l'a produite.** Le desk a essayé au moins treize
   stratégies ou variantes avant d'en retenir deux (section 6 de sa propre
   description). Au rang 1 d'une correction de Benjamini-Hochberg sur treize
   hypothèses, le seuil est 0,05/13 = 0,0038. p = 0,022 ne le franchit pas. La
   meilleure de treize tentatives sur une seule fenêtre ressemble à ça par
   construction.
2. **Hors échantillon, elle ne tient pas.** Mêmes règles figées sur 16 autres
   perps : 7 positifs sur 16, E[R] médian **−0,021**.
3. **Un seul actif la porte.** SOL +0,287 sur 53 trades ; BTC +0,054 sur 111. Le
   desk l'avait lui-même noté — « edge surtout ETH/SOL ».

Donchian B′ décrit bien SOL entre février et septembre 2026. Elle ne décrit pas
un edge.

## Mes prédictions, confrontées

| prédiction | verdict |
|---|---|
| 1. L'implémentation correcte ne reproduit pas 55,8 % et +0,222 | **tient** — 37,0 % et −0,105. La réussite tombe dans la fourchette prédite (35-45 %) ; l'E[R] sort de la mienne (−0,1 à +0,1) par le bas. |
| 2. L'implémentation à anticipation s'en approche nettement | **fausse** — elle donne exactement les mêmes chiffres. La ligne Supertrend est à trois ATR du milieu de la barre : elle ne dépasse presque jamais le plus bas de sa propre barre, et l'utiliser en avance ne change rien. |
| 3. Contre le nul, l'implémentation correcte n'est pas significative | **tient** — p = 0,77, et la stratégie fait moins bien que le nul. |

La deuxième était l'hypothèse qui devait expliquer l'écart. Elle ne l'explique
pas. L'écart entre −0,105 et +0,222 a donc une autre cause, que seul le script du
desk peut dire.

## Sondes exploratoires — non pré-enregistrées

Écrites *après* avoir vu que l'hypothèse pré-enregistrée échouait, pour orienter
la lecture du script du desk. Ce ne sont pas des résultats : ce sont des pistes.

| | n | réussite | E[R] | PF |
|---|---:|---:|---:|---:|
| fidèle | 146 | 37,0 % | −0,105 | 0,74 |
| **A — entrée au prix de la barre k−1** | 145 | 49,7 % | **+0,453** | **2,45** |
| B — sortie à la clôture plutôt qu'au stop | 146 | 40,4 % | −0,118 | 0,72 |

Décaler l'entrée d'une seule barre — décider sur la clôture de la barre k, être
rempli au prix d'avant son mouvement — suffit à transformer une stratégie
perdante en une stratégie qui dépasse ce que le desk déclare. Ça ne prouve pas
que le script du desk le fait : ses chiffres ne coïncident pas avec cette sonde.
Ça montre qu'une erreur d'une barre suffit, et ça dit où regarder en premier.

## Ce qu'il faut pour conclure sur V3-1B

Le script `scripts/paper_supertrend_live.py` et le backtest qui l'a validé. La
question à lui poser est précise : **à quel prix, et à quelle barre, l'entrée est-
elle remplie par rapport à la barre qui a produit le signal ?**
