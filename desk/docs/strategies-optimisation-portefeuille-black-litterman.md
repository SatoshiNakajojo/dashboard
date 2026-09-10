# Optimisation de Portefeuille Avancée : Modèle de Black-Litterman & Allocation par Parité des Risques

L'optimisation classique de moyenne-variance de Markowitz souffre d'une sensibilité extrême aux paramètres d'entrée (bruit d'estimation), générant fréquemment des portefeuilles hautement concentrés et instables en production. Ce document formalise deux piliers de l'allocation institutionnelle robuste : le modèle bayésien de **Black-Litterman** pour combiner mathématiquement l'équilibre de marché et les opinions de vos agents IA, et la **Parité des Risques (HRP)** pour une diversification résiliente face à la volatilité.

---

## 1. Le Modèle de Black-Litterman : Cadre Bayésien d'Allocation

Le modèle de Black-Litterman (1992) résout l'instabilité de Markowitz en prenant pour point de départ l'équilibre général du marché, puis en mettant à jour ces rendements neutres sous forme de loi *a posteriori* en y injectant les opinions (*views*) formulées par vos analystes d'IA (ex: notes de l'agent *Fundamental*, signaux de momentum de l'agent *Technical*).

```
  ┌─────────────────────────────────┐
  │  Priors de Marché (CAPM)        │
  │  • Covariance Σ                 ├─────────┐
  │  • Rendements d'équilibre Π     │         │
  └─────────────────────────────────┘         ▼
                                        ┌───────────┐       ┌────────────────────────┐
                                        │ Modèle de │ ────► │ Rendements Posteriori  │
                                        │  Black-   │       │      E(R) & Σ_post     │
                                        │ Litterman │       └────────────────────────┘
  ┌─────────────────────────────────┐   └───────────┘
  │  Views des Agents IA            │         ▲
  │  • Vecteur d'opinions Q         ├─────────┘
  │  • Matrice d'incertitude Ω      │
  └─────────────────────────────────┘
```

### A. Formulation Mathématique Globale
La formule centrale calcule le vecteur de rendements excédentaires espérés mis à jour, $E(R)$ (vecteur $N \times 1$) :

$$E(R) = \left[ (\tau \Sigma)^{-1} + P^T \Omega^{-1} P \right]^{-1} \left[ (\tau \Sigma)^{-1} \Pi + P^T \Omega^{-1} Q \right]$$

Où :
*   $\Sigma$ : Matrice de covariance historique ou ajustée des rendements des actifs (taille $N \times N$).
*   $\tau$ : Scalaire de confiance dans le prior de marché (généralement compris entre $0.025$ et $0.05$).
*   $\Pi$ : Vecteur de rendements d'équilibre de marché implicites (prior de marché, taille $N \times 1$).
*   $Q$ : Vecteur d'opinions formulées par les agents (taille $K \times 1$, où $K$ est le nombre d'opinions).
*   $P$ : Matrice de sélection (*picking matrix*) qui relie chaque opinion aux actifs concernés (taille $K \times N$).
*   $\Omega$ : Matrice de covariance de l'incertitude sur les opinions (taille $K \times K$, supposée diagonale si les opinions sont indépendantes).

### B. Étape 1 : Calcul des rendements implicites d'équilibre ($\Pi$)
Les rendements implicites sont extraits par "optimisation inverse" à partir de la capitalisation de marché globale, évitant de se baser uniquement sur l'historique :
$$\Pi = \lambda \Sigma w_{\text{mkt}}$$
Où :
*   $w_{\text{mkt}}$ : Vecteur des poids de capitalisation de marché des actifs.
*   $\lambda$ : Coefficient d'aversion au risque global du marché, défini par :
    $$\lambda = \frac{E(R_{\text{mkt}}) - R_f}{\sigma^2_{\text{mkt}}}$$

### C. Étape 2 : Spécification des opinions ($Q$) et de leur incertitude ($\Omega$)
*   **Opinion absolue** : "L'agent de sentiment s'attend à ce que l'action Apple réalise un rendement de +10%".
    $$Q_1 = [0.10], \quad P_1 = [1, 0, 0, \dots]$$
