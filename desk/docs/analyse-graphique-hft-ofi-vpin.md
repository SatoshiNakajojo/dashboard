# Microstructure HFT : Order Flow Imbalance (OFI) et Volume-Synchronized Probability of Toxicity (VPIN)

Dans l'univers du High-Frequency Trading (HFT) et de la tenue de marché (Market Making), les indicateurs techniques traditionnels basés sur le temps (ex: RSI, MACD) sont inefficaces en raison de leur déphasage arithmétique. Ce document formalise deux métriques micro-structurelles fondamentales basées sur le flux d'ordres et l'horloge de volume : l'**Order Flow Imbalance (OFI)** et le **Volume-Synchronized Probability of Informed Trading (VPIN)**.

---

## 1. Order Flow Imbalance (OFI)

Formalisé par Rama Cont, Arseniy Kukanov et Sasha Stoikov (2014) dans *"The Price Impact of Order Book Events"*, l'OFI quantifie le déséquilibre net entre la pression acheteuse et vendeuse au niveau le plus haut du carnet d'ordres (Limit Order Book - LOB) sur un intervalle donné. Contrairement au déséquilibre de transaction, l'OFI intègre les placements et les annulations d'ordres limites.

### A. Formulation Mathématique
Soit $q_t^B$ le volume disponible au meilleur bid (meilleur cours acheteur) à l'instant $t$, et $p_t^B$ le prix associé.
Soit $q_t^A$ le volume disponible au meilleur ask (meilleur cours vendeur) à l'instant $t$, et $p_t^A$ le prix associé.

Les variations de demande ($\Delta W_t^B$) et d'offre ($\Delta W_t^A$) à l'étape $t$ sont définies par :

$$\Delta W_t^B = \begin{cases} q_t^B & \text{si } p_t^B > p_{t-1}^B \\ q_t^B - q_{t-1}^B & \text{si } p_t^B = p_{t-1}^B \\ -q_{t-1}^B & \text{si } p_t^B < p_{t-1}^B \end{cases}$$

$$\Delta W_t^A = \begin{cases} -q_t^A & \text{si } p_t^A < p_{t-1}^A \\ q_t^A - q_{t-1}^A & \text{si } p_t^A = p_{t-1}^A \\ q_{t-1}^A & \text{si } p_t^A > p_{t-1}^A \end{cases}$$

L'**OFI** sur l'intervalle $t$ est défini par le déséquilibre net :

$$\text{OFI}_t = \Delta W_t^B - \Delta W_t^A$$

*   **OFI > 0** : Accumulation au Bid (nouveaux Bids ou annulations d'Asks) -> Pression haussière.
*   **OFI < 0** : Accumulation à l'Ask (nouveaux Asks ou annulations de Bids) -> Pression baissière.

La relation entre la variation du cours moyen ($\Delta P_t = P_t - P_{t-1}$) et l'OFI est modélisée par une relation linéaire à court terme :

$$\Delta P_t = \beta \cdot \text{OFI}_t + \epsilon_t$$

Où $\beta$ représente le coefficient d'impact sur le prix (Kyle's Lambda micro-structurel), inversement proportionnel à la profondeur du carnet.

### B. Implémentation Python (Calcul de l'OFI)
Voici le script optimisé pour calculer l'OFI à partir d'un DataFrame de flux LOB de niveau 1 :

```python
import numpy as np
import pandas as pd

def calculate_ofi(df):
    """
    Calcule l'Order Flow Imbalance (OFI) de niveau 1.
    df doit contenir : 'bid_price', 'bid_size', 'ask_price', 'ask_size'
    """
    ofi = []
    
    # Initialisation aux indices t et t-1
    for t in range(1, len(df)):
        p_b_curr, p_b_prev = df.loc[df.index[t], 'bid_price'], df.loc[df.index[t-1], 'bid_price']
        q_b_curr, q_b_prev = df.loc[df.index[t], 'bid_size'], df.loc[df.index[t-1], 'bid_size']
        
        p_a_curr, p_a_prev = df.loc[df.index[t], 'ask_price'], df.loc[df.index[t-1], 'ask_price']
        q_a_curr, q_a_prev = df.loc[df.index[t], 'ask_size'], df.loc[df.index[t-1], 'ask_size']
        
        # Calcul de delta Bid
        if p_b_curr > p_b_prev:
            delta_bid = q_b_curr
        elif p_b_curr == p_b_prev:
            delta_bid = q_b_curr - q_b_prev
        else:
            delta_bid = -q_b_prev
            
        # Calcul de delta Ask
        if p_a_curr < p_a_prev:
            delta_ask = -q_a_curr
        elif p_a_curr == p_a_prev:
            delta_ask = q_a_curr - q_a_prev
        else:
            delta_ask = q_a_prev
            
        ofi.append(delta_bid - delta_ask)
        
    return pd.Series([0] + ofi, index=df.index)
```

---

## 2. Volume-Synchronized Probability of Toxicity (VPIN)

Introduit par Easley, Lopez de Prado et O'Hara (2012), le **VPIN** estime la probabilité de trading informé et la toxicité des flux en temps réel en remplaçant l'horloge physique (temps) par une **horloge de volume** (Volume Clock). Le flux transactionnel est découpé en tranches d'un volume constant $V$ (appelées paniers ou *buckets*).

