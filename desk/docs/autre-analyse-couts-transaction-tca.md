# Analyse des Coûts de Transaction (TCA) & Modélisation d'Exécution Optimale (Almgren-Chriss)

En gestion de fonds systématique, la qualité d'exécution des ordres conditionne la capture de l'alpha théorique généré par les modèles de recherche. L'analyse des coûts de transaction (TCA - *Transaction Cost Analysis*) et la théorie mathématique de l'exécution optimale permettent de minimiser la friction des ordres. Ce document formalise le calcul de l'**Implementation Shortfall** (Perold, 1988) et résout le modèle d'impact sur le marché d'**Almgren-Chriss** (2000) pour guider l'agent d'exécution (*Le Nageur*).

---

## 1. L’Analyse des Coûts de Transaction (TCA) : Implementation Shortfall

Développé par Andre Perold en 1988, l'**Implementation Shortfall (IS)** est l'étalon-or pour mesurer les frictions d'un desk de trading. Il quantifie l'écart de performance absolu entre le **rendement d'un portefeuille théorique papier** (qui s'exécute de manière instantanée, sans coût ni frottement, au prix de décision) et le **rendement réel du portefeuille physique**.

### A. Formulation Mathématique Générale
Pour un ordre d'achat global (parent) ciblant une quantité totale $X$ (notée positive à l'achat, négative à la vente) :
$$\text{IS}_{\text{absolu}} = \text{Performance Papier} - \text{Performance Réelle}$$

Si l'on détaille en termes de flux financiers d'un ordre d'achat d'un actif :
*   $P_0$ : Prix de décision (*decision price*) - le prix au moment où le modèle de trading génère le signal.
*   $P_d$ : Prix d'arrivée (*arrival price*) - le prix du marché au moment où l'ordre est envoyé au carnet d'ordres ou au courtier.
*   $P_i$ : Prix d'exécution effectif du $i$-ème sous-ordre (remplissage d'un ordre enfant de taille $s_i$).
*   $P_T$ : Prix terminal (*terminal price*) - le cours de l'actif à la fermeture de l'horizon de trading pour l'évaluation de la fraction non exécutée.

$$\text{IS}_{\text{absolu}} = X \cdot P_0 - \left( \sum_{i} s_i P_i + \left(X - \sum_{i} s_i\right) P_T \right) - \text{Commissions}$$

En pourcentage du montant initial de l'ordre :
$$\text{IS}_{\% } = \frac{\text{IS}_{\text{absolu}}}{X \cdot P_0}$$

### B. Décomposition Sémantique de l'Implementation Shortfall
Pour permettre à l'agent d'audit (*Cold Analyst*) de formuler des recommandations précises sur l'exécution, l'IS est décomposé en quatre composantes distinctes :

$$\text{IS} = \text{Délai d'Exécution} + \text{Slippage (Impact Marché)} + \text{Coût d'Opportunité} + \text{Frais de Courtage}$$

1.  **Le Coût de Délai (Delay Cost / Latency)** : Mesure l'effet du mouvement de prix entre la prise de décision et l'arrivée effective du premier ordre sur le marché (latence réseau ou file d'attente d'autorisation).
    $$\text{Coût de Délai} = \sum_{i} s_i (P_d - P_0)$$
