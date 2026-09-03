# Trading Desk — Hyperliquid

Desk de trading automatisé multi-agents. **Phases P0 et P2** : ingestion de
marché, moteur de risque, supervision, et les baselines chiffrées sans IA.
Aucune couche d'exécution — ce code ne signe rien et n'envoie aucun ordre.

---

## Le principe : une architecture à deux vitesses

```
  couche cognitive (LLM, 1–15 min)
        ↓  MANDAT  (objet borné, périssable, sans prose)
  moteur de risque (code, 12 invariants, droit de veto absolu)
        ↓
  couche déterministe (asyncio, 1–50 ms)
        ↓
  Hyperliquid — source de vérité
```

Les agents ne décident jamais d'un trade. Ils émettent un **mandat** : un objet
Pydantic strict qui dit ce que l'exécution a le droit de faire, avec une date
d'expiration. La couche déterministe n'a le droit de faire que ce que le
mandat autorise, et rien d'autre.

Trois conséquences, qui sont les seules choses à retenir de ce dépôt :

1. **Aucun LLM n'est dans le chemin critique.** Un débat entre agents coûte
   des dizaines de secondes ; un bloc Hyperliquid tombe en dizaines de
   millisecondes. Les deux cadences ne peuvent pas partager une boucle.
2. **Le risque n'est pas un agent.** Les limites dures sont du code testé.
   L'agent conseiller ne peut que *resserrer* — les facteurs consultatifs sont
   bornés à `]0, 1]` et appliqués par `min()`, jamais `max()`.
3. **Un contrôle qui ne peut pas être évalué est un contrôle en échec.**
   L'ignorance ne s'interprète jamais favorablement.

---

## Démarrer en une minute

```bash
cd desk
pip install -e ".[dev]"          # ou : uv sync
python -m trading_desk --demo    # marché simulé, sans réseau
```

Puis ouvrir <http://127.0.0.1:8787>. L'écran montre l'état des douze
invariants, le mandat en vigueur, la fraîcheur des flux et un kill switch.

Pour ingérer le vrai marché (testnet, toujours en lecture seule) :

```bash
cp .env.example .env
python -m trading_desk
```

Produire les baselines (**la référence du P2**) :

```bash
python -m trading_desk.backtest --source hyperliquid --asset BTC --days 365
```

Lancer les tests :

```bash
python -m pytest tests -q        # 142 tests
```

---

## Ce qui existe aujourd'hui

| Module | Rôle |
|---|---|
| `contracts/mandate.py` | **Le mandat.** Bornage, péremption, resserrage monotone. |
| `contracts/signals.py` | Un schéma fermé par agent. L'abstention est une réponse valide. |
| `risk/engine.py` | Les douze invariants. Aucune dépendance vers un LLM. |
| `risk/sizing.py` | Taille déduite du risque et de la distance de stop, jamais de la conviction. |
| `execution/cloid.py` | Identifiant d'ordre déterministe → un renvoi ne double pas la position. |
| `execution/nonce.py` | Nonces monotones, fenêtre temporelle, compteur atomique partagé. |
| `market/hyperliquid_ws.py` | Ingestion WebSocket, heartbeat, détection de flux gelé. |
| `market/budget.py` | Suivi des trois limites de débit Hyperliquid. |
| `storage/sqlite_store.py` | Persistance + journal de décisions **append-only**. |
| `api/` + `ui/` | Supervision, SSE, kill switch. |
| `features/indicators.py` | RSI, EMA, MACD, ATR, z-score, Donchian — écrits à la main, conventions explicites. |
| `features/bars.py` | Bougies. Les trous ne sont **pas** comblés : un trou doit rester visible. |
| `backtest/engine.py` | Backtest événementiel qui **réutilise `size_position` du live**. |
| `backtest/costs.py` | Frais, funding, slippage — présents dès le premier run. |
| `backtest/strategies.py` | Les baselines sans IA : croisement d'EMA, retour à la moyenne RSI. |

## Ce qui n'existe pas encore

Signature et envoi d'ordres, réconciliation avec l'exchange, agents LLM. Le
mode par défaut est `SHADOW`, et l'application **refuse de démarrer** en
`TESTNET` ou `LIVE` tant que la couche d'exécution n'est pas écrite (porte P1).

---

## Le backtest, et pourquoi il ne triche pas

Un backtest optimiste est plus dangereux qu'aucun backtest : il produit un
chiffre auquel on finit par croire. Quatre choix de prudence, chacun couvert
par un test :

1. **Entrée à l'ouverture de la barre suivante.** Une décision prise sur la
   clôture de la barre `i` ne peut pas s'exécuter à cette même clôture.
2. **Le stop l'emporte sur la cible** quand une barre contient les deux : on
   ignore l'ordre réel des ticks, donc on suppose le pire.
3. **Les gaps sont servis au gap**, pas au niveau du stop. C'est là que les
   pertes réelles dépassent les pertes théoriques.
4. **Le funding se paie à chaque barre détenue.**

Le moteur appelle `size_position` et `RiskLimits` — les objets du live, pas
une copie. Une stratégie testée ici est dimensionnée comme elle le serait en
production.

