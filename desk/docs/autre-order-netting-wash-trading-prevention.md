# Compensation Interne et Prévention du Wash Trading : Moteur de Netting pour Équipes Multi-Agents

Dans une architecture de trading systématique complexe, l'utilisation de plusieurs agents spécialisés (opérant sur différents horizons temporels comme l'**Intraday** et le **Swing**) génère inévitablement des conflits de signaux directionnels. Sans une couche de contrôle centrale, ces conflits provoquent une inefficacité financière critique et violent les règles de conformité réglementaire de marché. Ce document formalise l'intégration d'un **Moteur de Compensation Interne (Internal Order Netting Engine)** pour prémunir le Trading Desk contre ces risques.

---

## 1. Le Risque Juridique du Wash Trading Multi-Agents

Le **Wash Trading** consiste à exécuter simultanément des ordres d'achat et de vente sur le même actif sous-jacent, pour la même quantité (ou une quantité similaire), sans qu'il n'y ait de changement réel de propriété bénéficiaire (*Beneficial Ownership*).

### A. La position stricte des régulateurs (SEC, CFTC, MiCA, FIN-FSA)
*   **Manipulation de marché** : Même si le but sous-jacent n'est pas de manipuler les cours (mais résulte d'un conflit de logique entre vos agents IA), le fait de faire transiter des ordres opposés sur un échange externe crée du volume d'échange artificiel.
*   **Réglementation MAR (Market Abuse Regulation)** : En Europe et aux États-Unis, le wash trading est strictement qualifié d'abus de marché et de manipulation. Les courtiers et bourses utilisent des algorithmes de détection de transactions circulaires basés sur l'adresse IP, l'identifiant du compte ou les clés d'API liées.
*   **Le Piège Multi-Agents** : Si votre agent *Technical* (Intraday) décide de couper une position longue en vendant **100 AAPL** à 14h30, pendant que votre agent *Fundamental* (Swing) décide de renforcer son portefeuille en achetant **100 AAPL** à la même minute :
    *   Le compte externe exécute un achat et une vente simultanés de 100 actions.
    *   L'exposition globale du desk n'a pas bougé (changement nul).
    *   Le desk a payé **deux fois les frais de courtage**, a payé l'écart bid-ask (*spread*) à la contrepartie externe, et est désormais **signalé par l'algorithme de surveillance de l'échange** pour Wash Trading potentiel.

---

## 2. Le Moteur de Compensation Interne (Netting Engine)

Pour éliminer définitivement ce risque, le **Desk Manager** (l'agent superviseur orchestrant l'infrastructure) doit implémenter un **Moteur de Netting** faisant office de chambre de compensation interne avant l'envoi de tout ordre à l'agent d'exécution externe (le Nageur).

```
   Agents de Stratégie (Alpha)
     ┌──────────────────────┐      ┌──────────────────────┐
     │  Agent A (Intraday)  │      │   Agent B (Swing)    │
     │     Ordre : BUY      │      │     Ordre : SELL     │
     └──────────┬───────────┘      └──────────┬───────────┘
                │                             │
                │ (Ordres virtuels bruts)     │
                ▼                             ▼
   ┌────────────────────────────────────────────────────────┐
   │             DESK MANAGER : MOTEUR DE NETTING           │
   │                                                        │
   │  1. Calcul de l'exposition nette : Q_net = BUY - SELL  │
   │  2. Blocage des transactions circulaires (Wash-Trade)  │
   │  3. Tenue du Grand Livre Interne (Virtual Ledger)      │
   └────────────────────────────┬───────────────────────────┘
                                │
                                │ (Ordre Net Réel Unique)
                                ▼
                   ┌────────────────────────┐
                   │    Agent Exécution     │
                   │      (Le Nageur)       │
                   └────────────────────────┘
```

### A. Algorithme Algébrique de Netting
L'orchestrateur centralise toutes les intentions d'achat et de vente d'un même actif \\(i\\) émises dans une fenêtre de temps glissante de \\(\Delta t\\) (ex: 500 ms) :

\\[Q_{\text{net}, i} = \sum_{a=1}^{A} Q_{\text{buy}, a, i} - \sum_{s=1}^{S} Q_{\text{sell}, s, i}\\]

Où :
*   \\(Q_{\text{buy}, a, i}\\) est la quantité d'achat demandée par l'agent \\(a\\) pour l'actif \\(i\\).
*   \\(Q_{\text{sell}, s, i}\\) est la quantité de vente demandée par l'agent \\(s\\) pour l'actif \\(i\\).

### B. Règles de routage d'exécution externe
1.  **Si \\(Q_{\text{net}, i} > 0\\)** : Seul un ordre d'**achat net** de taille \\(Q_{\text{net}, i}\\) est envoyé à l'échange externe.
2.  **Si \\(Q_{\text{net}, i} < 0\\)** : Seul un ordre de **vente nette** de taille \\(|Q_{\text{net}, i}|\\) est envoyé à l'échange externe.
3.  **Si \\(Q_{\text{net}, i} = 0\\)** : **Aucun ordre n'est envoyé à l'extérieur**. L'opération est compensée à 100 % en interne.

### C. La tenue du Grand Livre Interne (Virtual Ledger)
Pour que les sous-agents d'IA conservent l'historique et la notation de leur performance propre de manière équitable :
*   Le Moteur de Netting tient un **Grand Livre Interne (Virtual Ledger)** dans Redis.
*   Si l'ordre externe net est exécuté au prix réel \\(P_{\text{real}}\\), le système crédite virtuellement l'agent acheteur et l'agent vendeur d'une exécution à ce prix \\(P_{\text{real}}\\).
*   Pour les ordres compensés en interne à 100% (sans transaction externe), le prix d'exécution virtuel de référence est fixé au prix moyen du carnet d'ordres (*Mid-Market Price*) au moment exact de l'arbitrage.

