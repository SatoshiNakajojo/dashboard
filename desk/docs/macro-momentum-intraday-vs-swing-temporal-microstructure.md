# Microstructure Temporelle et Profils Intra-journaliers : Gestion de Session et Modélisation en U

Ce document traite de la dynamique micro-structurelle temporelle et fournit le cadre algorithmique permettant au **Desk Manager** d'orchestrer les sessions de trading et de basculer dynamiquement entre les stratégies **Intraday** (scalping, cassures rapides, retour à la moyenne micro) et **Swing** (suivi de tendance macro, capture de narratifs, portage d'arbitrage).

---

## 1. La Distribution Temporelle du Volume : Profil en U (Actions)

La liquidité et la volatilité ne sont pas constantes au cours d'une séance boursière. Sur les marchés d'actions (comme le S&P 500), le volume d'échange suit une distribution empirique hautement prévisible en forme de **U (U-Shape Volume Profile)**.

```
 Volume / Volatilité
   ▲
   │  █ █                                                 █ █  ◄ Enchères de Clôture (MOC)
   │  █ █ █                                             █ █ █
   │  █ █ █ █                                         █ █ █ █
   │  █ █ █ █ █                                     █ █ █ █ █
   │  █ █ █ █ █ █                                 █ █ █ █ █ █
   │  █ █ █ █ █ █ █                             █ █ █ █ █ █ █
   │  █ █ █ █ █ █ █ █                         █ █ █ █ █ █ █ █
   │  █ █ █ █ █ █ █ █ █ █ █ █ █     █ █ █ █ █ █ █ █ █ █ █ █ █  ◄ Creux de Mi-journée (Lunchtime)
   └──────────────────────────────────────────────────────────► Temps
     9h30     10h00           12h00-14h00           15h30  16h00
    (Ouverture / NYSE)        (Lunchtime)             (Clôture)
```

### A. La Phase d'Ouverture (9h30 - 10h15) : Volatilité et Price Discovery
*   **Mécanisme** : L'accumulation d'informations et d'événements hors-séance (overnight news, earnings) crée un déséquilibre initial à l'ouverture du marché. Les enchères d'ouverture résolvent ce déséquilibre initial, suivies d'une forte activité des market makers et des algorithmes spéculatifs.
*   **Implication** : C'est la zone d'espérance maximale pour les stratégies de **Breakout Intraday** (ORB - Opening Range Breakout) et de scalp à fort momentum. Le slippage est absorbé par la profondeur extrême du carnet, bien que le spread bid-ask soit légèrement plus large à la première minute.

### B. Le Creux de Mi-journée (11h30 - 14h00) : Le Piège de la Mi-journée (Lunchtime Drift)
*   **Mécanisme** : La baisse de participation humaine et institutionnelle (fin des flux européens à 11h30, heure de New York) assèche le carnet d'ordres.
*   **Implication** : Les stratégies de suivi de tendance intraday subissent une forte usure (*churn* et faux signaux). C'est le royaume du **Mean Reversion micro** (retour à la moyenne). Les ordres passifs doivent être privilégiés car l'impact de marché d'un grand ordre de swap est amplifié par le manque de profondeur (Kyle's \\(\lambda\\) élevé).

### C. La Phase de Clôture (15h30 - 16h00) : Les Enchères Market-On-Close (MOC)
*   **Mécanisme** : Les fonds indiciels (ETFs) et les grands gérants rééquilibrent leurs portefeuilles de manière à s'exécuter exactement au prix de clôture officiel pour éliminer la *tracking error*.
*   **Implication** : Des blocs d'ordres massifs traversent le carnet. Les algorithmes d'exécution d'ordres parents (TWAP/VWAP) doivent augmenter agressivement leur taux de participation (POV) pour achever leur exécution avant 16h00.

---

## 2. L'Horloge du Taux de Financement (Cryptos)

