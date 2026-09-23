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

---

## 23/09 — le script reçu : la cause est trouvée, et vérifiée

`paper_supertrend_live.py` a été fourni. `script_du_desk.py` porte son
`supertrend()` et son `check_exit()` **ligne pour ligne** et les rejoue sur les
208 jours.

### Le défaut

```python
if st is not None:
    if side == "long" and st > stop:
        stop = st                  # ← remonté AVANT de vérifier la barre
...
stop_hit = lo <= stop if side == "long" else hi >= stop
if stop_hit:
    return {"event": "exit", "exit_px": stop, "reason": "stop", ...}
```

Le stop est remonté avec la ligne Supertrend **de la barre en cours** avant de
vérifier si cette barre l'a touché. Sur une barre de retournement, cette ligne
n'est plus la bande basse : c'est la **bande haute**, au-dessus du prix. Le code
la prend pour stop (elle est bien « plus haute »), constate que le bas de la barre
est en dessous — forcément — et enregistre la sortie **à la bande haute : un prix
au-dessus du plus haut de la barre, jamais coté**. Symétriquement pour un court.

### La vérification

| | n | réussite | E[R] | PF |
|---|---:|---:|---:|---:|
| **déclaré par le desk** | 120 | 55,8 % | **+0,222** | 1,92 |
| code du desk tel quel (ATR Wilder) | 149 | 54,4 % | **+0,217** | 1,88 |
| code du desk, `check_exit` corrigé | 149 | 35,6 % | **−0,140** | 0,67 |

Le code tel quel **retrouve le backtest déclaré à la deuxième décimale.** Sur ses
149 sorties, **54 sont enregistrées hors de la barre**, en moyenne **+0,57 R
au-delà du prix coté**. Corrigé, il perd.

`hl_common.atr_series` n'a pas été fourni ; une ATR en moyenne simple donne
+0,319 (tel quel) et −0,121 (corrigé). Le verdict ne dépend pas de ce choix.

L'hypothèse pré-enregistrée (prédiction 2) visait ce mécanisme mais dans sa forme
prudente — ligne de la barre en cours *seulement si la direction n'a pas changé*.
C'est la forme brute, celle qui franchit le retournement, qui est dans le code.

### Ce que ça veut dire

**Supertrend V3-1B ne passe pas les critères du desk lui-même** une fois corrigée :
E[R] −0,140 pour un seuil à +0,05, PF 0,67 pour un seuil à 1,1. Son PASS reposait
entièrement sur des prix impossibles.

Et le même `check_exit` écrit les événements du **paper** : chaque trade qui se
termine sur une barre de retournement y est inscrit comme sortant à la bande
opposée. Un relevé paper produit par ce code est structurellement gagnant.

### Deux défauts de plus, propres au paper — lus dans le code, non quantifiés

1. **La barre en formation est traitée comme close.** Hyperliquid renvoie la
   bougie en cours ; `df.iloc[-1]` est donc une barre vieille de cinq minutes à
   chaque passage de :05. La boucle de gestion la marque traitée
   (`last_processed_bar_ts`), et le passage suivant la saute. **Une barre sur
   deux n'est jamais vue que sur ses cinq premières minutes** : un stop touché
   pendant les 55 autres n'est jamais constaté.
2. **Les entrées ne sont cherchées que sur la dernière barre**, et la routine
   tourne toutes les deux heures : les retournements de la barre intermédiaire
   ne sont jamais vus. Le paper n'échantillonne qu'une partie des signaux — et
   sur une barre incomplète, dont le signal peut disparaître à la clôture.

---

## Le relevé paper, rejoué : d'où viennent « que des gagnants »

`corrige/simulation_paper.py` fait tourner le logger — l'original et le corrigé —
comme la routine du desk, passage par passage, sur les 50 derniers jours.
L'API simulée rend, comme Hyperliquid, les bougies closes **et la bougie en
cours**, reconstituée depuis le premier quart d'heure de l'heure (les passages
ont donc lieu à :15 plutôt qu'à :05 — déclaré, le mécanisme est le même).

| | trades | réussite | E[R] | PF | sorties à un prix jamais coté |
|---|---:|---:|---:|---:|---:|
| **logger d'origine, toutes les 2 h** | **8** | **62,5 %** | **+0,492** | **11,78** | **6 sur 8** |
| logger corrigé, toutes les heures | 32 | 34,4 % | −0,167 | 0,64 | 0 |

Le logger d'origine ne voit qu'un trade sur quatre, et en inscrit six sur huit à
un prix que le marché n'a pas coté. **C'est lui qui fabrique le relevé
gagnant.** Correctement enregistrée, la stratégie perd sur la même période, en
cohérence avec le backtest corrigé (35,6 %, −0,140).

## Le correctif

Livré à part — le dépôt est public, le script est celui du desk. Trois
corrections, aucun paramètre modifié :

1. **`check_exit`** : le stop en place pendant une barre est celui connu à la
   clôture précédente ; il n'est remonté qu'après les vérifications, jamais
   par-dessus un retournement ; une sortie au stop se fait au pire de
   l'ouverture et du stop.
2. **Barres closes seulement** : la bougie en cours est écartée.
3. **Toutes les barres closes depuis le passage précédent**, rejouées dans
   l'ordre, pour les sorties et les entrées.

Le script corrigé refuse de démarrer sur un état ou un journal de l'ancienne
version : ils ont été écrits par le `check_exit` défectueux, et doivent être
archivés. Vérifié dans le banc d'essai : zéro passage en échec sur 1 200.

**Le correctif ne rend pas V3-1B gagnante. Il la rend mesurable, et la mesure
dit qu'elle perd.** Par les propres critères PASS du desk, elle doit sortir du
cadre live v1.
