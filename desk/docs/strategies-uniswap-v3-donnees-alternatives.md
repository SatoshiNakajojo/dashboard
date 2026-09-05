# Mathématiques de Liquide Concentré (Uniswap V3) et Intégration de Données Alternatives

Ce document formalise les mathématiques sous-jacentes à la fourniture de liquidité concentrée sur les teneurs de marché automatisés de nouvelle génération (CLMM - Concentrated Liquidity Market Makers comme Uniswap V3 ou Algebra) et décrit l'intégration opérationnelle de **Données Alternatives** (flux on-chain, flux GitHub, et dépôts de baleines) au sein du desk de trading.

---

## 1. Mathématiques de la Liquide Concentré (Uniswap V3)

Contrairement aux AMM classiques (Uniswap V2) où la liquidité est répartie uniformément de $0$ à $\infty$, Uniswap V3 permet aux Liquidity Providers (LPs) de concentrer leurs jetons dans un intervalle de prix fini $[P_a, P_b]$. Cette concentration décuple l'efficacité du capital mais amplifie de manière asymétrique le risque de **Perte Impermanente (Impermanent Loss - IL)**.

### A. Formulation de la Liquidité $L$ et des Réserves Virtuelles
Soit $x$ la réserve réelle de Token 0 (ex: ETH) et $y$ la réserve réelle de Token 1 (ex: USDC). 
Soit $P$ le prix de Token 0 exprimé en termes de Token 1 ($P = y/x$). Le protocole suit l'équation de produit constant virtuel :

$$(x + x_v)(y + y_v) = L^2$$

Où $x_v$ et $y_v$ sont des réserves virtuelles permettant de simuler la courbe d'un AMM constant product classique au sein de l'intervalle $[P_a, P_b]$.
La liquidité d'une position, notée $L$, représente la variation des réserves pour une variation donnée de la racine carrée du prix :

$$L = \frac{\Delta y}{\Delta \sqrt{P}} = \Delta x \cdot \frac{\sqrt{P_{\text{current}}} \cdot \sqrt{P_{\text{target}}}}{\sqrt{P_{\text{target}}} - \sqrt{P_{\text{current}}}}$$

### B. Équations d'Allocation d'Actifs
La composition exacte en jetons $x$ et $y$ d'une position active dépend de la position du prix actuel $P$ par rapport aux bornes $P_a$ et $P_b$ définies par le LP :

