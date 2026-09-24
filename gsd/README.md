# Grok Strategy Department (GSD)

Département autonome du trading desk : wallet Hyperliquid dédié, agent Grok existant, gates J0–J2, coupe des perdants.

**Ce dossier ne remplace pas le desk.** Branche `gsd` — le `main` du cockpit HTML reste intact.

## Secrets (hors git)

Copier `.env.example` → `deploy/vps/.env` **uniquement sur le VPS**.

| Variable | Rôle |
|---|---|
| `TYPESAFE_AI_API_KEY` | Avis de Jev en ombre, ancienne stratégie seulement (facultatif) |
| `HL_AGENT_KEY` | Clé API agent Hyperliquid (64 hex) |
| `HL_MASTER` | Adresse du wallet du département |
| `GSD_ACCESS_PIN` | PIN d’accès web |

Jamais ces valeurs dans le repo.

## VPS

```bash
cd gsd
sudo docker compose -f deploy/vps/compose.yml up -d --build
```

## Stratégie active : la règle BTC 25/10

BTC seul, en journalier. Achat au plus haut des 25 derniers jours, sortie au
plus bas des 10 derniers jours, tout le compte, sans levier, à plat le reste
du temps. Proposée par Grok, testée dans `research/grok-btc` : son timing bat
le hasard hors échantillon (2013–2020, p = 0,0004), mais 25/10 est le meilleur
réglage de la période où il a été choisi. C'est une façon de détenir du BTC
pendant ses tendances : elle ne gagne que si le BTC monte.

- `src/lib/desk/btc-rule.ts` rejoue la règle sur tout l'historique journalier
  d'Hyperliquid et dit quels ordres le compte doit porter. Module pur, testé ;
  `research/grok-btc/parite.ts` vérifie qu'il retrouve les 37 trades de la
  recherche un à un.
- `src/lib/desk/btc-rule.server.ts` aligne le compte à chaque passage, **au
  comptant** : la paire UBTC/USDC d'Hyperliquid, sans funding. Joué sur les
  perps, le funding a coûté 19 % du capital en 2,7 ans — à peu près toute
  l'avance de la règle (`research/grok-btc/attentes.py`).
- Pas d'ordre stop au repos au comptant : le pilote vérifie les deux niveaux
  chaque minute et relance un passage dès que le BTC en franchit un ; le
  passage relit les bougies et achète ou vend au marché. Au comptant, il n'y a
  pas de liquidation : si le bot tombait, la sortie serait retardée, pas pire.
- Une position BTC en perp — l'exécution d'avant — est refermée au premier
  passage, ses ordres annulés, puis rachetée au comptant.
- Le filet et la gestion de l'ancienne stratégie ne touchent pas au BTC :
  calibrés sur 1 % de risque par trade, ils couperaient la position dès −1,5 %.
- Aucun LLM n'intervient : la règle décide tout. En mode règle BTC, Jev n'est
  pas appelé.

L'ancienne stratégie reste disponible dans **Réglages → Stratégie**.
**La règle n'agit qu'en mode autonome, ou d'un clic sur « Lancer ».**

## Décisions, Jev et Grok

L'onglet **Décisions** montre chaque décision du bot telle qu'elle a été
prise, lue dans `decisions.jsonl` (dossier `GSD_DATA_DIR`) et sur le compte
Hyperliquid : régime, signal, limites, famille, avis de Jev, ordre, gestion,
revue, filet. Les coûts affichés sont les sommes facturées, appel par appel
(`spend.json`) — jamais un tarif multiplié par un compteur.

**Grok n'est plus appelé.** Il intervenait à trois endroits :

| endroit | ce que Grok faisait | ce qui le remplace |
|---|---|---|
| cycle, à chaque signal | justification et horizon de détention — qu'aucune règle de sortie ne lisait | rien : l'horizon affiché est le time-stop réel |
| J2, après J1 | vote d'ombre d'un « comité » de six agents | Jev : prendre ? famille ? taille ? — ombre |
| revue du book | coupait ou réduisait des positions, appliqué | Jev : garder, réduire, couper — **ombre** |

