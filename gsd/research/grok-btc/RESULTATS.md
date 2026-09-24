# La règle BTC de Grok — résultats

Protocole : `PRE-ENREGISTREMENT.md`, commité avant tout calcul (c1ae967).
Programme : `regle_grok.py`. Chiffres complets : `resultats.json`.

## 1. Les chiffres de Grok sont exacts

Variante A — ordres stop posés aux niveaux du canal, frais 4,5 bps par côté,
barres closes du 19/08/2020 au 23/09/2026 :

| | annoncé par Grok | reproduit |
|---|---:|---:|
| comptant | +613 %, repli −77 % | +617 %, repli −77 % |
| règle | +901 % | +930 % |
| règle, funding réel retiré depuis 2024 | +710 % | +733 % |
| repli de la règle | −34 % | −34 % |
| temps en position | 37 % | 37 % |
| réussite | 43 % | 43 % (37 trades) |
| trade médian | −1,9 % | −2,4 % |

| année | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---:|---:|---:|---:|---:|---:|---:|
| comptant | +146 % | +60 % | −64 % | +156 % | +121 % | −6 % | −4 % |
| règle, annoncé | +129 % | +38 % | −15 % | +96 % | +64 % | +6 % | +11 % |
| règle, reproduit | +129 % | +38 % | −15 % | +96 % | +64 % | +6 % | +12 % |

Le tableau annuel se retrouve au point près. C'est un backtest honnête.

**L'exécution compte.** Jouée sur signal de clôture (variantes B et C), la
même règle rend +370 % avec un repli de −50 %. Elle doit être exécutée par des
ordres stop posés chez l'exchange aux niveaux du canal — ce qu'elle suppose.

La règle est en position depuis le 21/09/2026, entrée à 82 268 $.

## 2. Contre le hasard : le timing est réel, la protection l'est moins

Le calendrier d'exposition de la règle, décalé en bloc de k jours pour tous
les k à au moins 30 jours de l'alignement réel (version clôture, D) :

| période | rendement log, règle | hasard, en moyenne | p | repli, règle | hasard, médian | p |
|---|---:|---:|---:|---:|---:|---:|
| 2020–2026 (descriptif) | +2,10 | +0,61 | 0,030 | −42 % | −58 % | 0,10 |
| **2013–2020, hors échantillon** | **+7,23** | **+2,44** | **0,0004** | −68 % | −71 % | 0,28 |

Hors échantillon, **aucun des 2 727 décalages ne fait aussi bien** : 0,0004
est le plancher du test. Sensibilité : p = 0,001 depuis 2015, 0,002 depuis
2017.

Le repli, lui, n'est pas meilleur que celui d'une exposition aléatoire de même
taille (p = 0,28). **La règle réduit le repli parce qu'elle est hors du
marché 62 % du temps, pas parce qu'elle sait sortir avant les chutes.** Ce
que le timing apporte, c'est d'être dedans pendant les grandes hausses.

## 3. Hors échantillon, année par année

CoinMetrics, clôtures, mêmes paramètres 25/10, aucun ajustement. Fidélité
vérifiée sur la période commune : +614 % contre +664 % sur Hyperliquid,
repli −41 % contre −42 %.

| année | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020* |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| comptant | +5 372 % | −56 % | +34 % | +126 % | +1 337 % | −74 % | +94 % | +67 % |
| règle | +3 418 % | −11 % | +43 % | +107 % | +749 % | −25 % | +76 % | +33 % |

\* jusqu'au 18/08/2020.

| départ | règle | comptant | repli règle | repli comptant | MAR règle | MAR comptant |
|---|---:|---:|---:|---:|---:|---:|
| 01/01/2013 | × 1 385 | × 899 | −68 % | −85 % | 2,32 | 1,70 |
| 01/01/2015 | +4 314 % | +3 708 % | −43 % | −84 % | 2,24 | 1,08 |
| 01/01/2017 | +1 349 % | +1 102 % | −43 % | −84 % | 2,54 | 1,18 |

Même forme que sur 2020–2026 : moins que le comptant dans chaque année de
hausse, beaucoup moins de pertes dans les deux marchés baissiers.

## 4. La grille : 25/10 est le meilleur réglage de 2020–2026, et un réglage moyen avant

MAR (rendement annualisé / |repli maximal|), 45 combinaisons :

| période | part qui bat le comptant | rang de 25/10 |
|---|---:|---:|
| 2020–2026, variante A | 58 % | **1 sur 45** |
| 2020–2026, variante D | 60 % | 7 sur 45 |
| 2013–2020, variante D | **96 %** | 14 sur 45 |

Sur la période où Grok l'a choisie, 25/10 est un pic : MAR 1,05, contre 0,44
pour 20/10 et 0,71 pour 30/10. Sur la période qu'elle n'a pas vue, elle est
au milieu d'une famille qui bat presque entièrement le comptant. Le +930 %
est flatté par le choix du réglage ; la famille, elle, tient.

## 5. Dates de départ

Sur 61 départs mensuels de septembre 2020 à septembre 2025, 43 finissent
devant le comptant au 23/09/2026 et **les 61 ont un repli plus faible**.
Départs en 2023 : 0 sur 12 devant. Départs en 2024 : 12 sur 12 devant
(01/01/2024 : +95 % contre +91 %). Grok écrit qu'un départ en 2024 serait
derrière ; ses propres règles disent le contraire.

## Mes prédictions, confrontées

1. **Juste.** La variante A reproduit le total à 3 % près (+930 % contre +901 %).
2. **Fausse.** J'attendais un p entre 0,05 et 0,30 sur 2020–2026 : il vaut
   0,030.
3. **Juste en partie.** Hors échantillon, MAR meilleur et p = 0,0004. Mais
   le repli « fortement réduit » ne l'est que depuis 2015 (−43 % contre
   −84 %) ; depuis 2013 il vaut −68 % contre −85 %, et il n'est pas meilleur
   que celui du hasard.
4. **Fausse en 2020–2026, juste avant.** 58 % et 60 % de la grille battent
   le comptant en 2020–2026 ; 96 % en 2013–2020.

## Verdict, selon les critères fixés avant

- **Timing démontré** : oui, p = 0,0004 hors échantillon.
- **Règle robuste** : non. En 2020–2026, variante A, 58 % de la grille bat
  le comptant pour un seuil fixé à 60 % — une case de moins que requis.

Le protocole dit donc : **pas d'intégration comme stratégie à edge ;
intégrable comme gestion d'exposition au BTC, déclarée comme telle.**

Ce que ça veut dire, concrètement : c'est une façon de détenir du BTC 37 à
40 % du temps, pendant ses tendances. Elle ne gagne que si le BTC monte, elle
gagne moins que lui dans chaque année de hausse, et quand il ne monte pas
elle perd lentement — 57 % des trades perdent, médiane −2,4 %. Son avantage
est de ne pas porter tout le marché baissier. Le +930 % de 2020–2026 est
flatté par le choix du réglage ; il faut en attendre moins.

C'est la première règle de tout ce qu'on a testé — GSD, agents Grok, desk —
dont le timing passe un test hors échantillon pré-enregistré.
