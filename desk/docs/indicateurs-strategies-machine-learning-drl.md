# Intelligence Artificielle Avancée : Deep Learning Temporel et Deep Reinforcement Learning (DRL) en Trading

L'intégration d'agents d'intelligence artificielle autonomes au sein d'un trading desk de production nécessite de dépasser les modèles statistiques linéaires. Ce document décrit l'implémentation de deux technologies de pointe : les **Transformers Temporels** pour la prévision de prix, et le **Deep Reinforcement Learning (DRL)** pour l'allocation dynamique de portefeuille.

---

## 1. Modélisation Prédictive : Transformers & Attention Mécanisme

Pour capturer les dépendances temporelles à long terme et les relations non linéaires complexes sans subir les limites de mémoire des LSTM/GRU, les architectures basées sur l'**Attention** (Self-Attention) et plus spécifiquement les **Temporal Fusion Transformers (TFT)** sont privilégiées.

### A. Le Mécanisme de Self-Attention Multi-Tête (Multi-Head Attention)
Dans un contexte de trading, l'attention permet au modèle de peser dynamiquement l'importance des événements passés (ex: un pic de volume survenu il y a 4 heures ou une annonce macroéconomique majeure) par rapport à la structure actuelle du marché.

Soit une matrice d'entrée $X \in \mathbb{R}^{T \times d}$ représentant une série temporelle de prix et de volumes de longueur $T$. On projette $X$ dans trois espaces vectoriels distincts : les requêtes (**Query** $Q$), les clés (**Key** $K$) et les valeurs (**Value** $V$) via les matrices de poids d'apprentissage $W_Q, W_K, W_V \in \mathbb{R}^{d \times d_k}$ :

$$Q = XW_Q, \quad K = XW_K, \quad V = XW_V$$

La matrice d'attention pondérée par similarité de produit scalaire est définie par :

$$\text{Attention}(Q, K, V) = \text{softmax}\left( \frac{QK^T}{\sqrt{d_k}} \right)V$$

Où $\sqrt{d_k}$ est un facteur d'échelle stabilisant les gradients lors de l'entraînement. 

Pour capturer des motifs de marché s'exécutant sur différentes échelles temporelles (ex : micro-tendances intra-journalières et tendances macro), on utilise le mécanisme **Multi-Head Attention** :

$$\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, \dots, \text{head}_h)W^O$$

$$\text{où} \quad \text{head}_i = \text{Attention}(QW_Q^i, KW_K^i, VW_V^i)$$

---

## 2. Allocation de Portefeuille par Deep Reinforcement Learning (DRL)

L'allocation d'actifs dynamique est modélisée comme un **Processus de Décision Markovien (MDP)** à espace d'états et d'actions continus. L'agent DRL n'apprend pas à prédire le prix futur directement, mais apprend une politique $\pi$ maximisant le rendement ajusté au risque à long terme sous contrainte de coûts de transaction.

### A. Formalisation du MDP
1.  **Espace d'États ($S_t$)** :
    Le tenseur d'état $s_t \in \mathcal{S}$ à l'instant $t$ synthétise l'historique récent des actifs :
    *   **Features de Marché** : Rendements logarithmiques passés, volatilité ATR, VPIN, OFI, et scores de sentiment FinBERT.
    *   **État du Portefeuille** : Le vecteur d'allocation de capital précédent $\mathbf{w}_{t-1} \in \mathbb{R}^M$ (où $M$ est le nombre d'actifs) et le solde de marge disponible.
2.  **Espace d'Actions ($A_t$)** :
    L'action $\mathbf{a}_t \in \mathcal{A}$ est le nouveau vecteur de poids cible du portefeuille $\mathbf{w}_t \in \mathbb{R}^M$ tel que :
    
    $$\sum_{i=1}^{M} |w_{t,i}| \le \text{Levier Maximal} \quad \text{et} \quad w_{t,i} \in [-1, 1]$$
    
    *   $w_{t,i} > 0$ : Position Longue.
    *   $w_{t,i} < 0$ : Position Courte (Short).
    *   $w_{t,i} = 0$ : Sortie de position (Cash).
