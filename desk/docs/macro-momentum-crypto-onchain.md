# Crypto-monnaies : Indicateurs Dérivés, Métriques On-Chain et Liquidations

Le marché des crypto-monnaies se caractérise par une structure de microstructure de marché unique, largement dominée par les contrats à terme perpétuels (perpetual futures ou "perps") et une transparence totale offerte par la blockchain (métriques on-chain). Pour un trading desk systématique, l'analyse des flux de capitaux, du levier et de la liquidité on-chain fournit un avantage informationnel crucial (Edge) sur les investisseurs de détail.

Ce document fournit un guide technique détaillé sur le calcul, l'interprétation et l'utilisation opérationnelle des indicateurs dérivés et des données on-chain pour qualifier la structure du marché crypto.

---

## 1. Indicateurs Dérivés et Dynamique du Levier

Les produits dérivés perpétuels représentent souvent $80\% \text{ à } 90\%$ du volume d'échange d'un actif crypto. L'analyse de l'effet de levier du marché permet de détecter les déséquilibres structurels avant qu'ils ne se traduisent sur le marché spot.

### A. Le Taux de Financement (Funding Rate)

Le taux de financement est un paiement périodique (généralement toutes les 1h, 4h ou 8h) échangé entre les acheteurs (Longs) et les vendeurs (Shorts) de contrats perpétuels. Il sert à ancrer le prix du contrat à terme perpétuel ($P_{\text{perp}}$) sur le prix réel du marché spot sous-jacent ($P_{\text{spot}}$).

#### Formule de Calcul du Taux de Financement

Le taux de financement ($F$) se compose généralement de deux parties : le taux d'intérêt ($I$) et la prime d'écart ($P$) :

$$F = P + \text{clamp}(I - P, -0.05\%, 0.05\%)$$

Où la prime d'écart ($P$) mesure la déconnexion entre le perp et le spot :

$$P = \frac{\max(0, P_{\text{perp}} - P_{\text{spot}}) - \max(0, P_{\text{spot}} - P_{\text{perp}})}{P_{\text{spot}}}$$

*   **Interprétation Opérationnelle** :
    *   **$F > 0$ (Funding Rate Positif)** : Le prix perpétuel est supérieur au prix spot. Les Longs sont agressifs et paient les Shorts pour maintenir leurs positions ouvertes. Un taux de financement excessivement élevé et persistant (ex: $> 0.1\%$ par 8 heures) indique un **marché sur-effet-de-levier à l'achat**, propice à une cascade de liquidations baissières (Long Squeeze).
    *   **$F < 0$ (Funding Rate Négatif)** : Le prix perpétuel est inférieur au prix spot. Les Shorts sont agressifs et paient les Longs. Un taux de financement très négatif indique un **marché sur-effet-de-levier à la vente**, mûr pour un retournement haussier violent (Short Squeeze).

### B. L'Intérêt Ouvert (Open Interest - OI)

L'Open Interest représente la valeur notionnelle totale de tous les contrats à terme perpétuels actuellement ouverts (non clôturés, non expirés et non liquidés) sur l'ensemble des plateformes d'échange pour un actif donné.

#### Interprétation Conjointe : Prix vs. Open Interest

| Prix de l'Actif | Open Interest | Taux de Financement | Interprétation de la Structure de Marché |
| :--- | :--- | :--- | :--- |
| **En Hausse** | En Hausse | En Hausse (Positif) | **Accumulation agressive par levier long** : Tendance haussière forte mais vulnérabilité croissante. |
| **En Hausse** | En Baisse | En Baisse (Neutre) | **Short Squeeze** : La hausse est provoquée par les vendeurs qui capitulent et coupent leurs pertes, et non par de nouveaux acheteurs. Tendance fragile. |
| **En Baisse** | En Hausse | En Baisse (Négatif) | **Distribution agressive par levier short** : Tendance baissière forte. Risque de Short Squeeze si le prix se retourne. |
| **En Baisse** | En Baisse | En Baisse | **Long Liquidation** : Capitulation des acheteurs à levier. Phase saine d'assainissement du marché. |

