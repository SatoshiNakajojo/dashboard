# Base de connaissances du desk

Documents de référence fournis par le porteur du projet, archivés ici parce
que Google Drive est refusé par la politique réseau de l'environnement de
développement et que ces documents doivent vivre avec le code qu'ils décrivent.

`00-manifeste-indexation-rag.md` est l'index maître : il recense ~24 documents
et les associe à une phase, un agent destinataire et des tags d'interrogation.
**Cinq documents sur les vingt-quatre sont présents à ce jour** — le reste est
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
