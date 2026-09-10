# Règles de Trading en Tendance & en Range et Analyse des Phases de Marché

Ce document formalise les règles opérationnelles et quantitatives pour identifier les régimes de marché et y appliquer des stratégies adaptées de suivi de tendance ou de retour à la moyenne (mean reversion).

---

## 1. Les Phases de Marché : Le Modèle Quantitatif de Wyckoff et Dow

Le marché évolue de manière cyclique en quatre phases distinctes. La reconnaissance de ces phases détermine le biais directionnel des agents et les types d'algorithmes à activer.

```
       [ Phase 2 : MARKUP (Tendance Haussière) ]
             /\             /\
            /  \__         /  \
           /      \       /    \       [ Phase 3 : DISTRIBUTION (Sommet) ]
          /        \_____/      \             _/\_/\_
         /                                   /       \
_______/                                              \_____
[ Phase 1 : ACCUMULATION (Range de Base) ]                  \
                                                             \_____
                                                                   \
                                                                    \ [ Phase 4 : MARKDOWN ]
                                                                     \  (Tendance Baissière)
```

### Phase 1 : L'Accumulation (Range de Base)
*   **Dynamique macro** : Les investisseurs institutionnels ("smart money") accumulent des positions de manière discrète au sein d'une borne horizontale bien définie.
*   **Microstructure** : Le volume diminue progressivement à mesure que l'offre flottante est absorbée. Cette phase se termine souvent par un **Spring** (fausse cassure baissière/shakeout) pour capturer la liquidité résiduelle sous le support avant d'initier la hausse.
*   **Biais de l'agent** : Neutre / Long sur support après confirmation de fausse cassure.

### Phase 2 : Le Markup (Tendance Haussière)
*   **Dynamique macro** : Cassure validée de la résistance d'accumulation avec impulsion volumétrique. Le grand public et les fonds de suivi de tendance entrent sur le marché.
*   **Microstructure** : succession de hauts plus hauts (Higher Highs - HH) et de bas plus hauts (Higher Lows - HL). Les retracements sont brefs et caractérisés par une baisse de volume, suivis de vagues d'impulsion à fort volume.
*   **Biais de l'agent** : Strictement haussier (Long on pullbacks / Breakout trading).

### Phase 3 : La Distribution (Sommet)
*   **Dynamique macro** : Les mains fortes distribuent leurs positions aux acheteurs tardifs ("main retail"). Le marché devient volatil et latéralise.
*   **Microstructure** : Échecs répétés à franchir la résistance supérieure. Apparition d'un **Upthrust After Distribution (UTAD)**, piégeant les acheteurs de breakout avant l'effondrement. Le volume augmente sur les bougies baissières.
*   **Biais de l'agent** : Neutre / Short sur résistance après UTAD.

### Phase 4 : Le Markdown (Tendance Baissière)
*   **Dynamique macro** : Phase de panique et de ventes forcées (liquidations en cascade sur crypto, appels de marge sur actions). 
*   **Microstructure** : Succession de hauts plus bas (Lower Highs - LH) et de bas plus bas (Lower Lows - LL). Les cassures de support se font sans effort, et les rebonds techniques échouent systématiquement sur les anciennes zones de support (polarité).
*   **Biais de l'agent** : Strictement baissier (Short on pullbacks / Breakdown trading).

---

## 2. Identification Quantitative du Régime : Tendance vs. Range

Pour éviter qu'un algorithme de tendance ne se fasse laminer dans un range, ou qu'un algorithme de retour à la moyenne ne subisse une perte catastrophique lors d'un breakout, les agents doivent calculer trois filtres de régime :

### A. L'Average Directional Index (ADX)
L'ADX mesure la force d'une tendance, indépendamment de sa direction. Il est calculé à partir du Directional Movement Index ($+DI$ et $-DI$).

$$\text{ATR}_t = \text{EMA}(TR, N)$$
$$+DM_t = \text{High}_t - \text{High}_{t-1} \quad \text{si} \quad (\text{High}_t - \text{High}_{t-1}) > (\text{Low}_{t-1} - \text{Low}_t) \quad \text{et} > 0$$
$$-DM_t = \text{Low}_{t-1} - \text{Low}_t \quad \text{si} \quad (\text{Low}_{t-1} - \text{Low}_t) > (\text{High}_t - \text{High}_{t-1}) \quad \text{et} > 0$$
$$+DI_t = 100 \times \frac{\text{EMA}(+DM, N)}{\text{ATR}_t}$$
$$-DI_t = 100 \times \frac{\text{EMA}(-DM, N)}{\text{ATR}_t}$$
$$\text{DX} = 100 \times \frac{|+DI - -DI|}{+DI + -DI}$$
$$\text{ADX}_t = \text{EMA}(\text{DX}, N)$$

*   **Règle décisionnelle** :
    *   **$\text{ADX} > 25$** : Tendance forte établie. Activer les modules de suivi de tendance.
    *   **$\text{ADX} < 20$** : Marché en range/congestion. Désactiver le suivi de tendance, activer le retour à la moyenne.

### B. Bollinger Bandwidth (Largeur des Bandes)
La largeur relative des bandes de Bollinger indique la phase de volatilité (contraction vs. expansion).

