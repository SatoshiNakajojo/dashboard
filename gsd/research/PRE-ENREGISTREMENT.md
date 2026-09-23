# Pré-enregistrement — les deux moteurs du GSD ont-ils un edge ?

**Écrit le 23/09/2026, avant d'avoir calculé un seul résultat.** Ce fichier
existe pour que les règles ne puissent pas être retouchées après avoir vu les
chiffres. C'est la seule protection contre la façon la plus discrète de truquer
un test : déplacer la cible.

## L'hypothèse, en une phrase

Le moteur de signal du GSD — cassure Donchian 20, à défaut retournement
Supertrend 10×3, tel qu'il est écrit dans `src/lib/desk/strats.ts` — produit des
trades d'espérance positive **nette de frais et de financement**, et
distinguable d'entrées aléatoires soumises à la même géométrie de sortie.

## Ce que la campagne peut conclure, et ce qu'elle ne peut pas

Elle peut **réfuter**. Un résultat négatif sur cette grille dit où ne pas mettre
d'argent, et c'est un résultat.

Elle ne peut pas **confirmer** un edge exploitable. Sept mois d'historique sur
des actifs corrélés ne font pas un échantillon indépendant, et la leçon la plus
chère du desk est précisément là : quatorze cellules corrélées à 0,58 valaient
moins de deux observations. La taille d'échantillon effective est donc calculée
et rendue, pas supposée.

## Univers — calculé, jamais écrit à la main

**In-sample** : les dix actifs que le bot trade, tels que `types.ts` les
déclare. BTC, ETH, SOL, BNB, XRP, DOGE, AVAX, LINK, SUI, APT.

**Hors-échantillon** : les dix perps Hyperliquid les plus anciennement listés
qui ne sont *pas* dans la liste ci-dessus, pris dans l'ordre d'index du
`meta` de l'exchange. Cet ordre est fixé par Hyperliquid, pas par moi, et il
maximise l'historique disponible. La liste n'est pas écrite ici : elle est
**recalculée** à chaque exécution depuis l'API.

Les actifs sans historique suffisant sortent par le seuil ci-dessous, pas par
un choix.

## Échelles de temps

Les quatre du bot : 15m, 1h, 4h, 12h. Soit **20 actifs × 4 échelles = 80
cellules**.

## Seuils fixés maintenant

| | valeur | pourquoi |
|---|---|---|
| Historique minimal | **800 barres** | le seuil du desk, fixé avant de regarder |
| Trades minimaux par cellule | **10** | sous ce compte une moyenne ne veut rien dire |
| Tirages du modèle nul | **2 000** | plancher de p = 1/2001 = 0,0005 |
| Frais | **4,5 bps taker, à l'aller ET au retour** | le taux Hyperliquid, celui que le compte a réellement payé |
| Financement | **réel, horaire, par actif** | `fundingHistory` de l'exchange, pas une moyenne |

Le plancher de p, 0,0005, est **sous** le seuil de Benjamini-Hochberg au rang 1
pour 80 cellules (0,05/80 = 0,000625). Le criblage peut donc rejeter. Si ce
n'était pas le cas, un « zéro survivant » ne mesurerait que sa propre
résolution — et il faudrait le dire au lieu de conclure.

## Règles de trade — portées à l'identique depuis `strats.ts`

Le but est de tester la stratégie **telle qu'elle tourne**, pas telle que je la
comprends. Le port est littéral, y compris :

- `lastClosed()` écarte la barre en formation. Aucun look-ahead.
- Donchian est calculé sur les **hauts et bas**, pas les clôtures.
- Donchian a la **priorité** : Supertrend ne parle que si Donchian se tait.
- Un retournement Supertrend depuis une direction nulle ne compte pas — `0` est
  falsy en JavaScript, et le port le reproduit.
- `i >= 25` avant tout signal.

Signal long Donchian : la clôture précédente était sous le plus haut des 20
barres précédentes, et la clôture courante passe au-dessus. Stop = le plus bas
des 20 barres (ou −3 % s'il manque). Cible = entrée + 1,5 × la distance au stop.
Court : symétrique.

Retournement Supertrend : la direction change. Stop = la ligne. Cible = 1,5 R.

## Modèle d'exécution — choisi pessimiste là où il y a un doute

- **Entrée à l'ouverture de la barre suivante.** Le signal est connu à la
  clôture ; le pilote ne tourne que toutes les quinze minutes. Entrer à la
  clôture du signal serait un look-ahead déguisé.
- **Sortie intra-barre.** Si la barre touche le stop, sortie au stop. Si elle
  touche la cible, sortie à la cible. **Si elle touche les deux, le stop
  l'emporte** — on ne s'accorde pas le bénéfice du doute.
- **Une position à la fois par cellule.** Les signaux émis en position sont
  ignorés, comme le bot le fait avec `GSD_MAX_OPEN`.
- **Pas de time-stop.** `strats.ts` n'en a pas. Celui de `manage.server.ts`
  (24 h) est testé séparément, comme variante, et non comme règle principale.

## Le modèle nul — ce contre quoi on mesure

Pour chaque cellule, 2 000 tirages. Chaque tirage rejoue **le même nombre de
trades, le même sens, la même distance de stop et le même rapport 1,5 R**, à
des dates d'entrée tirées au hasard dans la même série.

Le nul paie donc exactement les mêmes frais et subit le même financement. Ce
qui reste de l'écart est du signal, pas du coût. C'est la seule façon de ne pas
confondre « ma stratégie gagne » avec « être en position gagne ».

Un second nul, à durée appariée et sortie au marché, est rendu à titre de
contrôle.

## Statistique

- Par cellule : **R moyen par trade**, R total, taux de réussite, p contre le
  nul.
- **Benjamini-Hochberg** sur les 80 cellules. Valide sous dépendance positive,
  contrairement au test de signe — qui compte les cellules comme indépendantes
  et qui est précisément l'erreur qui a coûté une campagne au desk.
- **Corrélation moyenne** des rendements quotidiens des actifs, et taille
  d'échantillon effective `n / (1 + (n−1)·ρ)`. Rendue à côté du compte de
  cellules, pour que le nombre de cellules ne flatte plus l'œil.
- Les p ne sont **pas arrondis**. `round(p, 4)` écrase à 0,0 tout p sous
  0,00005 — une valeur impossible, et qui flatte.

## Ce qui serait un succès

Une cellule qui survit à Benjamini-Hochberg **et** dont le signe se reproduit
hors échantillon. Rien d'autre ne compte comme edge.

Une moyenne positive sans survivante après correction n'est pas un edge : c'est
le bruit qu'on attend de 80 hypothèses.

## Une déviation, déclarée

Les bougies viennent de **Hyperliquid**, pas de Binance dont le bot se sert
(`market.ts`). Binance est inatteignable depuis la machine qui exécute cette
campagne. Même sous-jacent, carnet différent ; sur des barres de 15 minutes à
12 heures l'écart est négligeable, et Hyperliquid est la plateforme où
l'exécution a réellement lieu. C'est déclaré ici parce qu'une déviation non
déclarée est une déviation qui finit par expliquer un résultat.
