# Mathématiques des Indicateurs Techniques et Signaux de Divergence

Les indicateurs techniques sont des transformations mathématiques déterministes appliquées aux données de marché historiques (Open, High, Low, Close, Volume). Ils servent à compresser l'information, à mesurer l'inertie du prix (momentum), la force d'une tendance ou la volatilité actuelle.

Ce document détaille les formules mathématiques exactes des indicateurs de référence, leurs interprétations quantitatives, ainsi que l'identification formelle des signaux de divergence (RSI/Prix) indispensables à l'alimentation de vos agents de trading.

---

## 1. La Moyenne Mobile Exponentielle (EMA - Exponential Moving Average)

Contrairement à la Moyenne Mobile Simple (SMA) qui attribue le même poids à toutes les bougies de la fenêtre, l'EMA attribue un poids exponentiellement décroissant aux observations les plus anciennes. Elle réagit donc beaucoup plus rapidement aux changements de tendance récents.

### Formule de Calcul Récursive

L'EMA à $N$ périodes pour une bougie $t$ est calculée de la façon suivante :

$$\text{EMA}_t = \left( \text{Prix}_t \cdot \alpha \right) + \left( \text{EMA}_{t-1} \cdot (1 - \alpha) \right)$$

Où :
*   $\text{Prix}_t$ est généralement le prix de clôture de la bougie actuelle ($C_t$).
*   $\alpha$ est le facteur de lissage multiplicatif, défini par :
    $$\alpha = \frac{2}{N + 1}$$
*   Pour l'initialisation de la formule, la valeur $\text{EMA}_0$ de la première bougie de la série est calculée à l'aide d'une Moyenne Mobile Simple (SMA) sur les $N$ premières périodes.

---

## 2. Le Relative Strength Index (RSI)

Le RSI est un oscillateur de momentum borné entre 0 et 100, développé par J. Welles Wilder en 1978. Il mesure la vitesse et l'ampleur des mouvements de prix directionnels récents.

### Formule de Calcul Mathématique

Le RSI est calculé à l'aide des formules successives suivantes :

$$RSI_t = 100 - \frac{100}{1 + RS_t}$$

Où $RS$ (Relative Strength) est le ratio de la moyenne mobile des gains sur celle des pertes :

$$RS_t = \frac{\text{Average Gain}_t}{\text{Average Loss}_t}$$

Pour calculer les gains ($G$) et les pertes ($L$) à chaque bougie :
*   $\text{Diff}_t = C_t - C_{t-1}$
*   $G_t = \max(\text{Diff}_t, 0)$
*   $L_t = \max(-\text{Diff}_t, 0)$

Wilder utilise une méthode de lissage spécifique (équivalente à une EMA modifiée) pour calculer l'Average Gain ($AG$) et l'Average Loss ($AL$) à la période $t$ sur une fenêtre de $N$ périodes (généralement $N=14$) :

$$\text{Average Gain}_t = \frac{\text{Average Gain}_{t-1} \cdot (N-1) + G_t}{N}$$
$$\text{Average Loss}_t = \frac{\text{Average Loss}_{t-1} \cdot (N-1) + L_t}{N}$$

---

## 3. Le MACD (Moving Average Convergence Divergence)

Créé par Gerald Appel, le MACD mesure la convergence et la divergence de deux moyennes mobiles exponentielles de périodes différentes. C'est à la fois un indicateur de suivi de tendance et de momentum.

### Équations de Base

Le MACD se compose de trois éléments calculés à chaque bougie $t$ :

1.  **La Ligne MACD (MACD Line)** : Différence entre l'EMA rapide (généralement 12 périodes) et l'EMA lente (généralement 26 périodes).
    $$\text{MACD Line}_t = \text{EMA}_{12}(C)_t - \text{EMA}_{26}(C)_t$$

2.  **La Ligne de Signal (Signal Line)** : EMA à 9 périodes de la ligne MACD.
    $$\text{Signal Line}_t = \text{EMA}_9(\text{MACD Line})_t$$

3.  **L'Histogramme MACD** : Représente la distance entre la ligne MACD et la ligne de Signal.
    $$\text{Histogram}_t = \text{MACD Line}_t - \text{Signal Line}_t$$

---

## 4. Les Bandes de Bollinger (Bollinger Bands)

Développées par John Bollinger, les Bandes de Bollinger mesurent la volatilité dynamique d'un actif. Elles se composent d'une bande médiane entourée de deux bandes dont l'écartement varie selon l'écart-type des prix.

### Équations de Base

1.  **Bande Médiane (Middle Band)** : Moyenne mobile simple (généralement sur $N = 20$ périodes) du prix de clôture.
    $$\text{MB}_t = \text{SMA}_{20}(C)_t = \frac{1}{20} \sum_{i=0}^{19} C_{t-i}$$

2.  **Bandes Supérieure et Inférieure** : Éloignées de la bande médiane par un nombre $K$ d'écarts-types (généralement $K = 2.0$) calculés sur la même fenêtre glissante de $N$ périodes.
    $$\text{UB}_t = \text{MB}_t + K \cdot \sigma_{20}(t)$$
    $$\text{LB}_t = \text{MB}_t - K \cdot \sigma_{20}(t)$$

