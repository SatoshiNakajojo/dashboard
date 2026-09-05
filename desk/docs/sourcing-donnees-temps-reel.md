# Sourcing de Données Temps Réel et Analyse Macro-économique Quantitative

Pour alimenter les agents de trading de manière réactive, la mise en place d'un pipeline de données temps réel et à haute fréquence est indispensable. Ce document décrit l'architecture de sourcing des données de microstructure (cryptomonnaies) et macro-économiques (actions/macro globale) ainsi que les spécifications de leurs API respectives.

---

## 1. Données Microstructurelles Crypto : Dérivés et On-Chain

En cryptomonnaie, le marché Spot est souvent guidé par les marchés Dérivés (Contrats Perpetuels) et les flux On-chain (mouvements de baleines, flux d'exchanges). Les agents IA doivent surveiller trois types d'indicateurs temps réel :

### A. Le Taux de Financement (Funding Rate) & L'Intérêt Ouvert (Open Interest)
Le *Funding Rate* est le mécanisme de paiement périodique entre les positions Long et Short permettant d'ancrer le prix du contrat perpétuel au prix Spot de l'indice sous-jacent.
*   **Funding Rate fortement positif ($> 0.05\%$ par 8 heures)** : Signale un excès d'effet de levier sur les Longs. Risque élevé de *Long Squeeze* (cascade de liquidations à la baisse).
*   **Funding Rate négatif ($< -0.05\%$)** : Excès d'effet de levier Short. Risque de *Short Squeeze* (hausse violente par rachat forcé des Shorts).
*   **Open Interest (OI)** : Valeur totale de tous les contrats dérivés ouverts sur un actif. Une hausse simultanée de l'OI et du prix confirme un flux d'acheteurs agressifs (momentum sain). Une hausse de l'OI avec un prix stagnant indique une accumulation de positions prêtes à exploser de manière bidirectionnelle.

### B. Intégration de l'API CoinGlass V4 (Production-Grade)
Pour récupérer ces données dérivés en temps réel, le trading desk s'appuie sur l'API CoinGlass V4 (mise à jour 2026).

*   **URL de base** : `https://open-api-v4.coinglass.com`
*   **En-tête d'authentification** : `CG-API-KEY` (remplace l'ancien `coinglassSecret`)

```python
import requests
import json

def get_coinglass_funding_rate(symbol="BTC", api_key="VOTRE_CG_API_KEY"):
    """
    Récupère le taux de financement moyen en temps réel pour un symbole donné
    via l'API v4 de CoinGlass.
    """
    url = f"https://open-api-v4.coinglass.com/public/v2/funding/average?symbol={symbol}"
    headers = {
        "accept": "application/json",
        "CG-API-KEY": api_key
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                return data.get("data") # Retourne le dictionnaire de données filtrées
            else:
                print(f"Erreur CoinGlass : {data.get('msg')}")
        else:
            print(f"Erreur HTTP {response.status_code} sur {url}")
    except Exception as e:
        print(f"Échec de la connexion à l'API CoinGlass: {e}")
    return None
```

### C. On-Chain Metrics (CryptoQuant & Glassnode)
Les métriques On-chain permettent de mesurer la "température" fondamentale du réseau de manière programmatique.

| Métrique | API d'extraction | Signal Algorithmique |
| :--- | :--- | :--- |
| **Exchange Inflow/Outflow** | CryptoQuant API / Glassnode API | Une hausse massive de stablecoins vers les exchanges (*Inflow*) indique un pouvoir d'achat prêt à se déployer. Une hausse de BTC/ETH vers les exchanges indique une pression vendeuse potentielle. |
| **MVRV Z-Score** | Glassnode / CryptoQuant | Évalue la valeur de marché d'un actif par rapport à sa valeur réalisée. Un score $> 7$ indique une surévaluation macro (sommet de cycle), un score $< 0.1$ indique une sous-évaluation sévère (point bas). |
| **Miner Outflow** | CryptoQuant API | Indique si les mineurs capitulent ou vendent leurs réserves accumulées pour couvrir leurs coûts de production. |

