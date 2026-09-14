# Machine Learning Appliqué et Détection de Régimes par Modèles de Markov Cachés (HMM)

Les règles de trading directionnel classiques échouent souvent parce qu'elles s'appliquent de manière uniforme sur des structures de marché changeantes. Un algorithme performant doit classifier le régime de marché sous-jacent (Tendance Haussière Calme, Tendance Baissière Volatile, Range Étroit, etc.) avant de déclencher des signaux opérationnels. Ce document formalise le cadre statistique et mathématique pour la détection automatisée des régimes par le Machine Learning, avec un focus sur les Modèles de Markov Cachés (Hidden Markov Models - HMM).

---

## 1. Cadre Théorique des Modèles de Markov Cachés (HMM)

Un Modèle de Markov Caché postule que l'état ou le régime du marché à un instant $t$, noté $s_t$, appartient à un ensemble fini de $K$ états cachés ou inobservables (par exemple $s_t \in \{1: \text{Calme Haussier}, 2: \text{Volatile Baissier}, 3: \text{Range}\}$). Bien que nous ne puissions pas observer $s_t$ directement, nous observons des variables de marché générées par cet état, appelées émissions, notées $o_t$ (par exemple, le rendement quotidien, la volatilité intra-journalière).

### A. Propriété de Markov et Matrice de Transition
L'évolution de l'état caché $s_t$ suit une chaîne de Markov du premier ordre, où la probabilité de transition vers l'état suivant dépend uniquement de l'état actuel :
$$P(s_t = j \mid s_{t-1} = i, s_{t-2} = k, \dots) = P(s_t = j \mid s_{t-1} = i) = A_{ij}$$

La **Matrice de Transition d'État** $A \in \mathbb{R}^{K \times K}$ regroupe ces probabilités :
$$A = \begin{pmatrix} 
A_{11} & A_{12} & \dots & A_{1K} \\
A_{21} & A_{22} & \dots & A_{2K} \\
\vdots & \vdots & \ddots & \vdots \\
A_{K1} & A_{K2} & \dots & A_{KK}
\end{pmatrix}$$

Avec la contrainte de normalisation : $\sum_{j=1}^K A_{ij} = 1$ pour tout $i$. En finance, les éléments diagonaux $A_{ii}$ sont généralement très élevés ($> 0.90$), ce qui reflète la persistance naturelle des régimes de marché (un régime baissier ou haussier a tendance à durer plusieurs jours ou semaines).

### B. Distribution d'Émission (Emission Probability)
Chaque état caché $i$ génère des observations $o_t$ selon une loi de probabilité continue, le plus souvent modélisée par une distribution Gaussienne (ou un mélange de Gaussiennes) caractérisée par une moyenne $\mu_i$ et une variance $\sigma_i^2$ (ou matrice de covariance $\Sigma_i$ pour des dimensions multiples) :
$$o_t \mid s_t = i \sim \mathcal{N}(\mu_i, \sigma_i^2)$$

$$P(o_t \mid s_t = i) = \frac{1}{\sqrt{2\pi\sigma_i^2}} \exp\left( -\frac{(o_t - \mu_i)^2}{2\sigma_i^2} \right)$$

---

## 2. Algorithmes Fondamentaux pour la Résolution des HMM

Pour exploiter un HMM au sein d'un trading desk, trois problèmes algorithmiques fondamentaux doivent être résolus :

### A. L'Algorithme de Viterbi (Décodage)
L'algorithme de Viterbi calcule la séquence d'états cachés la plus probable $S^* = \{s_1^*, s_2^*, \dots, s_T^*\}$ ayant généré la séquence d'observations observées $O = \{o_1, o_2, \dots, o_T\}$. Il résout par programmation dynamique :
$$\max_{S} P(S, O \mid A, B, \pi)$$

Où $\pi$ est le vecteur de probabilité initiale de l'état $s_1$.

### B. L'Algorithme de Baum-Welch (Apprentissage / Entraînement)
L'apprentissage d'un HMM s'effectue de manière non supervisée. L'algorithme de Baum-Welch est une variante de l'algorithme Espérance-Maximisation (EM) qui ajuste itérativement les paramètres du modèle (la matrice $A$, les moyennes $\mu_i$ et écarts-types $\sigma_i$ des émissions) pour maximiser la vraisemblance des données historiques observées :
$$\max_{A, \mu, \sigma} \log P(O \mid A, \mu, \sigma)$$

---

## 3. Ingénierie des Caractéristiques (Feature Engineering) pour la Détection de Régimes

