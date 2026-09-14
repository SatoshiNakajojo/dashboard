# Détection Mathématique des Extrema, Tracés de Trendlines et Algorithmes en Python

Dans un système de trading systématique et algorithmique, la détection des structures graphiques (supports, résistances, canaux, figures chartistes) nécessite de traduire des concepts visuels en opérations mathématiques rigoureuses et déterministes. 

Ce document décrit les algorithmes fondamentaux utilisés pour nettoyer les données de prix, identifier les extrema locaux (sommets et creux), modéliser formellement la théorie de Dow, et tracer automatiquement des supports, résistances et lignes de tendance en Python.

---

## 1. Formalisation Mathématique des Extrema Locaux (Peaks & Troughs)

Pour identifier une figure chartiste ou tracer une ligne de tendance, un algorithme doit d'abord extraire de la série temporelle brute les points de retournement majeurs, appelés **extrema locaux**.

### A. Algorithme par Fenêtre Glissante (Rolling Window)

C'est la méthode la plus simple et robuste pour identifier les sommets locaux (peaks, $P$) et les creux locaux (troughs, $T$). Un point $x_t$ est un extremum local d'ordre $n$ si sa valeur est supérieure (ou inférieure) à toutes les valeurs environnantes sur un horizon de $n$ bougies de chaque côté.

*   **Sommet local (Peak)** :
    $$P_t = x_t \iff x_t = \max(x_{t-n}, \dots, x_t, \dots, x_{t+n})$$
*   **Creux local (Trough)** :
    $$T_t = x_t \iff x_t = \min(x_{t-n}, \dots, x_t, \dots, x_{t+n})$$

*Inconvénient de l'implémentation en temps réel* : Cette méthode introduit un retard algorithmique systématique égal à $n$ périodes (puisqu'il faut attendre d'avoir les $n$ bougies futures pour confirmer la nature de l'extremum).

### B. Algorithme SciPy `argrelextrema`

Pour traiter efficacement d'importantes quantités de données historiques (backtesting), nous utilisons la bibliothèque scientifique `scipy.signal` qui implémente des algorithmes optimisés en C/C++ pour localiser les indices des extrema locaux dans un tableau à 1 dimension.

---

## 2. Lissage des Données de Prix : Le Filtre de Savitzky-Golay

Les séries de prix brutes (surtout dans les crypto-monnaies) contiennent une grande quantité de "bruit" haute fréquence (mèches brutales, spreads) qui perturbe la détection des structures géométriques à moyen terme.

Pour éliminer ce bruit sans introduire le déphasage (lag) temporel typique des moyennes mobiles simples ou exponentielles, nous appliquons un **filtre de Savitzky-Golay** ($SG$). 

Le filtre de Savitzky-Golay lisse les données en ajustant des polynômes locaux de degré $d$ sur des fenêtres glissantes de taille impaire $w$.

$$y_i = \sum_{j=-m}^{m} c_j \cdot x_{i+j}$$

Où les coefficients $c_j$ sont précalculés par la méthode des moindres carrés pour préserver les moments statistiques d'ordre supérieur de la série d'origine (comme la hauteur et la forme des pics réels).

---

## 3. Identification Algorithmique des Tendances (Théorie de Dow)

Une fois les extrema locaux identifiés et filtrés sur les prix de clôture, nous pouvons implémenter la théorie de Dow de manière mathématiquement stricte.

```
       Higher High (HH2)
            /\
           /  \             Uptrend : HH2 > HH1 ET HL2 > HL1
HH1       /    \
 /\      /      \
/  \----/ HL2    \
    \  /
     \/ HL1
```

*   **Uptrend (Tendande Haussière)** : Définie par une suite de sommets de plus en plus hauts (Higher Highs - $HH$) et de creux de plus en plus hauts (Higher Lows - $HL$).
    $$HH_k > HH_{k-1} \quad \text{et} \quad HL_k > HL_{k-1}$$
*   **Downtrend (Tendance Baissière)** : Définie par une suite de sommets de plus en plus bas (Lower Highs - $LH$) et de creux de plus en plus bas (Lower Lows - $LL$).
    $$LH_k < LH_{k-1} \quad \text{et} \quad LL_k < LL_{k-1}$$

---

## 4. Code Python Complet : Lissage, Détection d'Extrema et Identification de Tendance

Voici le script Python prêt à être intégré dans votre infrastructure de trading automatique. Il prend en entrée un jeu de données de prix OHLC (DataFrame Pandas), applique le lissage de Savitzky-Golay, détecte les extrema via `scipy` et labellise les tendances.

