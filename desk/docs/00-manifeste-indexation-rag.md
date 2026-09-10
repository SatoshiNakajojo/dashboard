# Manifeste d'Indexation RAG & Cartographie de la Base de Connaissances (Version 3 - Intraday & Swing)

Ce document sert de **répertoire d'indexation sémantique** pour les agents d'Intelligence Artificielle (LLM/RAG) chargés du codage, de l'orchestration et du fonctionnement opérationnel du **Trading Desk Multi-Agents**.

Il associe chaque document technique à ses métadonnées d'intégration (fonction, phase, destinataire système et tags clés) permettant un aiguillage (*routing*) dynamique des connaissances sans relecture exhaustive du corpus.

---\n\n## 🧭 Métadonnées Système Globales

| Tag Métadonnée | Description / Valeurs Possibles |
| :--- | :--- |
| **Phase d'Utilité** | `Conception Architecture` (Phase 1) \| `Développement & Code` (Phase 2) \| `Production / Exécution` (Phase 3) \| `Audit & Optimisation` (Phase 4) |
| **Destinataire principal** | `Quant Developer` (Système) \| `Agent IA Individuel` (Spécifique) \| `Superviseur / Orchestrateur` (LangGraph) |
| **Type de Contenu** | `Formules Mathématiques` \| `Code de Production` \| `Spécifications Fonctionnelles` \| `Règles de Risque` |

---\n\n## 🗂️ Index Thématique de la Bibliothèque de Connaissances

### 1. ANALYSE GRAPHIQUE (ANALYSE_GRAPHIQUE)

#### `analyse-graphique-candlesticks.md`
*   **Fonction / Utilité** : Modélisation des structures logiques de bougies (Marubozu, Doji, Hammer, Englobante, Harami) et statistiques d'efficacité historique des figures chartistes (Épaule-Tête-Épaule, Triangles, Double Bottom).
*   **Phase d'Utilité** : `Développement & Code` (implémentation de la reconnaissance de patterns) & `Production / Exécution` (validation des figures).
*   **Destinataires** :
    *   **Agent** : `Technical Analyst Agent` (pour classifier les bougies).
    *   **Humain / Code** : `Quant Developer` (pour traduire les conditions logiques en algorithmes).
*   **Index d'Interrogation RAG** : `["candlesticks", "marubozu", "doji", "englobante", "double_bottom", "success_rates", "chart_patterns"]`

#### `analyse-graphique-detection.md`
*   **Fonction / Utilité** : Guide d'automatisation de la détection d'extrema locaux en Python. Intègre le lissage par filtre de Savitzky-Golay, la régression linéaire pour les droites de tendance (trendlines) et le clustering K-Means pour l'extraction de niveaux horizontaux (S&R).
*   **Phase d'Utilité** : `Développement & Code` (codage des modules d'analyse quantitative en Python).
*   **Destinataires** :
    *   **Agent** : `Market Screener Agent` (pour scanner les structures de prix de manière automatisée).
    *   **Système** : `Quant Developer` (pour implémenter `scipy.signal.argrelextrema`).
*   **Index d'Interrogation RAG** : `["argrelextrema", "savitzky_golay", "lissage", "kmeans", "trendlines", "support_resistance_automation"]`

#### `analyse-graphique-hft-ofi-vpin.md`
*   **Fonction / Utilité** : Modélisation de microstructure à haute fréquence (HFT). Formules mathématiques exactes et codes Python pour calculer l'Order Flow Imbalance (OFI) et la toxicité du flux d'ordres par le Volume-Synchronized Probability of Informed Trading (VPIN).
*   **Phase d'Utilité** : `Conception Architecture` (conception des flux de données en temps réel) & `Développement & Code` (codage du pipeline QuestDB/Python).
*   **Destinataires** :
    *   **Agent** : `Action Trade Agent (Le Nageur)` (pour détecter l'adverse selection avant l'exécution).
    *   **Système** : `Market Data Ingestion pipeline` (QuestDB).
*   **Index d'Interrogation RAG** : `["OFI", "VPIN", "microstructure", "adverse_selection", "order_flow_toxicity", "volume_buckets"]`

---

