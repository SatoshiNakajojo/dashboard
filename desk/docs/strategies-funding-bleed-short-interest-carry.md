# Coûts de Portage et Financement Temporel : Gestion du Funding Bleed Crypto et du Short Interest Actions

Le maintien d'une position de trading sur un horizon moyen/long (**Swing Trading**) génère des frictions financières invisibles à l'échelle de l'intraday. Ces coûts opérationnels — regroupés sous l'appellation de **Coût de Portage (Cost of Carry)** — peuvent transformer une stratégie directionnelle gagnante en un trade déficitaire. Ce document formalise la modélisation mathématique du **Funding Bleed (Crypto)** et du **Short Interest (Actions)** pour protéger la marge du Trading Desk.

---

## 1. Le "Funding Bleed" sur les Contrats Perpétuels Crypto

Les contrats perpétuels n'ont pas de date d'expiration. Pour forcer le prix du contrat perpétuel (Perp) à converger vers le prix du marché au comptant (Spot), les bourses utilisent le mécanisme du **Taux de Financement (Funding Rate)**.

### A. La dérive d'érosion (Funding Bleed Drag)
Lorsqu'une position est maintenue sur plusieurs jours ou semaines, le paiement continu du taux de financement peut éroder de manière drastique les gains latents. 
*   Si un agent détient une position longue avec un levier de **5x** sur un actif dont le taux de financement moyen est de **0.05% par tranche de 8 heures** (soit 0.15% par jour ou **54.7% par an** de taux nominal) :
    *   **Le coût de portage réel annuel** sur le capital alloué est de :
        \\[\text{Coût Annuel} = \text{Taux quotidien} \times 365 \times \text{Levier} = 0.15\% \times 365 \times 5 = 273.75\%\\]
    *   La position doit réaliser une hausse minimale de **54.75% brut** sur l'actif par an juste pour atteindre le point mort (Break-Even).

### B. Intégration dans l'espérance mathématique de gain
Le **Desk Manager** doit rejeter ou réduire la taille de toute proposition de swing d'un agent de stratégie si le coût de financement cumulé estimé sur l'horizon de détention théorique dépasse une fraction critique de l'objectif de gain (Take Profit) :

\\[\mathbb{E}[\text{P\&L}_{\text{Net}}] = (\text{Objectif} \times \text{Prob}_{\text{Win}} - \text{Stop} \times \text{Prob}_{\text{Loss}}) - \sum_{t=1}^{N} \text{Funding Rate}_t \times \text{Levier}\\]

Si \\(\sum \text{Funding Cost} \ge 0.3 \times \text{Gain Théorique}\\), l'ordre doit être rejeté ou ré-aiguillé vers le marché au comptant (Spot) malgré les coûts d'emprunt ou de levier initiaux plus élevés de ce dernier.

---

## 2. Le "Short Interest" et le Coût d'Emprunt des Actions

La vente à découvert (*Short Selling*) d'actions physiques exige d'emprunter préalablement le titre auprès d'un courtier. Cette opération introduit deux variables critiques de risque intertemporel : **les frais d'emprunt (Borrow Rates)** et le risque de **Short Squeeze**.

### A. Les Frais d'Emprunt des Titres Difficiles à Emprunter (Hard-to-Borrow - HTB)
*   **Mécanisme** : Pour les actions ordinaires à forte liquidité, les frais d'emprunt sont négligeables (<1% par an). Mais pour les actions spéculatives à forte volatilité, les frais d'emprunt peuvent exploser et dépasser **50% à 150% par an** de taux d'intérêt, calculés quotidiennement :
    \\[\text{Frais Quotidiens} = \frac{\text{Valeur de la position Short} \times \text{Borrow Rate}}{360}\\]
*   **Règle de risque** : Interdiction absolue d'initier un swing short si le coût d'emprunt annualisé dépasse **50% de l'espérance de rendement brut** calculée du trade.

### B. Le Risque de Short Squeeze et les Indicateurs de Contrôle
Un *Short Squeeze* survient lorsqu'une hausse rapide du cours force les vendeurs à découvert à racheter simultanément leurs actions pour couper leurs pertes, provoquant une hausse parabolique auto-alimentée.
Pour s'en prémunir, l'agent de risque doit surveiller deux indicateurs clés de structure de marché :
1.  **Le Short Interest (SI % of Float)** : Le pourcentage d'actions en circulation actuellement vendues à découvert.
    *   *Seuil de Danger* : **SI > 15%**. L'action est hautement sensible à un squeeze.
2.  **Le Days to Cover (DTC) / Short Interest Ratio** : Le nombre théorique de jours nécessaires pour racheter toutes les actions shortées sur la base du volume d'échange quotidien moyen :
    \\[\text{Days to Cover} = \frac{\text{Actions Shortées (Total)}}{\text{Average Daily Volume (30 jours)}}\\]
    *   *Seuil de Danger* : **DTC > 5.0 jours**. En cas de panique haussière, les vendeurs à découvert mettront plusieurs jours à sortir du marché, bloqués par le goulot d'étranglement de la liquidité journalière.

### C. Protocole de Protection de l'Agent de Risque
*   Si le **Days to Cover (DTC) franchit le seuil de 5.0**, tout ordre de vente à découvert doit être immédiatement bloqué par l'orchestrateur.
*   Si une position de swing short est active et que le DTC dépasse **7.0** suite à un assèchement du volume quotidien moyen, le stop-loss de la position doit être resserré automatiquement de **3x ATR à 1.5x ATR** pour sortir en amont de toute cascade de rachat.

