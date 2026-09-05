# Intégration Programmatique avec Hyperliquid : SDK Python, WebSockets et Gestion Sécurisée des Clés Agents

Hyperliquid est une blockchain de couche 1 (L1) spécialisée et optimisée pour la finance décentralisée et les contrats perpétuels. Traitant jusqu'à 200 000 transactions par seconde (TPS) avec des temps de bloc d'environ 500 ms, Hyperliquid offre la rapidité d'un échange centralisé tout en conservant le caractère non-custodial de la DeFi. 

Pour connecter de manière robuste et sécurisée une équipe d'agents de trading à Hyperliquid, il est crucial d'implémenter son architecture de sécurité basée sur les **clés d'agents** et de maîtriser son double canal REST/WebSocket.

---

## 1. Modèle de Sécurité : Clés d'Agents (Agent Wallets)

Déployer un robot de trading en stockant la clé privée de votre portefeuille principal (Master Wallet) sur un serveur cloud est une faille de sécurité critique. Si le serveur est compromis, l'intégralité de vos fonds peut être drainée.

### Le mécanisme de l'Agent Wallet (EIP-712)
Hyperliquid résout ce problème en introduisant le concept de **portefeuille d'agent** (*Agent Wallet* ou *API Wallet*) :
1. Vous générez une clé privée secondaire (une simple paire de clés Ethereum générée localement par votre script).
2. Via l'interface web de Hyperliquid (`app.hyperliquid.xyz/API`) ou par programmation, vous signez une transaction EIP-712 à l'aide de votre **portefeuille principal** pour approuver cette clé secondaire en tant qu'**Agent** autorisé pour votre compte.
3. **Ségrégation stricte des droits** : La clé d'agent possède l'autorisation exclusive d'initier et d'annuler des ordres de trading (`place_order`, `cancel_order`, modifier le levier). Elle n'a **strictement aucune autorisation** pour retirer des fonds, les transférer vers d'autres sous-comptes, ou valider des actions de gouvernance.
4. En cas de compromission de votre serveur, vous révoquez instantanément l'agent depuis votre portefeuille principal (Metamask, Rabby ou hardware wallet OneKey).

---

## 2. Installation et Configuration du SDK Python

L'intégration de Hyperliquid sous Python s'appuie sur le SDK officiel `hyperliquid-python-sdk`.

```bash
pip install hyperliquid-python-sdk
```

### Le Gotcha Technique Majeur de l'API
*   **Signature** : Vous devez signer toutes les transactions d'écriture (Exchange API) avec la **clé privée de l'agent**.
*   **Requêtes Info (Lecture)** : Vous devez interroger l'Info API (positions ouvertes, historique des transactions, soldes) en utilisant **l'adresse publique du portefeuille principal** (*Master Account Address*), et non celle de l'agent. Si vous passez l'adresse de l'agent pour lire les positions d'un compte, l'API renverra un dictionnaire vide ou une structure par défaut sans lever d'erreur explicite.

---

## 3. Exemple de Code de Production : Initialisation, Lecture et Trading

Voici un script de niveau production montrant comment initialiser le client, récupérer des informations de marché, configurer l'effet de levier et soumettre un ordre limite de manière sécurisée.

