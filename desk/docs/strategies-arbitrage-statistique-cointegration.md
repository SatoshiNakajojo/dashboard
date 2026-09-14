# Arbitrage Statistique & Co-intégration : Modélisation Quantitative et Stratégie Pairs Trading

L'arbitrage statistique (StatArb) et plus particulièrement le *Pairs Trading* reposent sur la construction de portefeuilles synthétiques stables à partir d'actifs individuellement volatils et non stationnaires. Ce document formalise la transition mathématique de la corrélation simple à la co-intégration, décrit la méthodologie en deux étapes d'Engle-Granger, le modèle à correction d'erreur (VECM), et fournit une implémentation Python complète de niveau production.

---

## 1. Fondations Mathématiques : Stationnarité, Intégration et Co-intégration

### A. Intégration d'ordre $d$ : $I(d)$
Une série temporelle univariée $X_t$ est intégrée d'ordre $d$ (notée $X_t \sim I(d)$) si elle doit être différenciée $d$ fois pour devenir stationnaire d'ordre 2 (faiblement stationnaire).
*   **Série stationnaire $I(0)$** : Moyenne constante, variance finie constante et fonction d'autocovariance dépendante uniquement du décalage temporel $\tau$, sans dérive dans le temps.
    $$\mathbb{E}[X_t] = \mu, \quad \text{Var}(X_t) = \sigma^2 < \infty, \quad \text{Cov}(X_t, X_{t+\tau}) = \gamma(\tau)$$
*   **Série non stationnaire $I(1)$** : Marche aléatoire typique des prix financiers (actions, crypto-monnaies).
    $$X_t = X_{t-1} + \epsilon_t, \quad \epsilon_t \sim \text{WN}(0, \sigma^2) \implies \text{Var}(X_t) = t \cdot \sigma^2$$
    La variance diverge linéairement avec le temps, rendant les régressions simples trompeuses (biais de régression de prime abord significative mais fallacieuse).

### B. Co-intégration
Soient deux séries de prix $Y_t \sim I(1)$ et $X_t \sim I(1)$. S'il existe une combinaison linéaire de ces séries qui est stationnaire $I(0)$, alors les deux séries sont dites co-intégrées.
Il existe un vecteur de co-intégration $\boldsymbol{\beta} = [1, -\beta]^T$ tel que le résidu (ou spread) $u_t$ satisfait :
$$u_t = Y_t - \beta X_t - \alpha \sim I(0)$$
Où :
*   $\beta$ représente le ratio de couverture (*hedge ratio*).
*   $\alpha$ représente la constante de décalage historique.
*   $u_t$ représente le spread stationnaire qui oscille autour d'une moyenne de zéro avec une variance stable, offrant une opportunité de retour à la moyenne (*mean reversion*).

---

## 2. Test de Co-intégration d'Engle-Granger (Two-Step Method)

Le test d'Engle-Granger vérifie l'existence d'une relation de co-intégration par un processus en deux étapes successives.

### Étape 1 : Estimation de la relation de long terme par Moindres Carrés Ordinaires (OLS)
On estime par régression linéaire simple la relation contemporaine entre les séries de prix d'origine :
$$Y_t = \alpha + \beta X_t + u_t$$
On extrait la série temporelle des résidus estimés $\hat{u}_t$ :
$$\hat{u}_t = Y_t - \hat{\alpha} - \hat{\beta} X_t$$