Les avis de Jev sont **inscrits, jamais appliqués** (`COMMITTEE_CFG`,
`REVIEW_CFG.apply`). Le contrôle du risque reste le stop posé chez l'exchange
et les règles de `manage.server.ts`. On ne leur donnera la main que si le
journal montre qu'ils évitent des pertes. Sans `TYPESAFE_AI_API_KEY`, J2 passe
en repli local et la revue est sautée ; le bot trade exactement pareil.

Les réglages « appels / heure » et « $ / jour » du cockpit bornent Jev.

## Politique de risque

Toutes les constantes sont dans `src/lib/desk/bot.ts`, et le calcul qui les
consomme est isolé dans `src/lib/desk/sizing.ts` — module pur, sans SDK
exchange, couvert par `sizing.test.ts`.

**La taille d'une position descend du risque et de la distance au stop :**

```
notionnel = (GSD_RISK_PCT × équité) ÷ (distance au stop ÷ prix d'entrée)
```

puis bornée par quatre plafonds — position, livre, marge, plafond absolu. Le
journal nomme celui qui a mordu (`taille bridée par « marge »`). Conséquence :
un signal dont le stop est à 12 % reçoit une position quatre fois plus petite
qu'un signal dont le stop est à 3 %, et les deux risquent le même montant.

| Constante | Défaut | Rôle |
|---|---:|---|
| `GSD_RISK_PCT` | 1 % | de l'équité risquée par trade — la seule qui *détermine* une taille |
| `GSD_MAX_SLOT_PCT` | 50 % | notionnel maximal d'une position |
| `GSD_MAX_BOOK_PCT` | 150 % | notionnel maximal du livre entier |
| `GSD_MARGIN_RESERVE_PCT` | 30 % | part de la marge libre jamais engagée |
| `GSD_MIN_STOP_FRAC` / `GSD_MAX_STOP_FRAC` | 0,5 % / 15 % | hors de cette bande, le signal est **refusé** |
| `GSD_BACKSTOP_R` | 1,5 R | perte au-delà de laquelle on considère que le stop a échoué |
| `GSD_TIME_STOP_H` | 24 h | âge au-delà duquel une position sans gain est rendue |

**L'équité n'est pas `accountValue`.** Sur ce compte le collatéral vit en USDC
spot : `clearinghouseState.marginSummary.accountValue` ne vaut que la marge
immobilisée — relevé à **0,32 $** le 22/09 quand le capital réel était de
**47,08 $**. `classifyHl` lit donc `perp + spot libre`, et jamais le spot
retenu en plus du perp, qui serait le même collatéral compté deux fois.
`scripts/panic-flat.mjs` affiche les trois chiffres séparément.

**Le contrôle du risque est le stop posé chez l'exchange.** `flattenLosers` et
`manageOpens` ne sont qu'un filet : ils ne coupent que sur un changement de
thèse (Supertrend contre la position), un kill-switch, ou une perte au-delà du
budget. Jamais sur du bruit de marché.

> **Le compte doit suivre.** À 1 % de risque et un stop à 5 %, une position
> pèse 20 % de l'équité en notionnel. Sous ~500 $ de capital, le minimum
> d'ordre Hyperliquid (10 $) ne laisse plus la place à plus d'une ou deux
> positions correctement dimensionnées — quel que soit le réglage.

## Remettre le compte à plat

```bash
# constat seul, rien n'est envoyé
sudo docker compose -f deploy/vps/compose.yml exec gsd node scripts/panic-flat.mjs

# annule tous les ordres au repos et solde toutes les positions
sudo docker compose -f deploy/vps/compose.yml exec gsd node scripts/panic-flat.mjs --go

# n'annule que les ordres, laisse les positions
sudo docker compose -f deploy/vps/compose.yml exec gsd node scripts/panic-flat.mjs --go --orders-only
```

Le script affiche, pour chaque ordre au repos, son rapport à la position
réelle — c'est ce rapport qui avait atteint 415× en production.