```python
import os
from eth_account import Account
from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
from hyperliquid.utils import constants

# 1. Configuration des clés et adresses de manière sécurisée
# Remplacez par vos variables d'environnement
MASTER_PUBLIC_ADDRESS = "0xYourMasterWalletPublicAddressHere..."
AGENT_PRIVATE_KEY = os.getenv("HL_AGENT_PRIVATE_KEY")  # Clé privée de l'agent API uniquement

# Initialisation de l'objet Account d'Ethereum pour la clé de l'agent
agent_account = Account.from_key(AGENT_PRIVATE_KEY)

# 2. Initialisation des clients (Mode Testnet ou Mainnet)
# constants.TESTNET_API_URL ou constants.MAINNET_API_URL
base_url = constants.TESTNET_API_URL 

info = Info(base_url, skip_initial_requests=False)
exchange = Exchange(agent_account, base_url, account_address=MASTER_PUBLIC_ADDRESS)

def setup_trading_parameters(coin: str, leverage_x: int):
    """Configure l'effet de levier et le mode de marge (Cross/Isolated) pour l'actif ciblé."""
    print(f"[-] Configuration du levier à {leverage_x}x pour {coin}...")
    try:
        # Configuration en mode 'Cross' (le mode par défaut et le plus robuste)
        response = exchange.update_leverage(leverage_x, coin, is_cross=True)
        print(f"[+] Réponse Levier : {response}")
    except Exception as e:
        print(f"[!] Erreur de configuration du levier : {e}")

def get_market_data(coin: str):
    """Récupère l'état actuel des positions et les métriques du carnet d'ordres."""
    # Attention : on interroge l'Info API avec l'adresse du Master Wallet
    user_state = info.user_state(MASTER_PUBLIC_ADDRESS)
    
    # Extraction du solde disponible en USDC de marge globale
    margin_summary = user_state["marginSummary"]
    available_withdrawable_usdc = float(margin_summary["withdrawable"])
    print(f"[-] Capital disponible : {available_withdrawable_usdc:.2f} USDC")
    
    # Extraction des positions ouvertes pour cet actif
    positions = user_state["assetPositions"]
    for pos in positions:
        pos_info = pos["position"]
        if pos_info["coin"] == coin:
            print(f"[+] Position active détectée sur {coin} | Taille : {pos_info['sentrySize']} | PnL non-réalisé : {pos_info['unrealizedPnl']} USDC")
            return pos_info
            
    print(f"[-] Aucune position active sur {coin}.")
    return None

def execute_limit_order(coin: str, is_buy: bool, sz: float, px: float):
    """Soumet un ordre limite sécurisé via l'Agent Wallet."""
    # Structuration du dictionnaire d'ordre standardisé pour l'Exchange API
    order_spec = {
        "coin": coin,
        "is_buy": is_buy,
        "sz": sz,
        "px": px,
        "cloid": None,  # Optionnel : ID d'ordre personnalisé pour vos agents de suivi
        "order_type": {"limit": {"tif": "Gtc"}}  # Good 'Til Cancelled
    }
    
    print(f"[-] Envoi d'un ordre de {'BUY' if is_buy else 'SELL'} sur {coin} : {sz} unités à {px} USDC...")
    try:
        # L'Exchange API valide, signe la charge utile EIP-712 et l'envoie sur la L1 de Hyperliquid
        result = exchange.order(order_spec)
        if result["status"] == "ok":
            status_data = result["response"]["data"]["statuses"][0]
            if "resting" in status_data:
                print(f"[+] Ordre placé avec succès ! ID d'ordre sur le réseau : {status_data['resting']['oid']}")
            elif "filled" in status_data:
                print(f"[+] Ordre exécuté immédiatement au marché ! ID : {status_data['filled']['oid']}")
        else:
            print(f"[!] Erreur lors de l'exécution de l'ordre : {result}")
    except Exception as e:
        print(f"[!] Exception d'exécution rencontrée : {e}")

if __name__ == "__main__":
    # Test d'intégration rapide sur Solana
    coin_target = "SOL"
    setup_trading_parameters(coin_target, leverage_x=3)
    get_market_data(coin_target)
    # Exemple d'appel d'ordre limite à un prix très bas pour éviter une exécution non-désirée en test :
    # execute_limit_order(coin_target, is_buy=True, sz=0.1, px=10.0)
```

---

## 4. Streaming en Temps Réel avec les WebSockets

Pour alimenter instantanément l'agent de données de marché (*Market Data Agent*) et l'agent d'exécution (*Execution Agent*), l'utilisation des endpoints WebSockets (`wss://api.hyperliquid.xyz/ws`) est indispensable. Cela évite d'épuiser vos limites de taux REST (rate limits).

### Formats de souscription clés
Pour vous abonner au carnet d'ordres ou aux transactions de votre compte, vous envoyez une charge utile JSON structurée :

```json
// S'abonner aux transactions en temps réel d'un compte (remplissages d'ordres / fills)
{
  "method": "subscribe",
  "subscription": {
    "type": "userFills",
    "user": "0xYourMasterWalletPublicAddressHere..."
  }
}
```

### Reconnexion et robustesse réseau
Les serveurs de Hyperliquid peuvent déconnecter périodiquement les sockets en période de mise à jour ou de forte surcharge. Votre code de streaming doit implémenter :
1.  **Un Heartbeat de ping/pong** toutes les 30 secondes pour détecter les déconnexions silencieuses.
2.  **Une reconnexion automatique avec backoff exponentiel** (ex : attendre 1s, puis 2s, 4s, 8s jusqu'à un maximum de 60s) pour éviter d'inonder le serveur lors d'une panne réseau globale.
3.  **Un backfill de sécurité** : À chaque reconnexion WebSocket, l'agent d'exécution doit émettre une requête HTTP REST ponctuelle (`user_fills`) pour récupérer les transactions éventuellement exécutées pendant l'intervalle de déconnexion.