2.  **Le Coût d'Impact (Slippage / Execution Cost)** : Mesure le coût de friction provoqué par la consommation de liquidité de notre propre transaction dans le carnet d'ordres.
    $$\text{Coût d'Impact} = \sum_{i} s_i (P_i - P_d)$$
3.  **Le Coût d'Opportunité (Opportunity Cost)** : Évalue la perte de gain sur la quantité cible $X$ qui n'a pas pu être exécutée à la fin de l'horizon de trading $T$ (ordres rejetés ou annulés).
    $$\text{Coût d'Opportunité} = \left(X - \sum_{i} s_i\right) (P_T - P_0)$$
4.  **Frais de Courtage** : Somme plate des commissions de courtage et frais de transfert d'échange.

---

## 2. Le Modèle d'Optimal Execution d'Almgren-Chriss (2000)

Le modèle d'Almgren-Chriss résout de manière analytique le compromis fondamental de l'exécution : **exécuter trop rapidement augmente les coûts d'impact de marché temporaires, tandis qu'exécuter trop lentement expose l'ordre à un risque de dérive de prix défavorable dû à la volatilité (timing risk)**.

```
       Volume d'exécution Parent : X sur N intervalles de temps
       
       ┌────────────────────────────────────────────────────────┐
       │   Exécution TRÈS RAPIDE       │   Exécution TRÈS LENTE │
       ├───────────────────────────────┼────────────────────────┤
       │   • Impact Temporaire Élevé   │   • Impact Minime      │
       │   • Risque de Volatilité Bas  │   • Risque Volatilité  │
       │                               │     Très Élevé (Drift) │
       └───────────────────────────────┴────────────────────────┘
```

### A. Formalisation de la dynamique du carnet d'ordres
Soit un ordre parent de taille $X$ à liquider sur un horizon de $N$ intervalles discrets de temps $\tau$. Les holdings restants à l'intervalle $k$ sont notés $x_k$, avec la condition aux limites :
$$x_0 = X, \quad x_N = 0$$
La taille de l'ordre enfant à l'intervalle $k$ est $n_k = x_{k-1} - x_k$ (exécuté au taux $v_k = n_k/\tau$).

Le modèle d'Almgren-Chriss postule deux mécanismes d'impact sur le prix :
1.  **L'impact permanent** ($\gamma$) : Modélise l'asymétrie d'information révélée par notre trading. Il décale de manière irréversible le prix d'équilibre du marché (loi de Kyle, 1985).
    $$S_k = S_{k-1} + \sigma \tau^{1/2} \xi_k - \tau \gamma(v_k)$$
    Où $\xi_k \sim \mathcal{N}(0, 1)$ et $\gamma(v)$ est la fonction d'impact permanent.
2.  **L'impact temporaire** ($\eta$) : Représente la concession de prix immédiate requise pour trouver de la liquidité à court terme (il s'évapore instantanément au pas de temps suivant). Le prix d'exécution effectif $\tilde{S}_k$ du sous-ordre est :
    $$\tilde{S}_k = S_k - \eta(v_k)$$

### B. Linéarité de l'impact et fonctions de coût
Sous l'hypothèse standard d'un modèle d'impact linéaire, les fonctions sont définies par :
$$\gamma(v) = \gamma v, \quad \eta(v) = \eta v \quad (\gamma, \eta > 0)$$
Le coût total d'exécution espéré (l'Implementation Shortfall attendu) est :
$$\mathbb{E}[x] = \eta \sum_{k=1}^{N} \frac{n_k^2}{\tau} + \frac{1}{2} \gamma X^2$$
La variance du coût d'exécution total (qui mesure le risque de volatilité encouru) s'écrit :
$$\mathbb{V}[x] = \sigma^2 \sum_{k=1}^{N} \tau x_k^2$$

### C. Optimisation sous fonction d'utilité de moyenne-variance
L'objectif de l'exécuteur est de minimiser la fonction d'utilité globale combinant coût espéré et pénalité de risque (aversion au risque $\lambda > 0$) :
$$\min_{x} \ U(x) = \mathbb{E}[x] + \lambda \mathbb{V}[x]$$

La résolution de ce problème de minimisation quadratique sous contraintes de limites donne l'équation de récurrence du second ordre pour la trajectoire optimale des holdings $x_j$ :
$$\frac{\eta}{\tau^2} (x_{j+1} - 2x_j + x_{j-1}) = \lambda \sigma^2 x_j$$

### D. Solution analytique continue
La solution en temps continu de cette trajectoire de holdings optimale est une décroissance exponentielle hyperbolique vers $0$ :

$$x(t) = \frac{\sinh(\kappa(T - t))}{\sinh(\kappa T)} X$$

