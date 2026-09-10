# Microstructure des Marchés, Algorithmes d'Exécution et MEV

En trading quantitatif de haute performance, la qualité d'exécution d'un ordre détermine si une stratégie préserve son alpha ou s'effondre sous le poids des coûts transactionnels cachés. Ce document détaille les concepts de la microstructure de marché (actions et cryptos), la formulation mathématique des algorithmes d'exécution, le fonctionnement du MEV (Maximal Extractable Value) et les techniques d'optimisation de routage.

---

## 1. Microstructure du Carnet d'Ordres (Limit Order Book)

Les marchés financiers électroniques modernes s'organisent principalement autour du **Limit Order Book (LOB)**, où s'affrontent les fournisseurs de liquidité (ordres cours limité) et les preneurs de liquidité (ordres au marché).

### A. Anatomie Mathématique du LOB
Le carnet est une structure ordonnée composée de deux sous-ensembles à un instant $t$ :
*   **Les Demandes (Asks)** : $\mathcal{A}_t = \{(p_i^a, v_i^a)\}_{i=1}^M$ triées par prix croissant ($p_1^a < p_2^a < \dots < p_M^a$)
*   **Les Offres (Bids)** : $\mathcal{B}_t = \{(p_i^b, v_i^b)\}_{i=1}^M$ triées par prix décroissant ($p_1^b > p_2^b > \dots > p_M^b$)

Où $p_i$ représente le prix et $v_i$ le volume à la ligne $i$.
*   **Le Bid-Ask Spread (Écart)** : $S_t = p_1^a - p_1^b$
*   **Le Mid-Price (Prix moyen)** : $P_t^{\text{mid}} = \frac{p_1^a + p_1^b}{2}$
*   **Le Micro-Price (Prix ajusté par les volumes d'imbalance)** :
    $$P_t^{\text{micro}} = \frac{v_1^b \cdot p_1^a + v_1^a \cdot p_1^b}{v_1^a + v_1^b}$$

### B. Impact sur le Prix (Price Impact) et Sélection Adverse
Lorsqu'un grand ordre au marché est soumis, il consomme la liquidité disponible au meilleur prix et "marche" dans le carnet d'ordres, augmentant le coût réel de l'exécution.
*   **Impact Temporaire (Modèle d'Almgren-Chriss)** : Déviation temporaire du prix due à un manque de liquidité transitoire. Le prix revient vers sa valeur fondamentale après l'exécution.
*   **Impact Permanent** : Changement permanent du prix causé par l'asymétrie d'information. Le marché interprète un gros ordre d'achat comme le signal d'un flux d'information positive (sélection adverse).

---

## 2. Formulation des Algorithmes d'Exécution Systématique

Pour minimiser l'impact sur le prix, un ordre institutionnel massif (ordre parent) est découpé en sous-ordres plus petits (ordres enfants) exécutés séquentiellement.

### A. Volume-Weighted Average Price (VWAP)
Le VWAP vise à exécuter un ordre proportionnellement au profil de volume historique d'une journée de trading typique (qui suit généralement une courbe en "U" ou en "double cloche" entre l'ouverture et la clôture).

Pour exécuter une quantité totale $V$ sur $N$ intervalles de temps :
1.  Soit $\phi_i$ la fraction attendue du volume de marché de l'intervalle $i$ basée sur l'historique : $\sum_{i=1}^N \phi_i = 1$.
2.  La taille de l'ordre enfant $v_i$ à soumettre à l'intervalle $i$ est :
    $$v_i = \phi_i \cdot V$$
3.  **Ajustement Dynamique** : Si le volume réel observé $V_t$ dévie fortement de la moyenne historique, l'algorithme accélère ou décélère pour maintenir sa participation relative constante.

### B. Time-Weighted Average Price (TWAP)
Le TWAP répartit le volume de manière strictement linéaire sur le temps d'exécution choisi, sans se soucier des fluctuations de volume du marché.

La quantité exécutée à chaque intervalle constant $i$ est identique :
$$v_i = \frac{V}{N}$$

*   **Avantage** : Très simple à coder et robuste pour les actifs à faible liquidité mais sans profil de volume historique stable (ex. paires cryptos exotiques).
*   **Inconvénient** : Facilement repérable par les algorithmes de trading haute fréquence (HFT) adverses, qui peuvent anticiper les vagues d'ordres régulières et "front-runner" l'exécution.

---

## 3. Microstructure Crypto et Maximal Extractable Value (MEV)

Sur les blockchains de type Ethereum ou Solana, la microstructure intègre des couches de consensus et d'ordonnancement de blocs qui créent des dynamiques de frais et d'extraction de valeur radicalement différentes de la finance traditionnelle.

### A. Qu'est-ce que le MEV ?
Le **Maximal Extractable Value (MEV)** désigne le profit que les validateurs de blocs ou des entités spécialisées ("searchers") peuvent extraire en réorganisant, insérant ou supprimant arbitrairement des transactions au sein d'un bloc en cours de construction.

### B. Les Principales Attaques et Stratégies MEV
1.  **Sandwich Attack (Attaque en sandwich)** :
    *   Un bot MEV détecte un ordre d'achat important d'un utilisateur ordinaire dans la file d'attente des transactions en attente (le **Mempool** public).
    *   Le bot insère une transaction d'achat juste *avant* la victime en payant des frais de gaz plus élevés (Front-running). Cela fait monter le prix artificiellement.
    *   La transaction de la victime s'exécute à un prix plus élevé (avec un slippage maximal).
    *   Le bot vend immédiatement ses jetons juste *après* l'exécution de la victime (Back-running) pour empocher la différence.
2.  **Arbitrage Atomique** : Exploitation instantanée des écarts de prix entre deux bourses décentralisées (DEXs) au sein d'une seule et unique transaction (sans risque d'inventaire).

