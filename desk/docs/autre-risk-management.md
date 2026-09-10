# Gestion du Risque, Taille de Position et Mathématiques de la Ruine

La gestion du risque est la clé de voûte absolue de tout système de trading quantitatif et systématique. Alors que la majorité des traders se concentrent sur la prédiction directionnelle (les entrées/sorties), les modèles mathématiques prouvent que l'allocation du capital et la gestion de la taille de position déterminent la survie à long terme et la croissance géométrique du portefeuille.

Ce document fournit les fondements mathématiques, les modèles d'allocation et les règles opérationnelles de gestion des risques pour un trading desk automatisé opérant sur les actions et les crypto-monnaies.

---

## 1. Le Critère de Kelly (Kelly Criterion)

Développé en 1956 par John Larry Kelly Jr. chez Bell Labs, le critère de Kelly est une formule mathématique qui détermine la fraction optimale de capital à risquer sur une série de paris favorables afin de maximiser le taux de croissance géométrique à long terme du capital.

### Formule Mathématique (Cas Binaire)

Dans un cadre de trading à résultats binaires (gain ou perte fixe), la fraction optimale $f^*$ est définie par :

$$f^* = \frac{p \cdot b - q}{b} = p - \frac{q}{b} = p - \frac{1 - p}{R}$$

Où :
*   $f^* \in [0, 1]$ est la fraction optimale du capital total à allouer à l'opération.
*   $p$ est la probabilité de gain (Win Rate), exprimée sous forme décimale (ex: $0.55$ pour $555\%$).
*   $q = 1 - p$ est la probabilité de perte (Loss Rate).
*   $b$ ou $R$ est le ratio gain/perte moyen (Reward-to-Risk ratio), calculé comme $\frac{\text{Gain Moyen}}{\text{Perte Moyenne}}$.

### Démonstration de la croissance logarithmique

Le critère de Kelly maximise l'espérance mathématique de la valeur logarithmique de la richesse à long terme, $E[\ln(W_N)]$. 

Si nous commençons avec une richesse initiale $W_0$, et qu'après chaque trade nous gagnons une fraction $f \cdot R$ avec une probabilité $p$ ou perdons une fraction $f$ avec une probabilité $1-p$ :

$$W_1 = W_0 \cdot (1 + f \cdot R) \quad \text{(avec probabilité } p\text{)}$$
$$W_1 = W_0 \cdot (1 - f) \quad \text{(avec probabilité } 1-p\text{)}$$

Après $N$ trades, la richesse attendue est :

$$W_N = W_0 \cdot (1 + f \cdot R)^{p \cdot N} \cdot (1 - f)^{(1 - p) \cdot N}$$

Pour maximiser le taux de croissance géométrique $G(f)$ par trade :

$$G(f) = \lim_{N \to \infty} \frac{1}{N} \ln\left(\frac{W_N}{W_0}\right) = p \ln(1 + f \cdot R) + (1-p) \ln(1 - f)$$

Pour trouver la valeur optimale de $f$, nous prenons la dérivée première par rapport à $f$ et l'égalisons à zéro :

$$\frac{dG(f)}{df} = \frac{p \cdot R}{1 + f \cdot R} - \frac{1 - p}{1 - f} = 0$$

$$\Rightarrow p \cdot R \cdot (1 - f) = (1 - p) \cdot (1 + f \cdot R)$$
$$\Rightarrow p \cdot R - p \cdot R \cdot f = 1 - p + f \cdot R - p \cdot f \cdot R$$
$$\Rightarrow p \cdot R - 1 + p = f \cdot R$$
$$\Rightarrow f^* = \frac{p \cdot R - (1 - p)}{R} = p - \frac{1 - p}{R}$$

### Le danger du "Full Kelly" et la solution du Fractional Kelly

Bien que mathématiquement optimal pour un horizon temporel infini, utiliser le "Full Kelly" ($100\%$ du $f^*$ calculé) présente de graves inconvénients en pratique :
1.  **Volatilité extrême** : Les tirages (drawdowns) peuvent être colossaux. Par exemple, un trader utilisant Full Kelly a une probabilité de $50\%$ de subir un drawdown de $50\%$ avant de doubler son capital.
2.  **Sensibilité aux erreurs d'estimation** : Si le taux de réussite $p$ ou le ratio $R$ sont surestimés en raison d'un historique trop court, la mise de Kelly devient surévaluée, ce qui peut conduire à la ruine (Negative Expected Growth).

Pour atténuer ces risques, les traders professionnels et les fonds quantitatifs appliquent systématiquement un **Fractional Kelly** (Kelly Fractionnaire), qui consiste à multiplier $f^*$ par un coefficient de sécurité $k \in (0, 1)$ :

$$f_{\text{réel}} = k \cdot f^*$$

