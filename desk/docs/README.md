# Base de connaissances du desk

Documents de référence fournis par le porteur du projet, archivés ici parce
que Google Drive est refusé par la politique réseau de l'environnement de
développement et que ces documents doivent vivre avec le code qu'ils décrivent.

`00-manifeste-indexation-rag.md` est l'index maître : il recense ~24 documents
et les associe à une phase, un agent destinataire et des tags d'interrogation.
**Vingt documents sur les vingt-quatre sont présents à ce jour** — le reste est
annoncé comme suivant.

| document | testable avec l'outillage actuel ? |
|---|---|
| `analyse-graphique-candlesticks.md` | **Oui, immédiatement.** Les figures sont formalisées en conditions logiques sur OHLC, et le dépôt a 14 jeux de données réels plus la grille de robustesse. Les taux de réussite annoncés (H&S ~72,3 %, double bottom ~65,8 %) sont des hypothèses à passer au modèle nul, pas des acquis. |
| `analyse-graphique-detection.md` | Oui — `argrelextrema`, Savitzky-Golay et K-Means ne demandent que de l'OHLC. Attention au filtre SG : il est **non causal**, il lisse en regardant des barres futures. Utilisé tel quel dans un backtest, il fabrique une fuite de futur. |
| `analyse-graphique-hft-ofi-vpin.md` | **Non, pas encore.** OFI exige le carnet niveau 1 tick par tick, VPIN exige les trades individuels. `candleSnapshot` ne donne que de l'OHLCV : ces métriques ne sont pas backtestables sur l'historique disponible, elles ne peuvent être validées qu'en avant, en paper trading. |
| `architecture-web-trading-desk.md` | Sans objet — c'est une cible d'infrastructure, pas une hypothèse. Voir la note de séquencement ci-dessous. |

## Note de séquencement

L'architecture décrite (Redis Streams, QuestDB, React/Vite, Prometheus) est
cohérente et correspond à un desk de production. Le dépôt en est loin :
SQLite, une page HTML unique, pas de Redis.

Ce n'est pas un retard à rattraper en priorité. À ce jour, **aucune stratégie
du dépôt ne démontre d'edge** : la grille de robustesse donne une cellule
survivante sur cinquante-six, et le modèle nul a déjà invalidé deux résultats
positifs apparents. Construire QuestDB et un dashboard React avant qu'un edge
existe, c'est bâtir la salle des machines d'un navire dont on ignore s'il
flotte.

L'ordre qui protège le projet est : **un edge mesuré → l'infrastructure qui
l'exploite**, et non l'inverse.


## Deuxième lot : risque, processus, conformité

Une grande partie de ces documents décrit des choses que le dépôt **fait
déjà**. Les douze invariants du moteur de risque recoupent presque un pour un
le tableau des coupe-circuits :

| document | invariant existant |
|---|---|
| Perte de flux WebSocket | `I09_FRESH_DATA` |
| Drawdown journalier de l'équipe | `I03_DAILY_LOSS` |
| Coupure d'urgence / cancel-all | `I10_KILL_SWITCH` |
| Agent wallet sans droit de retrait | `I12_SIGNER_ISOLATION` |
| « la vérité de l'échange prévaut » | `I01_RECONCILED` |
| Écart de prix local vs échange | `price_divergence_bps` |

Non couvert à ce jour : le coupe-circuit de **latence** (> 150 ms → lecture
seule) et le **haircut de levier du week-end**.

### Order netting : le dépôt est structurellement à l'abri

Le document décrit des agents indépendants soumettant des ordres opposés, d'où
un risque de wash trading. Le graphe du dépôt n'émet **qu'un seul mandat** par
cycle, et `max_concurrent_positions=1` : deux ordres contraires ne peuvent pas
coexister. Le risque décrit n'existe pas dans cette architecture — et si un
jour plusieurs mandats coexistent, c'est *à ce moment-là* qu'il faudra le
moteur de netting, pas avant.

### TCA / Almgren-Chriss : juste, mais hors d'échelle ici

Almgren-Chriss résout l'arbitrage entre impact de marché et risque de dérive
pour des **ordres parents qui déplacent le carnet**. Le desk dimensionne des
positions de 44 à 500 $ de notionnel sur des perpétuels dont le carnet se
compte en millions. À cette taille, l'impact est nul et le fractionnement
optimal n'a rien à optimiser.

L'**Implementation Shortfall**, lui, redeviendra utile au P5 : il mesure si
les exécutions réelles correspondent aux hypothèses de `backtest/costs.py`.
C'est une mesure de validation, pas un algorithme d'exécution.

