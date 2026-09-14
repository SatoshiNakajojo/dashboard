# Construction de Stratégies Systématiques et Implémentation Pine Script v5

La construction d'une stratégie de trading efficace repose sur l'assemblage de filtres logiques et de déclencheurs (triggers) non corrélés afin d'exploiter une anomalie statistique ou un comportement récurrent du marché. Une stratégie réussie doit définir de manière totalement déterministe ses règles d'entrée, ses règles de filtrage de faux signaux, et ses conditions de sortie.

Ce document fournit une méthodologie de construction systématique ainsi que le code source complet en **Pine Script v5** d'une stratégie performante à volatilité ajustée (ATR) combinant le suivi de tendance et le momentum, optimisée pour les marchés des actions et des crypto-monnaies.

---

## 1. Méthodologie Globale de Construction d'une Stratégie

Un système algorithmique robuste se compose de cinq modules logiques distincts :

```
+--------------------------------------------------+
|          1. FILTRE DE RÉGIME DE MARCHÉ           |  --> Ex: Prix > EMA 200 (Marché Haussier)
+--------------------------------------------------+
                        |
                        v
+--------------------------------------------------+
|           2. DÉCLENCHEUR D'ENTRÉE (TRIGGER)      |  --> Ex: Crossover EMA 21 / EMA 50
+--------------------------------------------------+
                        |
                        v
+--------------------------------------------------+
|           3. FILTRE DE CONFIRMATION (MOMENTUM)   |  --> Ex: RSI > 50 ET Volume > MA_Volume
+--------------------------------------------------+
                        |
                        v
+--------------------------------------------------+
|            4. MODULE DE GESTION DU RISQUE        |  --> Ex: Sizing Kelly / Stop Loss ATR
+--------------------------------------------------+
                        |
                        v
+--------------------------------------------------+
|          5. RÈGLES DE SORTIE (TP / SL / TRAILING) | --> Ex: TP à 3x ATR, Trailing ATR
+--------------------------------------------------+
```

### Description des Modules

