# Architecture Multi-Agents pour Trading Desk Automatisé : Structuration et Orchestration

Dans un trading desk quantitatif de niveau institutionnel, s'appuyer sur un script monolithique unique ("un seul robot") pour tout faire engendre une fragilité extrême. Un bug dans la lecture d'une API de flux d'actualités peut bloquer l'évaluation du risque ou paralyser la boucle d'exécution d'ordres. 

Pour résoudre ce problème, l'architecture moderne de trading s'appuie sur un **Système Multi-Agents (MAS)**. Ce système distribue les responsabilités de collecte de données, de génération d'alpha, de gestion du risque, d'arbitrage et d'exécution d'ordres entre plusieurs agents logiciels spécialisés et découplés, collaborant via un bus d'événements asynchrones.

---

## 1. Topologie et Rôles de l'Équipe de Robots (Agents IA)

Chaque agent est conçu comme un microservice autonome possédant son propre état local, ses outils et ses modèles spécifiques.

```
       ┌────────────────────────┐
       │   Market Data Agent    │
       └───────────┬────────────┘
                   │  (Publie des flux / événements bruts)
                   ▼
       ┌────────────────────────┐
       │ Strategy/Alpha Agent   │
       └───────────┬────────────┘
                   │  (Génère des signaux / propositions bruts)
                   ▼
       ┌────────────────────────┐
       │  Portfolio Manager     │ ◄─── (Superviseur de la structure)
       └─────┬───────────▲──────┘
             │           │  (Stress-test et approbation)
             ▼           │
       ┌───────────┴─────┴──────┐
       │ Risk Management Agent  │
       └───────────┬────────────┘
                   │  (Veto de sécurité / Calcul du Sizing)
                   ▼
       ┌────────────────────────┐
       │   Execution Agent      │  (Le "Nageur" - Interaction L1/LOB)
       └────────────────────────┘
```

### Table des Spécifications des Agents

| Nom de l'Agent | Rôle Central | Entrées Clés | Sorties Clés | Modèles / Outils Recommandés |
| :--- | :--- | :--- | :--- | :--- |
| **Market Data Agent** | Collecter, normaliser et distribuer les flux de marché en temps réel sans blocage. | Websockets d'échanges, API CoinGlass, flux RSS macro, API de réseaux sociaux. | Événements structurés JSON (Ticks, Volumes, Sentiments). | Asyncio Python, WebSockets, Redis Streams. |
| **Strategy Agent (Alpha)** | Analyser les structures graphiques, calculer les indicateurs techniques et générer des propositions directionnelles. | Données historiques (OHLCV), Ticks récents, probabilités de régimes HMM. | Propositions de trade (`BUY/SELL/HOLD`), prix limites recommandés, niveau de confiance. | Ta-Lib, modèles d'apprentissage (Random Forest, SVM, HMM). |
| **Risk Agent** | Appliquer un veto de conformité, calculer le dimensionnement de position exact (ATR & Kelly) et surveiller la corrélation. | Portefeuille actuel, propositions d'Alpha, volatilité ATR (14). | Volume d'ordre maximal autorisé (en unités d'actifs), Stop-Loss absolu, validation/rejet du trade. | Algorithmes d'asymétrie de perte, calculs vectoriels Numpy. |
| **Portfolio Manager (PM)** | Superviser le desk, résoudre les conflits (ex: signaux opposés), arbitrer l'allocation de capital entre les sous-stratégies. | Décisions du Risk Agent, propositions des Strategy Agents, mémoire à long terme. | Allocation de capital consolidée, activation ou désactivation des sous-agents. | LangGraph (graphe d'état), LLMs légers avec structured outputs (JSON schema). |
| **Execution Agent (Le Nageur)** | Placer les ordres, gérer la microstructure (LOB), découper les ordres d'envergure (VWAP/TWAP) et minimiser le glissement (*slippage*). | Ordre approuvé, carnet d'ordres L2/L3 en temps réel, profil de volume historique. | Ordres limites/marché exécutés, taux de slippage réel, frais de gaz consommés. | Python SDK d'échanges (Hyperliquid, CCXT), algorithmes Almgren-Chriss. |

---

## 2. Protocoles d'Interaction et Canaux de Communication

Faire communiquer les agents par des requêtes HTTP (REST) synchrones est une erreur critique : si l'agent de Risque met 200 ms à répondre en raison d'une latence réseau, le prix d'entrée sur l'actif aura déjà bougé. Les interactions doivent être entièrement **asynchrones et événementielles**.

### A. Le Bus d'Événements (Message Broker) : Redis Streams vs RabbitMQ
*   **Redis Streams / PubSub (Ultra-Low Latency, <1ms)** : Idéal pour distribuer les données de marché en temps réel (Ticks, order book updates). Tous les agents écoutent un canal partagé.
*   **RabbitMQ / Kafka (Durable, Persistant)** : Idéal pour le routage des ordres et les flux transactionnels. L'utilisation de **queues avec accusé de réception (ACK)** garantit qu'un signal d'ordre n'est jamais perdu, même si l'agent d'exécution redémarre au pire moment.

### B. Le Patron de Conception : "Proposition - Validation - Exécution"
1.  **Proposition** : L'agent *Strategy* publie un événement :
    ```json
    {
      "event": "TRADE_PROPOSAL",
      "proposal_id": "prop_9831a",
      "asset": "BTC",
      "direction": "LONG",
      "reasoning": "RSI oversold + EMA 200 rejection"
    }
    ```
2.  **Validation & Sizing** : L'agent *Risk* intercepte le message, analyse l'état du portefeuille global, applique le critère de Kelly fractionnaire et l'ATR, puis publie :
    ```json
    {
      "event": "TRADE_VALIDATED",
      "proposal_id": "prop_9831a",
      "status": "APPROVED",
      "authorized_size_usdc": 4250.00,
      "suggested_stop_loss": 58200.00
    }
    ```
3.  **Arbitrage PM** : Le *Portfolio Manager* valide le signal global, puis l'envoie à la queue d'exécution.
4.  **Exécution ("Le Nageur")** : L'agent d'exécution capte le signal, divise l'ordre de 4250 USDC en sous-ordres via un algorithme TWAP sur 5 minutes pour éviter d'impacter le marché sur Hyperliquid.

---

## 3. Gestion des Défaillances et File d'Attente de Secours (Dead-Letter Queues)

Dans un système multi-agents de production, les pannes d'API, les congestions réseau ou les spikes de volatilité extrême sont inévitables. L'architecture doit intégrer un système de **Degradation Gracieuse** :

*   **Dead-Letter Queues (DLQ)** : Tout ordre rejeté par l'échange pour anomalie de signature, slippage hors limites ou mauvaise configuration réseau est immédiatement poussé dans une file de secours spéciale (`exec_dead_letter_queue`). Un agent superviseur alerte les opérateurs humains par Webhook (Slack/Telegram) et place l'agent d'exécution défaillant en mode "lecture seule".
*   **Heartbeat & Circuit Breaker** : Un agent de surveillance léger envoie des requêtes ping toutes les secondes à chaque conteneur d'agent. Si un agent (ex: Risque) ne répond pas pendant 3 battements de cœur consécutifs, le disjoncteur (*Circuit Breaker*) se déclenche : toutes les ouvertures de position sont suspendues et l'agent d'exécution passe automatiquement en mode de gestion passive des ordres ouverts (mise en place de stop-loss stricts directement sur l'échange pour sécuriser le capital sans calcul d'agent tiers).