### C. Cartes Thermiques de Liquidation (Liquidation Heatmaps)

Contrairement aux marchés d'actions traditionnels, les positions à effet de levier dans les crypto-monnaies sont liquidées de manière forcée et automatique par le moteur de risque de l'échange dès que la marge de maintien est franchie.

Les cartes thermiques de liquidation estiment les zones de prix où s'accumulent d'importants volumes de liquidations forcées potentielles. Les teneurs de marché (Market Makers) et les algorithmes ont tendance à pousser le prix vers ces "poches de liquidité" pour exécuter de gros volumes à bas coût.
*   **Alerte opérationnelle** : Un cluster massif de liquidations sous le prix actuel agit comme un aimant gravitationnel. Une fois franchi, il déclenche des ventes automatiques en cascade (cascade de liquidations), provoquant des chutes verticales de prix temporaires et des mèches d'absorption idéales pour l'achat spot à escompte.

---

## 2. Indicateurs On-Chain fondamentaux pour la Crypto

L'analyse on-chain permet d'observer en temps réel le comportement des investisseurs, la vélocité de l'argent et la rentabilité globale du réseau blockchain.

### A. Total Value Locked (TVL)

La TVL représente la valeur totale des crypto-actifs verrouillés ou déposés dans les contrats intelligents (smart contracts) des protocoles de finance décentralisée (DeFi) d'une blockchain (ex: Ethereum, Solana, BNB Chain).
*   **Ratio Valeur Réseau / TVL (Market Cap to TVL Ratio)** : Utilisé pour détecter les surévaluations ou sous-évaluations fondamentales d'une blockchain Layer-1.
    $$\text{Ratio} = \frac{\text{Capitalisation Boursière de la L1}}{\text{TVL Globale}}$$
    *   Un ratio **$< 1.0$** indique que le réseau est potentiellement sous-évalué par rapport à l'activité économique réelle de sa DeFi.

### B. Le MVRV Z-Score (Market Value to Realized Value)

Le MVRV Z-Score est un indicateur on-chain à grande échelle utilisé pour identifier les phases de surévaluation (sommets de cycle) ou de sous-évaluation extrême (creux de cycle) du Bitcoin par rapport à sa "valeur réalisée".

#### Définition Mathématique

$$\text{MVRV Z-Score} = \frac{\text{Market Cap} - \text{Realized Cap}}{\sigma_{\text{Market Cap}}}$$

Où :
*   $\text{Market Cap}$ (Valeur de Marché) : Le prix actuel du marché multiplié par le nombre de pièces en circulation.
*   $\text{Realized Cap}$ (Valeur Réalisée) : Calcule la valeur de chaque unité de crypto-monnaie au moment où elle a été déplacée pour la dernière fois sur la blockchain (représentant le coût d'acquisition ou coût moyen d'achat global des investisseurs).
*   $\sigma_{\text{Market Cap}}$ : L'écart-type de la capitalisation boursière historique.

#### Seuils Opérationnels de Cycle
*   **Z-Score > 7.0** : Zone rouge historique. Le prix du marché est déconnecté de son coût d'acquisition historique de manière statistiquement extrême. Indique un sommet de bull run imminent, caractérisé par une euphorie de détail (Retail Mania). Zone de prise de bénéfices obligatoire pour le desk.
*   **Z-Score < 0.1** : Zone verte historique. Le prix du marché est inférieur ou égal au coût d'acquisition historique moyen. Indique une capitulation totale et une sous-évaluation extrême (creux de bear market). Zone d'accumulation majeure à long terme.

### C. Flux de Stablecoins (Stablecoin Inflows)

Les stablecoins (USDT, USDC, DAI) représentent la réserve de poudre sèche (dry powder) du marché crypto. Une augmentation rapide de la capitalisation boursière cumulée des stablecoins ou leur transfert massif depuis des portefeuilles privés vers les plateformes d'échange (Inflows) indique un apport de liquidités fraîches, ce qui constitue le carburant obligatoire pour initier et soutenir un mouvement haussier majeur (momentum d'achat).
