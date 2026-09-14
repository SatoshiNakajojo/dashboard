# Cadre Réglementaire, AML/CFT et Sécurité Critique du Capital (Compliance & Security)

La viabilité à long terme d'un trading desk de niveau institutionnel dépend de la robustesse de ses protocoles de sécurité informatique et de son alignement avec les cadres réglementaires internationaux. Ce document formalise la politique de gestion des clés privées, la surveillance de la conformité anti-blanchiment (AML/CFT) et les règles réglementaires applicables aux marchés d'actions et de crypto-actifs.

---

## 1. Sécurité du Capital & Gestion des Clés de Production

Pour éliminer les risques de piratage, de fraude interne ou de perte opérationnelle, le desk applique une politique stricte de séparation des privilèges de signature :

### A. La Ségrégation Portefeuille Master / Agent Wallet
*   **Master Vault (Cold/Warm Custody)** : Le capital du desk (USDC, BTC, Actions) est sécurisé au sein d'une infrastructure multi-signature institutionnelle (ex: Fireblocks, Gnosis Safe ou OneKey Hardware Wallet). Ce coffre-fort nécessite la validation physique de plusieurs membres de l'équipe (par exemple, 3 validations sur 5 signataires) pour toute transaction de retrait ou de transfert.
*   **Agent Wallet (Programmatic Trading)** : Les robots de trading s'exécutent avec des clés privées associées à un portefeuille d'agent éphémère (*Agent Wallet* ou clé déléguée EIP-712).
    *   **Droits Restreints** : Ce portefeuille d'agent est explicitement autorisé sur l'échange (via la fonction `authorize_agent` sur Hyperliquid) à **passer et annuler des ordres de trading uniquement**.
    *   **Sécurité absolue** : L'agent wallet ne possède **aucun droit de retrait, de transfert ou de modification des adresses de destination**. En cas de compromission totale de la clé privée de l'agent, le pirate ne peut cloner ou siphonner le capital, préservant ainsi l'intégrité financière du desk.

### B. Whitelisting d'IP & Modules HSM
*   **Whitelisting strict** : Les clés d'API et clés d'agents d'exécution sont limitées au niveau réseau de l'échange. Seules les requêtes provenant des adresses IP fixes et chiffrées de nos conteneurs de production sont acceptées.
*   **Hardware Security Module (HSM)** : Pour les volumes de trading importants, les clés d'agents d'exécution sont stockées au sein de modules de sécurité matériels (Cloud HSM) afin de s'assurer que les clés de signature ne circulent jamais en clair dans la mémoire RAM des serveurs d'application.

---

## 2. Intégration de la Conformité Anti-Blanchiment (AML/CFT)

Opérer sur les marchés de crypto-actifs exige de se prémunir contre les risques d'interaction avec des adresses sanctionnées, frauduleuses ou associées à des piratages.

### L'API de Filtrage Transactionnel (On-Chain Transaction Monitoring)
L'agent d'exécution interroge systématiquement des services d'analyse on-chain (ex: APIs de Chainalysis, Elliptic ou TRM Labs) avant de s'engager avec de nouvelles adresses de contrepartie (notamment dans les transactions de gré à gré OTC ou le liquidity provisioning sur DEX) :

```python
import requests
import logging

class ComplianceMonitor:
    def __init__(self, api_key: str, provider_url: str):
        self.api_key = api_key
        self.provider_url = provider_url  # ex: Chainalysis or Elliptic Endpoint
        
    def check_address_risk(self, wallet_address: str) -> bool:
        """
        Interroge l'API de conformité pour évaluer l'exposition au risque d'une adresse.
        Retourne True si l'adresse est conforme (Safe), False s'il y a un risque élevé (Blocked).
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {"address": wallet_address}
        
        try:
            response = requests.post(f"{self.provider_url}/v1/address/screen", json=payload, headers=headers, timeout=5)
            if response.status_code == 200:
                data = response.json()
                risk_score = data.get("risk_score", 100)  # Score de 0 (sûr) à 100 (risque critique)
                risk_category = data.get("category", "Unknown")
                
                if risk_score > 50 or risk_category in ["Sanctions", "Darknet Market", "Stolen Funds", "Terrorism Financing"]:
                    logging.warning(f"🚨 ADRESSE TOXIQUE DÉTECTÉE : {wallet_address} | Score : {risk_score} | Catégorie : {risk_category}")
                    return False  # Bloquer l'interaction
                    
                return True  # Adresse conforme
            else:
                logging.error(f"Erreur d'interrogation de l'API AML : {response.status_code}")
                return False  # En cas de doute, la politique est fermée : on bloque
        except Exception as e:
            logging.critical(f"Défaillance critique du système AML : {str(e)}")
            return False  # Fail-Closed policy
```

---

## 3. Conformité Réglementaire Internationale

Un trading desk professionnel doit respecter les cadres juridiques en vigueur selon sa juridiction géographique d'opération et les classes d'actifs négociées :

### A. Réglementation Crypto-Actifs : MiCA (Europe) & CFTC/SEC (US)
*   **Réglementation MiCA (Markets in Crypto-Assets - Union Européenne)** :
    *   Les activités de tenue de marché (*Market Making*) et d'arbitrage algorithmique systématique nécessitent l'obtention d'un agrément de Prestataire de Services sur Actifs Numériques (PSAN / CASP).
    *   Le desk doit documenter formellement ses algorithmes de trading, prouver qu'ils ne génèrent pas de manipulation de marché (ex: Wash Trading, Spoffing) et enregistrer tous les journaux de transactions historiques pendant au moins 5 ans.
*   **Cadre Réglementaire des États-Unis (SEC & CFTC)** :
    *   L'utilisation de stablecoins ou d'actifs assimilés à des contrats d'investissement (*Securities*) impose de négocier exclusivement sur des plateformes enregistrées comme Alternative Trading Systems (ATS) ou d'opérer sous des statuts juridiques spécifiques exemptant l'activité.

### B. Réglementation Actions : Règle d'Accès au Marché (SEC Rule 15c3-5) & Reg NMS
*   **SEC Rule 15c3-5 (Market Access Rule)** :
    *   Interdit l'accès direct non filtré au carnet d'ordres d'une bourse d'actions par un tiers sans contrôles de risques automatisés et préalables.
    *   Notre infrastructure d'exécution intègre des limites de taille maximale d'ordre (*Max Order Size*), des contrôles de crédit et des blocages de prix aberrants pour se conformer de manière native à cette règle avant la transmission à notre courtier (*Broker-Dealer*).
*   **Régulation NMS (National Market System)** :
    *   Garantit que les ordres d'achat ou de vente s'exécutent au meilleur prix disponible sur l'ensemble des places de marché nationales (Best Execution / NBBO - National Best Bid and Offer). Les routeurs intelligents de notre courtier intègrent ces règles de routage dynamique.
