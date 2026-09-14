# Analyse Graphique, Structures de Bougies et Formes Classiques

L'analyse graphique (ou chartisme) repose sur l'étude des mouvements de prix représentés sous forme de bougies japonaises (candlesticks) ou de structures géométriques complexes. Dans un trading desk systématique, ces formes ne doivent pas être interprétées de manière subjective, mais traduites sous forme d'algorithmes et de conditions logiques strictes.

Ce document présente l'ensemble des figures de bougies et de chartisme classiques, leurs caractéristiques techniques, leur psychologie de marché sous-jacente, et leurs taux de réussite statistiques observés sur les actions et les crypto-monnaies.

---

## 1. Modélisation et Logique Formelle des Bougies Japonaises

Chaque période de trading (ex: 5 min, 1h, 1 jour) est modélisée par une bougie contenant quatre points de données : l'Ouverture (Open - $O$), le Plus Haut (High - $H$), le Plus Bas (Low - $L$) et la Clôture (Close - $C$). 

Pour formaliser les motifs de bougies en programmation, nous définissons d'abord les composantes d'une bougie $i$ :
*   **Corps (Body)** : $B_i = |C_i - O_i|$
*   **Mèche Supérieure (Upper Shadow)** : $US_i = H_i - \max(O_i, C_i)$
*   **Mèche Inférieure (Lower Shadow)** : $LS_i = \min(O_i, C_i) - L_i$
*   **Direction** : Bullish si $C_i > O_i$, Bearish si $C_i < O_i$

### Figures à Bougie Unique (Single Candlestick Patterns)

#### 1. Le Marubozu
*   **Description** : Une bougie caractérisée par un grand corps et des mèches quasi inexistantes ou nulles. Elle montre un contrôle absolu de la direction par un camp de l'ouverture à la clôture.
*   **Formulation logique (Bullish Marubozu)** : 
    $$B_i \ge 0.90 \cdot (H_i - L_i) \quad \text{et} \quad C_i > O_i$$
*   **Utilisation** : Signal de force acheteuse ou vendeuse majeure, confirmation de cassure de niveau clé (breakout).

#### 2. Le Doji
*   **Description** : Indique une indécision totale. Le prix de clôture est égal ou très proche du prix d'ouverture.
*   **Formulation logique** : 
    $$B_i \le 0.05 \cdot (H_i - L_i)$$
*   **Variantes** :
    *   **Dragonfly Doji** (mèche inférieure très longue, mèche supérieure inexistante, signal de rejet baissier) : 
        $$B_i \le 0.05 \cdot (H_i - L_i) \quad \text{et} \quad LS_i \ge 0.70 \cdot (H_i - L_i)$$
    *   **Gravestone Doji** (mèche supérieure très longue, signal de rejet haussier) : 
        $$B_i \le 0.05 \cdot (H_i - L_i) \quad \text{et} \quad US_i \ge 0.70 \cdot (H_i - L_i)$$

#### 3. Le Marteau (Hammer) & L'Étoile Filante (Shooting Star)
*   **Marteau** : Bougie de retournement haussier apparaissant en fin de tendance baissière.
    *   *Logique* : Petit corps dans le tiers supérieur, mèche inférieure faisant au moins le double du corps, pas ou peu de mèche supérieure.
    *   *Formule* : 
        $$LS_i \ge 2 \cdot B_i \quad \text{et} \quad US_i \le 0.10 \cdot B_i \quad \text{et} \quad \text{Tendance préalable baissière}$$
*   **Étoile Filante** : Bougie de retournement baissier apparaissant en fin de tendance haussière.
    *   *Logique* : Petit corps dans le tiers inférieur, mèche supérieure faisant au moins le double du corps, pas ou peu de mèche inférieure.
    *   *Formule* : 
        $$US_i \ge 2 \cdot B_i \quad \text{et} \quad LS_i \le 0.10 \cdot B_i \quad \text{et} \quad \text{Tendance préalable haussière}$$

### Figures à Bougies Multiples (Multi-Candlestick Patterns)

#### 1. L'Englobante (Engulfing Pattern)
*   **Englobante Haussière (Bullish Engulfing)** : Retournement haussier majeur de court terme. Le corps de la bougie actuelle engloutit complètement le corps de la bougie précédente.
    *   *Formule* :
        $$C_{i-1} < O_{i-1} \quad \text{(Bougie précédente baissière)}$$
        $$C_i > O_i \quad \text{(Bougie actuelle haussière)}$$
        $$O_i < C_{i-1} \quad \text{et} \quad C_i > O_{i-1}$$
*   **Englobante Baissière (Bearish Engulfing)** : Retournement baissier majeur de court terme.
    *   *Formule* :
        $$C_{i-1} > O_{i-1} \quad \text{(Bougie précédente haussière)}$$
        $$C_i < O_i \quad \text{(Bougie actuelle baissière)}$$
        $$O_i > C_{i-1} \quad \text{et} \quad C_i < O_{i-1}$$

#### 2. Le Harami
*   **Harami Haussier** : Figure d'essoufflement de la tendance vendeuse où une petite bougie haussière est complètement contenue à l'intérieur du grand corps de la bougie baissière précédente.
    *   *Formule* :
        $$C_{i-1} < O_{i-1} \quad \text{et} \quad C_i > O_i$$
        $$O_i > C_{i-1} \quad \text{et} \quad C_i < O_{i-1}$$
*   **Harami Baissier** : Essoufflement de la tendance haussière.
    *   *Formule* :
        $$C_{i-1} > O_{i-1} \quad \text{et} \quad C_i < O_i$$
        $$O_i < C_{i-1} \quad \text{et} \quad C_i > O_{i-1}$$