Où le taux de décroissance optimale $\kappa$ (la "vitesse" optimale d'exécution) est défini par :
$$\kappa \approx \sqrt{\frac{\lambda \sigma^2}{\eta}}$$

*Interprétation* : Plus l'aversion au risque $\lambda$ ou la volatilité du marché $\sigma$ sont élevées, plus $\kappa$ augmente, forçant *Le Nageur* à exécuter rapidement l'ordre (au détriment d'un impact temporaire accru) pour éviter le risque de dérive de prix (*price drift*).

---

## 3. Implémentation de Production en Python

Le module Python ci-dessous calcule l'Implementation Shortfall historique à partir de journaux d'exécution et calcule la trajectoire de trading optimale théorique basée sur Almgren-Chriss.

```python
import numpy as np
import pandas as pd

class TransactionCostAnalyzer:
    def __init__(self, market_volatility_daily: float, temp_impact_coef: float, perm_impact_coef: float):
        """
        :param market_volatility_daily: Volatilité quotidienne de l'actif (ex: 0.02 pour 2%)
        :param temp_impact_coef: Coefficient d'impact temporaire linéaire (eta)
        :param perm_impact_coef: Coefficient d'impact permanent linéaire (gamma)
        """
        self.sigma = market_volatility_daily / np.sqrt(24 * 60)  # Normalisation à la minute (si trading intraday)
        self.eta = temp_impact_coef
        self.gamma = perm_impact_coef

    def calculate_implementation_shortfall(self, target_qty: float, decision_price: float, 
                                           execution_log: list, terminal_price: float, 
                                           commission_flat: float = 0.0) -> dict:
        """
        Calcule l'Implementation Shortfall complet à partir d'un journal d'exécutions.
        execution_log est une liste de dicts : [{'qty': q_i, 'price': p_i, 'arrival_price': pd_i}]
        """
        X = target_qty
        P0 = decision_price
        PT = terminal_price
        
        sum_qty_executed = sum(trade['qty'] for trade in execution_log)
        qty_unexecuted = X - sum_qty_executed
        
        # Calcul des composantes
        total_executed_value = sum(trade['qty'] * trade['price'] for trade in execution_log)
        unexecuted_value_paper = qty_unexecuted * PT
        
        # Implementation Shortfall Absolu ($)
        is_absolute = (X * P0) - (total_executed_value + unexecuted_value_paper) - commission_flat
        is_percentage = (is_absolute / (X * P0)) * 10000  # En points de base (bps)
        
        # Décomposition
        delay_cost = sum(trade['qty'] * (trade['arrival_price'] - P0) for trade in execution_log)
        impact_cost = sum(trade['qty'] * (trade['price'] - trade['arrival_price']) for trade in execution_log)
        opportunity_cost = qty_unexecuted * (PT - P0)
        
        return {
            "is_absolute_usd": is_absolute,
            "is_points_de_base": is_percentage,
            "delay_cost_usd": delay_cost,
            "impact_cost_usd": impact_cost,
            "opportunity_cost_usd": opportunity_cost,
            "execution_efficiency_pct": (sum_qty_executed / X) * 100
        }

    def compute_optimal_trajectory(self, total_qty: float, n_intervals: int, 
                                   time_horizon_minutes: float, risk_aversion: float) -> pd.DataFrame:
        """
        Calcule la trajectoire optimale de holdings selon le modèle Almgren-Chriss discret.
        """
        X = total_qty
        N = n_intervals
        T = time_horizon_minutes
        dt = T / N
        
        # Calcul du paramètre d'échelle kappa de décroissance optimale
        # kappa_tilde = dt * np.sqrt( (lambda * sigma^2) / eta )
        kappa_tilde = dt * np.sqrt((risk_aversion * (self.sigma ** 2)) / self.eta)
        
        # Résolution analytique de l'équation aux différences
        holdings = np.zeros(N + 1)
        holdings[0] = X
        
        for j in range(1, N + 1):
            t_j = j * dt
            # x_j = sinh(kappa * (T - t_j)) / sinh(kappa * T) * X
            # En version discrète, on utilise les approximations de sinh avec kappa_tilde
            holdings[j] = (np.sinh(kappa_tilde * (N - j)) / np.sinh(kappa_tilde * N)) * X
            
        # Calcul des ordres enfants à passer à chaque intervalle
        trades = np.diff(holdings, prepend=X) # n_j = x_j-1 - x_j
        trades = -trades  # Pour avoir des valeurs positives à la vente/liquidation
        trades[0] = X - holdings[1] # Correction d'initialisation
        
        df_trajectory = pd.DataFrame({
            "Intervalle": np.arange(N + 1),
            "Holding_Optimal_Target": holdings,
            "Child_Order_Size": np.append(trades[1:], 0.0) # L'ordre final restant à exécuter
        })
        
        return df_trajectory

# Exemple de validation unitaire
if __name__ == "__main__":
    # Paramètres d'un marché d'actions liquides
    # Volatilité quotidienne 3%, impact temporaire de 10e-6, permanent de 5e-7
    analyzer = TransactionCostAnalyzer(market_volatility_daily=0.03, 
                                      temp_impact_coef=1.2e-5, 
                                      perm_impact_coef=5.0e-7)
    
    # 1. Test unitaire du TCA (Implementation Shortfall)
    # On veut ACHETER 10 000 actions. Décision prise à 150.00 USD
    mock_execution_log = [
        {"qty": 4000, "price": 150.25, "arrival_price": 150.10},  # Premier ordre
        {"qty": 4000, "price": 150.60, "arrival_price": 150.35},  # Deuxième ordre
    ]  # Reste 2000 non exécutés. Le cours finit à la fin de journée à 151.20 USD (terminal price)
    
    tca_results = analyzer.calculate_implementation_shortfall(
        target_qty=10000,
        decision_price=150.00,
        execution_log=mock_execution_log,
        terminal_price=151.20,
        commission_flat=25.0
    )
    
    print("--- 1. ÉVALUATION TCA DE L'EFFICIENCY DU DESK ---")
    print(f"Implementation Shortfall Global ($) : {tca_results['is_absolute_usd']:.2f} USD")
    print(f"Implementation Shortfall (points de base) : {tca_results['is_points_de_base']:.2f} bps")
    print(f"  └─ Coût de Délai : {tca_results['delay_cost_usd']:.2f} USD")
    print(f"  └─ Coût d'Impact Direct (Slippage) : {tca_results['impact_cost_usd']:.2f} USD")
    print(f"  └─ Coût d'Opportunité (Non Exécuté) : {tca_results['opportunity_cost_usd']:.2f} USD\n")
    
    # 2. Calcul d'une trajectoire d'exécution optimale Almgren-Chriss
    # On souhaite liquider 100 000 actions en 5 intervalles sur 1 heure (T=60 mins)
    # Cas 1 : Faible aversion au risque (Risk Aversion = 1e-4) -> Exécution lente
    # Cas 2 : Forte aversion au risque (Risk Aversion = 1e-2) -> Exécution rapide
    df_slow = analyzer.compute_optimal_trajectory(100000, n_intervals=5, time_horizon_minutes=60, risk_aversion=1e-4)
    df_fast = analyzer.compute_optimal_trajectory(100000, n_intervals=5, time_horizon_minutes=60, risk_aversion=1e-2)
    
    print("--- 2. TRAJECTOIRES DE LIQUIDATION ALMGREN-CHRISS (Holdings Restants) ---")
    print("Int | Trajectoire Lente (Holding) | Trajectoire Rapide (Holding)")
    for i in range(len(df_slow)):
        print(f" {i}  |         {df_slow['Holding_Optimal_Target'].iloc[i]:.0f}          |         {df_fast['Holding_Optimal_Target'].iloc[i]:.0f}")
```
