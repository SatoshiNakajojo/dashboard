# Gestion du Risque Intertemporel : Volatilité d'Ouverture (Overnight Gaps) et Liquidité de Week-end

La continuité du temps n'est qu'une illusion sur les marchés financiers. La transition entre deux séances boursières (Actions) ou la transition vers le week-end (Cryptos) modifie profondément la structure du risque. Ce document formalise la gestion du **Risque Intertemporel (Intertemporal Risk)** et fournit les filtres algorithmiques nécessaires pour immuniser le portefeuille du Trading Desk.

---

## 1. Le Risque de Saut de Nuit (Overnight Gap Risk) sur les Actions

Contrairement au marché des crypto-monnaies, le marché des actions physiques ferme ses portes la nuit et le week-end. Cependant, le flux d'informations économiques et géopolitiques ne s'arrête jamais. Cette asymétrie temporelle donne naissance au **Risque de Gap d'Ouverture (Overnight Gap)**.

### A. Mécanisme de saut et inefficacité des Stop-Loss ordinaires
Un Stop-Loss classique est un ordre à déclenchement (Stop) qui devient un ordre de vente au marché (*Market Order*) dès que le prix franchit le seuil. 
*   **Le Piège** : Si l'action Apple (AAPL) clôture à **$150** avec un stop-loss placé à **$145** (-3.3%), et qu'un avertissement sur les bénéfices est publié pendant la nuit, l'action peut ouvrir le lendemain directement à **$135** (-10%).
*   **La Réalité** : Le Stop-Loss est déclenché à l'ouverture et s'exécute à **$135**, infligeant une perte trois fois supérieure à la perte maximale autorisée.

### B. Modélisation de la Volatilité d'Ouverture (Expected Gap Size)
Pour anticiper et absorber ce risque de saut, le **Desk Manager** doit évaluer mathématiquement la taille attendue du gap d'ouverture (\\(G_{exp}\\)) en utilisant la volatilité implicite des options à court terme (IV) ou l'ATR historique :

\\[G_{exp} = \sigma_{overnight} = \sigma_{implied} \times \sqrt{\frac{\Delta t}{365}}\\]

Où :
*   \\(\sigma_{implied}\\) est la volatilité implicite de l'option At-The-Money (ATM) de maturité la plus courte.
*   \\(\Delta t\\) est la fraction de temps d'arrêt du marché (ex : 17.5 heures entre 16h00 et 9h30, ou 65.5 heures pendant le week-end).

### C. Règles de Contrôle du Risque Overnight (Swing Actions)
1.  **Réduction systématique du Levier** : Aucune position de swing d'actions individuelles ne doit être maintenue overnight avec un levier supérieur à **1.5x**.
2.  **Sizing ajusté au Gap** : La taille de la position doit être redimensionnée de manière à ce que la perte en cas de gap d'ouverture équivalent à **3 * \\(\sigma_{overnight}\\)** ne dépasse pas la limite de risque par trade (ex : 1% du capital total).
3.  **Hedging par Options** : Pour les positions de swing de taille importante, l'achat d'un put option protecteur *overnight* doit être envisagé pour limiter contractuellement la perte maximale au prix d'exercice (Strike), agissant comme un stop-loss garanti.

---

## 2. L'Assèchement de Liquidité du Week-end (Cryptos)

Le marché des crypto-monnaies cote 24/7. Cependant, la liquidité institutionnelle (banques de contrepartie, grands teneurs de marché, bureaux de gré à gré - OTC) est fermée du vendredi soir 17h00 au dimanche soir 17h00 (Heure de New York). Cela coïncide également avec la fermeture des contrats à terme régulés du CME.

### A. La Microstructure du Week-end
*   **L'Assèchement du carnet (Thinning Order Book)** : La profondeur du carnet d'ordres L1/L2/L3 d'Hyperliquid s'effondre de **40% à 70%** le week-end. Les ordres limites restants sont principalement placés par des algorithmes de market making de faible capitalisation ou des traders de détail.
*   **Élargissement du Spread** : L'écart acheteur-vendeur (*Spread*) s'élargit mécaniquement pour compenser l'augmentation du risque d'inventaire des teneurs de marché.
*   **La Mèche de Liquidation (Stop Hunt)** : Avec un carnet d'ordres mince, de faibles volumes directionnels suffisent à faire dévier le prix et à franchir les zones de liquidation à fort levier (cascades de liquidations), provoquant des "mèches" de prix qui reviennent immédiatement à la moyenne ensuite.

