# Base de connaissances du desk

Documents de référence fournis par le porteur du projet, archivés ici parce
que Google Drive est refusé par la politique réseau de l'environnement de
développement et que ces documents doivent vivre avec le code qu'ils décrivent.

`00-manifeste-indexation-rag.md` est l'index maître : il recense ~24 documents
et les associe à une phase, un agent destinataire et des tags d'interrogation.
**Dix documents sur les vingt-quatre sont présents à ce jour** — le reste est
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