### Risque de week-end : l'assèchement est réel, la prescription ne l'est pas

Seule affirmation chiffrée et falsifiable du lot. Testée par
`scripts/weekend_effect.py` sur 7 actifs, en 4 h et en 1 j :

| | 4 h | 1 j |
|---|---:|---:|
| volume | **−43 %** | **−40 %** |
| amplitude médiane | −27 % | −26 % |
| amplitude p95 | −21 % | −16 % |
| amplitude p99 | −19 % | −18 % |

**L'assèchement de liquidité est confirmé** — −43 % de volume, dans la
fourchette de 40 à 70 % annoncée.

**Les mèches de liquidation ne le sont pas.** L'amplitude baisse aussi, et
elle baisse jusque dans les queues, sur les sept actifs et aux deux échelles
de temps (une seule exception : DOGE au p99 en daily, +14 %). Le week-end
n'est pas plus violent : il est plus calme.

La règle qui en découle — « élargir les stops à 3,5× ATR au lieu de 2× » —
relâcherait donc la protection pendant la période la plus calme. Pire : si
l'ATR est calculé sur une fenêtre glissante mêlant semaine et week-end, un
multiplicateur de 3,5 s'applique à des barres 27 % plus étroites, et le risque
porté augmente sans contrepartie.

*Portée de ce test* : perpétuels Hyperliquid, 833 jours en 4 h et six ans en
1 j. Le volume approxime la profondeur du carnet, imparfaitement. Le mécanisme
décrit dans le document reste plausible — un carnet mince se pousse plus
facilement — mais il ne se traduit pas en mouvements réalisés plus larges sur
cette place et cette période.


## Troisième lot : ML, risque et cahier des charges

### Le critère de Kelly, appliqué aux chiffres réellement mesurés

`autre-risk-management.md` prescrit **deux** choses. Confrontées aux trades
que ce dépôt produit réellement (7 actifs, daily), elles se contredisent d'un
facteur sept. `scripts/kelly_sur_mesure.py` le montre :

| stratégie | trades | p | R | f\* | quarter-Kelly | DD après 8 pertes |
|---|---:|---:|---:|---:|---:|---|
| `ema_cross` | 217 | 0,410 | 1,63 | +0,047 | +0,012 | 9 % |
| `rsi_reversion` | 511 | 0,440 | 0,79 | **−0,265** | — | **ne pas trader** |
| `turtle_breakout` | 195 | 0,369 | 8,90 | +0,298 | **+0,075** | **46 %** |
| `tsmom` | 987 | 0,342 | 5,72 | +0,227 | **+0,057** | **37 %** |

Le même document plafonne le risque crypto à **0,5–1 % par trade** et définit
la « zone de mort mathématique » au-delà de 30 % de perte. Or son propre
quarter-Kelly prescrit ici 5,7 à 7,5 % — et à ce taux, une série de huit
pertes coûte 37 à 46 %. Ces stratégies perdent 63 à 66 % de leurs trades :
sur 500 trades, une telle série est **quasi certaine**.

**Kelly n'a pas tort.** Il est exact si `p` et `R` sont les vraies valeurs.
Ils sont ici estimés *in-sample*, sur des stratégies dont le modèle nul dit
qu'elles ne battent pas des entrées aléatoires. Le document nomme d'ailleurs
ce danger — « si p ou R sont surestimés en raison d'un historique trop court,
la mise de Kelly devient surévaluée ». Sa parade, le quarter-Kelly, ne suffit
pas : **le quart d'un edge fantôme reste un edge fantôme.**

Deux choses valent d'être retenues :

- **Kelly rejette correctement `rsi_reversion`** (f\* = −0,265). C'est la
  seule partie du critère qui protège sans hypothèse, et elle rejoint le
  verdict indépendant du modèle nul. Deux méthodes convergent.
- **Le plafond dur doit primer sur Kelly**, pas l'inverse. Le dépôt est à
  0,5 % — l'extrémité conservatrice de la fourchette du document — et il est
  sûr précisément parce qu'il ne fait confiance à aucun edge estimé.

### Une tension avec l'architecture du dépôt

Le cahier des charges veut que le Desk Manager dimensionne via un consensus
pondéré `w_TA·S_TA + w_FA·S_FA + w_SA·S_SA`, avec des poids que le Cold
Analyst fait évoluer (*Authority Feedback Loop*).

Le dépôt interdit structurellement ce chemin : `I05_NO_LLM_WIDENING` borne
les facteurs consultatifs à `]0, 1]` et les applique par `min()`. **Un agent
ne peut que resserrer, jamais élargir.** Faire dépendre la taille d'un score
d'agent rouvrirait exactement la porte que cet invariant ferme.