Contrairement aux actions, le marché des dérivés de crypto-monnaies (contrats perpétuels Hyperliquid) fonctionne en continu (24/7). Cependant, il est rythmé par des pulsations temporelles déterministes : **les cycles de calcul du Funding Rate** (généralement toutes les 1 heure ou 8 heures).

### A. Le Phénomène d'Anomalie Pré-Financement
*   **Mécanisme** : Lorsque le taux de financement prévisionnel est fortement positif (les positions longues paient les positions courtes), les spéculateurs à court terme ferment leurs positions longues juste avant le "Funding Tick" pour éviter de payer le frais de financement. Inversement, les arbitragistes accumulent des positions courtes.
*   **Impact** : Ce flux unidirectionnel crée une micro-pression vendeuse systématique entre **T-15 minutes** et **T-0** (le moment exact du paiement).
*   **Le Rebond Post-Financement** : À **T+1 seconde**, une fois le frais payé, les arbitragistes ferment simultanément leurs couvertures courtes (achat), provoquant un micro-rebond haussier de retour à la moyenne.

### B. Exploitation par l'Agent Intraday
L'agent d'exécution intraday doit adapter son algorithme pour éviter d'entrer en long de swing juste avant un gros prélèvement de financement, ou exploiter la micro-volatilité de retour à la moyenne post-financement :
\\[\text{Espérance Net} = \mathbb{E}[\Delta P] - \text{Funding Rate}\\]

---

## 3. Cadre Décisionnel de l'Orchestrateur : Intraday vs. Swing