$$\text{Bollinger Bandwidth} = \frac{\text{Upper Band} - \text{Lower Band}}{\text{Middle Band}}$$

*   **Compression (Squeeze)** : Un Bandwidth historiquement bas indique une contraction extrême de la volatilité, signalant l'imminence d'une phase de Markup/Markdown (breakout).
*   **Expansion** : Un élargissement violent des bandes valide le début d'une phase directionnelle.

### C. Slope (Pente) d'une Moyenne Mobile Long Terme (EMA 200)
L'évaluation de la pente de l'EMA 200 via une régression linéaire sur un lookback de $M$ périodes permet de confirmer la phase macro-économique.
*   $\text{Slope} \approx 0$ : Range macro-économique.
*   $\text{Slope} > \epsilon$ : Tendance haussière saine.

---

## 3. Règles Opérationnelles de Trading en Tendance (Markup / Markdown)

Dans un marché à fort momentum ($\text{ADX} > 25$), les règles suivantes s'imposent pour maximiser l'effet de levier sur la tendance.

### Stratégie 1 : Achat sur Pullback (Repli)
*   **Condition d'entrée (Long)** : Prix supérieur à l'EMA 200 ($\text{Filtre Tendance} = 1$). Le prix retrace vers l'EMA 21 ou EMA 50 en phase corrective.
*   **Signal de déclenchement** : Bougie de retournement haussier (ex: Hammer ou Englobante) touchant la moyenne de support, validée par un RSI qui rebondit depuis la zone neutre (entre 40 et 50).
*   **Stop-Loss** : Positionné à $1.5 \times \text{ATR}$ sous le plus bas récent (HL).
*   **Take-Profit** : Ratio Risk/Reward minimum de $1:2.5$, ou sortie dynamique via un trailing stop basé sur le **Chandelier Exit** ($3 \times \text{ATR}$ calculé sur le plus haut de la position).

### Stratégie 2 : Breakout System (Cassure)
*   **Condition d'entrée (Long)** : Le prix casse une résistance horizontale établie (durant au moins 30 bougies).
*   **Filtre de validation** : Le volume lors de la bougie de cassure doit être supérieur d'au moins $1.5 \times$ à la moyenne mobile des volumes sur 20 périodes. Le RSI doit être orienté à la hausse et croiser les $60$.
*   **Stop-Loss** : Placé au milieu de l'ancien range ou sous la bougie de breakout.

```python
# Pseudo-code d'un filtre de tendance pour robot systématique
def is_trending(df, lookback=14):
    adx_val = calculate_adx(df, lookback)
    bandwidth = calculate_bollinger_bandwidth(df)
    
    if adx_val > 25:
        trend_direction = "BULL" if df['close'].iloc[-1] > df['ema_200'].iloc[-1] else "BEAR"
        return {"regime": "TRENDING", "direction": trend_direction}
    else:
        return {"regime": "RANGING", "direction": "NEUTRAL"}
```

---

## 4. Règles Opérationnelles de Trading en Range (Mean Reversion)

Lorsque le marché consolide ($\text{ADX} < 20$), les stratégies de cassure échouent systématiquement (phénomène de *whipsaw*). Il faut appliquer un cadre de retour à la moyenne.

### Stratégie : Oscillateur aux Bornes (Bollinger + RSI)
*   **Condition d'entrée (Long)** : Le prix touche le support horizontal majeur du range, qui coïncide avec la bande de Bollinger inférieure.
*   **Filtre de validation** : Le RSI (14) est en zone de survente ($< 30$) et montre une divergence haussière classique (le prix fait un double bas horizontal, mais le RSI fait un bas plus haut). Le volume doit être faible (signe d'épuisement des vendeurs).
*   **Signal de déclenchement** : Clôture d'une bougie à l'intérieur de la bande inférieure de Bollinger (réintégration).
*   **Stop-Loss** : Très serré, placé à $0.5 \times \text{ATR}$ sous le support horizontal. Un franchissement de ce niveau invalide immédiatement le range.
*   **Take-Profit** : Premier objectif partiel (50% de la position) sur la ligne médiane des bandes de Bollinger (SMA 20). Objectif final sur la bande de Bollinger supérieure (résistance opposée).

### Tableau de Synthèse des Règles

| Paramètre / Règle | Régime TENDANCE ($\text{ADX} > 25$) | Régime RANGE ($\text{ADX} < 20$) |
| :--- | :--- | :--- |
| **Biais de Trading** | Suivi du momentum directionnel | Retour à la valeur moyenne |
| **Indicateurs clés** | EMA 21, EMA 50, EMA 200, ADX | RSI, Stochastique, Bollinger Bands |
| **Points d'entrée** | Cassure (Breakout) ou Pullback sur MA | Touche de support/résistance horizontale |
| **Filtre de Volume** | Volume élevé requis sur les mouvements | Volume faible requis aux extrêmes du range |
| **Gestion du Stop** | Stop large ($1.5$ à $2 \times \text{ATR}$) pour respirer | Stop très serré ($0.5 \times \text{ATR}$ ou niveau horizontal) |
| **Take Profit** | Trailing Stop dynamique (laisser courir) | Objectif fixe aux bornes opposées du range |