### 2. INDICATEURS & STRATÉGIES (INDICATEURS_STRATEGIE)

#### `indicateurs-techniques-maths.md`
*   **Fonction / Utilité** : Formules mathématiques exactes et récursives des indicateurs de base (EMA, RSI de Wilder, MACD, Bollinger, ADX/DMI) et logique d'identification formelle des divergences prix-oscillateurs.
*   **Phase d'Utilité** : `Développement & Code` (écriture des calculs vectorisés sous Pandas ou NumPy).
*   **Destinataires** :
    *   **Agent** : `Technical Analyst Agent`.
    *   **Système** : `Quant Developer` (librairie d'indicateurs personnalisés).
*   **Index d'Interrogation RAG** : `["wilder_rsi", "ema_recursive", "macd_calculation", "bollinger_bands", "adx_dmi_math", "divergence_logic"]`

#### `strategies-pinescript-v5.md`
*   **Fonction / Utilité** : Script complet Pine Script v5 pour TradingView implémentant une stratégie de tendance multi-indicateurs avec filtres macro, déclencheurs par crossovers, et stop/TP dynamiques calculés sur l'ATR.
*   **Phase d'Utilité** : `Développement & Code` (backtesting rapide et prototypage TradingView).
*   **Destinataires** :
    *   **Système** : `TradingView Integration Engine`.
    *   **Humain** : `Quant Researcher`.
*   **Index d'Interrogation RAG** : `["pinescript_v5", "backtest_tradingview", "atr_stop_loss", "moving_average_crossover", "strategy_logic"]`

#### `regles-trading-phases-marche.md`
*   **Fonction / Utilité** : Définition quantitative des régimes de marché (tendance vs range) via ADX, Bollinger Bandwidth et l'angle de l'EMA 200. Règles d'arbitrage comportemental associées (breakouts en tendance vs mean-reversion en range).
*   **Phase d'Utilité** : `Conception Architecture` (moteur de règles) & `Production / Exécution` (sélection dynamique de la logique active).
*   **Destinataires** :
    *   **Agent** : `Desk Manager (Orchestrateur)` (pour adapter le comportement global de l'équipe au marché).
    *   **Agent** : `Market Screener Agent` (pour classifier le régime par actif).
*   **Index d'Interrogation RAG** : `["market_regimes", "adx_thresholds", "bandwidth_squeeze", "mean_reversion", "breakout_rules", "wyckoff_phases"]`

#### `indicateurs-strategies-validation-robustesse.md`
*   **Fonction / Utilité** : Protocoles mathématiques contre le surajustement (overfitting) : analyse Walk-Forward (WFO), calcul de l'efficacité Walk-Forward (WFE), cartes de chaleur de sensibilité des paramètres, et simulations de Monte-Carlo par permutation.
*   **Phase d'Utilité** : `Audit & Optimisation` (validation obligatoire avant passage en production).
*   **Destinataires** :
    *   **Agent** : `Cold Analyst Agent` (pour auditer les performances passées et proposer des optimisations).
    *   **Système** : `Backtesting Suite` (moteur de validation quantitative).
*   **Index d'Interrogation RAG** : `["walk_forward", "monte_carlo", "overfitting_mitigation", "parameter_sensitivity", "p_hacking_prevention"]`

#### `indicateurs-strategies-ml-regimes.md`
*   **Fonction / Utilité** : Modélisation des transitions d'états de marché via les modèles de Markov cachés (Gaussian HMM). Intègre les algorithmes de Viterbi et de Baum-Welch en Python, et structure la logique de commutation automatique de stratégies (*strategy switching*).
*   **Phase d'Utilité** : `Développement & Code` (entraînement du modèle HMM learn) & `Production / Exécution` (inférence en temps réel).
*   **Destinataires** :
    *   **Agent** : `Desk Manager (Orchestrateur)`.
    *   **Système** : `Machine Learning Pipeline`.
*   **Index d'Interrogation RAG** : `["HMM", "hidden_markov_models", "viterbi_algorithm", "baum_welch", "state_transition", "strategy_switching"]`

#### `indicateurs-strategies-multi-agents.md`
*   **Fonction / Utilité** : Définition de la topologie de communication inter-agents (Proposition-Validation-Exécution). Gestion de la communication asynchrone par Redis Streams et mise en place de Dead-Letter Queues (DLQ) pour isoler les erreurs.
*   **Phase d'Utilité** : `Conception Architecture` (architecture logicielle) & `Développement & Code` (codage de l'orchestration).
*   **Destinataires** :
    *   **Système** : `LangGraph / CrewAI Framework Coordinator`.
    *   **Système** : `Redis Message Broker Stream Group`.
*   **Index d'Interrogation RAG** : `["agent_topology", "redis_streams", "consumer_groups", "dead_letter_queue", "asynchronous_communication"]`

#### `strategies-funding-rate-arbitrage.md`
*   **Fonction / Utilité** : Modèle mathématique d'arbitrage de taux de financement (Spot vs Perp / CEX vs DEX). Formules de calcul de l'APY net, de dimensionnement et de hedging delta-neutre.
*   **Phase d'Utilité** : `Développement & Code` (codage du bot d'arbitrage) & `Production / Exécution` (surveillance des taux).
*   **Destinataires** :
    *   **Agent** : `Technical Analyst Agent` (détection des anomalies de taux) et `Action Trade Agent` (exécution simultanée Spot/Perp).
