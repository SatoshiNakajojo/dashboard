# Grok Strategy Department (GSD)

Département autonome du trading desk : wallet Hyperliquid dédié, agent Grok existant, gates J0–J2, coupe des perdants.

**Ce dossier ne remplace pas le desk.** Branche `gsd` — le `main` du cockpit HTML reste intact.

## Secrets (hors git)

Copier `.env.example` → `deploy/vps/.env` **uniquement sur le VPS**.

| Variable | Rôle |
|---|---|
| `XAI_API_KEY` | Appels Grok |
| `HL_AGENT_KEY` | Clé API agent Hyperliquid (64 hex) |
| `HL_MASTER` | Adresse du wallet du département |
| `GSD_ACCESS_PIN` | PIN d’accès web |

Jamais ces valeurs dans le repo.

## VPS

```bash
cd gsd
sudo docker compose -f deploy/vps/compose.yml up -d --build
```

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