1.  **Filtre de Régime** : Identifie le biais directionnel macro (ex: haussier, baissier, ou range). On utilise typiquement l'**EMA 200** ou l'**ADX** pour cette tâche.
2.  **Déclencheur (Trigger)** : Le signal temporel précis qui initie l'analyse d'un trade potentiel (ex: croisement de moyennes mobiles, cassure de bande de Bollinger).
3.  **Filtre de Confirmation** : Évite les pièges directionnels (fakeouts) en vérifiant le momentum (ex: RSI, Stochastique) et la participation (ex: volume d'échange supérieur à sa moyenne).
4.  **Gestion du Risque (Sizing)** : Calcule la taille optimale de la position en fonction de la volatilité actuelle (ATR) et de la taille du compte de trading (voir module "Risk Management" dans la section Autre).
5.  **Règles de Sortie** : Définissent la fermeture de la position. Un bon système possède plusieurs scénarios de sortie : un Stop Loss d'urgence, un Take Profit fixe pour sécuriser les gains, et un **Trailing Stop** (stop suiveur) pour laisser courir les profits en cas d'impulsion majeure.

---

## 2. Spécifications de la Stratégie de Référence : "Trend-Follower Volatility-Adjusted"

Cette stratégie hybride est conçue pour exploiter les tendances moyennes/longues sur les crypto-monnaies liquides (BTC, ETH, SOL) et les actions de croissance (Apple, Nvidia, etc.) tout en s'adaptant dynamiquement à la volatilité intrinsèque de chaque actif grâce à l'ATR.

### Règles d'Entrée Long (Achat)
*   **Filtre de Tendance Macro** : Le prix de clôture doit être strictement supérieur à l'EMA 200.
    $$\text{Close} > \text{EMA}_{200}$$
*   **Déclencheur d'Entrée** : L'EMA rapide à 21 périodes croise à la hausse l'EMA moyenne à 50 périodes.
    $$\text{EMA}_{21} \ \text{crosses over} \ \text{EMA}_{50}$$
*   **Filtre de Confirmation (Momentum)** : Le RSI (14 périodes) doit être en zone de force (supérieur à 50) pour s'assurer que le momentum soutient la cassure.
    $$\text{RSI}_{14} > 50$$

### Règles de Sortie et Risk Management
*   **Volatilité de Référence** : Calculée à l'aide de l'$\text{ATR}_{14}$.
*   **Placement du Stop Loss (SL)** : Fixé à $2.0 \times \text{ATR}$ en dessous du prix d'entrée pour donner de l'espace aux fluctuations normales du prix.
    $$\text{SL} = \text{Entrée} - (2.0 \cdot \text{ATR}_{14})$$
*   **Placement du Take Profit (TP)** : Fixé à $3.5 \times \text{ATR}$ au-dessus du prix d'entrée, garantissant un ratio de rentabilité (Reward-to-Risk ratio) structurellement avantageux de **1.75**.
    $$\text{TP} = \text{Entrée} + (3.5 \cdot \text{ATR}_{14})$$
*   **Trailing Stop Actif** : Dès que le prix atteint un gain égal à $1.5 \times \text{ATR}$, le niveau de stop loss remonte automatiquement à l'équilibre (Break Even) pour éliminer le risque financier sur le trade.

---

## 3. Code Pine Script v5 Prêt à l'Emploi sur TradingView

Copiez et collez ce code directement dans l'éditeur Pine Editor de votre compte TradingView pour exécuter instantanément des backtests historiques détaillés sur n'importe quel actif crypto ou action.

```pinescript
//@version=5
strategy("Trading Desk System - Trend Follower Volatility-Adjusted", overlay=true, initial_capital=100000, default_qty_type=strategy.cash, default_qty_value=100000, commission_type=strategy.commission.percent, commission_value=0.075)

// ==========================================
// 1. PARAMÈTRES ET ENTRÉES UTILISATEUR
// ==========================================
// Moyennes Mobiles Exponentielles
emaFastLength = input.int(21, title="Longueur EMA Rapide", minval=1)
emaMediumLength = input.int(50, title="Longueur EMA Moyenne", minval=1)
emaSlowLength = input.int(200, title="Longueur EMA Macro (Filtre)", minval=1)

// Relative Strength Index (RSI)
rsiLength = input.int(14, title="Période RSI", minval=1)
rsiFilterVal = input.int(50, title="Seuil de Force RSI", minval=1, maxval=100)

// Gestion du Risque basés sur l'ATR
atrLength = input.int(14, title="Période ATR Volatilité", minval=1)
slMultiplier = input.float(2.0, title="Multiplicateur Stop Loss", step=0.1)
tpMultiplier = input.float(3.5, title="Multiplicateur Take Profit", step=0.1)
riskPercent = input.float(1.0, title="Risque maximal par trade (%)", step=0.1)

// ==========================================
// 2. CALCULS DES INDICATEURS MATHÉMATIQUES
// ==========================================
// Calcul des EMA
emaFast = ta.ema(close, emaFastLength)
emaMedium = ta.ema(close, emaMediumLength)
emaSlow = ta.ema(close, emaSlowLength)

// Calcul du RSI
rsiVal = ta.rsi(close, rsiLength)

// Calcul de l'ATR
atrVal = ta.atr(atrLength)

// ==========================================
// 3. CONDITIONS LOGIQUES D'ENTRÉE ET DE SORTIE
// ==========================================
// Filtre Macro : Tendance haussière à long terme
isMacroBullish = close > emaSlow

// Déclencheur : Croisement EMA rapide au-dessus de l'EMA moyenne
emaCrossOver = ta.crossover(emaFast, emaMedium)

// Filtre Momentum : RSI supérieur au seuil de force
isMomentumBullish = rsiVal > rsiFilterVal

// Condition globale d'achat (Long Entry)
longCondition = isMacroBullish and emaCrossOver and isMomentumBullish

// ==========================================
// 4. CALCULS DU TRADING DESK ET SIZING
// ==========================================
// Variables d'état pour capturer les prix de stop et cible à l'entrée
var float entryPrice = na
var float stopLossPrice = na
var float takeProfitPrice = na

// Calcul de la taille de position dynamique basée sur l'ATR
riskAmount = (strategy.equity * (riskPercent / 100))
stopLossDistance = atrVal * slMultiplier
positionSizeUnits = stopLossDistance > 0 ? (riskAmount / stopLossDistance) : na

// Convertir les unités en valeur cash pour TradingView
positionSizeCash = positionSizeUnits * close

if (longCondition and strategy.position_size == 0)
    entryPrice := close
    stopLossPrice := close - stopLossDistance
    takeProfitPrice := close + (atrVal * tpMultiplier)
    
    // Entrée en position longue avec calcul précis de la taille du lot
    strategy.entry("Desk Long", strategy.long, qty=positionSizeUnits)

// ==========================================
// 5. TRAILING STOP ET SÉCURISATION DU CAPITAL
// ==========================================
// Rehausser le stop loss à Break Even (équilibre) si le prix a progressé de 1.5x ATR
breakEvenTrigger = entryPrice + (atrVal * 1.5)

if (strategy.position_size > 0)
    if (high >= breakEvenTrigger)
        stopLossPrice := entryPrice  // Plus aucun risque financier sur la position

// Exécuter la sortie si l'une des bornes (TP ou SL) est touchée
if (strategy.position_size > 0)
    strategy.exit("Exit Long", "Desk Long", stop=stopLossPrice, limit=takeProfitPrice)

// ==========================================
// 6. VISUALISATION SUR LES GRAPHES (PLOT)
// ==========================================
// Tracer les moyennes mobiles sur le graphique des prix
plot(emaFast, color=color.blue, title="EMA Rapide (21)")
plot(emaMedium, color=color.orange, title="EMA Moyenne (50)")
plot(emaSlow, color=color.red, linewidth=2, title="EMA Macro (200)")

// Coloration des niveaux opérationnels du trade actif
plot(strategy.position_size > 0 ? stopLossPrice : na, color=color.red, style=plot.style_linebr, linewidth=1, title="Stop Loss Actif")
plot(strategy.position_size > 0 ? takeProfitPrice : na, color=color.green, style=plot.style_linebr, linewidth=1, title="Take Profit Actif")
```