*   **Index d'Interrogation RAG** : `["funding_rate_arbitrage", "delta_neutral", "perp_futures", "hedging_cost", "liquidation_risk"]`

#### `indicateurs-strategies-machine-learning-drl.md`
*   **Fonction / Utilité** : Architecture d'apprentissage par renforcement profond (Deep Reinforcement Learning - DRL) pour l'optimisation de portefeuille. Modélisation de l'algorithme Actor-Critic (DDPG) sous PyTorch et intégration de Transformers (Multi-Head Attention) pour le traitement temporel.
*   **Phase d'Utilité** : `Développement & Code` (implémentation PyTorch) & `Audit & Optimisation` (apprentissage continu).
*   **Destinataires** :
    *   **Agent** : `Fundamental Analyst Agent` & `Technical Analyst Agent` (qui s'entraînent sur les tenseurs combinés).
    *   **Système** : `PyTorch Execution Environment`.
*   **Index d'Interrogation RAG** : `["deep_reinforcement_learning", "DDPG", "actor_critic", "pytorch_trading", "transformers_attention", "portfolio_optimization"]`

#### `strategies-uniswap-v3-donnees-alternatives.md`
*   **Fonction / Utilité** : Modèle quantitatif d'apport de liquidité concentrée sur Uniswap V3. Formules de calcul de virtual reserves, couverture dynamique de la perte impermanente (IL), et ingestion de données alternatives (GitHub commits, flux de stablecoins, transferts on-chain).
*   **Phase d'Utilité** : `Conception Architecture` (intégration on-chain) & `Production / Exécution` (ajustement des liquidités).
*   **Destinataires** :
    *   **Agent** : `News Watcher Agent` (pour le sentiment GitHub/On-chain) & `Action Trade Agent` (pour la mise en place de positions LP v3).
*   **Index d'Interrogation RAG** : `["uniswap_v3_math", "impermanent_loss", "concentrated_liquidity", "alternative_data_commits", "whale_tracking"]`

#### `strategies-arbitrage-statistique-cointegration.md`
*   **Fonction / Utilité** : Modélisation quantitative du Pairs Trading de co-intégration. Intègre le test d'Engle-Granger en deux étapes (régression OLS et test ADF), la modélisation à correction d'erreur (VECM), et un script Python de génération de signaux par Z-score glissant.
*   **Phase d'Utilité** : `Développement & Code` & `Production / Exécution`.
*   **Destinataires** :
    *   **Agent** : `Market Screener Agent` & `Technical Analyst Agent`.
    *   **Système** : `Backtesting Suite` & `Execution pipeline`.
*   **Index d'Interrogation RAG** : `["cointegration", "pairs_trading", "engle_granger", "vecm_model", "z_score_spread", "statistical_arbitrage"]`

#### `strategies-optimisation-portefeuille-black-litterman.md`
*   **Fonction / Utilité** : Cadre d'allocation bayésien combinant le prior d'équilibre de marché (optimisation inverse de CAPM) avec les opinions subjectives des agents IA (vecteur Q et incertitude de He-Litterman). Formalise également l'allocation par Parité des Risques (ERC numérique) et Parité Hiérarchique des Risques (HRP).
*   **Phase d'Utilité** : `Conception Architecture` & `Production / Exécution`.
*   **Destinataires** :
    *   **Agent** : `Desk Manager (Orchestrateur)` / `Portfolio Manager` (pour optimiser le dimensionnement de position multi-actifs).
*   **Index d'Interrogation RAG** : `["black_litterman_views", "portfolio_optimization", "equal_risk_contribution_erc", "risk_parity_allocation", "hierarchical_risk_parity_hrp"]`

---\n\n
#### `strategies-funding-bleed-short-interest-carry.md`
*   **Fonction / Utilité** : Modélisation quantitative du coût de portage (Cost of Carry) pour le Swing trading. Intègre la formule du Funding Rate drag cumulé pour les dérivés crypto et l'évaluation du Short Interest (SI % of Float) et des Days to Cover (DTC) pour les shorts d'actions afin de prévenir le risque de Short Squeeze.
*   **Phase d'Utilité** : `Conception Architecture` (dimensionnement de position) & `Production / Exécution` (vérification de la viabilité des shorts et du portage).
*   **Destinataires** :
    *   **Agent** : `Risk Manager Agent` & `Technical Analyst Agent`.
    *   **Système** : `Risk Management Core`.
*   **Index d'Interrogation RAG** : `["cost_of_carry", "funding_bleed", "short_interest", "days_to_cover_dtc", "short_squeeze_risk", "perp_futures_drag"]`

### 3. MACRO ET MOMENTUM (MACRO_MOMENTUM)

#### `macro-momentum-crypto-onchain.md`
*   **Fonction / Utilité** : Sourcing de microstructure et données on-chain spécifiques aux cryptos : Funding Rates, Open Interest, cartes thermiques de liquidation, et métriques fondamentales d'évaluation (TVL, MVRV Z-Score, flux de stablecoins).
*   **Phase d'Utilité** : `Production / Exécution` (analyse quotidienne de marché).
*   **Destinataires** :
    *   **Agent** : `Market Screener Agent` & `Fundamental Analyst Agent`.
*   **Index d'Interrogation RAG** : `["open_interest_oi", "funding_rate_microstructure", "liquidation_cascades", "mvrv_z_score", "stablecoin_inflows"]`

#### `macro-momentum-equity-narratives.md`
*   **Fonction / Utilité** : Cadre d'analyse macroéconomique pour les actions (rotation sectorielle S&P 500, courbe des taux 10Y-2Y, taux directeurs) et modélisation théorique du cycle de vie des narratifs spéculatifs (Accumulation -> Croissance/FOMO -> PMF).
*   **Phase d'Utilité** : `Conception Architecture` & `Production / Exécution` (identification des rotations sectorielles).
*   **Destinataires** :
    *   **Agent** : `News Watcher Agent` (pour classifier la phase du récit) & `Fundamental Analyst Agent` (pour l'analyse de valorisation macro).
*   **Index d'Interrogation RAG** : `["yield_curve_spread", "sector_rotation", "macro_monetary_policy", "narrative_lifecycle", "speculative_bubble"]`

#### `sourcing-donnees-temps-reel.md`
*   **Fonction / Utilité** : Protocoles d'acquisition de données en production. Code Python pour requêter l'API de la FRED (St. Louis Fed) et de CoinGlass (V4 API avec CG-API-KEY).
*   **Phase d'Utilité** : `Développement & Code` (développement du pipeline d'ingestion et d'extraction de données).
*   **Destinataires** :
    *   **Système** : `Inward Market Data Worker` (FastAPI background tasks).
*   **Index d'Interrogation RAG** : `["coinglass_api_v4", "fred_api_sourcing", "real_time_order_flow", "extraction_python_json"]`

#### `macro-momentum-microstructure-execution-mev.md`
*   **Fonction / Utilité** : Analyse de la microstructure du carnet d'ordres profonds et algorithmes d'exécution (VWAP, TWAP, POV). Intègre la gestion des attaques MEV (sandwichs, front-running) et l'algorithme convexe de routage fractionné (Convex Split Routing) pour les DEXs.
*   **Phase d'Utilité** : `Conception Architecture` & `Développement & Code` (implémentation de la logique d'exécution).
*   **Destinataires** :
    *   **Agent** : `Action Trade Agent (Le Nageur)` (le module d'exécution direct).
*   **Index d'Interrogation RAG** : `["limit_order_book", "VWAP_TWAP_POV", "MEV_sandwich_attacks", "convex_split_routing", "slippage_minimization"]`

#### `sourcing-hyperliquid-agent-key.md`
*   **Fonction / Utilité** : Guide d'intégration complet avec le protocole Hyperliquid. Utilisation du SDK officiel Python, gestion de l'Agent Wallet (clé de trading EIP-712 non-custodiale, sans droit de retrait), et souscription aux WebSockets (`wss://api.hyperliquid.xyz/ws`).
*   **Phase d'Utilité** : `Développement & Code` (connexion à l'échange d'exécution).
*   **Destinataires** :
    *   **Agent** : `Action Trade Agent`.
    *   **Système** : `Hyperliquid Interface Engine`.
*   **Index d'Interrogation RAG** : `["hyperliquid_python_sdk", "agent_wallet_signing", "eip712_signatures", "websocket_reconnection_loop", "exchange_endpoint"]`

#### `macro-momentum-nlp-sentiment-finbert.md`
*   **Fonction / Utilité** : Pipeline d'analyse de sentiment quantitatif. Implémentation hybride associant **VADER** (pour l'argot crypto et la rapidité sociale) et **FinBERT** (pour l'analyse sémantique profonde de rapports financiers via Transformers HuggingFace).
*   **Phase d'Utilité** : `Développement & Code` (écriture du classifieur NLP) & `Production / Exécution` (scoring de flux en temps réel).
*   **Destinataires** :
    *   **Agent** : `News Watcher Agent` (son cerveau sémantique).
*   **Index d'Interrogation RAG** : `["finbert_transformers", "vader_lexicon", "financial_sentiment_analysis", "nlp_score_aggregation", "text_preprocessing"]`

---\n\n
#### `macro-momentum-intraday-vs-swing-temporal-microstructure.md`
*   **Fonction / Utilité** : Analyse microstructurelle temporelle de la liquidité et du volume. Détaille le profil de volume en U (U-Shape) pour les actions et les pics d'activité crypto liés aux cycles d'horloge de financement (Funding Rate). Fournit l'algorithme décisionnel pour basculer automatiquement entre une session de trading Intraday et Swing.
*   **Phase d'Utilité** : `Conception Architecture` (gestion des régimes temporels) & `Production / Exécution` (orchestration des horaires de session).
*   **Destinataires** :
    *   **Agent** : `Desk Manager (Orchestrateur)` (pour commuter les sessions) & `Action Trade Agent` (pour le timing d'exécution).
*   **Index d'Interrogation RAG** : `["u_shape_volume", "funding_clock", "temporal_microstructure", "intraday_vs_swing_decision", "detrended_fluctuation_analysis", "hurst_exponent"]`

### 4. GESTION DE RISQUE, PROCESSUS ET ARCHITECTURE (AUTRE)

#### `autre-risk-management.md` & `Manuel des Procédures`
*   **Fonction / Utilité** : Le noyau dur du contrôle des risques. Formules de la perte asymétrique (drawdown recovery), calculs exacts du critère de Kelly fractionnaire (Half & Quarter Kelly) et dimensionnement dynamique des positions ajusté à la volatilité ATR (exemples sur actions et cryptos).
*   **Phase d'Utilité** : `Conception Architecture` (règles de conformité strictes) & `Production / Exécution` (validation de chaque trade avant ordre).
*   **Destinataires** :
    *   **Agent** : `Desk Manager (Orchestrateur)` (pour appliquer le sizing de Kelly) & `Action Trade Agent` (pour poser le stop-loss ATR).
    *   **Système** : `Risk Management Core`.
*   **Index d'Interrogation RAG** : `["kelly_criterion_formula", "asymmetric_drawdown", "atr_position_sizing", "risk_of_ruin", "leverage_control"]`

#### `structure-equipe-trading.md`
*   **Fonction / Utilité** : Cartographie organisationnelle et rôles d'une équipe de trading de niveau professionnel (PM, Quant Researchers, Quant Developers, Risk Manager, et rôle spécifique du "Nageur" en market making / exécution d'ordres parents).
*   **Phase d'Utilité** : `Conception Architecture` (définition des rôles fonctionnels).
*   **Destinataires** :
    *   **Humain** : `Head of Trading` (conception humaine).
    *   **Système** : `Multi-Agent System Orchestrator` (gabarits de comportement).
*   **Index d'Interrogation RAG** : `["portfolio_manager_role", "quant_researcher_role", "execution_trader_nageur", "risk_manager_compliance"]`

#### `architecture-web-trading-desk.md`
*   **Fonction / Utilité** : Schéma technique complet du système : architecture conteneurisée Docker associant FastAPI (asynchrone), React (dashboard temps réel avec Vite), Redis (Pub/Sub & Streams à latence sub-milliseconde), et QuestDB (Séries temporelles en colonnes).
*   **Phase d'Utilité** : `Conception Architecture` (choix de l'infrastructure logicielle).
*   **Destinataires** :
    *   **Système** : `System Architect / Lead DevOps` (pour le déploiement).
*   **Index d'Interrogation RAG** : `["docker_compose_stack", "fastapi_websocket_multiplexer", "redis_latency", "questdb_time_series", "react_rendering_throttling"]`

#### `cahier-charges-trading-desk-multi-agents.md`
*   **Fonction / Utilité** : Spécifications fonctionnelles et cartographie complète des interactions de votre équipe de 7 agents d'IA (News Watcher, Market Screener, Fundamental, Technical, Desk Manager, Action Trader, et Cold Analyst). Structure de l'**Authority Feedback Loop** pour noter les agents de manière asymétrique après la fermeture des trades.
*   **Phase d'Utilité** : `Conception Architecture` & `Développement & Code` (le plan de construction directeur de tout le système).
*   **Destinataires** :
    *   **Système** : `LangGraph Supervisor Agent` (le schéma des graphes).
    *   **Humain / Code** : `Lead AI Architect` (pour coder les agents de manière coordonnée).
*   **Index d'Interrogation RAG** : `["multi_agent_specification", "authority_feedback_loop", "agent_grading_metrics", "mae_mfe_slippage", "consensus_calculation"]`

#### `autre-disaster-recovery-circuit-breakers.md`
*   **Fonction / Utilité** : Plan de continuité d'activité (HA Redis Sentinel & stockage ZFS QuestDB) et protocole d'interruption d'urgence (Circuit Breaker). Il intègre les codes Python de coupure automatique et de notification (Slack/Telegram) en cas d'anomalie technique.
*   **Phase d'Utilité** : `Conception Architecture` (plan d'urgence) & `Production / Exécution` (surveillance active).
*   **Destinataires** :
    *   **Système** : `Circuit Breaker Global Watchdog` (script autonome).
    *   **Humain** : `DevOps / SRE Engineer`.
