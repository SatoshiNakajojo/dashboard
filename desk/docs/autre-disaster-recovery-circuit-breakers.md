# Tolérance aux Pannes, Circuit Breakers et Reprise d'Activité (Disaster Recovery)

Un trading desk algorithmique à haute fréquence doit être conçu selon des principes de résilience aéronautique. Ce document formalise le plan de continuité d'activité (PCA), les règles de coupure d'urgence (*Circuit Breakers*) et la politique de sauvegarde des données pour garantir une disponibilité continue et une sécurité absolue des fonds.

---

## 1. Topologie de Haute Disponibilité (HA)

L'architecture technique est configurée en mode redondant sans point de défaillance unique (No Single Point of Failure) :

```
             ┌─────────────────────────┐
             │    Échange (API L1)     │
             └──────▲───────────▲──────┘
                    │           │ (Double Connexion)
             ┌──────▼───────────▼──────┐
             │  LOAD BALANCER RESEAU   │
             └──────┬───────────┬──────┘
                    │           │
         ┌──────────▼───┐   ┌───▼──────────┐
         │ AGENT MASTER │   │ AGENT SLAVE  │  <-- Standby Chaud
         └──────────┬───┘   └───┬──────────┘
                    │           │
     ┌──────────────▼───────────▼──────────────┐
     │        REDIS MEMORY REPLICATION         │
     │  ┌──────────────────┐  ┌─────────────┐  │
     │  │ Redis Master(HA) ├─►│ Redis Slave │  │  <-- Réplication synchrone
     │  └──────────────────┘  └─────────────┘  │
     └──────────────────────┬──────────────────┘
                            │ (Synchro)
                            ▼
     ┌─────────────────────────────────────────┐
     │          BASE DE DONNÉES DISQUE         │
     │  ┌──────────────────┐  ┌─────────────┐  │
     │  │   QuestDB Primary├─►│QuestDB Stand│  │  <-- Mirroring de disque (ZFS)
     │  └──────────────────┘  └─────────────┘  │
     └─────────────────────────────────────────┘
```

*   **Redis Sentinel / Replication** : Redis est configuré avec un nœud Master actif et un nœud Slave passif. La réplication synchrone garantit qu'en cas de défaillance du Master, Sentinel effectue un basculement (*failover*) automatique de l'IP virtuelle en moins de 2 secondes.
*   **QuestDB Partitioning & Backup** : Pour éviter toute corruption des séries temporelles (Ticks/Order Books), QuestDB stocke ses partitions de données quotidiennes sur un volume de stockage persistant répliqué (de type ZFS ou AWS EBS multi-AZ). Un instantané (*snapshot*) à chaud est généré toutes les 24 heures et exporté vers un espace de stockage décentralisé ou froid.

---

## 2. Coupe-Circuits Algorithmiques (Circuit Breakers)

Les agents d'exécution (*Execution Agents*) intègrent des coupe-circuits automatiques pour interdire les opérations anormales ou couper les serveurs en cas d'anomalie d'infrastructure :

| Scénario d'Anomalie | Condition Déclenchante | Action Immédiate du Coupe-Circuit |
| :--- | :--- | :--- |
| **Perte de flux (Websocket Drop)** | Pas de message de prix reçu depuis plus de 3 000 ms. | Annulation instantanée de tous les ordres limites en attente (*Cancel-All*) via API REST de secours. Blocage des entrées. |
| **Pic de Latence Réseau (Ping)** | Latence aller-retour vers l'API de l'échange > 150 ms (mesurée toutes les 10 secondes). | Passage de l'agent en mode *Read-Only* (Pas de nouvelles exécutions autorisées). |
| **Écart de Prix (Price Drift)** | Écart entre le prix interne du carnet d'ordres local et le prix d'indice de l'échange > 2%. | Blocage des exécutions. Soupçon de désynchronisation de l'état local ou de carnet d'ordres factice. |
| **Drawdown Journalier Équipe** | Perte nette du portefeuille sur les dernières 24 heures > 5% du capital global. | Clôture immédiate de toutes les positions ouvertes, désactivation globale de la logique d'entrée et mise en sommeil des agents. |

