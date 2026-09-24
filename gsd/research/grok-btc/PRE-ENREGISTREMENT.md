# Pré-enregistrement — la règle BTC proposée par Grok (Donchian 25/10, long seul)

Écrit le 24 septembre 2026, **avant tout calcul sur cette règle**. La date du
commit qui ajoute ce fichier fait foi.

## La règle, telle que Grok l'énonce

BTC seul, en journalier. Achat au plus haut des 25 derniers jours, sortie au
plus bas des 10 derniers jours. Une fois le notionnel, à plat le reste du
temps. Pas d'alt, pas de short, pas de levier.

Chiffres annoncés, du 19/08/2020 au 24/09/2026 : comptant +613 %, repli
−77 % ; règle +901 % frais inclus, +710 % après le funding réel payé depuis
2024 ; repli −34 % ; en position 37 % du temps ; réussite 43 % ; trade
médian −1,9 %.

C'est, à un paramètre près, le « Système 1 » des Turtles (20/10), que le desk
a déjà gelé pour un test en avant (`turtle_btc_1d`, 15/09/2026). Grok a
retenu 25 au lieu de 20, sans dire combien de valeurs il a essayées.

## Données

- **Hyperliquid**, `candleSnapshot` BTC 1d : 19/08/2020 → 23/09/2026, barres
  closes seulement (la bougie du 24/09, en cours, est exclue). Avant le
  26/02/2023 le volume est nul : ce sont des prix importés par Hyperliquid.
- **CoinMetrics** (dépôt public `coinmetrics/data`), `PriceUSD`, clôture
  quotidienne : 01/01/2013 → 18/08/2020, pour le hors échantillon. Clôtures
  seulement : la règle y est jouée en version « clôture » (plus haute des 25
  dernières clôtures, plus basse des 10 dernières), déclarée comme une
  approximation. Sa fidélité est mesurée sur la période commune.

## Reproduction

Trois exécutions de la même règle : (A) ordres stop intrajournaliers aux
niveaux du canal, remplis au pire de l'ouverture et du niveau ; (B) signal
et exécution à la clôture ; (C) signal à la clôture, exécution à
l'ouverture suivante. Frais : 4,5 bps par côté. Le funding réel
d'Hyperliquid est retiré à partir du 01/01/2024.

## Tests

1. **Timing, contre un modèle nul par décalage circulaire.** Le calendrier
   d'exposition de la règle — mêmes entrées, mêmes durées, même exposition —
   est décalé en bloc de k jours, pour tous les k à au moins 30 jours de
   l'alignement réel. Statistique : rendement log total, net de frais.
   p unilatéral = part des décalages qui font au moins aussi bien. Le repli
   maximal est rapporté de la même façon.
2. **Hors échantillon, 01/01/2013 → 18/08/2020** (CoinMetrics, version
   clôture, mêmes paramètres 25/10, aucun ajustement) : même test de
   décalage ; comparaison au comptant en rendement, repli maximal et MAR
   (rendement annualisé / |repli maximal|). Départs au 01/01/2015 et au
   01/01/2017 rapportés en sensibilité, sans entrer dans le verdict.
3. **Grille** : entrée {10, 15, 20, 25, 30, 40, 55, 70, 100} × sortie
   {5, 10, 15, 20, 30} : rang de 25/10, et part de la grille qui bat le
   comptant en MAR, sur chaque période.
4. **Date de départ** : pour chaque départ mensuel de septembre 2020 à
   septembre 2025, la règle bat-elle le comptant au 23/09/2026 ?

## Critères, fixés avant de voir

- **Timing démontré** : p < 0,05 au test 1 sur la période hors échantillon.
  Sur 2020–2026, où Grok a choisi ses paramètres, le p est descriptif.
- **Règle robuste** : 25/10 n'est pas un pic isolé — au moins 60 % de la
  grille bat le comptant en MAR, sur les deux périodes.
- **Intégration au GSD** comme stratégie seulement si les deux critères
  tiennent. Sinon, au mieux comme gestion d'exposition au BTC, déclarée
  comme telle, et jamais présentée comme un edge.

## Mes prédictions

1. La variante A reproduit le total annoncé à ±15 %.
2. Sur 2020–2026, le p du décalage est entre 0,05 et 0,30 : un seul marché
   baissier, peu de puissance.
3. Hors échantillon, la règle réduit fortement le repli (2014, 2018) et bat
   le comptant en MAR, avec p < 0,05.
4. La grille forme un plateau : plus de 60 % des combinaisons battent le
   comptant en MAR.