---

## 3. Code de Production Python : Moteur de Netting et Prévention du Wash Trading

Le script asynchrone ci-dessous simule la réception d'ordres directionnels conflictuels de la part de plusieurs sous-agents, exécute le netting algébrique, bloque les transactions suspectes et génère l'ordre d'exécution net final.

```python
import asyncio
import time
import uuid

class OrderNettingEngine:
    def __init__(self):
        self.pending_orders = []
        self.internal_ledger = []
        self.mid_price_feed = {"SOL": 145.50, "AAPL": 178.20} # Prix simulés en temps réel

    def submit_agent_order(self, agent_id: str, symbol: str, side: str, quantity: int) -> str:
        """
        Permet à un sous-agent d'IA de soumettre son ordre virtuel brut au moteur de compensation.
        """
        order_id = str(uuid.uuid4())
        order_payload = {
            "order_id": order_id,
            "agent_id": agent_id,
            "symbol": symbol,
            "side": side.upper(),       # "BUY" ou "SELL"
            "quantity": quantity,
            "timestamp": time.time()
        }
        self.pending_orders.append(order_payload)
        return order_id

    def process_and_net_orders(self, symbol: str) -> dict:
        """
        Exécute le netting algébrique sur tous les ordres en attente pour un actif donné.
        Bloque le wash trading externe et génère l'ordre d'exécution net.
        """
        orders_to_net = [o for o in self.pending_orders if o["symbol"] == symbol]
        if not orders_to_net:
            return {"symbol": symbol, "external_execution_required": False, "net_quantity": 0}

        total_buy_qty = sum(o["quantity"] for o in orders_to_net if o["side"] == "BUY")
        total_sell_qty = sum(o["quantity"] for o in orders_to_net if o["side"] == "SELL")
        
        # Calcul de la quantité nette
        net_quantity = total_buy_qty - total_sell_qty
        
        # Compensation interne
        total_volume_requested = total_buy_qty + total_sell_qty
        internal_netted_volume = total_volume_requested - abs(net_quantity)
        
        # Détermination de l'action externe
        if net_quantity > 0:
            external_side = "BUY"
            external_qty = net_quantity
        elif net_quantity < 0:
            external_side = "SELL"
            external_qty = abs(net_quantity)
        else:
            external_side = "NONE"
            external_qty = 0

        # Simulation d'exécution au prix Mid-Market si pas de trade externe, ou prix réel simulé
        execution_price = self.mid_price_feed[symbol]
        
        # Enregistrement dans le Grand Livre Interne pour chaque agent
        for order in orders_to_net:
            ledger_entry = {
                "order_id": order["order_id"],
                "agent_id": order["agent_id"],
                "symbol": symbol,
                "side": order["side"],
                "requested_quantity": order["quantity"],
                "virtual_execution_price": execution_price,
                "status": "COMPENSATED_INTERNAL" if external_qty == 0 or order["side"] != external_side else "EXECUTED_EXTERNAL"
            }
            self.internal_ledger.append(ledger_entry)

        # Nettoyage de la file des ordres en attente
        self.pending_orders = [o for o in self.pending_orders if o["symbol"] != symbol]

        return {
            "symbol": symbol,
            "total_requested_volume": total_volume_requested,
            "internally_compensated_volume": internal_netted_volume,
            "external_execution_required": external_qty > 0,
            "external_side": external_side,
            "external_quantity": external_qty,
            "virtual_execution_price": execution_price,
            "wash_trading_prevented": internal_netted_volume > 0
        }

# Simulation d'un conflit multi-agents (AAPL)
if __name__ == "__main__":
    engine = OrderNettingEngine()
    
    # L'Agent A (Intraday Scalper) veut vendre 150 AAPL car le RSI est suracheté
    engine.submit_agent_order(
        agent_id="Agent_A_Intraday",
        symbol="AAPL",
        side="SELL",
        quantity=150
    )
    
    # L'Agent B (Swing Fundamental) veut acheter 200 AAPL car l'évaluation financière est décotée
    engine.submit_agent_order(
        agent_id="Agent_B_Swing",
        symbol="AAPL",
        side="BUY",
        quantity=200
    )
    
    print("--- DEBUT DU TRAITEMENT DU MOTEUR DE NETTING ---")
    print(f"Nombre d'ordres virtuels en attente : {len(engine.pending_orders)}")
    
    # Lancement du netting
    result = engine.process_and_net_orders("AAPL")
    
    print("\n--- RESULTAT DE LA COMPENSATION ---")
    print(f"Volume brut total demandé : {result['total_requested_volume']} actions")
    print(f"Volume compensé en interne (zéro frais externe) : {result['internally_compensated_volume']} actions")
    print(f"Vente à découvert / Wash trading évités en externe : {result['wash_trading_prevented']}")
    print(f"Ordre net réel à envoyer à l'échange : {result['external_side']} {result['external_quantity']} AAPL")
    print(f"Prix d'exécution virtuel de référence : ${result['virtual_execution_price']}")
    
    print("\n--- GRAND LIVRE INTERNE (VIRTUAL LEDGER) ---")
    for entry in engine.internal_ledger:
        print(f"Agent: {entry['agent_id']} | Type: {entry['side']} | Qté: {entry['requested_quantity']} | Prix Virtuel: ${entry['virtual_execution_price']} | Statut: {entry['status']}")
```