Pour entraîner efficacement un classificateur de régime (HMM ou modèles d'apprentissage non supervisés), les données brutes de prix doivent être transformées en caractéristiques d'entrée stationnaires et informatives.

| Variable d'Entrée | Formule / Transformation | Intérêt pour le Régime |
| :--- | :--- | :--- |
| **Rendements logarithmiques** | $r_t = \ln(P_t / P_{t-1})$ | Mesure la direction et la dérive de l'actif. |
| **Volatilité Réalisée (Roll. Vol)** | $\sigma_{t, N} = \sqrt{\frac{1}{N-1} \sum_{i=0}^{N-1} (r_{t-i} - \bar{r})^2}$ | Sépare les régimes calmes (bull market actions) des paniques (bear market actions). |
| **Ratio de Volume Volatile** | $\text{V\_Ratio}_t = \frac{\text{Volume}_t}{\text{SMA(Volume, } N)_t}$ | Identifie les capitulations et les phases d'accumulation institutionnelle. |
| **Spread de Volatilité (VIX-SPY)** | $\text{Imbalance}_t = \sigma_{\text{implicite}} - \sigma_{\text{réalisée}}$ | Mesure le degré de complaisance ou de peur des opérateurs d'options. |
| **Taux de Financement (Crypto)** | $\text{Funding Rate}_t$ | Identifie l'effet de levier et l'excès d'optimisme/pessimisme. |

---

## 4. Approches Alternatives d'Apprentissage Non Supervisé

### A. Modèles de Mélange Gaussien (Gaussian Mixture Models - GMM)
Le GMM est un modèle de regroupement probabiliste qui suppose que les données observées sont générées à partir d'un mélange de plusieurs distributions gaussiennes à paramètres inconnus. Contrairement au K-Means qui effectue un partitionnement strict (Hard Clustering), le GMM fournit une probabilité d'appartenance douce (Soft Clustering) à chaque régime.

### B. K-Means et Réduction de Dimension (PCA) pour les Régimes Cross-Asset
Pour classifier le régime macroéconomique global sur des paniers d'actifs (ex. SPY, Gold, BTC, HYG, DXY) :
1.  **Réduction de dimension par ACP (Analyse en Composantes Principales)** : Projeter la matrice de rendements hautement corrélés sur ses $P$ vecteurs propres principaux pour extraire les facteurs de risque dominants (ex. Croissance vs. Inflation).
2.  **Clustering par K-Means** : Regrouper les coordonnées projetées en $K$ clusters stables pour définir les états macroéconomiques (ex. Récession, Expansion inflationniste, Stagnation).

---

## 5. Commutation de Stratégie Adaptative (Strategy Switching Engine)

Une fois que le HMM fournit à chaque pas de temps $t$ les probabilités a posteriori d'être dans chaque régime $P(s_t = i \mid O_{1:t})$, le moteur décisionnel du trading desk commute dynamiquement l'allocation du capital entre les sous-agents spécialisés.

```
                  +---> S_t = Régime 1 (Tendance Calme) ---> Agent Trend-Following
                  |                                          (Règles: EMA Cross, Breakout)
Moteur Decision --+---> S_t = Régime 2 (Range Étroit)    ---> Agent Mean-Reversion
                  |                                          (Règles: RSI, Bollinger Rebound)
                  +---> S_t = Régime 3 (Panique Volatile) ---> Coupe-circuit / Cash / Arbitrage
```

### Règles Décisionnelles de Transition :
Soit $w_t^{\text{trend}}$ et $w_t^{\text{range}}$ les allocations de capital respectives pour les agents de tendance et de range au temps $t$ :
*   **Seuil de Confiance de Tendance** : Si la probabilité du régime tendanciel dépasse un seuil $\alpha$ (ex. $P(s_t = \text{Tendance} \mid O_{1:t}) > 0.70$) :
    $$w_t^{\text{trend}} = 1.0, \quad w_t^{\text{range}} = 0.0$$
*   **Seuil de Confiance de Range** : Si la probabilité du régime de range dépasse $\beta$ (ex. $P(s_t = \text{Range} \mid O_{1:t}) > 0.65$) :
    $$w_t^{\text{trend}} = 0.0, \quad w_t^{\text{range}} = 1.0$$
*   **Zone d'Incertitude** : Si aucune probabilité ne dépasse le seuil, l'allocation est divisée proportionnellement aux probabilités estimées pour lisser l'impact des transitions brusques (filtre de transition souple) :
    $$w_t^{\text{trend}} = P(s_t = \text{Tendance} \mid O_{1:t}), \quad w_t^{\text{range}} = P(s_t = \text{Range} \mid O_{1:t})$$

Cette architecture de commutation dynamique prévient l'érosion du capital des algorithmes de tendance pendant les longs mois de consolidation latérale et protège les algorithmes de retour à la moyenne contre les explosions directionnelles unilatérales (Breakout).
