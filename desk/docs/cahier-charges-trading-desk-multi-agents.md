# Cahier des Charges & Cartographie Fonctionnelle : Trading Desk Multi-Agents Quantitatif (V1)

Ce document définit les spécifications techniques, fonctionnelles et architecturales pour le déploiement d'une équipe d'agents de trading autonomes et semi-autonomes opérant sur les marchés des Crypto-monnaies (notamment Hyperliquid) et des Actions. Il s'appuie sur la documentation quantitative collectée et propose des optimisations majeures pour transformer l'architecture initiale en un système robuste, auto-évolutif et résistant aux failles de marché.

---

## 1. Challenge & Optimisations de l'Architecture Initiale

L'architecture proposée par l'utilisateur est excellente et couvre l'intégralité du cycle de vie d'un trade (de la détection de tendance à l'audit post-trade). Néanmoins, pour fonctionner dans des conditions de marché réelles (haute fréquence, volatilité extrême, asymétrie d'information), elle doit être challengée sur plusieurs points critiques :

### A. Le Piège de la Latence du "News Watcher" vs "Market Screener"
*   **Challenge** : Si le *Market Screener* attend passivement un rapport du *News Watcher* pour commencer à scanner, le desk ratera systématiquement les impulsions initiales (momentum). De plus, les données issues de Twitter/X ou du web sont extrêmement bruitées.
*   **Optimisation** : Le *Market Screener* doit fonctionner **en continu** (calcul des régimes de marché, ATR, volumes inhabituels). Le *News Watcher* lui envoie des "vecteurs de thèmes" (ex: "AI sector volume spike"). Le Screener effectue un croisement matriciel instantané entre ses watchlists techniques actives et le thème identifié pour extraire des setups qualifiés en quelques millisecondes.