*   **Opinion relative** : "L'agent de rotation s'attend à ce que Solana surperforme Ethereum de +3%".
    $$Q_2 = [0.03], \quad P_2 = [0, \dots, 1_{\text{SOL}}, \dots, -1_{\text{ETH}}, \dots]$$
*   **Incertitude d'He and Litterman (2002)** : $\Omega$ est modélisé proportionnellement à la variance de la projection du prior de marché sur la matrice de picking $P$ :
    $$\Omega = \text{diag}\left(P (\tau \Sigma) P^T\right)$$

### D. Mise à jour de la matrice de covariance
Le modèle calcule également la matrice de covariance *a posteriori* mise à jour pour intégrer l'incertitude des opinions :
$$\Sigma_{\text{posterior}} = \Sigma + \left[ (\tau \Sigma)^{-1} + P^T \Omega^{-1} P \right]^{-1}$$

---

## 2. Allocation par Parité des Risques (Risk Parity / ERC)

La parité des risques vise à construire un portefeuille diversifié en s'assurant que **chaque actif contribue de manière identique au risque global du portefeuille**, indépendamment de sa volatilité propre ou de son rendement espéré.

### A. Contribution Marginale au Risque ($MCR$)
Soit un vecteur de poids de portefeuille $w$ et une matrice de covariance $\Sigma$. La volatilité du portefeuille est :
$$\sigma_p(w) = \sqrt{w^T \Sigma w}$$
La Contribution Marginale de l'actif $i$ au risque global est la dérivée partielle de la volatilité par rapport au poids $w_i$ :
$$\text{MCR}_i = \frac{\partial \sigma_p}{\partial w_i} = \frac{(\Sigma w)_i}{\sigma_p(w)}$$

### B. Contribution Totale au Risque ($TRC$)
La Contribution Totale de l'actif $i$ au risque est le produit de son poids et de sa contribution marginale :
$$\text{TRC}_i = w_i \cdot \text{MCR}_i = \frac{w_i (\Sigma w)_i}{\sigma_p(w)}$$
Selon le théorème d'Euler, la somme des contributions de risque de chaque actif équivaut exactement à la volatilité globale du portefeuille :
$$\sum_{i=1}^{N} \text{TRC}_i = \sigma_p(w)$$

### C. Condition Equal Risk Contribution (ERC)
Le portefeuille de parité des risques optimal cherche à égaliser toutes les contributions totales au risque :
$$\text{TRC}_i = \text{TRC}_j \iff w_i (\Sigma w)_i = w_j (\Sigma w)_j, \quad \forall i, j$$
La résolution de ce système non linéaire se fait par minimisation numérique d'une fonction d'écart sous contrainte de pleine allocation :
$$\min_{w} \sum_{i=1}^{N} \sum_{j=1}^{N} \left( w_i (\Sigma w)_i - w_j (\Sigma w)_j \right)^2 \quad \text{s.t.} \quad \sum_{i=1}^{N} w_i = 1, \ w_i \ge 0$$

---

## 3. Parité Hiérarchique des Risques (HRP - Hierarchical Risk Parity)

Développé par Marcos Lopez de Prado (2016), le modèle HRP combine l'apprentissage automatique non supervisé (clustering hiérarchique) et la parité des risques. Contrairement aux approches classiques de Markowitz, HRP **ne nécessite pas l'inversion de la matrice de covariance**, ce qui le rend ultra-robuste face à la colinéarité et au bruit d'estimation historique.

L'algorithme HRP s'exécute en 3 étapes formelles :

### Étape 1 : Regroupement Hiérarchique (Tree Clustering)
1.  On calcule la matrice de corrélation $\rho_{ij}$ et on définit la métrique de distance :
    $$d_{ij} = \sqrt{\frac{1 - \rho_{ij}}{2}}$$
2.  On calcule la distance euclidienne entre les colonnes de distance $d$ pour mesurer la similarité structurelle globale :
    $$\tilde{d}_{ij} = \sqrt{\sum_{k=1}^{N} (d_{ki} - d_{kj})^2}$$