*   **Half-Kelly ($k = 0.5$)** : Réduit la volatilité du capital de $50\%$ tout en conservant environ $75\%$ du taux de croissance maximal théorique.
*   **Quarter-Kelly ($k = 0.25$)** : Réduit drastiquement la volatilité et protège contre les erreurs d'estimation des paramètres historiques.

| Paramètre | Full Kelly ($k=1.0$) | Half Kelly ($k=0.5$) | Quarter Kelly ($k=0.25$) |
| :--- | :--- | :--- | :--- |
| **Objectif** | Croissance max absolue | Équilibre Croissance/Risque | Préservation stricte |
| **Volatilité** | Très élevée | Modérée | Faible |
| **Tolérance erreur** | Nulle | Acceptable | Excellente |
| **Risque de Ruine** | Présent (si $p$ surestimé) | Pratiquement nul | Nul |

---

## 2. Mathématiques du Drawdown et de la Récupération

Le drawdown (tirage) est la baisse de valeur du capital depuis son sommet historique (Peak-to-Trough). En raison de l'asymétrie géométrique des rendements, la performance nécessaire pour retrouver son capital initial après une perte augmente de manière non linéaire.

### Formule Mathématique de Récupération

Le taux de rendement $R_{\text{recup}}$ requis pour effacer une perte de $L$ (exprimée sous forme de fraction décimale de perte du capital initial) est donné par :

$$R_{\text{recup}} = \frac{L}{1 - L}$$

### Tableau d'Asymétrie des Pertes

| Perte de Capital ($L$) | Rendement Requis pour Revenir à l'Équilibre ($R_{\text{recup}}$) |
| :--- | :--- |
| **5%** | 5.26% |
| **10%** | 11.11% |
| **20%** | 25.00% |
| **30%** | 42.86% |
| **40%** | 66.67% |
| **50%** | 100.00% |
| **60%** | 150.00% |
| **70%** | 233.33% |
| **80%** | 400.00% |
| **90%** | 900.00% |