### B. L'Ambiguïté des Signaux Techniques
*   **Challenge** : Le *Technical Analyst* risque de générer des signaux contradictoires (ex: RSI suracheté alors que l'EMA 200 indique une tendance haussière puissante).
*   **Optimisation** : Le *Technical Analyst* doit obligatoirement valider le **Régime de Marché** (Tendance vs Range) défini dans `regles-trading-phases-marche.md` avant d'évaluer les indicateurs. Les oscillateurs (RSI, Stochastique) sont ignorés ou inversés en tendance forte, tandis que les indicateurs de suivi de tendance (MACD, EMA) sont ignorés en range.

### C. Le Goulot d'Étranglement Discrétionnaire du "Desk Manager"
*   **Challenge** : Si le *Desk Manager* (superviseur) prend des décisions de sizing basées sur une interprétation subjective de rapports textuels, le système est exposé au risque de ruine.
*   **Optimisation** : Le processus de décision du *Desk Manager* doit être **strictement quantitatif**. Il calcule un score pondéré de consensus :
    $$\text{Score Global} = w_{TA} \cdot S_{TA} + w_{FA} \cdot S_{FA} + w_{SA} \cdot S_{SA}$$
    Si ce score dépasse un seuil critique, la taille de position est calculée de manière déterministe via le **critère de Kelly fractionnaire** et le stop-loss est indexé sur l'**ATR** (comme spécifié dans le `Manuel des Procédures`).

### D. La Vulnérabilité de l'Exécution du "Action Trader"
*   **Challenge** : Passer des ordres simples sur des carnets d'ordres profonds ou des DEX (comme Hyperliquid) expose le desk à un glissement (*slippage*) massif et à l'exploitation par des bots MEV (sandwich attacks).
*   **Optimisation** : L'agent d'exécution (baptisé **Le Nageur**) doit utiliser des algorithmes d'exécution avancés (TWAP/VWAP) décrits dans `macro-momentum-microstructure-execution-mev.md` et signer ses ordres de manière non-custodiale via des clés d'agents EIP-712 limitées au trading (sans droits de retrait).

### E. La Rétroaction Passive du "Cold Analyst"
*   **Challenge** : Un simple rapport textuel du *Cold Analyst* au manager n'a que peu d'effet immédiat sur le comportement des agents.
*   **Optimisation** : Introduction d'un **Système de Notation Évolutif (Authority Feedback Loop)**. Le *Cold Analyst* modifie dynamiquement le poids de décision ($w_{TA}, w_{FA}, w_{SA}$) de chaque agent au sein du consensus en fonction de la précision passée de leurs rapports.

---

## 2. Cartographie des Interactions (Flux d'Information)

La communication entre les agents s'effectue via un bus d'événements à haute performance (Redis Streams) pour garantir un couplage faible et une tolérance aux pannes.

### A. Flux de Génération de Signal (Temps Réel - Synchrone/Asynchrone)

```
 ┌──────────────────────┐      ┌──────────────────────┐
 │     News Watcher     │      │   Market Screener    │
 └──────────┬───────────┘      └──────────┬───────────┘
            │ (Vecteur de Narratif)       │ (Watchlists Actives / Régimes)
            ▼                             ▼
 ┌────────────────────────────────────────────────────────────┐
 │               CONCURRENCE & CORRÉLATION (Bus Redis)        │
 └────────────────────────────┬───────────────────────────────┘
                              │
                              ├──────────────────────────────┐
                              ▼                              ▼
                   ┌────────────────────┐          ┌────────────────────┐
                   │Technical Analyst   │          │Fundamental Analyst │
                   └──────────┬─────────┘          └──────────┬─────────┘
                              │ (Score TA / S&R)              │ (Score FA / On-chain)
                              ▼                              ▼
 ┌────────────────────────────────────────────────────────────┐
 │                     DESK MANAGER (Gatekeeper)              │
 │  - Calcule le consensus pondéré par l'autorité             │
 │  - Applique la formule de Kelly & ATR Sizing               │
 └────────────────────────────┬───────────────────────────────┘
                              │ (Ordre ferme : Symbole, Côté, Taille, SL, TP)
                              ▼
 ┌────────────────────────────────────────────────────────────┐
 │                 ACTION TRADER ("Le Nageur")                │
 │  - Signature EIP-712 Agent Wallet                          │
 │  - Découpage TWAP / VWAP                                   │
 │  - Routage privé (Flashbots / MEV Blocker)                 │
 └────────────────────────────────────────────────────────────┘
```

### B. Flux d'Audit et d'Apprentissage (Post-Trade - Asynchrone)

```
 ┌───────────────────────────┐      ┌───────────────────────────┐
 │       Position Cloturée   ├─────►│       Cold Analyst        │
 └───────────────────────────┘      └─────────────┬─────────────┘
                                                  │
                                                  ▼ (Requête d'Audit de performance)
                                    ┌───────────────────────────┐
                                    │    Requête aux Agents     │
                                    │ (TA, FA, News, Execution) │
                                    └─────────────┬─────────────┘
                                                  │
                                                  ▼ (Calcul des métriques : MFE, MAE, Slippage)
                                    ┌───────────────────────────┐
                                    │ Mise à jour des scores    │
                                    │ d'autorité dans Redis     │
                                    └─────────────┬─────────────┘
                                                  │
                                                  ▼ (Directives d'Optimisation)
                                    ┌───────────────────────────┐
                                    │    Rapport au Manager     │
                                    └───────────────────────────┘
```

---

## 3. Spécifications Techniques des Agents (Cahier des Charges)

### Agent 1 : News Watcher (Sentinelle des Narratifs)
*   **Objectif** : Identifier en amont l'émergence de récits sectoriels et mesurer le sentiment de marché.
*   **Données d'Entrée (Inputs)** : Flux Twitter/X (comptes clés de la communauté actions/cryptos), flux RSS d'actualités financières, données de volume de recherche Google Trends, volume social CoinGlass/LunarCrush.
*   **Logique Métier** :
    1.  **Extraction de thèmes** : Regroupement (Clustering NLP) des termes récurrents pour isoler des narratifs émergents (ex: "Layer 1 alternative", "AI computing").
    2.  **Calcul du Score de Sentiment ($S_{SA}$)** : Analyse de sentiment polarisée (scores de -1.0 à +1.0) sur les données collectées.
    3.  **Alignement Macro** : Validation de la cohérence du narratif avec les conditions macroéconomiques globales (ex: phase de taux d'intérêt, liquidité mondiale).
*   **Données de Sortie (Outputs)** : `Narrative_Payload = {theme: "RWA", sentiment_score: 0.78, social_volume_drift: +150%, active_tickers: ["ONDO", "PENDLE"]}` envoyé sur le canal Redis `stream:narratives`.

### Agent 2 : Market Screener (Filtre de Vélocité)
*   **Objectif** : Balayer en continu le marché pour identifier les actifs présentant une volatilité et une liquidité suffisantes pour être tradés.
*   **Données d'Entrée (Inputs)** : Ticks de prix et volumes de toutes les paires d'Hyperliquid et du S&P 500 (via QuestDB).
*   **Logique Métier** :
    1.  **Filtre de liquidité** : Élimination des actifs dont le volume quotidien est insuffisant pour éviter l'impact sur le prix lors de l'exécution.
    2.  **Mesure de Volatilité** : Calcul de l'ATR (14 jours) et du Bollinger Bandwidth pour identifier les phases de compression (Squeeze) et de breakout imminent.
    3.  **Croisement thématique** : Dès réception d'un `Narrative_Payload`, le Screener filtre les tickers concernés et vérifie si leur configuration technique est propice à une explosion directionnelle.
*   **Données de Sortie (Outputs)** : Liste de tickers qualifiés transmise au *Technical* et *Fundamental Analyst* via Redis.

### Agent 3 : Fundamental Analyst (Validateur de Qualité)
*   **Objectif** : Évaluer la viabilité intrinsèque et on-chain d'un actif pour éviter les pièges spéculatifs (pump and dump).
*   **Données d'Entrée (Inputs)** : Données on-chain (TVL, volumes DEX, ratio Ethena USDe, frais de réseau), données financières d'entreprises (P/E, croissance des revenus, dette) via FRED ou APIs spécialisées.
*   **Logique Métier** :
    1.  **Modélisation On-chain (Crypto)** : Calcul du ratio MVRV Z-Score et suivi de la divergence de TVL par rapport au cours de l'actif.
    2.  **Analyse Financière (Actions)** : Attribution d'une note basée sur des critères de rentabilité et de levier d'endettement.
    3.  **Calcul du Score Fondamental ($S_{FA}$)** : Normalisation de la note sur une échelle de -1.0 (fondamentaux catastrophiques, risque de liquidation) à +1.0 (excellence opérationnelle).
*   **Données de Sortie (Outputs)** : `Fundamental_Report = {ticker: "ONDO", score_fa: 0.85, key_metric: "TVL +45% MoM"}` envoyé sur Redis.

### Agent 4 : Technical Analyst (Modélisateur de Prix)
*   **Objectif** : Déterminer la structure géométrique du graphique, identifier les niveaux clés et mesurer la dynamique du momentum de prix.
*   **Données d'Entrée (Inputs)** : Données historiques de chandeliers (OHLCV) extraites de QuestDB.
*   **Logique Métier** :
    1.  **Détection du Régime de Marché** : Calcul de l'ADX (14) et de l'écartement des Bandes de Bollinger pour classer l'actif en Tendance (haussière/baissière) ou en Range.
    2.  **Recherche de Figures Graphiques** : Exécution d'algorithmes de recherche d'extrema locaux (`scipy.signal.argrelextrema`) pour tracer les droites de support et résistance horizontales et identifier des figures classiques (Double Bottom, Triangles).
    3.  **Calcul du Score Technique ($S_{TA}$)** : Alignement des indicateurs clés (RSI Wilder, MACD, EMA 21/50).
*   **Données de Sortie (Outputs)** : `Technical_Report = {ticker: "ONDO", score_ta: 0.90, regime: "Tendance_Haussiere", support_level: 0.85, resistance_level: 0.98, stop_loss_atr: 0.045}` transmis sur Redis.

### Agent 5 : Desk Manager (Superviseur & Gestionnaire de Risques)
*   **Objectif** : Arbitrer les propositions de trades, assurer la stricte conformité réglementaire et calculer mathématiquement le dimensionnement des positions.
*   **Données d'Entrée (Inputs)** : Rapports des agents (TA, FA, News) et état actuel du portefeuille (RAM Redis).
*   **Logique Métier** :
    1.  **Évaluation du Consensus Pondéré** : Calcul du score de décision global en utilisant l'autorité relative des agents.
    2.  **Application du Sizing par Kelly et l'ATR** :
        *   Calcul du taux de réussite historique ($W$) et du ratio de gain/perte ($R$).
        *   Calcul du pourcentage optimal de capital à risquer via le critère de Kelly fractionnaire (Quarter Kelly pour sécuriser le portefeuille) :
            $$f^* = 0.25 \cdot \left( W - \frac{1 - W}{R} \right)$$
        *   Calcul du nombre précis de contrats/actions à acheter en fonction du stop-loss basé sur l'ATR défini par le Technical Analyst :
            $$\text{Position Size} = \frac{\text{Capital} \cdot f^*}{\text{Distance Stop Loss (ATR)}}$$
    3.  **Contrôle des Limites de Drawdown** : Bloquer l'envoi d'ordres si le drawdown journalier approche des limites de sécurité.
*   **Données de Sortie (Outputs)** : `Execution_Order = {ticker: "ONDO", action: "BUY", size: 12500, stop_loss: 0.805, take_profit: 0.98}` envoyé à l'Action Trader.

### Agent 6 : Action Trader (Le "Nageur" - Exécuteur de Précision)
*   **Objectif** : Exécuter l'ordre au meilleur prix, avec un glissement minimal et une protection contre les attaques MEV.
*   **Données d'Entrée (Inputs)** : `Execution_Order` du Desk Manager.
*   **Logique Métier** :
    1.  **Délégation & Signature** : Authentification auprès d'Hyperliquid ou du courtier d'actions en utilisant une clé d'agent EIP-712 sécurisée (aucun accès au retrait de fonds).
    2.  **Découpage d'Ordre** : Analyse de la profondeur du carnet d'ordres (LOB). Si la taille de l'ordre dépasse 5% de la liquidité disponible au premier niveau, l'agent utilise un algorithme d'exécution **TWAP (Time-Weighted Average Price)** ou **VWAP (Volume-Weighted Average Price)** pour diluer l'impact sur le marché.
    3.  **Routage Anti-MEV** : Envoi de transactions via des RPC privés (relais Flashbots pour Ethereum, ou équivalent sur Solana) pour masquer les ordres du mempool public et empêcher le *sandwiching*.
*   **Données de Sortie (Outputs)** : Acquittement d'exécution complet envoyé à Redis Streams et loggé dans QuestDB : `Order_ACK = {ticker: "ONDO", execution_price: 0.852, slippage: 0.02%}`.

### Agent 7 : Cold Analyst (Auditeur Post-Trade)
*   **Objectif** : Analyser a posteriori la qualité des décisions opérationnelles et optimiser l'intelligence collective de l'équipe d'agents.
*   **Données d'Entrée (Inputs)** : Données historiques de transaction, carnet d'ordres au moment de l'exécution, prix de l'actif jusqu'à 72 heures après la clôture de la position (QuestDB).
*   **Logique Métier** :
    1.  **Calcul des Métriques d'Efficacité** :
        *   *Slippage d'exécution* : Différence entre le prix de signal du Manager et le prix d'exécution réel du Nageur.
        *   *Maximum Favorable Excursion (MFE)* : Le gain maximal théorique qui était réalisable pendant la durée du trade.
        *   *Maximum Adverse Excursion (MAE)* : Le drawdown maximal subi par la position avant sa clôture.
    2.  **Évaluation des Diagnostics Agents** : Analyse de la pertinence de chaque rapport intermédiaire (TA, FA, Sentiment) par rapport à l'évolution réelle du marché.
    3.  **Mise à jour des Scores d'Autorité (Système de Notation Évolutif)**.
*   **Données de Sortie (Outputs)** : Rapport d'audit complet envoyé sur le canal Redis `stream:audit` et mise à jour des poids d'influence dans la mémoire Redis.

---

## 4. Le Système de Notation Évolutif (Authority Feedback Loop)

Pour rendre l'équipe d'agents adaptative et intelligente, le *Cold Analyst* met en place un modèle d'évaluation continue qui ajuste dynamiquement les coefficients d'influence ($w_{TA}, w_{FA}, w_{SA}$) au sein du processus de décision du *Desk Manager*.

### Formule de Mise à Jour de l'Autorité
À la clôture de chaque trade $t$, le score d'autorité $A_i$ d'un agent $i$ (compris entre 0.1 et 1.0) est mis à jour selon la règle suivante :

$$A_i(t+1) = A_i(t) + \eta \cdot \left( \text{Précision}_i \cdot \text{Signe}(\text{ROI}) - \alpha \right)$$

Où :
*   $\eta$ est le **taux d'apprentissage** (ex: 0.05).
*   $\text{Précision}_i$ est le coefficient de corrélation entre les prévisions de l'agent et le mouvement réel du prix.
*   $\text{Signe}(\text{ROI})$ vaut $+1$ si le trade s'est clôturé en gain, et $-1$ s'il s'est clôturé en perte.
*   $\alpha$ est un facteur d'amortissement (ex: 0.01) pour éviter une dérive positive automatique des scores.

### Impact Opérationnel du Consensus
Le *Desk Manager* utilise ces autorités normalisées comme coefficients de pondération :

$$w_i = \frac{A_i}{\sum_{j} A_j}$$

*Exemple concret* : Si le marché entre dans un régime très volatil et irrationnel (haute spéculation sur les cryptos mèmes), le *Fundamental Analyst* va générer des scores négatifs sur des tokens qui continuent pourtant de monter. Ses prévisions seront corrélées négativement avec la performance à court terme. Le système va automatiquement dégrader son autorité ($w_{FA}$ diminue) au profit du *Technical Analyst* ($w_{TA}$ augmente). Dès que le marché se normalise et retourne vers ses fondamentaux, le processus s'inverse naturellement, protégeant ainsi le capital d'une rigidité algorithmique.

---

## 5. Spécifications de la Stack Technique et Intégrations

Pour assurer la stabilité et l'exécution en temps réel de ce système d'agents, la stack technique de production se compose des briques technologiques interconnectées suivantes :

### A. Bus de Message Asynchrone : Redis Streams
*   **Rôle** : Servir de canal de communication haute performance (latence < 1 ms) pour la distribution des rapports d'agents et des instructions du Manager.
*   **Implémentation** : Les événements critiques sont structurés dans des topics Redis distincts avec des groupes de consommateurs pour garantir qu'aucun message d'ordre n'est perdu ou exécuté deux fois.

### B. Base de Données Temporelle : QuestDB
*   **Rôle** : Enregistrer de manière continue l'historique complet des ticks de marché et l'état des positions pour alimenter l'analyse quantitative du *Cold Analyst* et du *Technical Analyst*.
*   **Requêtes Clés** : Utilisation des fonctions SQL de QuestDB pour calculer des agrégations temporelles (VWAP, ATR) à la volée.

### C. Passerelle API & Websockets : FastAPI
*   **Rôle** : Centraliser les flux de données temps réel en provenance de Redis et les diffuser vers l'interface graphique de contrôle à l'aide de WebSockets asynchrones régulés (*throttling* de 100 ms).

### D. Interface de Contrôle : React.js (Vite)
*   **Rôle** : Fournir au superviseur humain un tableau de bord en temps réel lui permettant de visualiser l'état psychologique de chaque agent (monologue interne), les scores d'autorité actuels et de forcer un arrêt d'urgence (*Kill Switch*) si nécessaire.

---

Ce cahier des charges dote votre futur Trading Desk d'une architecture multi-agents résiliente, modulaire et auto-correctrice, éliminant les risques de biais émotionnels et de sur-optimisation, tout en garantissant une exécution professionnelle et sécurisée.