---

## 2. Données Macro-économiques et Actions : Les Sourcing de Référence

Pour le trading d'actions et la macro-économie globale, la réactivité aux annonces macro-économiques majeures évite d'exposer l'inventaire à une volatilité extrême non maîtrisée.

### A. Flux Macro Globale (FRED de Saint-Louis & Nasdaq Data Link)
L'API FRED (Federal Reserve Economic Data) permet aux agents d'extraire gratuitement les données macro-économiques américaines et mondiales les plus fiables.

```python
# Exemple de script pour extraire la courbe des taux 10Y-2Y depuis l'API FRED
def get_yield_curve_spread(api_key="VOTRE_FRED_API_KEY"):
    """
    Récupère le spread de la courbe des taux (10-Year Treasury Constant Maturity
    Minus 2-Year Treasury Constant Maturity) qui est un indicateur de récession.
    """
    series_id = "T10Y2Y"
    url = f"https://api.stlouisfed.org/fred/series/observations?series_id={series_id}&api_key={api_key}&file_type=json"
    
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            observations = response.json().get("observations", [])
            if observations:
                latest = observations[-1]
                return {
                    "date": latest["date"],
                    "spread_10y2y": float(latest["value"])
                }
    except Exception as e:
        print(f"Erreur d'extraction FRED: {e}")
    return None
```

### B. Variables de Contrôle Macro-économique à Surveiller par les Agents

1.  **Taux Directeurs (Fed Funds Rate)** : Détermine le coût de l'argent et la liquidité globale des marchés financiers. Une hausse des taux comprime les multiples de valorisation des actions de croissance (tech) et du secteur crypto.
2.  **Inversion de la Courbe des Taux (10Y-2Y Spread)** : Un spread négatif (courbe inversée) signale une récession économique imminente à un horizon de 12 à 18 mois dans $90\%$ des cas historiques.
3.  **Inflation (CPI & PCE)** : Si le CPI (Consumer Price Index) dépasse les attentes consensuelles, le marché anticipe un resserrement monétaire hawkish de la Fed, ce qui provoque une baisse instantanée des actifs à risque.
4.  **Emploi Américain (NFP - Non-Farm Payrolls & Chômage)** : Un marché de l'emploi anormalement fort donne de la marge à la banque centrale pour maintenir des taux élevés (bearish pour les cryptos). Une dégradation rapide de l'emploi peut forcer un pivot monétaire rapide (bullish à terme).

---

## 3. Architecture d'Alimentation du Trading Desk

Pour garantir un flux de données fluide et à faible latence, les agents IA de la salle de marché ne doivent pas exécuter de requêtes REST HTTP répétitives, ce qui provoquerait des blocages d'adresses IP (*rate limiting*). L'architecture idéale repose sur :

```
                        [ FLUX WEBSOCKET Temps Réel ]
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
[ Binance / OKX WebSockets ]                            [ CoinGlass API WS ]
   (Ticker, Order Book,                                  (Liquidations, OI,
    Liquidations en Direct)                               Taux de Financement)
         │                                                       │
         └───────────────────────────┬───────────────────────────┘
                                     ▼
                      [ Cache Interne : REDIS / InfluxDB ]
                        (Agrégation des Bougies OHLCV)
                                     │
                                     ▼
                        [ AGENTS IA DU TRADING DESK ]
                 - Agent Exécution ("Le Nageur") : WS Tick par Tick
                 - Agent Risque : Rafraîchissement 1 seconde
                 - Agent Macro & Narratifs : Interrogation horaire / journalière
```

*   **Redis** : Utilisé comme cache en mémoire à très faible latence pour stocker les derniers prix, les taux de financement en temps réel, et l'état actuel de l'intérêt ouvert.
*   **InfluxDB / TimescaleDB** : Base de données de séries temporelles pour archiver les données historiques à la milliseconde afin de permettre le backtesting continu des modèles d'agents par les quants.