Où $\sigma_N(t)$ est l'écart-type rolling (Standard Deviation) du prix sur les $N$ dernières clôtures :

$$\sigma_N(t) = \sqrt{\frac{1}{N} \sum_{i=0}^{N-1} (C_{t-i} - \text{MB}_t)^2}$$

*   **Squeeze de volatilité** : Lorsque les bandes supérieure et inférieure se resserrent à un niveau historiquement bas, cela indique une baisse extrême de la volatilité. Cela précède généralement une phase d'impulsion directionnelle majeure (breakout).

---

## 5. L'ADX (Average Directional Index)

L'ADX fait partie du système de mouvement directionnel conçu par Welles Wilder. Il mesure la force globale d'une tendance, quelle que soit sa direction.

### Calcul de la Force de Tendance

1.  **Mouvement Directionnel ($DM$)** :
    *   $+\text{DM}_t = H_t - H_{t-1}$ si $(H_t - H_{t-1}) > (L_{t-1} - L_t)$ et $(H_t - H_{t-1}) > 0$, sinon $+\text{DM}_t = 0$.
    *   $-\text{DM}_t = L_{t-1} - L_t$ si $(L_{t-1} - L_t) > (H_t - H_{t-1})$ et $(L_{t-1} - L_t) > 0$, sinon $-\text{DM}_t = 0$.

2.  **Calcul du True Range ($TR$)** et lissage sur $N$ périodes pour obtenir $+\text{DI}_N$ et $-\text{DI}_N$ :
    $$+\text{DI}_N = 100 \cdot \frac{\text{EMA}_N(+\text{DM})}{\text{EMA}_N(TR)}$$
    $$-\text{DI}_N = 100 \cdot \frac{\text{EMA}_N(-\text{DM})}{\text{EMA}_N(TR)}$$

3.  **Calcul de l'ADX** :
    $$\text{DX}_t = 100 \cdot \frac{|(+\text{DI}_N) - (-\text{DI}_N)|}{(+\text{DI}_N) + (-\text{DI}_N)}$$
    $$\text{ADX}_t = \text{Moyenne Mobile Lissée de } \text{DX}_t$$

*   **Règle de force** :
    *   $\text{ADX} < 20$ : Marché sans tendance claire (Ranging Market, privilégier les oscillateurs de type RSI ou bandes de Bollinger).
    *   $\text{ADX} > 25$ : Tendance forte en cours (Trend Following, privilégier le suivi avec moyennes mobiles).
    *   $\text{ADX} > 40$ : Tendance extrêmement puissante.

---

## 6. Identification Algorithmique des Divergences RSI-Prix

Une divergence se produit lorsque la trajectoire de l'oscillateur de momentum (RSI) se déconnecte de la trajectoire du prix. C'est l'un des signaux de retournement de tendance les plus puissants.

```
       Divergence Haussière (Bullish)           Divergence Baissière (Bearish)
       Prix : Creux descendants                 Prix : Sommets ascendants
       RSI  : Creux ascendants                 RSI  : Sommets descendants

Prix :   \      /                                Prix :     /\    /\
          \  /\/                                           /  \--/  \
           \/                                             /
RSI  :      /\  /\                               RSI  :     /\
           /  \/  \                                        /  \  /\
          /                                               /    \/  \
```

### A. Divergence Haussière Standard (Bullish Divergence)
*   **Conditions de Prix** : Le prix de l'actif inscrit un nouveau creux local inférieur au précédent ($LL$).
*   **Conditions d'Indicateur** : Le RSI inscrit un creux local supérieur au précédent ($HL$).
*   **Psychologie** : Malgré la pression vendeuse qui pousse les prix plus bas, le momentum baissier s'épuise. Les acheteurs accumulent secrètement.

### B. Divergence Baissière Standard (Bearish Divergence)
*   **Conditions de Prix** : Le prix inscrit un nouveau sommet local supérieur au précédent ($HH$).
*   **Conditions d'Indicateur** : Le RSI inscrit un sommet local inférieur au précédent ($LH$).
*   **Psychologie** : Bien que le prix monte sous l'effet de l'inertie de la tendance, le momentum s'essouffle. Les acheteurs perdent la main, annonçant une distribution imminente.

### Formulation Algorithmique pour les Agents

Pour coder une alerte de divergence de manière robuste dans l'API de vos agents :
1.  **Détecter deux creux (ou sommets) consécutifs** sur le prix via l'algorithme d'extrema (voir doc Analyse Graphique). Soit $T_1$ et $T_2$ les prix correspondants aux indices temporels $t_1$ et $t_2$ (avec $t_1 < t_2$).
2.  **Calculer le RSI** aux mêmes indices : $RSI(t_1)$ et $RSI(t_2)$.
3.  **Vérifier la condition de divergence haussière** :
    $$\text{Divergence Haussière} \iff T_2 < T_1 \quad \text{et} \quad RSI(t_2) > RSI(t_1)$$
4.  **Vérifier la condition de divergence baissière** :
    $$\text{Divergence Baissière} \iff P_2 > P_1 \quad \text{et} \quad RSI(t_2) < RSI(t_1)$$