1.  **Si $P \le P_a$** (le prix est sous la borne inférieure, la position est 100% exposée à l'actif volatil $x$) :
    $$x = \frac{L(\sqrt{P_b} - \sqrt{P_a})}{\sqrt{P_a}\sqrt{P_b}}, \quad y = 0$$

2.  **Si $P_a < P < P_b$** (le prix est à l'intérieur du range, la position est mixte) :
    $$x = \frac{L(\sqrt{P_b} - \sqrt{P})}{\sqrt{P}\sqrt{P_b}}, \quad y = L(\sqrt{P} - \sqrt{P_a})$$

3.  **Si $P \ge P_b$** (le prix a dépassé la borne supérieure, la position est entièrement convertie en stablecoin $y$) :
    $$x = 0, \quad y = L(\sqrt{P_b} - \sqrt{P_a})$$

---

## 2. Impermanent Loss (IL) et Stratégies de Couverture

### A. La Perte Impermanente dans Uniswap V3
L'IL mesure la sous-performance de la valeur du portefeuille du LP par rapport à une stratégie simple d'achat-conservation (HODL) des mêmes jetons initiaux. Pour une position de liquidité concentrée dans $[P_a, P_b]$, l'IL est beaucoup plus abrupte que dans le modèle V2.

Soit $k = \sqrt{P / P_0}$ le multiplicateur de prix par rapport au prix d'entrée $P_0$. L'IL pour une position Uniswap V3 avec $P_0$ positionné au centre géométrique ($\sqrt{P_a P_b}$) s'exprime par :

$$\text{IL}_{\text{V3}}(P) = \frac{V(P) - V_{\text{HODL}}(P)}{V_{\text{HODL}}(P)}$$

Où $V(P)$ représente la valeur réelle de la position LP en fonction du prix, calculée à partir des équations d'allocation du paragraphe 1.B. L'IL atteint 100% dès que le prix quitte définitivement l'intervalle $[P_a, P_b]$.

### B. Modélisation de la Couverture (Hedging)
Pour maintenir un rendement net positif (Fees générés > Perte Impermanente subie), le trading desk déploie deux stratégies de couverture quantitative :

1.  **Couverture Quadratique via Power Perpetuels (Opérations Dérivées)** :
    L'IL de la courbe d'AMM présente une convexité négative qui s'apparente à une position vendeuse d'options d'achat et de vente (Short Gamma). Pour neutraliser cette exposition, l'agent d'exécution achète des **Power Perpetuels** (contrats perpétuels indexés sur $S^2$, le carré du prix de l'actif). 
    La valeur de remboursement d'un Power Perpetuel compense exactement la décélération concave de la courbe de valeur du LP (Gamma hedging statique).
2.  **Couverture Delta-Dynamique par Contrats Futures** :
    L'exposition directionnelle de la position LP (le Delta de la position) est modélisée par :
    
    $$\Delta_{\text{LP}} = \frac{\partial V(P)}{\partial P} = \frac{L}{2\sqrt{P}} \left( 1 - \frac{\sqrt{P}}{\sqrt{P_b}} \right) \quad \text{pour } P_a < P < P_b$$
    
    À chaque rééquilibrage, l'agent de couverture calcule $\Delta_{\text{LP}}$ et ouvre une position courte (Short) équivalente sur les contrats perpétuels de l'échange (ex: Hyperliquid) :
    
    $$\text{Position Short de Couverture} = -\Delta_{\text{LP}}$$

---

## 3. Intégration de Données Alternatives (Alternative Data)

Pour offrir un avantage concurrentiel aux agents d'IA, le desk intègre des flux d'informations non traditionnels dits "données alternatives" :

*   **GitHub/Developer Activity Metrics** :
    *   **Indicateurs** : Nombre de commits quotidiens, soumissions de Pull Requests, nombre d'issues résolues et croissance du nombre de contributeurs uniques sur les repositories des protocoles d'infrastructure Layer-1 et d'applications d'envergure.
    *   **Logique Alpha** : Une accélération de l'activité des développeurs sur un projet crypto (ex: +50% de commits sur 30 jours) est un indicateur précurseur de livraison technologique, souvent corrélé à une rotation de capitaux et une appréciation du prix sous-jacent à moyen terme.
*   **Whale Wallet & On-Chain Flow Monitoring** :
    *   **Indicateurs** : Flux entrants et sortants des portefeuilles étiquetés comme institutionnels ou baleines (Whales) depuis ou vers les exchanges centralisés (CEX) et décentralisés (DEX).
    *   **Logique Alpha** : Un transfert massif de jetons (ex: > 10 millions de dollars) vers un contrat de dépôt d'échange indique une pression vendeuse imminente (Inflow). Inversement, un retrait massif vers des cold wallets indique une accumulation hors marché, favorable à une réduction de l'offre et un effet de raréfaction de la liquidité.

### A. Exemple d'Intégration Opérationnelle en Python (Calcul de Score Combiné)

```python
import numpy as np
import pandas as pd

def calculate_alternative_alpha_score(github_df, whale_df, sentiment_df):
    """
    Calcule un score Alpha synthétique basé sur les données alternatives.
    github_df : colonnes ['commits_30d_growth']
    whale_df : colonnes ['net_outflow_usd_30d'] (flux sortants des CEX en USD)
    sentiment_df : colonnes ['sentiment_score_finbert']
    """
    # 1. Normalisation Min-Max des features
    git_norm = (github_df['commits_30d_growth'] - github_df['commits_30d_growth'].mean()) / github_df['commits_30d_growth'].std()
    whale_norm = (whale_df['net_outflow_usd_30d'] - whale_df['net_outflow_usd_30d'].mean()) / whale_df['net_outflow_usd_30d'].std()
    sent_norm = sentiment_df['sentiment_score_finbert'] # Déjà normalisé [-1, 1]
    
    # 2. Score combiné pondéré
    # Un score positif indique des fondamentaux / momentum favorables
    alternative_score = (0.3 * git_norm) + (0.4 * whale_norm) + (0.3 * sent_norm)
    
    # 3. Règle de signal Alpha
    # Si le score alternatif dépasse le seuil de 1.5 écarts-types, le Market Screener lève une alerte
    signals = alternative_score.apply(lambda x: "BULLISH_ROTATION" if x > 1.5 else ("BEARISH_EXHAUSTION" if x < -1.5 else "NEUTRAL"))
    
    return pd.DataFrame({
        'Alternative_Score': alternative_score,
        'Signal': signals
    }, index=github_df.index)
```