Un dimensionnement par Kelly calculé sur des statistiques *mesurées en code*
resterait compatible ; un dimensionnement pondéré par des scores d'agents ne
l'est pas.

### HMM et DRL : la question préalable n'est pas résolue

La détection de régimes par HMM et l'allocation par DRL supposent toutes deux
qu'il existe quelque chose à commuter ou à allouer. À ce jour, la grille de
robustesse donne **une cellule survivante sur cinquante-six**. Un moteur de
commutation entre une stratégie de tendance et une stratégie de range n'a de
valeur que si au moins l'une des deux a un edge dans son régime — ce qui
reste à établir. `rsi_reversion`, la candidate naturelle du régime *range*,
est significativement pire que le hasard dans six cellules.


## Quatrième lot : le document méthodologique, et ce qu'il me reproche

`indicateurs-strategies-validation-robustesse.md` est le plus important du
corpus pour ce dépôt : c'est la grille de validation que tout le reste doit
franchir. Confrontée au travail fait cette session, elle valide trois choses
et en reproche quatre.

### Ce qui était déjà fait

| exigence | état |
|---|---|
| Correction pour tests multiples | Benjamini-Hochberg sur 56 cellules — plus strict que le `1-(1-α)^N` du document |
| Look-ahead bias | `donchian` exclut la bougie courante ; le filtre Savitzky-Golay du doc voisin est signalé comme non causal |
| Slippage et commissions | `backtest/costs.py`, frais + funding + slippage dès le premier run |

### Ce qui manquait — dont une faute de ma part

**Biais de survie.** J'ai bâti la grille sur sept actifs qui existent
*aujourd'hui* sur Hyperliquid. L'API en liste 233, dont **56 marqués
délistés** (MATIC, RNDR, FTM, FXS, UNIBOT…). Les actifs morts pendant la
période sont absents de mes chiffres. C'est le biais que le document nomme,
et je l'ai introduit sans le voir.

**Walk-Forward Analysis et WFE**, **Monte-Carlo par permutation** : non faits.
Le document en fait des critères de rejet (WFE < 50 %, P(DD > 30 %) > 5 %).

### Sensibilité des paramètres : le test que j'ai fait, et son résultat

`scripts/sensibilite_parametres.py`. Le document : « ne choisissez jamais le
pic absolu ; choisissez le centre de gravité du plateau le plus large ».

**`tsmom` sur BTC 1 j — le seul survivant de Benjamini-Hochberg :**

| lookback (j) | 7 | 14 | 21 | 28 | 35 | 42 | 49 | 56 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| p | 0,096 | **0,012** | **0,032** | **0,002** | **0,002** | **0,002** | **0,014** | **0,002** |

**7 valeurs sur 8 sous le seuil — un plateau.** C'est le premier résultat de
cette session qui survit à un test conçu pour le tuer.

**`turtle_breakout` sur BTC 1 j**, pour comparaison : 3 sur 7, avec une
décroissance monotone (p passe de 0,012 à 0,609 quand `entry_period` va de 20
à 100). Ni plateau, ni pic isolé — cohérent avec son échec à la grille.

**Ce que ce plateau ne prouve pas.** Il élimine l'explication « un paramètre
bien tombé ». Il ne dit rien du hors-échantillon, il porte sur **un seul
actif** — le survivant par excellence — et les frères pré-enregistrés sont
plus faibles (ETH p = 0,047, XRP p = 0,077). Il reste WFO, Monte-Carlo, et un
jeu d'actifs incluant les délistés avant d'en faire quoi que ce soit.

### Les quatre autres documents

- **`indicateurs-techniques-maths.md`** : le dépôt implémente déjà EMA, RSI de
  Wilder, MACD, ATR avec ces formules exactes. Manquent ADX, Bollinger et la
  détection de divergences.
- **`macro-momentum-crypto-onchain.md`** : funding, open interest, MVRV,
  liquidations — aucune de ces séries n'est dans le dépôt. `costs.py` traite
  le funding comme une constante, ce que le README signale déjà comme une
  limite.
- **`macro-momentum-intraday-vs-swing`** : l'exposant de Hurst et le profil en
  U sont mesurables sur les données existantes. Le profil en U est spécifique
  aux actions ; l'horloge de funding est mesurable en crypto.
- **`macro-momentum-equity-narratives.md`** : hors périmètre — le dépôt ne
  traite que des perpétuels crypto.