### C. Protections pour un Trading Desk Crypto
Pour protéger les algorithmes d'exécution du desk contre ces pertes invisibles mais massives :
*   **Private RPCs (Endpoints de routage privés)** : Router toutes les transactions de swap et d'exécution via des relais privés comme **Flashbots Protect** ou **MEV Blocker** sur Ethereum. Ces relais envoient l'ordre directement aux constructeurs de blocs, contournant complètement le mempool public. La transaction devient invisible aux yeux des bots de sandwich.
*   **Optimisation du Glissement (Slippage Limit)** : Toujours fixer de manière dynamique la limite de slippage (`amountOutMin`) au niveau exact calculé à partir de la liquidité de la piscine de destination, au lieu de laisser des valeurs par défaut (généralement trop permissives, ex. 0.5% ou 1%).

---

## 4. Algorithmes de Routage et Convex Split Routing

Dans la finance décentralisée (DeFi), la liquidité est fragmentée à travers de multiples piscines (pools) de types différents (piscines à produit constant AMM v2, piscines concentrées AMM v3). Pour minimiser l'impact sur le prix (Price Impact), un agrégateur de swap doit diviser un ordre important entre ces piscines de manière optimale.

```
Routage Divisé d'un Ordre de Swap Crypto :

                 +---> Pool Uniswap v2 (x% du volume) --->+
                 |                                        |
Ordre Entrant ---+---> Pool Uniswap v3 (y% du volume) --->+---> Actif Sortie
                 |                                        |
                 +---> Pool Curve Finance (z% du volume) ->+
```

### formulation Mathématique de l'Optimisation de Split
Soit $n$ piscines de liquidité disponibles. Chaque piscine $i$ possède une fonction de tarification concave $f_i(x_i)$ qui donne la quantité d'actifs de sortie obtenue pour un dépôt d'entrée $x_i$.

L'objectif est de maximiser la somme totale des actifs reçus pour un swap global de taille $X$ :
$$\max_{x_1, \dots, x_n} \sum_{i=1}^n f_i(x_i) \quad \text{sujet à} \quad \sum_{i=1}^n x_i = X \quad \text{et} \quad x_i \ge 0$$

Puisque les fonctions $f_i(x_i)$ sont strictement concaves (en raison du glissement de prix inhérent aux AMM), l'optimum global est caractérisé par la condition d'égalité des dérivées marginales (les prix marginaux de sortie doivent être égaux sur toutes les routes exploitées) :
$$f'_1(x_1) = f'_2(x_2) = \dots = f'_n(x_n)$$

### Implémentation Algorithmique : Approche Gloutonne (Greedy)
Pour les agents d'exécution en temps réel, une résolution analytique de l'optimiseur convexe complet peut s'avérer trop coûteuse en calcul. On implémente alors une approximation gloutonne à haute précision :

```python
# Algorithme d'approximation de Split Routing optimal
def calculate_optimal_routing(total_amount, pools, slices_count=100):
    remaining_amount = total_amount
    step_size = total_amount / slices_count
    allocations = {pool.id: 0.0 for pool in pools}
    
    while remaining_amount > 0:
        best_pool = None
        best_marginal_output = -1.0
        
        # Évalue quelle pool donne le meilleur rendement pour la prochaine tranche (slice)
        for pool in pools:
            current_alloc = allocations[pool.id]
            # Évaluation de la dérivée marginale f'_i(x_i + step)
            test_output = pool.estimate_output(current_alloc + step_size) - pool.estimate_output(current_alloc)
            
            if test_output > best_marginal_output:
                best_marginal_output = test_output
                best_pool = pool
                
        # Alloue la tranche à la meilleure pool
        allocations[best_pool.id] += step_size
        remaining_amount -= step_size
        
    return allocations
```

Cette méthode par étapes permet de converger vers la configuration optimale de routage à moins de **1%** de déviation par rapport à la courbe convexe absolue, réduisant drastiquement l'impact sur le prix pour le trading de gros blocs d'actifs.
