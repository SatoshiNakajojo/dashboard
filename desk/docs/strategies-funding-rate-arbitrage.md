# Arbitrage de Taux de Financement (Funding Rate Arbitrage)

Ce document fournit un cadre mathématique et algorithmique de production pour mettre en œuvre une stratégie d'arbitrage de taux de financement delta-neutre, croisant les marchés Spot et Dérivés (Contrats Perpetuels - Perps) sur les classes d'actifs Actions et Cryptos.

---

## 1. Le Mécanisme Fondamental du Taux de Financement

Dans les marchés de contrats perpétuels (notamment sur des protocoles comme Hyperliquid, dYdX ou Binance), le taux de financement (*Funding Rate*) est un paiement périodique échangé entre les traders longs et shorts. Son but est de maintenir le prix du contrat perpétuel (\\(P_{perp}\\)) ancré au prix de l'actif sous-jacent (\\(P_{spot}\\)) :

\\[F = \text{Clamp}\left(\text{Premium Index} + \text{Interest Rate}, F_{min}, F_{max}\right)\\]

*   **Si \\(F > 0\\) (Marché haussier / Contrat à prime)** : Les acheteurs (Longs) paient les vendeurs (Shorts). Le perp se négocie au-dessus du spot.
*   **Si \\(F < 0\\) (Marché baissier / Contrat à escompte)** : Les vendeurs (Shorts) paient les acheteurs (Longs). Le perp se négocie en dessous du spot.

Le paiement de financement s'effectue généralement toutes les heures ou toutes les 8 heures. Le flux de trésorerie net d'une période d'arbitrage s'écrit :

\\[\text{Cash Flow Funding} = \text{Position Size} \times P_{mark} \times F\\]

---

## 2. Conception de la Stratégie Delta-Neutre

L'objectif de cette stratégie est de capter ce flux de trésorerie tout en maintenant une exposition directionnelle nulle au marché (Delta global = 0).

### Scénario A : Financement Positif Permanent (Arbitrage Classique)
1.  **Entrée** : Acheter la quantité \\(Q\\) de l'actif \\(S\\) sur le marché Spot, et simultanément vendre à découvert (Short) la quantité \\(Q\\) de l'actif \\(S\\) via un contrat perpétuel.
2.  **Rendement** : L'arbitragiste collecte le taux de financement positif payé par les longs aux shorts toutes les échéances.
3.  **Sortie** : Vendre le Spot et racheter le Perp de manière asynchrone pour clore la position.

---

## 3. Modélisation Mathématique de la Rentabilité (Espérance Mathématique)

Le rendement net annualisé attendu (APY net) d'un arbitrage de financement doit impérativement intégrer les coûts frictionnels d'exécution.

L'espérance de rendement d'une campagne de financement d'une durée estimée de \\(D\\) jours s'écrit :

\\[\text{Yield}_{net} = \sum_{t=1}^{N_{periods}} \left( F_t \times Q \times P_{mark, t} \right) - \text{Coûts d'Entrée} - \text{Coûts de Sortie} - \text{Coûts de Portage}\\]

Où :
*   \\(N_{periods}\\) est le nombre de paiements collectés (ex : \\(D \times 3\\) pour un paiement toutes les 8 heures).
*   **Coûts d'Entrée** : \\(Q \times \left( P_{spot, 0} \times \text{Fee}_{spot} + P_{perp, 0} \times \text{Fee}_{perp} \right) + \text{Slippage d'exécution}\\).
*   **Coûts de Sortie** : \\(Q \times \left( P_{spot, D} \times \text{Fee}_{spot} + P_{perp, D} \times \text{Fee}_{perp} \right) + \text{Slippage d'exécution}\\).
*   **Coûts de Portage (Carry Cost)** : Intérêts d'emprunt marginaux si le spot est acheté sur marge ou si l'actif de short est emprunté.

Le taux d'opportunité d'arbitrage (Spread de déclenchement) est validé uniquement si :

\\[\text{APY}_{net} > \text{APY}_{sans\_risque} + \text{Primes de Risque}\\]

La prime de risque intègre les risques de dé-corrélation temporaire (basis risk) et le risque de liquidation forcée sur le short en cas de hausse parabolique brutale de l'actif.

---

## 4. Implémentation du Algorithme de Détection en Python

Ce script scanne en temps réel les opportunités de financement entre deux exchanges (ou entre le marché Spot et Perpetual de la même plateforme) pour évaluer la viabilité financière de la stratégie :

```python
import numpy as np

def calculate_arbitrage_viability(
    spot_price: float,
    perp_price: float,
    funding_rate_annualized: float,
    size: float,
    duration_days: int,
    maker_fee: float = -0.0001,  # Hyperliquid rebate
    taker_fee: float = 0.00035,   # Hyperliquid taker
    borrow_rate_annualized: float = 0.05
) -> dict:
    """
    Calcule la rentabilité nette attendue d'une position d'arbitrage de financement Spot-Perp.
    """
    notional = size * spot_price
    
    # Coûts d'entrée (Taker sur spot, Maker ou Taker sur perp)
    entry_cost_spot = notional * taker_fee
    entry_cost_perp = notional * taker_fee
    
    # Coûts d'emprunt (portage du spot s'il est acheté à crédit ou marge de short)
    carry_cost = notional * (borrow_rate_annualized * (duration_days / 365.0))
    
    # Estimation des coûts de sortie
    exit_cost_spot = notional * taker_fee
    exit_cost_perp = notional * taker_fee
    
    total_frictional_costs = entry_cost_spot + entry_cost_perp + exit_cost_spot + exit_cost_perp + carry_cost
    
    # Revenu brut du funding estimé sur la durée
    gross_funding_revenue = notional * (funding_rate_annualized * (duration_days / 365.0))
    
    # Profit Net
    net_profit = gross_funding_revenue - total_frictional_costs
    net_apy = (net_profit / notional) * (365.0 / duration_days) * 100
    
    # Calcul de la distance à la liquidation (LTV)
    # Si le perp monte de X%
    maintenance_margin = 0.05  # 5%
    leverage = 10.0            # Levier 10x sur le perp
    liquidation_price_jump = (1 / leverage) - maintenance_margin
    
    return {
        "notional_size_usd": notional,
        "gross_revenue_usd": gross_funding_revenue,
        "frictional_costs_usd": total_frictional_costs,
        "net_profit_usd": net_profit,
        "net_apy_percent": net_apy,
        "liquidation_price_increase_threshold_percent": liquidation_price_jump * 100,
        "is_viable": net_apy > 15.0  # Seuil minimal de rentabilité cible de 15% APY
    }
```

---

## 5. Protocoles Opérationnels de Gestion du Risque

1.  **Rééquilibrage de marge (Margin Call Automation)** : Le *Desk Manager* surveille en continu la LTV (Loan-To-Value) du compte de dérivés. Si le Perpetual subit une hausse asymétrique (ex: Hausse crypto de +30%), l'agent d'exécution doit automatiquement déplacer des collatéraux de marge du Spot (en vendant une fraction du spot ou en transférant des stablecoins inutilisés) vers le sous-compte de dérivés pour repousser la liquidation.
2.  **Filtre de Réversion de Taux** : Si le taux de financement moyen converge vers zéro ou s'inverse de manière persistante sur une fenêtre glissante de 72 heures, l'algorithme doit liquider de manière ordonnée les deux branches (Spot et Perp) pour préserver le capital d'arbitrage.