```python
import numpy as np
import pandas as pd
from scipy.signal import argrelextrema, savgol_filter
from scipy.stats import linregress

def process_market_trends(df: pd.DataFrame, order: int = 5, sg_window: int = 15, sg_poly: int = 3) -> pd.DataFrame:
    """
    Lisse la courbe des prix avec le filtre de Savitzky-Golay,
    détecte les sommets et les creux locaux,
    et qualifie la tendance (Théorie de Dow).
    
    :param df: DataFrame pandas contenant les colonnes ['close', 'high', 'low']
    :param order: Nombre de bougies de comparaison de chaque côté pour argrelextrema
    :param sg_window: Fenêtre du filtre Savitzky-Golay (doit être un entier impair)
    :param sg_poly: Degré du polynôme du filtre
    """
    df = df.copy()
    
    # 1. Éviter les erreurs de dimension si la taille des données est insuffisante
    if len(df) < sg_window:
        raise ValueError("Le jeu de données est trop petit pour appliquer le filtre SG spécifié.")
        
    # 2. Application du lissage de Savitzky-Golay sur le prix de clôture
    df['smoothed_close'] = savgol_filter(df['close'].values, window_length=sg_window, polyorder=sg_poly)
    
    # 3. Détection des indices d'extrema locaux
    # np.greater détecte les sommets (peaks)
    # np.less détecte les creux (troughs)
    peaks_idx = argrelextrema(df['smoothed_close'].values, comparator=np.greater, order=order)[0]
    troughs_idx = argrelextrema(df['smoothed_close'].values, comparator=np.less, order=order)[0]
    
    # Initialisation des colonnes d'extrema
    df['local_peak'] = np.nan
    df['local_trough'] = np.nan
    
    df.loc[df.index[peaks_idx], 'local_peak'] = df.loc[df.index[peaks_idx], 'smoothed_close']
    df.loc[df.index[troughs_idx], 'local_trough'] = df.loc[df.index[troughs_idx], 'smoothed_close']
    
    # 4. Labellisation Dow Theory (HH, HL, LH, LL)
    df['pivot_type'] = ""
    
    last_peak_val = None
    last_trough_val = None
    
    for idx in df.index:
        # Traitement des sommets
        if not np.isnan(df.at[idx, 'local_peak']):
            curr_peak = df.at[idx, 'local_peak']
            if last_peak_val is not None:
                if curr_peak > last_peak_val:
                    df.at[idx, 'pivot_type'] = "HH"  # Higher High
                else:
                    df.at[idx, 'pivot_type'] = "LH"  # Lower High
            last_peak_val = curr_peak
            
        # Traitement des creux
        if not np.isnan(df.at[idx, 'local_trough']):
            curr_trough = df.at[idx, 'local_trough']
            if last_trough_val is not None:
                if curr_trough > last_trough_val:
                    df.at[idx, 'pivot_type'] = "HL"  # Higher Low
                else:
                    df.at[idx, 'pivot_type'] = "LL"  # Lower Low
            last_trough_val = curr_trough
            
    # 5. Détection de la tendance actuelle par propagation des pivots
    # Remplit les valeurs vides vers le bas pour garder une trace du dernier pivot
    df['last_pivot'] = df['pivot_type'].replace("", np.nan).ffill()
    
    df['trend_direction'] = "NEUTRAL"
    df.loc[df['last_pivot'].isin(['HH', 'HL']), 'trend_direction'] = "UPTREND"
    df.loc[df['last_pivot'].isin(['LH', 'LL']), 'trend_direction'] = "DOWNTREND"
    
    return df

def calculate_linear_trendlines(df: pd.DataFrame, lookback: int = 50) -> dict:
    """
    Calcule l'équation de la ligne de tendance haussière (support) et baissière (résistance)
    en utilisant une régression linéaire sur les extrema des 'lookback' dernières bougies.
    """
    df_subset = df.tail(lookback)
    
    # Filtrer les creux (troughs) pour le support oblique
    troughs = df_subset[df_subset['local_trough'].notna()]
    # Filtrer les sommets (peaks) pour la résistance oblique
    peaks = df_subset[df_subset['local_peak'].notna()]
    
    result = {"support": None, "resistance": None}
    
    if len(troughs) >= 2:
        # Convertir les index temporels en valeurs numériques pour la régression
        x_vals = np.arange(len(df_subset))[df_subset['local_trough'].notna()]
        y_vals = troughs['local_trough'].values
        slope, intercept, r_val, p_val, std_err = linregress(x_vals, y_vals)
        result["support"] = {"slope": slope, "intercept": intercept, "r_squared": r_val**2}
        
    if len(peaks) >= 2:
        x_vals = np.arange(len(df_subset))[df_subset['local_peak'].notna()]
        y_vals = peaks['local_peak'].values
        slope, intercept, r_val, p_val, std_err = linregress(x_vals, y_vals)
        result["resistance"] = {"slope": slope, "intercept": intercept, "r_squared": r_val**2}
        
    return result
```

---

## 5. Tracé Algorithmique des Zones Horizontales (Support/Résistance)

Les zones de support et de résistance horizontaux représentent des zones de forte accumulation historique d'ordres d'achat (limite de carnet) ou de vente. Au lieu d'identifier de simples lignes, les traders quantitatifs segmentent le carnet en zones d'épaisseur dynamique.

### Algorithme de Clustering de Points (K-Means)

Pour regrouper les extrema de prix horizontaux en niveaux logiques majeurs :
1.  **Extraction de données** : On extrait la liste de toutes les valeurs de prix associées aux `local_peak` et `local_trough` sur une période de 200 à 500 bougies.
2.  **Clustering par K-Means** (avec la bibliothèque `scikit-learn`) : On applique l'algorithme K-Means avec un nombre de clusters prédéfini (ex: $K=5$). 
3.  **Identification** : Les centres des clusters obtenus représentent les niveaux horizontaux de support ou résistance où la densité d'extrema passés est la plus élevée.
4.  **Force du niveau** : La force du support ou de la résistance est directement proportionnelle au nombre de points historiques contenus dans son cluster associé.