### Étape 2 : Test de racine unitaire sur les résidus (Test ADF modifié)
On applique le test d'Augmented Dickey-Fuller (ADF) sur la série temporelle des résidus $\hat{u}_t$. Le modèle de régression du test ADF est formulé ainsi :
$$\Delta \hat{u}_t = \phi \hat{u}_{t-1} + \sum_{i=1}^{p} \theta_i \Delta \hat{u}_{t-i} + e_t$$
Où $p$ est le nombre de lags sélectionné par critère d'information (AIC ou BIC).
*   **Hypothèse Nulle ($H_0$)** : $\phi = 0$ (les résidus possèdent une racine unitaire, signifiant l'absence de co-intégration).
*   **Hypothèse Alternative ($H_1$)** : $\phi < 0$ (les résidus sont stationnaires, signifiant l'existence d'une relation de co-intégration).

*Remarque statistique* : Les valeurs critiques standard du test ADF d'une série isolée ne s'appliquent pas aux résidus d'une régression d'Engle-Granger. L'estimation OLS préalable de la première étape minimise artificiellement la variance des résidus $\hat{u}_t$, biaisant le test ADF vers la stationnarité. Il convient d'utiliser les valeurs critiques de MacKinnon (1994, 2010) spécialement ajustées pour ce test en deux étapes.

---

## 3. Le Modèle à Correction d'Erreur (VECM - Vector Error Correction Model)

La co-intégration implique que les variations de prix à court terme s'ajustent pour ramener le système vers son équilibre de long terme. Cette dynamique est formalisée par un modèle VECM d'ordre $k$ :

$$\Delta Y_t = a_1 (Y_{t-1} - \beta X_{t-1} - \alpha) + \sum_{i=1}^{k} \gamma_{1,i} \Delta Y_{t-i} + \sum_{i=1}^{k} \delta_{1,i} \Delta X_{t-i} + e_{1,t}$$
$$\Delta X_t = a_2 (Y_{t-1} - \beta X_{t-1} - \alpha) + \sum_{i=1}^{k} \gamma_{2,i} \Delta Y_{t-i} + \sum_{i=1}^{k} \delta_{2,i} \Delta X_{t-i} + e_{2,t}$$

Où :
*   $Y_{t-1} - \beta X_{t-1} - \alpha = u_{t-1}$ est le terme de correction d'erreur (l'écart par rapport à l'équilibre au pas de temps précédent).
*   $a_1$ et $a_2$ sont les coefficients de vitesse d'ajustement. Pour que le système converge, on doit avoir $a_1 < 0$ (si le spread est positif, $Y$ doit baisser) et/ou $a_2 > 0$ (si le spread est positif, $X$ doit monter).
*   Les coefficients $\gamma$ et $\delta$ décrivent l'impact de court terme de l'autocorrélation temporelle des rendements passés.

---

## 4. Algorithme d'Exécution & Logique Opérationnelle

Pour transformer un spread co-intégré en signaux opérationnels, la stratégie StatArb normalise le spread sous forme de $Z$-score glissant :

1.  **Calcul du $Z$-score glissant** :
    $$Z_t = \frac{u_t - \mu_{\text{roll}}(u, W)}{\sigma_{\text{roll}}(u, W)}$$
    Où $\mu_{\text{roll}}$ et $\sigma_{\text{roll}}$ sont respectivement la moyenne et l'écart-type glissants des résidus calculés sur une fenêtre temporelle rétrospective $W$.
2.  **Règles de décision opérationnelles** :
    *   **Entrée Short Spread** ($Z_t > Z_{\text{entry}}$) : Vendre $1$ unité de $Y$ et acheter $\beta$ unités de $X$.
    *   **Entrée Long Spread** ($Z_t < -Z_{\text{entry}}$) : Acheter $1$ unité de $Y$ et vendre $\beta$ unités de $X$.
    *   **Fermeture (Sortie) Short Spread** ($Z_t \le 0$ ou $Z_t \le Z_{\text{exit}}$) : Racheter $Y$ et vendre $X$.
    *   **Fermeture (Sortie) Long Spread** ($Z_t \ge 0$ ou $Z_t \ge -Z_{\text{exit}}$) : Vendre $Y$ et racheter $X$.
    *   **Stop Loss Catastrophique** ($|Z_t| \ge Z_{\text{stop}}$) : Clôture immédiate de toutes les positions si le spread diverge de manière excessive, indiquant une rupture structurelle de la relation de co-intégration.

---

## 5. Implémentation de Production en Python (statsmodels)

Le code ci-dessous est autonome et prêt pour la production. Il effectue l'analyse de co-intégration, extrait le hedge ratio optimal et génère les signaux de trading sur un dataframe d'OHLCV.

```python
import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.tsa.stattools import coint, adfuller

class CointegrationPairsTrader:
    def __init__(self, significance_level=0.05, entry_threshold=2.0, exit_threshold=0.0, stop_threshold=3.5, roll_window=60):
        self.significance_level = significance_level
        self.entry_threshold = entry_threshold
        self.exit_threshold = exit_threshold
        self.stop_threshold = stop_threshold
        self.roll_window = roll_window
        self.beta = None
        self.alpha = None
        self.is_cointegrated = False

    def test_pair(self, series_y: pd.Series, series_x: pd.Series) -> dict:
        """
        Exécute le test de co-intégration d'Engle-Granger en deux étapes.
        """
        # Alignement des données et suppression des NaNs
        df_temp = pd.concat([series_y, series_x], axis=1).dropna()
        y = df_temp.iloc[:, 0]
        x = df_temp.iloc[:, 1]
        
        # Étape 1 : Régression OLS pour le Hedge Ratio (Beta)
        X_with_const = sm.add_constant(x)
        model = sm.OLS(y, X_with_const).fit()
        self.alpha = model.params[0]
        self.beta = model.params[1]
        
        # Calcul des résidus
        residuals = model.resid
        
        # Étape 2 : Test de co-intégration de statsmodels (Engle-Granger)
        # renvoie : (t-stat de coint, p-value, valeurs critiques de MacKinnon)
        coint_t, p_value, crit_values = coint(y, x, trend='c')
        
        self.is_cointegrated = (p_value <= self.significance_level)
        
        return {
            "is_cointegrated": self.is_cointegrated,
            "p_value": p_value,
            "t_stat": coint_t,
            "critical_values_mackinnon": crit_values,
            "hedge_ratio_beta": self.beta,
            "intercept_alpha": self.alpha
        }

    def generate_signals(self, df_prices: pd.DataFrame, ticker_y: str, ticker_x: str) -> pd.DataFrame:
        """
        Calcule les résidus dynamiques, le Z-score glissant et génère les états de position du portefeuille.
        """
        if self.beta is None:
            raise ValueError("Le modèle doit d'abord être entraîné avec test_pair().")
            
        df = df_prices[[ticker_y, ticker_x]].dropna().copy()
        
        # Calcul du spread statique basé sur le Beta de calibrage
        df['spread'] = df[ticker_y] - (self.beta * df[ticker_x]) - self.alpha
        
        # Normalisation par Z-Score glissant
        df['spread_mean'] = df['spread'].rolling(window=self.roll_window).mean()
        df['spread_std'] = df['spread'].rolling(window=self.roll_window).std()
        df['z_score'] = (df['spread'] - df['spread_mean']) / df['spread_std']
        df = df.dropna()
        
        # Initialisation des colonnes de position
        df['position_y'] = 0.0
        df['position_x'] = 0.0
        df['trade_state'] = "NEUTRAL"  # NEUTRAL, LONG_SPREAD, SHORT_SPREAD
        
        current_state = "NEUTRAL"
        
        # Boucle d'exécution historique sans biais d'anticipation (backtest itératif)
        for i in range(1, len(df)):
            z = df['z_score'].iloc[i]
            prev_state = current_state
            
            if current_state == "NEUTRAL":
                # Signaux d'entrée
                if z > self.entry_threshold and z < self.stop_threshold:
                    current_state = "SHORT_SPREAD"  # Trop cher -> Vendre Y, Acheter X
                elif z < -self.entry_threshold and z > -self.stop_threshold:
                    current_state = "LONG_SPREAD"   # Trop bas -> Acheter Y, Vendre X
            
            elif current_state == "SHORT_SPREAD":
                # Signaux de sortie ou de stop loss
                if z <= self.exit_threshold or z >= self.stop_threshold:
                    current_state = "NEUTRAL"
                    
            elif current_state == "LONG_SPREAD":
                # Signaux de sortie ou de stop loss
                if z >= -self.exit_threshold or z <= -self.stop_threshold:
                    current_state = "NEUTRAL"
            
            # Application de l'état de position
            df.loc[df.index[i], 'trade_state'] = current_state
            
            if current_state == "SHORT_SPREAD":
                df.loc[df.index[i], 'position_y'] = -1.0
                df.loc[df.index[i], 'position_x'] = self.beta
            elif current_state == "LONG_SPREAD":
                df.loc[df.index[i], 'position_y'] = 1.0
                df.loc[df.index[i], 'position_x'] = -self.beta
            else:
                df.loc[df.index[i], 'position_y'] = 0.0
                df.loc[df.index[i], 'position_x'] = 0.0
                
        return df

# Exemple d'usage dans un pipeline de production
if __name__ == "__main__":
    # Génération d'une fausse relation de co-intégration pour test unitaire
    np.random.seed(42)
    steps = 500
    x_price = np.cumsum(np.random.normal(0, 1, steps)) + 100  # Marche aléatoire I(1)
    noise = np.random.normal(0, 0.5, steps)                    # Bruit stationnaire I(0)
    y_price = 1.5 * x_price + 10 + noise                       # Co-intégrée par construction, Beta = 1.5
    
    df_data = pd.DataFrame({"Asset_Y": y_price, "Asset_X": x_price})
    
    trader = CointegrationPairsTrader(roll_window=30)
    test_results = trader.test_pair(df_data["Asset_Y"], df_data["Asset_X"])
    
    print("--- RÉSULTATS DU CALIBRAGE ENGLE-GRANGER ---")
    print(f"La paire est-elle co-intégrée ? : {test_results['is_cointegrated']}")
    print(f"P-value du test : {test_results['p_value']:.6f}")
    print(f"Hedge Ratio Beta estimé : {test_results['hedge_ratio_beta']:.4f}")
    print(f"Alpha estimé : {test_results['intercept_alpha']:.4f}\n")
    
    if test_results['is_cointegrated']:
        df_signals = trader.generate_signals(df_data, "Asset_Y", "Asset_X")
        print("--- ÉCHANTILLON DE LA FEUILLE D'EXÉCUTION ---")
        print(df_signals[['z_score', 'trade_state', 'position_y', 'position_x']].tail(10))
```