Le **Desk Manager** (l'agent superviseur) doit adapter l'horizon de détention de l'équipe d'agents en fonction d'indicateurs macroéconomiques et statistiques mesurant la **volatilité intertemporelle et la persistance de tendance**.

### A. Algorithme de Sélection de Session (Régime Dynamique)

L'orchestrateur calcule deux métriques principales en fin de journée (ou toutes les 4 heures) :
1.  **L'Indice de Persistance (DFA - Detrended Fluctuation Analysis)** ou le coefficient de Hurst (\\(H\\)) :
    *   \\(H > 0.5\\) : Tendance persistante (favorable au **Swing Trading**).
    *   \\(H \approx 0.5\\) : Mouvement brownien aléatoire.
    *   \\(H < 0.5\\) : Tendance anti-persistante / retour à la moyenne (favorable à l'**Intraday Scalping**).
2.  **La Volatilité Relative d'Ouverture (Opening Range Ratio - ORR)** :
    \\[\text{ORR} = \frac{\text{ATR}_{15m} \text{ (Ouverture)}}{\text{ATR}_{1d} \text{ (Journalier)}}\\]
    *   Si \\(\text{ORR} > \text{Seuil}\\), l'intraday de début de séance offre une espérance de gain asymétrique supérieure au swing intertemporel.

### B. Matrice d'Orchestration Décisionnelle

| Métrique de Marché | H < 0.5 (Anti-persistant) | H > 0.5 (Persistant) |
| :--- | :--- | :--- |
| **ORR élevé (Volatilité matinale)** | **Session INTRADAY Active**<br>• Focus : ORB, scalping de niveau, arbitrage.<br>• Exécution : Limit orders, VWAP rapide.<br>• Positions : Fermeture forcée à 16h00 (Actions). | **Session HYBRIDE Active**<br>• Focus : Cassure d'ouverture suivie d'un swing de momentum.<br>• Exécution : Exécution de blocs rapides.<br>• Positions : Portées overnight avec stop ATR. |
| **ORR faible (Compression matinale)** | **Session RANGE / LATENTE**<br>• Focus : Trading de grille (Grid), arbitrage de financement.<br>• Exécution : Market Making passif, capture du spread.<br>• Positions : Portées neutre (Hedging). | **Session SWING Active**<br>• Focus : Swing Trend, rotation sectorielle, thématiques RWA/DePIN.<br>• Exécution : Slicing TWAP sur plusieurs jours.<br>• Positions : Portées plusieurs jours/semaines. |

---

## 4. Code de Production Python : Analyse du Profil de Volume et Détection d'Anomalie

Ce script calcule le profil de volume intra-journalier par tranches temporelles (Buckets) et génère des signaux d'alertes pour le Desk Manager en cas d'anomalies de distribution d'ouverture ou de pré-financement.

```python
import numpy as np
import pandas as pd
from datetime import datetime, time

def compute_intraday_volume_profile(df_ticks: pd.DataFrame, num_buckets: int = 24) -> pd.DataFrame:
    """
    Calcule le profil de volume moyen par bucket de temps sur un historique de ticks.
    Identifie la courbe en U pour les actions ou les pics de financement pour les cryptos.
    """
    # Extraction de l'heure et minute
    df_ticks['time_bucket'] = df_ticks['timestamp'].dt.time
    
    # Calcul du volume total par bucket
    profile = df_ticks.groupby('time_bucket')['volume'].agg(['mean', 'std']).reset_index()
    profile.rename(columns={'mean': 'avg_volume', 'std': 'volume_volatility'}, inplace=True)
    
    # Normalisation du volume pour tracer le profil (0 à 1)
    max_vol = profile['avg_volume'].max()
    min_vol = profile['avg_volume'].min()
    profile['normalized_profile'] = (profile['avg_volume'] - min_vol) / (max_vol - min_vol)
    
    return profile

def detect_temporal_anomaly(current_tick: dict, profile_df: pd.DataFrame, threshold_std: float = 2.5) -> bool:
    """
    Identifie si le volume actuel à une heure donnée dépasse de manière significative 
    la moyenne historique de cette tranche de temps (Indicateur d'anomalie de microstructure).
    """
    tick_time = current_tick['timestamp'].time()
    tick_volume = current_tick['volume']
    
    # Trouver le bucket de référence
    ref_row = profile_df[profile_df['time_bucket'] == tick_time]
    if ref_row.empty:
        return False
        
    avg_vol = ref_row['avg_volume'].values[0]
    std_vol = ref_row['volume_volatility'].values[0]
    
    # Calcul du z-score temporel
    z_score = (tick_volume - avg_vol) / (std_vol + 1e-9)
    
    return z_score > threshold_std

# Exemple de validation microstructurelle
if __name__ == "__main__":
    # Génération d'une série temporelle synthétique d'une journée boursière (NYSE)
    timestamps = pd.date_range("2026-09-04 09:30:00", "2026-09-04 16:00:00", freq="1Min")
    np.random.seed(42)
    
    # Simulation d'un profil en U de volume
    base_volumes = []
    for t in timestamps:
        current_time = t.time()
        # Profil en U mathématique : élevé à l'ouverture et à la clôture
        minutes_from_open = (t - datetime.combine(t.date(), time(9, 30))).seconds / 60
        minutes_to_close = (datetime.combine(t.date(), time(16, 0)) - t).seconds / 60
        
        u_factor = (1.0 / (minutes_from_open + 5)) + (1.0 / (minutes_to_close + 5))
        volume = int(np.random.exponential(scale=1000) * (1 + u_factor * 50))
        base_volumes.append(volume)
        
    df = pd.DataFrame({"timestamp": timestamps, "volume": base_volumes})
    
    profile = compute_intraday_volume_profile(df)
    print("Profil de volume intra-journalier (Extrait NYSE):")
    print(profile.head(10)) # Doit afficher des volumes élevés matinaux
    
    # Simulation d'un pic anormal (Block trade institutionnel à 12h00)
    anomaly_tick = {"timestamp": pd.Timestamp("2026-09-04 12:00:00"), "volume": 125000}
    is_anomaly = detect_temporal_anomaly(anomaly_tick, profile)
    print(f"\nDétection de block trade à 12h00 (anomalie temporelle): {is_anomaly}")
```