### B. Règles de Contrôle du Risque de Week-end (Cryptos)
Pour survivre à ce "bruit de week-end" sans perturber les stratégies de Swing, les agents doivent appliquer :
1.  **Le Filtre de Levier du Week-end** : Le vendredi à 16h00 UTC, l'agent de risque (*Risk Manager*) doit réduire de moitié le levier de toutes les positions de swing ouvertes (ex: ramener le levier maximum autorisé de 10x à 5x) en coupant partiellement les tailles ou en augmentant la marge de garantie.
2.  **L'Élargissement Volatil des Stops** : Les stop-loss des positions swing portées le week-end ne doivent pas être des stops fixes basés sur le carnet d'ordres L1. Ils doivent être calculés avec un multiplicateur ATR plus lâche (ex: **3.5x ATR(14) au lieu de 2x ATR**) pour éviter d'être exécutés par une mèche de liquidation factice et illiquide.
3.  **Le Gel des Ordres d'Exécution Grosses Tailles** : Sauf urgence (Circuit Breaker déclenché), l'agent d'exécution (*Action Trader*) a interdiction de soumettre des ordres parents supérieurs à **5% de l'ADV (Average Daily Volume)** du week-end, sous peine de subir un glissement destructeur.

---

## 3. Code de Production Python : Ajustement de Position au Risque Intertemporel

Le script ci-dessous calcule l'espérance de gap d'ouverture d'une action pour redimensionner dynamiquement la position avant la clôture, et ajuste les paramètres de levier crypto avant le week-end.

```python
import numpy as np

def calculate_overnight_risk_sizing(
    capital: float, 
    risk_tolerance_pct: float, 
    stock_price: float, 
    implied_volatility: float, 
    days_to_expiration: float = 1.0
) -> dict:
    """
    Calcule la taille de position maximale d'une action pour la détentions overnight.
    Utilise la volatilité implicite pour modéliser le pire saut d'ouverture (Gap) à 3 écarts-types.
    """
    # Risque maximum en valeur absolue
    max_risk_cash = capital * (risk_tolerance_pct / 100.0)
    
    # Estimation mathématique de l'écart-type du gap d'ouverture (overnight gap std dev)
    # days_to_expiration est la fraction de jour de fermeture (ex: 1 jour entre deux séances)
    sigma_overnight = implied_volatility * np.sqrt(days_to_expiration / 365.0)
    
    # Pire mouvement attendu à 3 sigmas (99.7% de niveau de confiance)
    worst_case_gap_pct = 3.0 * sigma_overnight
    worst_case_gap_price_drop = stock_price * worst_case_gap_pct
    
    # Taille de position max (en actions) pour ne pas dépasser la tolérance de risque
    max_shares = max_risk_cash / worst_case_gap_price_drop
    max_position_value = max_shares * stock_price
    
    # Levier théorique requis par rapport au capital total
    implied_leverage = max_position_value / capital
    
    return {
        "expected_gap_pct": round(sigma_overnight * 100.0, 3),
        "worst_case_gap_pct": round(worst_case_gap_pct * 100.0, 3),
        "max_shares_to_hold": int(max_shares),
        "max_position_value": round(max_position_value, 2),
        "suggested_leverage": round(implied_leverage, 2)
    }

def adjust_crypto_leverage_for_weekend(current_leverage: float, is_weekend: bool) -> float:
    """
    Règle de filtrage dynamique appliquant un haircut systématique de 50% sur le levier 
    lorsque le marché entre dans sa phase d'illiquidité de week-end.
    """
    if is_weekend:
        adjusted_leverage = max(1.0, current_leverage * 0.5)
        return round(adjusted_leverage, 1)
    return current_leverage

# Exemple d'exécution
if __name__ == "__main__":
    capital_desk = 1000000.0  # $1,000,000 sous gestion
    risk_limit_pct = 1.0     # 1% de perte maximale tolérée par trade ($10,000)
    
    # Cas 1 : Action très volatile (Tesla, TSLA) avant publication des résultats
    print("--- CAS ACTIONS : AJUSTEMENT OVERNIGHT (TSLA) ---")
    tsla_price = 220.0
    tsla_iv = 0.65  # 65% de volatilité implicite (IV élevée)
    
    sizing_tsla = calculate_overnight_risk_sizing(
        capital=capital_desk,
        risk_tolerance_pct=risk_limit_pct,
        stock_price=tsla_price,
        implied_volatility=tsla_iv
    )
    
    print(f"Gap attendu (1 écart-type) : {sizing_tsla['expected_gap_pct']}%")
    print(f"Gap pire cas (3 écarts-types) : {sizing_tsla['worst_case_gap_pct']}%")
    print(f"Nombre maximum d'actions à détenir overnight : {sizing_tsla['max_shares_to_hold']} actions")
    print(f"Valeur maximale de la position : ${sizing_tsla['max_position_value']}")
    print(f"Levier maximum suggéré : {sizing_tsla['suggested_leverage']}x")

    # Cas 2 : Réduction de levier Crypto avant le week-end
    print("\n--- CAS CRYPTO : GESTION DE LA LIQUIDITE DU WEEK-END ---")
    leverage_init = 6.0
    print(f"Levier de swing initial (Semaine) : {leverage_init}x")
    leverage_weekend = adjust_crypto_leverage_for_weekend(leverage_init, is_weekend=True)
    print(f"Levier de swing ajusté (Week-end) : {leverage_weekend}x")
```