---

## 3. Implémentation Logicielle d'un Circuit Breaker en Python

Voici le module de surveillance qui s'exécute au cœur du moteur de trading pour désactiver l'exécution en cas de anomalie :

```python
import time
import logging

class SystemCircuitBreaker:
    def __init__(self, ping_limit_ms=150.0, silence_timeout_sec=3.0, daily_loss_limit_usd=10000.0):
        self.ping_limit = ping_limit_ms
        self.silence_timeout = silence_timeout_sec
        self.daily_loss_limit = daily_loss_limit_usd
        
        self.is_tripped = False
        self.last_heartbeat = time.time()
        self.last_ping_ms = 0.0
        
    def check_infrastructure_health(self, current_ping: float, daily_pnl: float) -> bool:
        """
        Exécute la vérification d'état globale et déclenche le disjoncteur en cas de dépassement de limites.
        """
        now = time.time()
        
        # 1. Vérification du silence radio (Websocket déconnecté)
        if (now - self.last_heartbeat) > self.silence_timeout:
            self._trip_circuit("Websocket Heartbeat Timeout - Pas de données de prix.")
            return False
            
        # 2. Vérification de la latence réseau (Ping de l'échange)
        if current_ping > self.ping_limit:
            self._trip_circuit(f"Latence Réseau excessive : {current_ping}ms (seuil : {self.ping_limit}ms)")
            return False
            
        # 3. Vérification du Drawdown Journalier
        if daily_pnl < -self.daily_loss_limit:
            self._trip_circuit(f"Limite de perte journalière atteinte : {daily_pnl} USD (limite : -{self.daily_loss_limit} USD)")
            return False
            
        return True

    def update_heartbeat(self):
        """Appelé à chaque réception de tick de marché."""
        self.last_heartbeat = time.time()

    def _trip_circuit(self, reason: str):
        """Action d'urgence : déclenchement du disjoncteur."""
        if not self.is_tripped:
            self.is_tripped = True
            logging.critical(f"⚠️ CIRCUIT BREAKER DÉCLENCHÉ : {reason}")
            self.execute_emergency_shutdown()

    def execute_emergency_shutdown(self):
        """
        Protocole de coupure d'urgence :
        1. Annuler tous les ordres ouverts sur l'échange.
        2. Clôturer les positions à risque au prix du marché (si configuré).
        3. Enregistrer l'état du système pour analyse ultérieure.
        """
        # Pseudo-code d'appel API d'urgence
        # exchange.cancel_all_orders()
        # send_alert_to_slack_and_telegram()
        logging.info("Arrêt d'urgence exécuté avec succès. Les positions sont sécurisées.")
```

---

## 4. Protocole de Reprise d'Activité après un Crash (Disaster Recovery Step-by-Step)

En cas de défaillance majeure d'un serveur ou du centre de données, l'ingénieur système ou le script d'automatisation doit suivre cette procédure de redémarrage sécurisée :

1.  **Phase d'Isolation** : Couper la connexion des agents d'exécution pour s'assurer qu'aucun ordre parasite n'est envoyé lors de l'initialisation.
2.  **Restauration des États de Marge** : Interroger directement l'API REST de l'échange (ex: Hyperliquid) pour récupérer l'inventaire réel des positions et les soldes de marge disponibles (la vérité de l'échange prévaut toujours sur la base de données locale).
3.  **Vérification de la Parité de Base de Données** : Recaler l'état de Redis en injectant les positions de l'échange, puis lancer une requête SQL d'alignement sur QuestDB pour marquer l'horodatage précis de l'interruption.
4.  **Lancement en Mode Observation (Shadow Mode)** : Relancer les agents de stratégie en mode sans exécution réelle (*Dry Run*) pendant au moins 10 minutes pour s'assurer que les flux de données (WebSockets, indicateurs récursifs de type EMA/RSI) se réalignent parfaitement sans déphasage.
5.  **Réactivation Formelle** : Autoriser à nouveau l'envoi d'ordres de trading après validation explicite par l'ingénieur système ou par le *Desk Manager*.