---

## 3. Code de Production Python : Modélisation du Funding Drag et du Risque de Squeeze

Le code suivant modélise l'érosion d'une position longue de swing sur dérivés crypto et calcule le score d'alerte de Short Squeeze sur un panier d'actions.

```python
import numpy as np
import pandas as pd

def simulate_perpetual_funding_drag(
    entry_price: float,
    leverage: float,
    avg_funding_8h: float,
    holding_days: int,
    expected_price_move_pct: float
) -> dict:
    """
    Simule l'impact de l'érosion du taux de financement (Funding Bleed) sur un trade de swing.
    Compare le gain théorique espéré de l'actif avec le coût cumulé du portage.
    """
    # Nombre de tranches de financement (généralement 3 fois par jour / toutes les 8h)
    funding_periods = holding_days * 3
    
    # Coût de financement cumulé sur le capital de base (notional position value)
    # Formule composée : (1 + rate)^periods - 1
    cumulative_funding_rate_notional = (1 + avg_funding_8h)**funding_periods - 1
    
    # Coût réel par rapport à la marge de garantie initiale (marge requise)
    funding_cost_margin = cumulative_funding_rate_notional * leverage
    
    # Rendement brut de l'actif
    asset_return_pct = expected_price_move_pct / 100.0
    gross_pnl_margin = asset_return_pct * leverage
    
    # Rendement net après prélèvement du financement
    net_pnl_margin = gross_pnl_margin - funding_cost_margin
    
    # Érosion relative du gain attendu (Drag Ratio)
    drag_ratio = funding_cost_margin / (gross_pnl_margin + 1e-9)
    
    return {
        "cumulative_funding_cost_pct_of_margin": round(funding_cost_margin * 100.0, 2),
        "gross_pnl_margin_pct": round(gross_pnl_margin * 100.0, 2),
        "net_pnl_margin_pct": round(net_pnl_margin * 100.0, 2),
        "funding_drag_ratio_pct": round(drag_ratio * 100.0, 2),
        "viable": drag_ratio < 0.30  # Rejeté si l'érosion dépasse 30% du gain attendu
    }

def evaluate_short_squeeze_risk(
    float_shares: float,
    short_interest_shares: float,
    avg_daily_volume: float
) -> dict:
    """
    Évalue la vulnérabilité structurelle d'une action à un Short Squeeze.
    """
    short_interest_pct = (short_interest_shares / float_shares) * 100.0
    days_to_cover = short_interest_shares / avg_daily_volume
    
    # Score de risque de squeeze (de 0 à 100)
    risk_score = 0.0
    risk_score += min(50.0, short_interest_pct * 2.0)  # Poids SI (Max 50 pts pour SI >= 25%)
    risk_score += min(50.0, days_to_cover * 7.14)     # Poids DTC (Max 50 pts pour DTC >= 7j)
    
    return {
        "short_interest_pct": round(short_interest_pct, 2),
        "days_to_cover": round(days_to_cover, 2),
        "squeeze_risk_score": round(risk_score, 1),
        "action_allowed": risk_score < 65.0  # Bloquer l'entrée short si risque trop élevé
    }

# Exemple d'exécution
if __name__ == "__main__":
    # Cas 1 : Swing Long de 14 jours sur un altcoin ultra-bullish avec fort taux de financement
    print("--- EVALUATION DU FUNDING DRAG (CRYPTO SWING) ---")
    sim_crypto = simulate_perpetual_funding_drag(
        entry_price=100.0,
        leverage=5.0,
        avg_funding_8h=0.0005,  # 0.05% par 8h (courant en bull market crypto)
        holding_days=14,
        expected_price_move_pct=15.0  # Objectif de hausse de +15% sur l'actif
    )
    
    print(f"Coût cumulé du financement (% de la marge) : {sim_crypto['cumulative_funding_cost_pct_of_margin']}%")
    print(f"Gain brut théorique du levier : {sim_crypto['gross_pnl_margin_pct']}%")
    print(f"Gain net après érosion : {sim_crypto['net_pnl_margin_pct']}%")
    print(f"Rapport d'érosion (Funding Drag) : {sim_crypto['funding_drag_ratio_pct']}%")
    print(f"La position est-elle viable pour du Swing ? {sim_crypto['viable']}")

    # Cas 2 : Évaluation du risque de Squeeze sur une action d'intérêt (ex : GameStop)
    print("\n--- EVALUATION DU RISQUE DE SHORT SQUEEZE (ACTIONS SHORT) ---")
    gme_float = 265000000.0
    gme_short = 54000000.0
    gme_adv = 8500000.0
    
    squeeze_analysis = evaluate_short_squeeze_risk(
        float_shares=gme_float,
        short_interest_shares=gme_short,
        avg_daily_volume=gme_adv
    )
    
    print(f"Short Interest : {squeeze_analysis['short_interest_pct']}% du float")
    print(f"Days to Cover (DTC) : {squeeze_analysis['days_to_cover']} jours")
    print(f"Score de risque de Short Squeeze (0-100) : {squeeze_analysis['squeeze_risk_score']}")
    print(f"L'autorisation de short est-elle accordée par le Risk Manager ? {squeeze_analysis['action_allowed']}")
```