3.  On applique un algorithme de clustering hiérarchique agglomératif (Single-Linkage) pour construire l'arbre de dépendance (Dendrogramme).

### Étape 2 : Quasi-Diagonalisation
On réorganise l'ordre des actifs dans la matrice de covariance de sorte que les actifs les plus similaires soient placés à proximité les uns des autres sur la diagonale. Les corrélations fortes se concentrent autour de la diagonale principale, tandis que les relations éloignées sont reléguées vers l'extérieur.

### Étape 3 : Bisection Récursive
On parcourt l'arbre hiérarchisé de haut en bas. Pour chaque nœud divisant un ensemble d'actifs en deux sous-groupes $V_1$ et $V_2$ :
1.  On calcule la variance de chaque sous-groupe sous pondération de parité des risques inverse :
    $$W_k = \frac{\text{diag}(\Sigma_k)^{-1}}{\text{Tr}(\text{diag}(\Sigma_k)^{-1})}, \quad \sigma_k^2 = W_k^T \Sigma_k W_k \quad (\text{pour } k=1, 2)$$
2.  On calcule le facteur de répartition $\alpha$ (poids alloué à la première branche) :
    $$\alpha = 1 - \frac{\sigma_1^2}{\sigma_1^2 + \sigma_2^2}$$
3.  On met à jour les poids finaux de manière récursive :
    $$w_i = w_i \times \alpha \quad \forall i \in V_1, \qquad w_j = w_j \times (1 - \alpha) \quad \forall j \in V_2$$

---

## 4. Implémentation de Production en Python

Le code ci-dessous fournit un module d'optimisation robuste. Il implémente l'algorithme complet de parité de risque numérique (ERC) et le modèle de Black-Litterman en utilisant la bibliothèque mathématique SciPy.

