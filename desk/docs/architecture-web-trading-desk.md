# Architecture Technique d'un Trading Desk : Stack Haute Performance (FastAPI, React, Redis, QuestDB)

La conception technique d'un trading desk moderne et scalable exige une architecture découplée, capable d'absorber des volumes de transactions massifs en période de forte volatilité, tout en maintenant une latence minimale. Cet article décrit l'architecture web et infrastructure complète d'un trading desk de production.

---

## 1. Schéma d'Architecture Système et Flux de Données

```
 ┌───────────────────────────┐       ┌───────────────────────────┐
 │   Flux Réseau Externes    │       │   Échanges (Ex: Hyper)    │
 │ (FRED, APIs, Flux News)   │       │   REST / WebSockets L1    │
 └─────────────┬─────────────┘       └─────────────▲─────────────┘
               │                                   │ (Ordres de Trading)
               ▼                                   ▼
 ┌───────────────────────────────────────────────────────────────┐
 │                     DOCKER INFRASTRUCTURE                     │
 │                                                               │
 │  ┌───────────────────────┐         ┌───────────────────────┐  │
 │  │   Market Data Agent   ├────────►│    Execution Agent    │  │
 │  └──────────┬────────────┘         └───────────▲───────────┘  │
 │             │                                  │              │
 │             │ (Ticks / OB)                     │ (Ordres ACK) │
 │             ▼                                  │              │
 │  ┌─────────────────────────────────────────────┴───────────┐  │
 │  │                 REDIS MESSAGE BROKER                    │  │
 │  │        (Streams / PubSub / Centralized Cache)           │  │
 │  └──────────┬──────────────────────────────────▲───────────┘  │
 │             │ (Evenements)                     │ (Requêtes)   │
 │             ▼                                  │              │
 │  ┌───────────────────────┐         ┌───────────┴───────────┐  │
 │  │    Strategy Agent     ├────────►│   Portfolio Manager   │  │
 │  └───────────────────────┘         └───────────────────────┘  │
 │                                                               │
 │  ┌───────────────────────┐         ┌───────────────────────┐  │
 │  │        QUESTDB        │         │   FASTAPI WEB SERVER  │  │
 │  │ (Séries Temporelles)  │         │ (Moteur API & WS Hub) │  │
 │  └───────────────────────┘         └───────────┬───────────┘  │
 └────────────────────────────────────────────────┼──────────────┘
                                                  │ (Streaming UI WebSockets)
                                                  ▼
                                      ┌───────────────────────┐
                                      │    REACT DASHBOARD    │
                                      │ (Vite / Tailwind / WS)│
                                      └───────────────────────┘
```

---

## 2. La Stack Technique de Production

L'infrastructure est entièrement conteneurisée et s'articule autour de cinq technologies clés sélectionnées pour leur performance et leur complémentarité :

### A. FastAPI (Serveur Web API & WebSocket Hub)
*   **Rôle** : Servir d'interface entre l'infrastructure de trading (agents) et le tableau de bord utilisateur (React).
*   **Pourquoi FastAPI ?** : Construit sur Starlette et Pydantic, FastAPI gère de manière native la programmation asynchrone (`async/await`). Il est extrêmement performant pour maintenir des centaines de connexions WebSockets persistantes avec l'interface graphique tout en validant les types de données d'entrée instantanément.

### B. React.js + Vite (Dashboard Temps Réel)
*   **Rôle** : Afficher en temps réel les performances du desk, l'état d'esprit des agents (internal monologue), le carnet d'ordres consolidé et les métriques de risque.
*   **Pourquoi React ?** : La gestion d'un DOM virtuel permet de mettre à jour le tableau de bord à des fréquences très élevées (ex : rafraîchissement des ticks de prix 10 fois par seconde) sans figer le navigateur.
*   **Composants graphiques** : Utilisation de **Vite** pour un temps de build minimal, **Tailwind CSS** pour l'interface graphique et **ApexCharts / Lightweight Charts** (TradingView) pour le rendu graphique des chandeliers et des niveaux de liquidation.

### C. Redis (Message Broker et Cache Mémoire)
*   **Rôle** : Assurer la communication inter-agents à ultra-basse latence et stocker les états volatils des robots.
*   **Pourquoi Redis ?** : Avec des temps de réponse inférieurs à la milliseconde, Redis s'avère parfait pour la distribution rapide des données de marché via **Redis Pub/Sub**. Pour la coordination complexe des tâches des agents, l'utilisation de **Redis Streams** fournit une file d'attente robuste et ordonnée avec gestion des groupes de consommateurs.

### D. QuestDB (Base de Données de Séries Temporelles - Tick Data)
*   **Rôle** : Stocker l'historique de chaque tick de prix, les transactions de carnet d'ordres et les métriques d'exécution.
*   **Pourquoi QuestDB ?** : Écrit en Java et C++, QuestDB est spécialement optimisé pour la finance quantitative. Il permet d'ingérer des millions de lignes par seconde tout en offrant des performances de requêtage SQL incroyablement rapides sur de grands ensembles de données temporelles (ex : calcul d'un profil de volume intra-journalier sur un an de données de carnet d'ordres en moins de 10 ms).

### E. PostgreSQL (Données Relationnelles)
*   **Rôle** : Conserver les données non temporelles de configuration (clés d'API chiffrées des agents, comptes d'utilisateurs, configurations de leviers et logs d'audit à long terme).

---

## 3. Gestion des Flux WebSockets Haute Performance et Résilience de l'Interface

Pour diffuser les données des agents vers l'interface React sans saturer le serveur ni le navigateur client, le serveur FastAPI doit agir comme un **WebSocket Multiplexeur** :

1.  **Abonnement unique aux flux d'échange** : L'infrastructure de trading s'abonne à un seul flux WebSocket pour chaque actif (ex: Hyperliquid SOL-PERP). Les données entrantes sont stockées temporairement dans Redis.
2.  **Canal unique FastAPI-React** : L'interface utilisateur React ouvre une connexion WebSocket unique vers FastAPI.
3.  **Multiplexage** : FastAPI écoute le canal Redis Streams et sélectionne uniquement les données pertinentes à pousser vers la session utilisateur active (filtre de granularité).
4.  **Limitation de fréquence (Throttling) de l'interface** : Pour éviter que le navigateur React ne plante lors de spikes de volatilité extrême (ex: 200 ticks de prix par seconde lors d'une liquidation massive), FastAPI applique un *throttling* dynamique sur le canal utilisateur, regroupant les données de carnet d'ordres par paquets (batching) toutes les 100 ms avant l'envoi.

---

## 4. Observabilité, Alertes et Monitoring

Un trading desk ne peut tourner sans une surveillance rigoureuse de son état de santé technique. L'infrastructure intègre :

*   **Prometheus & Grafana** : Chaque conteneur d'agent expose un endpoint `/metrics` collecté par Prometheus. Un tableau de bord Grafana centralise des indicateurs techniques cruciaux :
    *   **Latence réseau aller-retour (Ping)** vers l'API de l'échange.
    *   **Consommation CPU/Mémoire** de chaque agent individuel (pour détecter les fuites de mémoire dans les boucles de calcul asynchrones).
    *   **Taux de rejets d'ordres** et de slippage.
    *   **Différence temporelle (Drift)** entre l'heure locale de l'agent et le timestamp du bloc de l'échange.
*   **Alertes critiques par Webhook** : Utilisation d'Alertmanager pour acheminer instantanément des alertes vers Slack, Discord ou Telegram en cas de dépassement de limites (ex: Drawdown maximal journalier de l'équipe d'agents dépassé à 85% -> avertissement rouge clignotant).