**Règle d'or du Trading Desk :** Pour éviter d'entrer dans la "zone de mort mathématique" (pertes $> 30\%$, où l'effort de récupération dépasse $40\%$), le risque maximal par transaction doit être strictement plafonné. 
*   **Actions** : Risque maximal recommandé de **1% à 1.5%** du capital par trade.
*   **Crypto-monnaies (haute volatilité)** : Risque maximal recommandé de **0.5% à 1%** du capital par trade.

---

## 3. Taille de Position basée sur la Volatilité (ATR-Based Position Sizing)

Allouer la même somme d'argent à chaque transaction est une erreur grave. Une position sur un actif peu volatil (ex: action $KO$ avec un ATR de $2\%$) doit être physiquement plus importante qu'une position sur un actif hyper volatil (ex: crypto-monnaie $SOL$ avec un ATR de $8\%$) pour que les deux transactions partagent le même risque financier nominal.

Pour harmoniser la volatilité du portefeuille, nous utilisons l'**ATR (Average True Range)** pour calculer dynamiquement notre taille de position et notre stop loss.

### Formule de Calcul de la Taille de Position

Pour un compte libellé dans une devise de base (ex: EUR ou USD), la taille de la position en unités de l'actif ($Q$) est calculée comme suit :

$$Q = \frac{\text{Capital Total} \cdot \text{Risque} \%}{D_{\text{Stop Loss}} \cdot \text{Valeur du Point}}$$

Où le stop-loss est indexé sur l'ATR actuel de l'actif :

$$D_{\text{Stop Loss}} = \text{ATR}_N \cdot \mu$$

*   $\text{Capital Total}$ : Solde actuel disponible (Equity).
*   $\text{Risque} \%$ : Pourcentage maximal du capital risqué par trade (ex: $1\% = 0.01$).
*   $\text{ATR}_N$ : Valeur de l'Average True Range sur $N$ périodes (généralement $N=14$ sur bougies journalières).
*   $\mu$ : Multiplicateur de volatilité pour le stop loss (généralement compris entre $1.5$ et $3.0$).
*   $\text{Valeur du Point}$ : Valeur d'une variation de 1 point de l'actif dans la devise du compte (généralement $= 1$ pour les actions en direct et les cryptos en spot).

### Exemples Comparatifs d'Application Réelle

Soit un portefeuille global de **100 000 USD** avec une tolérance au risque stricte de **1.0% par trade** (soit un budget de risque de **1 000 USD**).

#### Cas A : Action à faible volatilité (Apple - AAPL)
*   **Prix d'entrée** : $180.00 USD
*   **ATR (14 jours)** : $3.60 USD
*   **Multiplicateur de stop ($\mu$)** : $2.0$ (Stop Loss placé à $2 \cdot \text{ATR}$ du prix d'entrée)
*   **Distance du Stop Loss** : $3.60 \times 2.0 = 7.20 USD$
*   **Niveau du Stop Loss (Long)** : $180.00 - 7.20 = 172.80 USD$
*   **Calcul de la Quantité ($Q$)** :

$$Q_{\text{AAPL}} = \frac{100\,000 \cdot 0.01}{7.20 \cdot 1} = \frac{1\,000}{7.20} \approx 138.89 \text{ actions}$$

*   **Exposition nominale totale** : $138.89 \times 180.00 = 25\,000.20 USD$ (soit un levier réel de $0.25$ sur ce trade).

#### Cas B : Crypto-monnaie à haute volatilité (Solana - SOL)
*   **Prix d'entrée** : $120.00 USD
*   **ATR (14 jours)** : $8.40 USD
*   **Multiplicateur de stop ($\mu$)** : $2.0$
*   **Distance du Stop Loss** : $8.40 \times 2.0 = 16.80 USD$
*   **Niveau du Stop Loss (Long)** : $120.00 - 16.80 = 103.20 USD$
*   **Calcul de la Quantité ($Q$)** :

$$Q_{\text{SOL}} = \frac{100\,000 \cdot 0.01}{16.80 \cdot 1} = \frac{1\,000}{16.80} \approx 59.52 \text{ SOL}$$

*   **Exposition nominale totale** : $59.52 \times 120.00 = 7\,142.40 USD$ (soit une allocation nominale 3.5 fois inférieure à celle d'Apple, pour un risque financier identique de 1 000 USD).

---

## 4. Les Mathématiques de la Ruine (Risk of Ruin)

La probabilité de ruine mesure la chance qu'a un trader de voir son capital descendre à un niveau prédéfini à partir duquel il ne peut plus trader (ex: perte de $50\%$ du capital d'origine, ou ruine complète à $100\%$).

### Formule de Probabilité de Ruine Globale (Modèle Continu de Perry)

Pour une stratégie de trading infinie caractérisée par un Edge statistique constant, la probabilité de ruine complète ($P_{\text{ruine}}$) est modélisée par :

$$P_{\text{ruine}} = \left( \frac{1 - a}{1 + a} \right)^{C}$$

Où :
*   $a$ est l'avantage mathématique net du système (Edge). $a = p - (1-p) = 2p - 1$ (si le ratio gain/perte $R = 1.0$).
*   $C$ est le nombre d'unités de risque que contient le capital de départ. Par exemple, si le compte dispose de $10\,000$ USD et risque $2\%$ ($200$ USD) par transaction, alors $C = \frac{10\,000}{200} = 50$ unités de risque.

Dans le cas général où le ratio Gain/Perte $R \neq 1$, nous utilisons la forme classique :

$$P_{\text{ruine}} = \left( \frac{1 - \text{Edge}}{1 + \text{Edge}} \right)^C$$

Où le Edge est défini par l'espérance mathématique de rendement par dollar risqué :

$$\text{Edge} = p \cdot R - (1 - p)$$

### Analyse de la probabilité de séries de pertes consécutives

La croyance selon laquelle "subir 10 pertes de suite est impossible avec un taux de réussite de 60%" est un biais cognitif fréquent. En probabilités, sur une série temporelle longue, l'apparition de séquences de pertes consécutives est une certitude statistique.

Pour une stratégie avec une probabilité de perte $q = 1 - p$ par trade, la probabilité d'observer au moins une séquence de $n$ pertes consécutives au cours d'un échantillon de $N$ transactions est modélisée par :

$$P(\text{séquence de } n \text{ pertes sur } N \text{ trades}) \approx 1 - e^{-N \cdot p \cdot q^n}$$

### Modélisation des probabilités (Échantillon de 500 trades)

Voici la probabilité empirique de rencontrer une série de $n$ pertes consécutives sur une année opérationnelle standard (environ 500 trades) :

| Win Rate ($p$) | Perte par trade ($q$) | Séquence de 5 pertes | Séquence de 8 pertes | Séquence de 10 pertes |
| :--- | :--- | :--- | :--- | :--- |
| **40%** | 60% | 99.9% | 91.2% | 61.4% |
| **50%** | 50% | 98.7% | 62.1% | 29.5% |
| **60%** | 40% | 85.3% | 19.4% | 5.2% |
| **70%** | 30% | 34.6% | 1.8% | 0.2% |

**Conclusion opérationnelle pour les Agents de Trading :** Même avec un excellent algorithme gagnant à **60%**, il y a plus de **19.4%** de chances de subir 8 pertes consécutives au cours de l'année. 
*   Si l'agent allouait une mise de **10% par trade**, le drawdown cumulé serait de **80%** (ruine psychologique et opérationnelle).
*   Avec un risque contrôlé de **1% par trade**, le drawdown maximal provoqué par cette série noire serait de seulement **8%**, préservant ainsi l'intégralité du capital de l'agent pour le retour de l'edge.