`buy_and_hold` a son propre chemin de code (`benchmark_buy_and_hold`) et
**aucun stop** : le faire passer par le moteur de stratégies lui en imposerait
un, il sortirait à la première secousse, et la référence serait silencieusement
fausse — un benchmark cassé flatte tout ce qu'on lui compare.

### La limite à connaître

Le funding est supposé **constant**. C'est la simplification la plus forte du
modèle, et elle décide du verdict : sur une même série, `buy_and_hold` passe de
`+70` à `−420` USD selon qu'on suppose 0 ou 2 bps/heure. Tester la sensibilité
avant de conclure :

```bash
python -m trading_desk.backtest --source hyperliquid --funding-bps 0
python -m trading_desk.backtest --source hyperliquid --funding-bps 2
```

La correction propre est de rejouer le funding réellement observé depuis la
table `marks` que remplit le P0.

---

## Les douze invariants

Ils sont évalués en continu, pas seulement avant un ordre. L'interface montre
lequel bloque.

| | Invariant |
|---|---|
| I01 | Aucun ordre avant convergence de la réconciliation |
| I02 | Toute position ouverte a un stop actif **côté exchange** |
| I03 | La perte du jour reste sous la limite d'équité |
| I04 | Notionnel, levier effectif et marge plafonnés |
| I05 | Aucun agent ne peut élargir une borne de risque |
| I06 | Mandat valide, non expiré, et qui autorise cet actif et ce sens |
| I07 | Débit d'ordres et quota de mandats sous les plafonds |
| I08 | Tout ordre porte un `cloid` déterministe |
| I09 | Flux frais, horloge synchrone, prix non divergents |
| I10 | Kill switch joignable |
| I11 | Contenus externes isolés des instructions |
| I12 | Signer isolé : agent wallet, sans droit de retrait |

Un échec sur I01, I02, I03, I07 ou I09 ne refuse pas seulement un ordre : il
**arrête le desk**. Les sorties de position, elles, restent toujours
autorisées — un système qui s'interdit de réduire son risque au pire moment
est plus dangereux que le problème qu'il évite.

---

## Sécurité opérationnelle

**Clés.** Hyperliquid permet à un *master wallet* d'approuver un *agent
wallet* qui peut trader mais **ne peut pas retirer**. Seul l'agent wallet
touche la machine. Le master signe l'approbation hors ligne, idéalement depuis
un hardware wallet. Un agent wallet distinct par stratégie. Ne jamais
réutiliser une adresse d'agent après l'avoir désenregistrée : l'état de nonce
est purgé et d'anciennes actions signées redeviennent rejouables.

**Nonces.** L'exchange conserve les 100 nonces les plus élevés par signer ;
un nouveau nonce doit dépasser le plus petit de cet ensemble et tomber dans
`(T−2j, T+1j)`. `int(time.time()*1000)` casse dès que deux workers signent
dans la même milliseconde — d'où `MonotonicNonceSource`. `chrony` est
obligatoire sur le VPS.

**Débit.** Trois limites se superposent : poids par IP et par minute sur
l'API Info, requêtes par wallet sur l'API Exchange, et une réserve par adresse
indexée sur le volume tradé. Un compte neuf qui interroge l'API en boucle
épuise sa réserve avant d'avoir tradé. WebSocket d'abord, polling jamais.

**Supervision.** Le serveur écoute sur `127.0.0.1`. Il peut arrêter le desk :
ne jamais publier ce port. Depuis un téléphone, tunnel SSH.

**Contenus externes.** Les news, posts et réponses d'API sont des *données*,
jamais des instructions. L'agent News ne peut produire qu'un score numérique —
le schéma ne lui permet pas d'exprimer une recommandation.

---

## Roadmap

| | Phase | Porte de sortie |
|---|---|---|
| P0 ✓ | Fondations et ingestion | 72 h sans intervention, aucun trou de données |
| P1 | Cœur d'exécution déterministe | 200 aller-retours testnet sans divergence ; kill switch < 5 s |
| **P2** | Features, backtest, **baseline sans IA** | Chiffres de référence publiés et rejouables |
| P3 | Premier agent, en mode fantôme | > 98 % de sorties structurées valides ; coût connu |
| P4 | Graphe complet, toujours fantôme | 2 semaines sans mandat violant un invariant |
| P5 | Paper trading temps réel | **Bat les baselines net de tous les coûts, LLM inclus, sur 4 semaines** |
| P6 | Live micro-capital (200–500 USDC) | 4 semaines sans intervention d'urgence |
| P7 | Montée en charge | Tout palier de capital est réversible |

La porte P5 est celle qu'il faut refuser de franchir. Si le desk multi-agents
ne bat pas un croisement de moyennes mobiles, il ne faut pas passer en live —
il faut itérer.

---

## Avertissement

La grande majorité des desks automatisés de ce type perdent de l'argent, et un
système multi-agents n'y change rien par lui-même. L'IA traite du contexte ;
elle ne prédit pas les prix. Ce que ce projet a de solide, c'est
l'infrastructure, la discipline de risque et le journal qui permet d'apprendre
de chaque décision.

Plafonner le capital à ce qu'on peut perdre entièrement. Vérifier les
conditions d'utilisation d'Hyperliquid pour sa juridiction avant le premier
trade réel. Chaque fill est un événement fiscal : l'export existe dès le P1,
s'en servir.