### A. Formulation Mathématique
1.  **Bucketing par Volume** : Le flux continu des transactions est regroupé en paniers de taille fixe $V$ (ex: $V = 100\,000$ contrats ou actions). Si une transaction finale dépasse la taille $V$, le surplus est reporté sur le panier suivant.
2.  **Classification des transactions (Acheteurs/Vendeurs)** : Pour chaque transaction de prix $p_\tau$ au sein d'un panier, le volume de cette transaction $v_\tau$ est réparti entre acheteurs ($V^B$) et vendeurs ($V^S$) selon l'algorithme d'interpolation linéaire de prix (ou règle de la position dans le spread de tick) :

$$V^B = V \cdot Z\left( \frac{p_\tau - p_{\text{low}}}{p_{\text{high}} - p_{\text{low}}} \right) \quad \text{et} \quad V^S = V - V^B$$

Où $Z$ est la fonction de répartition cumulative de la loi normale standard. Pour une approximation classique, on utilise une répartition proportionnelle linéaire entre les limites de prix du panier.
3.  **Calcul du VPIN** : La toxicité globale sur une fenêtre glissante de $N$ paniers de volume est :

$$\text{VPIN} = \frac{\sum_{\tau=1}^{N} |V_\tau^B - V_\tau^S|}{N \cdot V}$$

Où :
*   $V$ est la taille constante de chaque panier.
*   $V_\tau^B$ et $V_\tau^S$ représentent respectivement le volume d'achat et le volume de vente dans le panier $\tau$.
*   $\text{VPIN} \in [0, 1]$. Un VPIN proche de 1 indique un déséquilibre d'achat/vente total (flux hautement toxique dominé par des traders informés). Un VPIN proche de 0 indique un marché parfaitement équilibré par des traders de bruit (*noise traders*).

### B. Implémentation Python (Calcul du VPIN)

```python
import numpy as np
import pandas as pd

def calculate_vpin(trades_df, bucket_size, rolling_window=50):
    """
    Calcule le VPIN (Volume-Synchronized Probability of Informed Trading).
    trades_df doit contenir : 'price', 'volume'
    """
    buckets_buys = []
    buckets_sells = []
    
    current_volume = 0
    current_trades = []
    
    # 1. Pipeline de bucketing par volume
    for idx, row in trades_df.iterrows():
        current_volume += row['volume']
        current_trades.append(row)
        
        if current_volume >= bucket_size:
            # Traitement du panier complété
            pdf = pd.DataFrame(current_trades)
            p_high = pdf['price'].max()
            p_low = pdf['price'].min()
            
            # Gestion du cas d'un panier plat (prix constant)
            if p_high == p_low:
                buy_vol = current_volume / 2
                sell_vol = current_volume / 2
            else:
                # Approximation linéaire de la répartition Acheteurs / Vendeurs
                # Règle de positionnement dans le range du panier
                prices = pdf['price'].values
                volumes = pdf['volume'].values
                buy_vol = 0
                for p, v in zip(prices, volumes):
                    factor = (p - p_low) / (p_high - p_low)
                    buy_vol += v * factor
                sell_vol = current_volume - buy_vol
                
            buckets_buys.append(buy_vol)
            buckets_sells.append(sell_vol)
            
            # Réinitialisation pour le prochain panier
            current_volume = 0
            current_trades = []
            
    # 2. Calcul du VPIN glissant
    buys = np.array(buckets_buys)
    sells = np.array(buckets_sells)
    
    vpin_values = []
    for i in range(rolling_window, len(buys) + 1):
        window_buys = buys[i - rolling_window : i]
        window_sells = sells[i - rolling_window : i]
        
        abs_diff = np.abs(window_buys - window_sells)
        vpin = np.sum(abs_diff) / (rolling_window * bucket_size)
        vpin_values.append(vpin)
        
    return pd.Series([np.nan] * (rolling_window - 1) + vpin_values)
```

---

## 3. Intégration Opérationnelle dans l'Équipe d'Agents

Les signaux de microstructure issus de l'OFI et du VPIN sont directement interfacés avec la topologie multi-agents du trading desk :

1.  **L'Agent Market Screener (Continuous Processing)** :
    *   Surveille continuellement les flux WebSockets de niveau 1 (LOB) et les trades des paires liquides de Hyperliquid (ex: SOL-PERP, BTC-PERP).
    *   Calcule l'OFI glissant sur des horizons de 10s, 30s, et 1 min, et compile les paniers VPIN.
2.  **L'Agent Risk Manager (Circuit Breaker Microstructurel)** :
    *   Si le VPIN franchit un centile extrême historique (ex: $\text{VPIN} > 0.85$, correspondant au 95ème centile historique), l'agent Risk Manager lève immédiatement une **alerte de toxicité de flux**.
    *   Il impose une **réduction immédiate de la taille de position** ou élargit les stops, car un marché hautement toxique annonce des risques de cascades de liquidations ou de vidage soudain de carnet d'ordres (Flash Crash).
3.  **L'Agent Action Trader (Le Nageur)** :
    *   Utilise la direction de l'OFI pour optimiser l'exécution de ses ordres. Si l'OFI est fortement négatif (pression vendeuse), l'agent retarde l'exécution d'un ordre d'achat limite pour obtenir un prix moyen plus favorable, ou utilise des ordres d'exécution agressifs en cas d'impulsion de momentum inverse.