```python
import numpy as np
import pandas as pd
from scipy.optimize import minimize

class SystematicPortfolioOptimizer:
    def __init__(self, risk_free_rate=0.03):
        self.rf = risk_free_rate

    def black_litterman(self, covariance: np.ndarray, market_weights: np.ndarray, 
                        views_Q: np.ndarray, picking_P: np.ndarray, 
                        tau: float = 0.05, risk_aversion: float = 3.0) -> tuple:
        """
        Calcule les rendements espérés et la covariance posteriors de Black-Litterman.
        """
        cov = np.array(covariance)
        w_mkt = np.array(market_weights).reshape(-1, 1)
        Q = np.array(views_Q).reshape(-1, 1)
        P = np.array(picking_P)
        
        # 1. Calcul du prior d'équilibre (Imply Equilibrium Returns)
        prior_returns_Pi = risk_aversion * np.dot(cov, w_mkt)
        
        # 2. Modélisation de l'incertitude des opinions (Omega de He & Litterman)
        # Omega = diag(P * (tau * Cov) * P.T)
        Omega = np.diag(np.diag(np.dot(np.dot(P, tau * cov), P.T)))
        Omega_inv = np.linalg.inv(Omega)
        
        # 3. Calcul des rendements espérés Posterior
        cov_inv_scaled = np.linalg.inv(tau * cov)
        P_T = P.T
        
        term_1 = np.linalg.inv(cov_inv_scaled + np.dot(np.dot(P_T, Omega_inv), P))
        term_2 = np.dot(cov_inv_scaled, prior_returns_Pi) + np.dot(np.dot(P_T, Omega_inv), Q)
        
        expected_returns_posterior = np.dot(term_1, term_2)
        
        # 4. Calcul de la covariance Posterior
        covariance_posterior = cov + term_1
        
        return expected_returns_posterior.flatten(), covariance_posterior

    def equal_risk_contribution(self, covariance: np.ndarray) -> np.ndarray:
        """
        Calcule les poids du portefeuille Equal Risk Contribution (Parité des risques numérique).
        """
        cov = np.array(covariance)
        n = cov.shape[0]
        
        # Objectif : Minimiser la variance des contributions au risque absolu
        def objective(weights):
            weights = np.array(weights)
            portfolio_vol = np.sqrt(np.dot(np.dot(weights.T, cov), weights))
            # TRC = weights * (Cov * weights) / portfolio_vol
            marginal_contributions = np.dot(cov, weights) / portfolio_vol
            total_risk_contributions = weights * marginal_contributions
            
            # Calcul des différences au carré des TRC
            diff = total_risk_contributions[:, None] - total_risk_contributions[None, :]
            return np.sum(diff ** 2)

        # Contraintes : somme(w_i) = 1
        constraints = ({'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0})
        # Bornes : positions exclusivement long-only [0, 1]
        bounds = [(0.0, 1.0) for _ in range(n)]
        
        # Initialisation uniforme
        init_weights = np.ones(n) / n
        
        result = minimize(objective, init_weights, method='SLSQP', bounds=bounds, constraints=constraints)
        
        if not result.success:
            raise ValueError(f"Échec de l'optimisation ERC : {result.message}")
            
        return result.x

# Exemple de validation unitaire
if __name__ == "__main__":
    np.random.seed(42)
    tickers = ["BTC", "ETH", "SOL", "AAPL", "MSFT"]
    n_assets = len(tickers)
    
    # 1. Génération d'une fausse matrice de covariance réaliste
    std_devs = np.array([0.45, 0.40, 0.60, 0.22, 0.18])  # Crypto volatiles vs Actions calmes
    corr_matrix = np.array([
        [1.0, 0.8, 0.6, 0.2, 0.1],
        [0.8, 1.0, 0.5, 0.2, 0.1],
        [0.6, 0.5, 1.0, 0.1, 0.1],
        [0.2, 0.2, 0.1, 1.0, 0.7],
        [0.1, 0.1, 0.1, 0.7, 1.0]
    ])
    cov_matrix = np.diag(std_devs) @ corr_matrix @ np.diag(std_devs)
    
    # Capitalisations fictives pour le prior de marché (en milliards)
    market_caps = np.array([1200.0, 400.0, 80.0, 3000.0, 3200.0])
    market_weights = market_caps / np.sum(market_caps)
    
    optimizer = SystematicPortfolioOptimizer()
    
    # 2. Test Black-Litterman
    # Opinions des agents IA :
    # View 1: SOL va faire +15% (absolu)
    # View 2: AAPL va surperformer MSFT de +3% (relative)
    views_Q = np.array([0.15, 0.03])
    picking_P = np.array([
        [0, 0, 1, 0, 0],      # SOL (absolu)
        [0, 0, 0, 1, -1]      # AAPL (1) vs MSFT (-1)
    ])
    
    expected_bl_returns, cov_bl = optimizer.black_litterman(
        covariance=cov_matrix,
        market_weights=market_weights,
        views_Q=views_Q,
        picking_P=picking_P,
        tau=0.05
    )
    
    print("--- 1. RENDEMENTS ESPÉRÉS BLACK-LITTERMAN POSTERIOR ---")
    for ticker, r in zip(tickers, expected_bl_returns):
        print(f"  {ticker} : {r*100:.2f}%")
        
    # 3. Test Parité de Risque Numérique (ERC)
    erc_weights = optimizer.equal_risk_contribution(cov_matrix)
    print("\n--- 2. POIDS ALLOUÉS EN PARITÉ DES RISQUES (ERC) ---")
    for ticker, w in zip(tickers, erc_weights):
        print(f"  {ticker} : {w*100:.2f}%")
        
    # Vérification de l'égalisation des contributions au risque
    portfolio_vol = np.sqrt(erc_weights.T @ cov_matrix @ erc_weights)
    trc = erc_weights * (cov_matrix @ erc_weights) / portfolio_vol
    print("\n--- 3. CONTRIBUTIONS RÉELLES DES ACTIFS AU RISQUE PORTFOLIO (TRC) ---")
    for ticker, risk_contrib in zip(tickers, trc):
        print(f"  {ticker} : {risk_contrib*100:.4f}% de volatilité globale")
```