---

## 2. Analyse Statistique des Figures Chartistes Classiques

Les figures de retournement et de continuation de tendance reflètent la psychologie de foule des intervenants de marché aux zones d'équilibre offre/demande. Les données statistiques quantitatives récentes mettent en lumière leur efficacité réelle.

### A. Figures de Retournement (Reversal Patterns)

```
   Head & Shoulders (Baisse à venir)           Double Bottom (Hausse à venir)
         Head (Sommet Central)
            /\                                      Price Line
           /  \                                     \  /\  /
Left Sh.  /    \  Right Sh.                          \/  \/
   /\    /      \    /\                               Bottoms
  /  \--/--------\--/  \
      Neckline (Ligne de cou)
```

#### 1. L'Épaule-Tête-Épaule (Head and Shoulders - H&S)
*   **Psychologie** : Une incapacité à inscrire un nouveau sommet supérieur au précédent après la formation de la "Tête", suivie de la rupture du support clé horizontal ou oblique appelé la "Ligne de Cou" (Neckline).
*   **Taux de Réussite Statistique** : **~72.3%** (l'un des schémas les plus fiables à l'échelle macro/daily pour anticiper les retournements de tendance baissiers).
*   **Règle d'Entrée** : Entrée en position Short lors de la rupture franche de la ligne de cou (Idéalement confirmée par une bougie de clôture sous ce niveau).
*   **Calcul de l'Objectif Théorique** : Hauteur verticale entre le sommet de la tête et la ligne de cou, projetée vers le bas à partir du point de cassure.

#### 2. Double Top & Double Bottom
*   **Double Bottom (W-Pattern)** : Le prix teste deux fois consécutivement un niveau de support sans parvenir à le casser, puis franchit la ligne de résistance locale (Neckline) reliant le sommet intermédiaire.
    *   *Taux de Réussite Statistique* : **~65.8%**.
    *   *Cible* : Hauteur du canal projetée au-dessus de la ligne de cou.
*   **Double Top (M-Pattern)** : Rejet consécutif sous un niveau de résistance majeure. Indique une distribution agressive par les grands capitaux.
    *   *Taux de Réussite Statistique* : **~66.2%**.

### B. Figures de Continuation (Continuation Patterns)

```
    Symmetrical Triangle                     Bull Flag (Drapeau)
          /\                                      /\      _
         /  \                                    /  \    /_\_ Flag (Consolidation)
        /----\                                  /    \--/  / 
       /------\                                /       /--/
      /--------\                              /       /
     /----------\                            Pole (Mât)
```

#### 1. Les Triangles (Symmetrical, Ascending, Descending)
*   **Triangle Symmetrical** : Convergence de deux lignes obliques de pente opposée (sommets de plus en plus bas, creux de plus en plus hauts). C'est une figure neutre par définition jusqu'au breakout.
    *   *Taux de Réussite Statistique de Cassure* : **~68.5%** de succès dans le sens de la tendance d'entrée.
*   **Triangle Ascendant** : Résistance horizontale et ligne de support oblique ascendante. Indique une accumulation progressive où les acheteurs acceptent d'acheter à des prix de plus en plus élevés.
    *   *Taux de Réussite Statistique de Cassure Haussière* : **~71.5%**.
*   **Triangle Descendant** : Support horizontal plat et ligne de sommets descendants. Indique une distribution latente avec des vendeurs de plus en plus agressifs.
    *   *Taux de Réussite Statistique de Cassure Baissière* : **~72.1%**.

#### 2. Drapeaux (Flags) et Fanions (Pennants)
*   **Bull Flag** : Une impulsion haussière brutale (le mât), suivie d'un canal de consolidation légèrement descendant et court. Cette figure indique des prises de bénéfices mineures sans retour de la force vendeuse réelle.
    *   *Taux de Réussite Statistique* : **~67.0%** de cassure haussière.
    *   *Cible* : Projection de la hauteur du mât au point de sortie du drapeau.

---

## 3. Le Rôle Fondamental des Volumes de Confirmation

Dans l'analyse graphique quantitative, l'étude du prix seul est sujette à un nombre élevé de faux signaux (fausses cassures ou "fakeouts"). Les volumes d'échange représentent l'énergie cinétique du marché et doivent être utilisés comme filtre logique obligatoire.

### Règles d'Or des Volumes pour la Validation des Breakouts

1.  **Validation de Cassure (Breakout Confirmation)** :
    Toute cassure de ligne de cou (H&S, Double Top/Bottom) ou de résistance de triangle doit s'accompagner d'une hausse significative des volumes de transaction. Un breakout sur faible volume a un taux d'échec de **$60\% \text{ à } 75\%$** (générant des pièges à acheteurs/vendeurs).
    *   *Formule algorithmique de validation* :
        $$V_{\text{breakout}} \ge 1.5 \cdot \text{MA}_{20}(V)$$
        Où $\text{MA}_{20}(V)$ est la moyenne glissante à 20 périodes du volume d'échange de l'actif.

2.  **Divergence Volume-Prix (Consolidation)** :
    Pendant la phase de formation d'un drapeau (Flag) ou d'un triangle, les volumes de transaction doivent s'effondrer progressivement (assèchement de la liquidité). Cela indique que le marché n'est pas en phase de distribution ou de panique, mais simplement dans une pause saine avant le prochain mouvement d'impulsion.

3.  **Vagues de Volume (On-Balance Volume - OBV)** :
    L'OBV cumulative doit être ascendante pendant les phases de hausse ou de consolidation haussière, démontrant que les capitaux continuent d'affluer de manière agressive dans l'actif, accumulé par les "mains fortes" institutionnelles.
