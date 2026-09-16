# Données — échelles, sources, et ce que le réseau permet

## Ce que Hyperliquid sert vraiment

Le briefing parle d'un « historique HL ~1000 bougies ». Mesuré le 16 septembre
2026 sur BTC, depuis janvier 2025 :

| échelle | bougies | couverture |
|---|---|---|
| 4 h | 3 703 | ~617 jours |
| 8 h | 1 852 | ~617 jours |
| 12 h | 1 235 | ~617 jours |
| 1 j | 618 | ~618 jours |

**L'historique n'est pas « ~1000 bougies » dans l'absolu : il dépend de
l'échelle**, et en journalier il est plus court que ça. Le nombre de bougies
disponibles est à peu près inversement proportionnel à la durée de la barre,
ce qui est attendu — c'est la même fenêtre calendaire découpée plus finement.

Conséquence contre-intuitive et utile : **descendre en échelle donne plus de
barres, pas moins**. Le 12 h remonte à mars 2024 avec 1 800 barres quand le
journalier n'en a que 618.

## 8 h et 12 h sont servis, et le dépôt ne les demandait pas

Le briefing les met en priorité — moins sensibles au bruit micro que le 15 m.
Ils n'étaient pas dans la table d'intervalles du dépôt : c'était une omission,
pas une limite de l'API. Ajoutés, avec les trois actifs collectés en 12 h sur
900 jours.

La table vit désormais dans `features/bars.py` **et nulle part ailleurs** :
`pilote_regles.py` en portait une copie, et deux tables d'intervalles qui
divergent se voient comme une entrée datée de la mauvaise heure — donc
silencieusement.

## Le croisement CEX est bloqué, et ce n'est pas un manque de code

Testé depuis cette machine :

    api.hyperliquid.xyz   200
    api.binance.com       000
    api.kraken.com        000
    api.bybit.com         000

**Aucun CEX n'est joignable.** Compléter l'historique par un croisement
externe demande une machine dont la politique réseau l'autorise ; écrire ici
un collecteur qui ne peut pas tourner donnerait l'illusion d'une capacité.

Ce qui est faisable sans réseau supplémentaire : descendre en échelle. Le
12 h sur 900 jours couvre 2,5 ans, soit quatre fois la fenêtre de 208 jours
utilisée par le rapport de l'agent externe.

## Frais et funding dans les simulations

Déjà pris en compte par `backtest/costs.py`, sur tout chemin de backtest :

- **frais taker** 4,5 bps par côté, maker 1,5 ;
- **glissement** 3 bps par côté — mesuré à 0,05–0,21 bps à la taille du desk,
  donc conservateur d'un facteur quinze à soixante ;
- **funding** 0,125 bps/heure payé par le côté long, soit la composante de
  taux d'intérêt Hyperliquid ramenée à l'heure.

Ce dernier chiffre a été faux une fois, à 1,0 bps/h — huit fois trop haut, par
confusion entre le taux 8 h et le taux horaire. L'erreur taxait 0,24 % de
notionnel par jour et condamnait mécaniquement toute stratégie exposée.

## Ce que le catalogue rend en 12 h, et comment le lire

Mesure du 16 septembre 2026, onze stratégies × trois actifs, 900 jours :

**Sept cellules franchissent les deux portes**, contre une seule sur la
fenêtre 1 h de 208 jours. Mais il faut lire la colonne d'à côté :
l'achat‑conservation rend **−15,1 % sur ETH et −24,4 % sur SOL** sur cette
période, et **+3,2 % sur BTC**.

Les sept passantes sont toutes sur ETH ou SOL, aucune sur BTC. **Elles battent
l'achat‑conservation surtout parce qu'il a perdu**, pas parce qu'elles ont
gagné : leurs rendements vont de +0,5 à +3,2 %/an.

Et aucune n'est passée au modèle nul. Ce sont des candidates au sens du
scorer, pas des résultats.