3.  **Fonction de Récompense ($R_t$)** :
    La récompense doit intégrer le rendement du portefeuille, les pénalités de risque et les frictions transactionnelles (frais d'échange $\gamma$ et slippage).
    
    Soit $\mathbf{r}_t \in \mathbb{R}^M$ le vecteur des rendements des actifs à l'instant $t$. Le rendement brut du portefeuille est $p_t = \mathbf{w}_t^T \mathbf{r}_t$. 
    Les coûts de transaction induits par le rééquilibrage de $\mathbf{w}_{t-1}$ à $\mathbf{w}_t$ sont modélisés par :
    
    $$C_t = \gamma \sum_{i=1}^{M} |w_{t,i} - w'_{t-1,i}|$$
    
    Où $w'_{t-1,i}$ est le poids de l'actif $i$ juste avant le rééquilibrage en raison de la variation organique des cours. Le rendement net est $p_{t,\text{net}} = p_t - C_t$.
    
    Pour maximiser le ratio de Sharpe glissant tout en pénalisant les drawdowns extrêmes (Maximum Drawdown - MDD), la fonction de récompense s'écrit :
    
    $$R_t = p_{t,\text{net}} - \lambda_1 \cdot \text{Variance}(p_{t,\text{net}}) - \lambda_2 \cdot \max(0, \text{MDD}_t)$$

---

## 3. Algorithme de Production : DDPG (Deep Deterministic Policy Gradient)

Pour opérer sur des espaces d'actions continus (poids précis de réallocation des fonds), on déploie une architecture Actor-Critic basée sur le gradient de politique déterministe (**DDPG**).

```
 ┌────────────────────────────────────────────────────────┐
 │                      ENVIRONMENT                       │
 │                    (Market & Order Book)               │
 └──────┬──────────────────────────────────▲──────────────┘
        │ State (s_t)                      │ Action (a_t)
        ▼                                  │
 ┌─────────────────────────────────────────┴──────────────┐
 │                      ACTOR NETWORK                     │
 │              Policy: \pi(s_t | \theta^\mu)             │
 └──────┬─────────────────────────────────────────────────┘
        │ Action Cible
        ▼
 ┌────────────────────────────────────────────────────────┐
 │                     CRITIC NETWORK                     │
 │          Value Q(s_t, a_t | \theta^Q)                  │
 └─────────────────────────┬──────────────────────────────┘
                           │ Calcule la perte de gradient
                           ▼
                 Maximise la récompense R_t
```

*   **Le Réseau Acteur ($\mu(s | \theta^\mu)$)** : Propose une action déterministe (le vecteur de poids $\mathbf{w}_t$) en maximisant l'évaluation du Critic.
*   **Le Réseau Critique ($Q(s, a | \theta^Q)$)** : Évalue la valeur de l'action choisie (l'espérance de la récompense future cumulée et actualisée par l'équation de Bellman).

### A. Implémentation Python (Squelette Actor-Critic pour le Sizing)
Voici une modélisation PyTorch simplifiée d'un agent d'allocation dynamique :

```python
import torch
import torch.nn as nn
import torch.optim as optim

class ActorNetwork(nn.Module):
    """
    Réseau Acteur : prend l'état du marché et du portefeuille,
    et sort le vecteur de poids cibles d'allocation d'actifs.
    """
    def __init__(self, state_dim, num_assets):
        super(ActorNetwork, self).__init__()
        self.network = nn.Sequential(
            nn.Linear(state_dim, 256),
            nn.LayerNorm(256),
            nn.ReLU(),
            nn.Linear(256, 128),
            nn.LayerNorm(128),
            nn.ReLU(),
            nn.Linear(128, num_assets),
            nn.Tanh() # Sortie continue entre -1 (Short) et 1 (Long)
        )
        
    def forward(self, state):
        return self.network(state)

class CriticNetwork(nn.Module):
    """
    Réseau Critique : estime la valeur Q(s, a) de l'action choisie.
    """
    def __init__(self, state_dim, num_assets):
        super(CriticNetwork, self).__init__()
        # Entrées combinées (état + action)
        self.fc_state = nn.Linear(state_dim, 128)
        self.fc_action = nn.Linear(num_assets, 128)
        
        self.q_value = nn.Sequential(
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Linear(128, 1)
        )
        
    def forward(self, state, action):
        s_out = torch.relu(self.fc_state(state))
        a_out = torch.relu(self.fc_action(action))
        combined = torch.cat([s_out, a_out], dim=-1)
        return self.q_value(combined)
```

---

## 4. Intégration Opérationnelle dans la Topologie du Desk

Cet agent DRL s'intègre au coeur de l'architecture multi-agents :

1.  **L'Agent Strategy (The Alpha Generator)** :
    *   Exécute le modèle de prédiction basé sur les Transformers pour anticiper les prix relatifs et génère l'état $s_t$.
    *   Transmet le tenseur d'état $s_t$ au broker de messages Redis.
2.  **L'Agent Desk Manager (The RL Agent)** :
    *   Héberge le réseau Acteur pré-entraîné du DRL.
    *   À chaque intervalle de décision (ex : toutes les 15 minutes), il souscrit à l'état $s_t$, calcule l'action optimale $\mathbf{a}_t$ (les poids d'allocation d'actifs).
    *   Vérifie que les poids calculés ne violent pas les règles de drawdown de l'agent Risk Manager.
    *   Envoie la commande d'exécution à l'agent d'exécution.
3.  **L'Agent Cold Analyst (Offline Training)** :
    *   Récupère les historiques de récompenses réelles récoltés dans QuestDB.
    *   Ré-entraîne périodiquement les réseaux de neurones (Actor-Critic) sur des GPU isolés en exploitant les nouvelles données d'apprentissage récoltées en production pour adapter continuellement les poids face à la dérive des modèles (*concept drift*).