*   **Index d'Interrogation RAG** : `["disaster_recovery", "redis_sentinel_failover", "global_circuit_breaker", "emergency_cancel_all", "slack_notifications"]`

#### `autre-compliance-security-cadre-legal.md`
*   **Fonction / Utilité** : Gouvernance réglementaire et conformité de trading. Procédures de protection des fonds, utilisation de clés de trading restreintes (API agents), audits AML/CFT et conformité aux standards internationaux (MiCA en Europe, SEC Rule 15c3-5 aux États-Unis).
*   **Phase d'Utilité** : `Conception Architecture` (règles de conformité au démarrage).
*   **Destinataires** :
    *   **Agent** : `Action Trade Agent` (bloquer les ordres non conformes).
    *   **Humain** : `Compliance Officer` (audit d'éligibilité).
*   **Index d'Interrogation RAG** : `["regulatory_compliance_mica", "sec_rule_15c3_5", "aml_cft_api_filtering", "key_isolation_master_agent", "audit_trail"]`

#### `autre-analyse-couts-transaction-tca.md`
*   **Fonction / Utilité** : Méthodologie rigoureuse d'évaluation de la qualité d'exécution (TCA). Formalise la décomposition de l'Implementation Shortfall (delay cost, temporary/permanent market impact, opportunity cost, fees) et résout de manière analytique le modèle continu d'Almgren-Chriss pour déterminer la trajectoire de holdings optimale.
*   **Phase d'Utilité** : `Production / Exécution` & `Audit & Optimisation`.
*   **Destinataires** :
    *   **Agent** : `Cold Analyst Agent` (pour auditer l'exécution) & `Action Trade Agent (Le Nageur)` (pour optimiser la trajectoire d'exécution).
*   **Index d'Interrogation RAG** : `["transaction_cost_analysis_tca", "implementation_shortfall", "almgren_chriss_execution", "market_impact_model", "optimal_trajectory_slicing", "delay_cost"]`

---\n\n
#### `autre-intertemporal-risk-overnight-weekend.md`
*   **Fonction / Utilité** : Gestion opérationnelle du risque intertemporel. Modélisation de l'espérance de gap d'ouverture (Overnight Gap Risk) sur actions via la volatilité implicite des options (IV) et gestion du risque d'assèchement de la liquidité du week-end (Weekend Liquidity Thinning) sur cryptos.
*   **Phase d'Utilité** : `Conception Architecture` (règles de marge) & `Production / Exécution` (contrôle dynamique du levier et élargissement des stops).
*   **Destinataires** :
    *   **Agent** : `Risk Manager Agent` & `Desk Manager (Orchestrateur)`.
    *   **Système** : `Risk Management Core`.
*   **Index d'Interrogation RAG** : `["overnight_gap_risk", "weekend_liquidity_thinning", "volatility_opening_gap", "leverage_haircut", "stop_loss_widening", "implied_volatility_iv"]`

#### `autre-order-netting-wash-trading-prevention.md`
*   **Fonction / Utilité** : Moteur de compensation interne (Order Netting Engine) pour équipes de trading multi-agents. Permet d'identifier et de bloquer le wash trading externe provoqué par des agents directionnels conflictuels, de calculer l'exposition nette réelle et de tenir un grand livre d'exécution virtuel.
*   **Phase d'Utilité** : `Conception Architecture` (architecture de routage d'ordres) & `Production / Exécution` (compensation temps réel).
*   **Destinataires** :
    *   **Agent** : `Desk Manager (Orchestrateur)` (filtre de netting) & `Action Trade Agent` (exécution de l'ordre net).
    *   **Système** : `Order Router & Internal Ledger`.
*   **Index d'Interrogation RAG** : `["wash_trading_prevention", "internal_order_netting", "virtual_ledger", "compensated_volume", "multi_agent_conflicts", "regulatory_wash_rules"]`

## 🚦 Schéma de Routage pour l'Orchestrateur IA (RAG Routing Logic)

```
                       ┌──────────────────────────────┐
                       │   Tâche demandée à l'agent   │
                       └──────────────┬───────────────┘
                                      │
       ┌──────────────────────────────┼──────────────────────────────┐
       ▼                              ▼                              ▼
 [Analyse de l'info]            [Analyse Graphique]            [Ordre & Exécution]
       │                              │                              │
  Interroger :                   Interroger :                   Interroger :
  • doc 18 (FinBERT)             • doc 02 (Détection Python)    • doc 17 (Hyperliquid API)
  • doc 14 (Narratifs)           • doc 04 (Maths Indicateurs)   • doc 16 (MEV, Slippage, VWAP)
  • doc 12 (Alternatifs)         • doc 03 (OFI & VPIN)          • doc 19 (Kelly, Sizing ATR)
                                 • doc 10 (Co-intégration)      • doc 11 (Black-Litterman/ERC)
                                 • doc 21 (Microstructure Temp) • doc 07 (TCA & Almgren-Chriss)
                                 • doc 23 (Funding/Borrow Drag) • doc 22 (Intertemporal Risk)
                                                                • doc 24 (Order Netting/Wash)
```
