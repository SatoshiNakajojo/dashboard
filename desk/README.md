# Trading Desk — Hyperliquid

Desk de trading automatisé multi-agents. **Phases P0, P2, et le P1 hors
testnet** : ingestion de marché, moteur de risque, supervision, baselines
chiffrées sans IA, et la couche d'exécution — order manager, idempotence,
réconciliation — validée contre un faux exchange.

Aucun connecteur Hyperliquid réel : ce code ne signe rien et n'envoie aucun
ordre à un vrai exchange.

> **État au 5 septembre 2026.** Le P2 est franchi sur données réelles. Sur
> 208 jours de BTC en 1 h, aucune baseline n'a d'edge statistiquement
> démontré : ni contre zéro (t = 0,24), ni contre un modèle nul à entrées
> aléatoires (p = 0,15) — ce dernier étant nettement plus favorable à la
> stratégie que le premier. Ce n'est pas un blocage : c'est l'information que
> la phase devait produire. [Détail et chiffres](#résultat-du-p2--mesuré-pas-espéré).
>
> **Le P3 a tourné le même jour**, 30 cycles sur ce même historique, 135 appels
> à `claude-opus-5`, 4,01 $. **100 % de sorties structurées valides pour les
> cinq agents appelés** — le critère de fond est atteint partout. La porte
> reste néanmoins *indéterminée* pour l'Avocat du diable, qui n'a reçu que 15
> appels : il n'intervient que s'il existe un setup à attaquer, et la
> Stratégie s'est abstenue une fois sur deux. Il faudrait ~61 cycles pour le
> mesurer. [Détail et chiffres](#résultat-du-p3--la-qualité-est-là-le-coût-interroge).
>
> Le chiffre qui compte pour la suite n'est pas le taux, c'est le prix :
> **0,1335 $ le cycle complet, soit ~1 154 $/mois à 12 décisions/h.** Le P5
> exige de battre les baselines *net de ce montant*.

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
# Depuis un fichier collecté ailleurs (machine sans accès à l'API)
python scripts/fetch_candles.py --asset BTC --interval 1h --days 208
python -m trading_desk.backtest --source file --file BTC_1h_208d.json

# Ou directement, si la machine a accès à api.hyperliquid.xyz
python -m trading_desk.backtest --source hyperliquid --asset BTC --days 208
```

`candleSnapshot` ne conserve qu'environ **5000 bougies par intervalle** :
208 jours en 1 h, 833 jours en 4 h, treize ans en 1 j. Demander davantage ne
renvoie pas d'erreur — juste une série plus courte. Les deux outils le
signalent désormais explicitement.

Faire tourner le desk d'agents en mode fantôme (**la porte P3**) :

```bash
# Vérifier le câblage sans clé et sans dépenser un centime
python -m trading_desk.agents --dry-run --runs 30

# Vérifier la clé et le réseau par un seul appel (< 1 centime)
export DESK_ANTHROPIC_API_KEY="sk-ant-..."
python -m trading_desk.agents --check

# Pour de vrai, sur le marché réel, avec un plafond de dépense
python -m trading_desk.agents --file data/BTC_1h_real.json --runs 30 --budget-usd 5
```

**`DESK_ANTHROPIC_API_KEY`, et pas `ANTHROPIC_API_KEY`.** Cette dernière est un
nom réservé dans plusieurs environnements d'exécution — Claude Code sur le web
prévient d'ailleurs qu'elle ne servira pas à authentifier les sessions. Selon
la plateforme elle peut être ignorée, filtrée, ou porter une identité qui n'est
pas celle qu'on veut facturer. Un nom propre au projet supprime l'ambiguïté :
ce qu'on pose est ce qu'on utilise. Le repli sur `ANTHROPIC_API_KEY` reste,
parce que c'est ce qu'on pose spontanément sur sa propre machine.

Pour la même raison le point d'entrée est fixé explicitement à
`https://api.anthropic.com` plutôt qu'hérité de `ANTHROPIC_BASE_URL` : cette
variable est souvent posée par l'outil qui exécute le code et peut pointer vers
un relais qui lui appartient. `DESK_ANTHROPIC_BASE_URL` permet de le changer —
explicitement, avec une variable qui appartient au projet.

Aucun ordre n'est émis : le mandat produit est journalisé puis jeté. Le
plafond est porté par le client LLM lui-même, pas par l'appelant — aucun
chemin de code ne peut le contourner, et il est franchi d'au plus un appel
puisqu'on ne connaît le coût d'un appel qu'après l'avoir fait.

Lancer les tests :

```bash
python -m pytest tests -q        # 363 tests
```

---

## Ce qui existe aujourd'hui

| Module | Rôle |
|---|---|
| `contracts/mandate.py` | **Le mandat.** Bornage, péremption, resserrage monotone. |
| `agents/budget.py` | **Plafond de dépense**, porté par le client. Incontournable par construction. |
| `backtest/null_model.py` | **Le modèle nul.** Même profil de risque, entrées au hasard. |
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
| `execution/exchange.py` | L'interface d'exchange, et un simulateur qui sait tomber en panne. |
| `execution/order_manager.py` | Seul chemin vers l'exchange. Timeouts, stop obligatoire, sorties toujours permises. |
| `execution/reconciler.py` | Démarrage après crash : l'exchange est la source de vérité. |
| `execution/hyperliquid_format.py` | Règles de tick et de lot — la première cause de rejets d'ordres. |
| `execution/hyperliquid_wire.py` | Format filaire et signature EIP-712 (msgpack → keccak → agent fantôme). |
| `execution/hyperliquid_client.py` | Transport HTTP. Classe les pannes selon ce qu'il est **sûr** de renvoyer. |
| `agents/analyst.py` | Premier agent. Interprète des chiffres calculés, n'en produit aucun. |
| `agents/runner.py` | Politique d'abstention : deux tentatives, puis un aveu — jamais un défaut. |
| `agents/isolation.py` | Isolation des contenus externes (I11), et pourquoi elle ne suffit pas. |
| `agents/metrics.py` | Les trois chiffres de la porte P3. |
| `agents/roster.py` | L'équipe. Un rôle, un schéma fermé, un pouvoir borné. |
| `agents/graph.py` | Les portes déterministes qui empêchent le débat de converger vers l'action. |
| `agents/shadow_book.py` | Mesure ce que le desk **refuse** — filtre-t-il du bruit ou de l'alpha ? |
| `agents/postmortem.py` | La boucle d'apprentissage. Causes dans un ensemble **fermé**, donc comptables. |
| `agents/memory.py` | Les leçons des trades clos, rappelées devant l'agent qui propose. |

## Ce qui n'existe pas encore

Rien de structurant côté code : les phases P0 à P4 sont écrites. Ce qui manque
est ailleurs — **aucune porte n'est franchie**, faute de données réelles, de
clé API et de compte testnet. Le mode par défaut est `SHADOW`, et l'application **refuse de
démarrer** en `TESTNET` ou `LIVE` — non plus parce que la couche d'exécution
manque, mais parce que sa signature n'a jamais été confrontée à l'exchange.
Ce garde se lève délibérément, pas par oubli d'une variable d'environnement.

⚠️ **La signature n'a jamais été confrontée à l'exchange.** Les règles viennent
de la documentation ; les vecteurs de signature doivent être validés contre le
SDK officiel avant le premier ordre réel. C'est une tâche explicite de la
porte P1, pas un détail.

---

## Format d'ordre : là où se fabriquent les rejets

Trois règles, chacune capable de faire échouer un ordre parfaitement valide
par ailleurs, avec un message d'erreur laconique :

- **Prix** : au plus 5 chiffres significatifs *et* au plus `6 − szDecimals`
  décimales. Un entier échappe à la règle des significatifs — `123456` passe
  alors que `12345.6` est refusé.
- **Taille** : arrondie à `szDecimals`, **toujours vers le bas**. Vers le haut
  ferait dépasser le notionnel que le moteur de risque a autorisé.
- **Zéros terminaux interdits** : `0.500` est rejeté, `0.5` passe.

Le prix d'un ordre s'arrondit dans le sens *défavorable* à la position : un
arrondi en sa faveur produit un ordre qui ne se remplit pas.

### Quelles pannes sont sûres à renvoyer

Le client HTTP classe les erreurs selon une seule question : **est-ce que la
requête est partie ?**

| Panne | Erreur levée | Renvoi |
|---|---|---|
| DNS, connexion refusée, délai de connexion | `ExchangeError` | Sûr — jamais partie |
| Timeout de lecture, 5xx | `ExchangeTimeout` | **Interdit** — sort inconnu |
| 4xx, rejet explicite | `ExchangeRejected` | Sûr — l'ordre n'existe pas |

Les confondre dans un `except Exception` unique est exactement la façon dont
on double une position en production.

Un piège de plus : Hyperliquid renvoie `status: "ok"` au niveau enveloppe même
quand l'ordre lui-même est refusé. Le vrai résultat est dans
`response.data.statuses[0]`. S'y fier ferait croire à un succès sur un ordre
jamais créé — et le desk poserait un stop sur une position inexistante.

### Le premier agent, et ce qu'il n'a pas le droit de faire

L'Analyste lit un état de marché et formule une thèse. Il ne dimensionne rien,
ne décide rien, et **n'a aucun import vers `execution` ou `risk`** — un test
le vérifie sur le source, parce qu'une frontière tenue par une consigne de
prompt n'est pas une frontière.

**Tous les chiffres du prompt sont calculés en code.** L'agent interprète des
valeurs, il n'en produit aucune : on peut rejouer l'entrée exacte et vérifier
que le RSI valait bien 38,2.

**Deux tentatives, puis abstention.** Jamais de valeur par défaut : un
`FLAT` de repli serait un mensonge, puisqu'il se lirait comme une analyse.
Une abstention *choisie par le modèle* est en revanche une réponse valide —
et la métrique distingue les deux, sinon un agent qui échoue systématiquement
afficherait 100 % de sorties valides.

**Un refus du modèle ne se réessaie pas** et ne bascule pas silencieusement
vers un autre modèle : sur un desk, s'abstenir est acceptable, alors qu'un
changement de modèle en cours de décision brouillerait le journal. Les
*refusal fallbacks* côté serveur restent activables en une ligne si l'on
préfère l'autre compromis.

### Le graphe, et pourquoi il est construit contre lui-même

Le problème n'est pas d'enchaîner des agents : c'est d'**empêcher le débat de
converger vers l'action**. Les LLM sont complaisants. Six agents qui délibèrent
trouvent un consensus poli, et sans contre-force explicite on obtient une
machine qui propose un trade toutes les quinze minutes — le sur-trading étant
le mode de mort le plus courant d'un desk automatisé.

D'où des **portes déterministes**, évaluées en code entre les agents :

| Porte | Ferme quand |
|---|---|
| `QUOTA` | le plafond quotidien est atteint — vérifié avant le moindre appel |
| `LECTURE` | une lecture amont s'est abstenue : décider sur un trou est pire que ne pas décider |
| `PAS_DE_SETUP` | la stratégie n'a rien proposé |
| `VETO` | l'Avocat du diable oppose son veto — **ou s'abstient** : un silence n'est pas un feu vert |
| `OBJECTION` | l'objection dépasse le seuil de sévérité |
| `CONVICTION` / `ASYMETRIE` | seuils chiffrés sur le setup lui-même |
| `REJET_CHEF` | le Chef de desk rejette |

**FLAT est la sortie par défaut**, et chaque porte fermée arrête le cycle
immédiatement — pas seulement pour économiser des appels, mais parce
qu'appeler le Chef de desk sur un setup déjà invalidé, c'est lui donner
l'occasion de le sauver. L'Avocat du diable passe donc **avant** lui.

Les deux facteurs de réduction — Chef de desk et Risk Advisor — se
multiplient, et chacun est borné à `]0, 1]` par son schéma. Aucun agent n'a de
champ capable d'élargir quoi que ce soit.

### Le registre fantôme

Chaque setup **rejeté** est suivi comme s'il avait été pris, jusqu'à sa cible
ou son stop. Au bout de quelques semaines, on sait si la couche décisionnelle
filtre du bruit ou détruit de l'alpha — sans cette mesure, « le Chef de desk
sert-il à quelque chose » n'a que des réponses d'opinion.

Le registre suit aussi **où** les cycles meurent. Une porte qui ne filtre
jamais rien donne l'illusion d'un filtrage : le rapport la signale.

### La boucle d'apprentissage

Le Post-mortem regarde un trade clos, en tire une leçon, et l'écrit en
mémoire. Il n'a **aucun pouvoir sur le présent** — c'est simplement ce qui
fait que le desk du troisième mois n'est pas identique à celui du premier.

Deux détails font la différence entre une boucle d'apprentissage et un journal
de plus :

**La cause est choisie dans un ensemble fermé** (huit valeurs). Des causes en
texte libre ne se comptent pas ; avec un ensemble fermé, on découvre au bout
de trente trades que 40 % des sorties sont des stops balayés par le bruit — un
fait que trente paragraphes de prose n'auraient jamais fait apparaître.

**La mémoire est lue.** Les leçons remontent dans le prompt de la Stratégie,
au moment où elle propose, filtrées par actif *et par régime réellement
identifié*. Une mémoire qu'on écrit sans jamais la relire est du théâtre, et
un test vérifie que les leçons arrivent bien dans le prompt.

Pas d'embeddings, et c'est un choix : la question que le desk pose à sa
mémoire n'est pas sémantique mais structurée — « qu'est-ce qui s'est passé sur
CET actif, dans CE régime, dans CE sens ? ». C'est un filtre, et un `WHERE`
exact bat une approximation vectorielle sur ce genre de question. `pgvector`
reste la porte de sortie si le corpus grossit ; le protocole ne changerait pas.

### L'isolation des contenus externes, et ses limites

Trois défenses cumulées, dont une seule est structurelle :

1. Le contenu externe arrive dans un bloc balisé, précédé d'une consigne qui
   dit que c'est une donnée, jamais un ordre. *Mitigation.*
2. Les délimiteurs sont neutralisés, pour qu'un texte ne puisse pas fermer son
   propre bloc. *Mitigation.*
3. **Le schéma de sortie ferme la porte** : l'agent News ne peut produire
   qu'un score numérique. Même convaincu par une injection, il n'a aucun champ
   où écrire « achète ». *La seule vraie défense.*

Aucune ne rend l'injection impossible. Elles la rendent inoffensive, ce qui
est un objectif atteignable.

Côté signature, le piège est ailleurs : une action L1 n'est pas signée
directement. Elle est sérialisée en msgpack, on y concatène le nonce et un
marqueur de vault, on hache en keccak-256, et ce hash devient le
`connectionId` d'une structure appelée *agent fantôme* — c'est elle qu'on
signe. Le domaine utilise **chainId 1337**, quel que soit le réseau : signer
avec l'identifiant d'Arbitrum produit un `INVALID_SIGNATURE` sur une requête
impeccable.

---

## La couche d'exécution, et les pannes qu'elle encaisse

Toute la logique est écrite et testée contre `FakeExchange`, un simulateur qui
tombe en panne exprès. Seule la validation finale de la porte P1 — 200
aller-retours réels — exige un compte testnet.

**Le renvoi ne double jamais une position.** Le `cloid` est dérivé du contenu
de l'intention, horodatage exclu ; l'exchange déduplique. Deux requêtes, un
seul ordre.

**Un timeout n'est pas un échec.** Quand la réponse se perd, le sort de
l'ordre est *inconnu* : le manager va voir chez l'exchange avant toute
décision. `SubmitOutcome.unknown` est distinct de `accepted=False` pour rendre
la confusion impossible dans le code appelant.

**Une entrée sans stop n'existe pas.** Le stop part dans la foulée. S'il est
refusé, la position est fermée immédiatement — une position nue est plus
dangereuse qu'une opportunité manquée.

**Une position nue bloque tout.** Conséquence directe de I02, et vérifiée :
tant qu'une position n'a pas de stop côté exchange, aucun nouvel ordre ne
passe. La seule action possible est de la protéger ou de la solder.

**Après un crash, l'exchange a raison.** `reconcile_and_protect` lit l'état
réel avant toute décision, détecte les positions dont le desk n'a aucune trace,
et leur pose un stop de secours — placé à la distance *maximale* autorisée, pas
minimale : on ignore la thèse qui a ouvert cette position, un stop serré la
ferait sortir sur du bruit. C'est un filet, pas une gestion. Si le stop échoue,
la position est soldée. Si l'exchange est illisible, la réconciliation ne
converge pas et le desk reste inerte — mieux qu'un desk qui trade sur un état
supposé.

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

## Résultat du P2 — mesuré, pas espéré

BTC 1 h, 5002 barres, du 8 février au 4 septembre 2026 (208 jours), 1000 USDC
de capital, funding à 0,125 bps/h, frais et slippage Hyperliquid.

| stratégie | net | net % | brut | coûts | Sharpe | DD max | trades | t | verdict |
|---|---|---|---|---|---|---|---|---|---|
| buy_and_hold | +81,87 | +8,19 % | +144,72 | 62,85 | 0,53 | 31,35 % | 1 | — | échantillon |
| rsi_reversion | +11,76 | +1,18 % | +48,83 | 37,07 | 0,37 | 4,58 % | 129 | 0,24 | **indécis** |
| ema_cross | −14,12 | −1,41 % | +13,17 | 27,29 | −0,36 | 5,57 % | 77 | −0,29 | **indécis** |

Trois faits, dans l'ordre d'importance.

**1. Aucune baseline n'a d'edge démontrable.** `rsi_reversion` gagne +11,76 $ —
et son intervalle de confiance à 95 % est [−80 ; +106]. p = 0,81. Il y a 40 %
de chances que sa vraie espérance soit négative. À cet effet, il faudrait
~8700 trades pour trancher, soit environ **39 ans** au rythme observé. Ce
n'est pas une stratégie à affiner : c'est du bruit.

**2. Les coûts mangent l'essentiel du brut.** `rsi_reversion` produit +66,77 $
sans frictions et n'en garde que 11,76 : **82 % de l'edge brut part en frais,
slippage et funding**. `ema_cross` est gagnante brute (+24,11) et perdante
nette (−14,12) — le cas le plus courant, et celui qu'un backtest sans modèle
de coûts ne voit jamais.

**3. Détenir l'actif a mieux marché que le trader**, sur cette période :
+8,19 % contre +1,18 %. Au prix d'un drawdown de 31 % contre 4,6 %. C'est un
échantillon d'un seul régime — BTC a monté de 11 % sur ces 208 jours — donc
cela ne prouve rien non plus, mais cela interdit d'annoncer que les
stratégies actives « battent le marché ».

### Deux erreurs corrigées en produisant ces chiffres

**Le funding était 8× trop élevé.** `funding_bps_per_hour` valait 1,0 : le taux
Hyperliquid de 0,01 % **par 8 heures** pris pour un taux horaire. Effet :
0,24 %/jour de notionnel, ~50 % du capital sur 208 jours. Le buy-and-hold
affichait −35 % au lieu de +8 %. L'erreur ne pénalisait pas au hasard — elle
taxait à proportion de l'exposition, donc écrasait la référence et flattait les
stratégies peu exposées. **Une baseline artificiellement basse est le pire cas
de figure** : c'est celle que le desk doit battre au P5.

**Le rapport affichait un PnL sans intervalle de confiance.** C'est ce qui rend
l'erreur d'interprétation quasi automatique : « +11,76 $ » se lit comme un
résultat, « +11,76 $, IC 95 % [−80 ; +106] » se lit correctement du premier
coup d'œil. Le rapport calcule désormais t de Student *et* bootstrap — le
bootstrap fait foi quand les deux divergent, parce qu'il ne suppose rien de la
forme de la distribution, et qu'en trading quelques trades portent tout le
résultat.

### Le hasard aurait-il fait aussi bien ?

Le t de Student dit si un PnL est distinguable de zéro. Il ne dit pas d'où il
vient — et **zéro est rarement la bonne référence**. Deux forces déplacent le
résultat qu'on obtiendrait sans aucun signal : la dérive du marché, qui pousse
vers le haut toute stratégie à biais long quand le prix monte, et les coûts,
qui poussent vers le bas à proportion du nombre de trades.

`backtest/null_model.py` construit le contrefactuel : **même nombre de trades,
même mélange long/short, mêmes distances de stop et de cible tirées des propres
signaux de la stratégie, mêmes coûts, même moteur — entrées à des dates tirées
au hasard.** La seule chose que le hasard ignore, c'est *quand* entrer. Toute
la valeur d'un signal d'entrée est exactement cette différence.

| stratégie | observé | hasard (moy.) | p5 | p95 | percentile | p | verdict |
|---|---|---|---|---|---|---|---|
| rsi_reversion | +11,76 | −46,48 | −126,20 | +48,47 | 86 % | 0,149 | non distinguable |
| ema_cross | −14,12 | −34,70 | −110,95 | +49,89 | 66 % | 0,338 | non distinguable |

Le nuage du hasard est centré sur **−46 $** pour le profil de `rsi_reversion` :
sur cette période, entrer au hasard 129 fois avec ces stops fait perdre de
l'argent, parce que les coûts dominent la dérive. La stratégie fait donc
**58 $ de mieux que l'absence de signal**, ce que le simple « +11,76 $ »
masquait complètement.

Et pourtant : p = 0,149. L'écart n'est pas concluant, parce que la dispersion
du nuage est énorme ([−126 ; +48]). La lecture honnête est **suggestive, pas
démontrée** — et c'est une conclusion différente, et plus riche, que celle du
t de Student seul.

Un percentile élevé dit que le signal a fonctionné sur cet échantillon, pas
qu'il fonctionnera. La sur-optimisation produit exactement cette signature.

### Ce que ces chiffres ne disent pas

- **Un seul actif, un seul régime, 208 jours.** BTC a monté. Rien ici ne dit
  ce qui se passe en marché baissier ou en range prolongé.
- **Rien sur la couche cognitive.** Ce backtest ne teste que le déterministe :
  indicateurs, dimensionnement, stops, coûts. Les agents LLM ne peuvent pas
  être backtestés — un modèle entraîné jusqu'en 2026 connaît l'histoire de
  2025. Contamination structurelle, pas défaut d'implémentation. Seul le
  forward-test valide le P5.
- **Le funding est supposé constant.** Il oscille et change de signe. `--funding-bps`
  existe pour tester si la conclusion tient : entre 0 et 0,5 bps/h, le classement
  des deux stratégies ne bouge pas (+11,86 → +11,58) ; le buy-and-hold, lui, passe
  de +143 à −104. Toute conclusion qui l'implique est une conclusion sur le
  funding, pas sur la stratégie.

---

## Résultat du P3 — la qualité est là, le coût interroge

30 cycles sur `data/BTC_1h_real.json` (les mêmes 208 jours que le P2), fenêtres
de 300 barres réparties sur toute la période, `claude-opus-5` à effort moyen,
plafond 5 $. Le 5 septembre 2026.

| agent | appels | sorties valides | abstentions | coût/appel | p95 | porte |
|---|---:|---:|---:|---:|---:|---|
| `regime` | 30 | 100 % | 0 % | 0,0142 $ | 10,1 s | franchie |
| `quant` | 30 | 100 % | 0 % | 0,0316 $ | 20,2 s | franchie |
| `analyste` | 30 | 100 % | 0 % | 0,0211 $ | 10,8 s | franchie |
| `strategie` | 30 | 100 % | **50 %** | 0,0323 $ | 13,3 s | franchie |
| `avocat_du_diable` | **15** | 100 % | 0 % | 0,0688 $ | 45,0 s | *indéterminée* |

**135 appels, 4,01 $, 100 % de sorties structurées valides.** Le critère de
fond — « > 98 % » — est atteint par tous les agents appelés, sans exception.

**Pourquoi l'Avocat du diable n'a que 15 appels.** Le graphe est conditionnel :
il n'est appelé que s'il existe un setup à attaquer. Sur 30 cycles, la
Stratégie s'est abstenue 15 fois — ce que son prompt encourage explicitement
(« Ne rien proposer est la réponse par défaut »). L'arithmétique est exacte :
15 cycles `PAS_DE_SETUP`, 15 appels à l'Avocat. **Trente cycles ne font pas
trente appels pour un agent conditionnel**, et la porte confondait les deux.

C'était un défaut de l'outil de mesure, pas de l'agent. Le verdict affichait
« NON FRANCHIE — avocat_du_diable », ce qui se lit comme un manque de
fiabilité alors que sa qualité était de 100 %. La porte distingue désormais
`quality_passes` de `sample_is_sufficient`, n'échoue (code 1) que sur la
qualité, et dit combien de cycles il faudrait : **~61**.

### Le chiffre qui décidera du P5

Le coût par agent induit en erreur : additionner les extrapolations mensuelles
surestime ceux qui ne tournent pas à chaque tour. L'unité qui compte est le
**cycle de décision complet** :

```
0,1335 $ le cycle  →  ~1 154 $/mois à 12 décisions/h
                   →  ~96 $/mois à 1 décision/h
```

À rapprocher du P2 : sur ces mêmes 208 jours, la meilleure baseline produisait
**+66,77 $ brut** avant coûts, et rien de statistiquement démontrable après.
**Le desk doit donc battre les baselines de plus de mille dollars par mois
avant d'être rentable à cadence nominale.** C'est la cadence, pas la qualité
des agents, qui est le premier levier — et c'est exactement ce que le P3
devait faire apparaître avant le P5.

### Deux bugs bloquants trouvés en franchissant la porte

**Le socle `AgentOutput` partait dans le schéma de sortie.** Ses huit champs
d'enveloppe — dont `cost_usd`, `latency_ms`, `model_id`, que le runner écrase
juste après l'appel — étaient demandés au modèle. On demandait donc à chaque
agent d'inventer son propre coût et sa propre latence, les deux chiffres mêmes
que cette porte doit établir honnêtement. Et le décodage contraint compile le
schéma en automate : mesuré contre l'API, **douze champs optionnels passent,
treize non**. Le socle poussait quatre agents au-delà — ils recevaient un
`400 Schema is too complex` à chaque appel.

**Les bornes `max_length` n'étaient dites nulle part.** Le décodage contraint
garantit la forme, pas les longueurs. L'analyste écrivait une thèse de longueur
naturelle, Pydantic la rejetait à 600 caractères, deux fois, abstention — à
chaque cycle. Les bornes sont maintenant lues dans le schéma et annoncées au
modèle, plutôt que recopiées dans un prompt qui mentirait à la première
modification d'un `Field`.

Aucun des deux n'était visible en test : la suite dépensait à la place. Le test
« sans clé » retirait `ANTHROPIC_API_KEY` et `ANTHROPIC_AUTH_TOKEN` mais pas
`DESK_ANTHROPIC_API_KEY`, ajoutée depuis — sur une machine où la clé du projet
est posée, il partait faire trente cycles facturés, et le seul symptôme était
une suite lente. Une fixture `autouse` isole désormais toute la suite.

---

## Roadmap

| | Phase | Porte de sortie |
|---|---|---|
| P0 ✓ | Fondations et ingestion | 72 h sans intervention, aucun trou de données |
| P1 | Cœur d'exécution déterministe | 200 aller-retours testnet sans divergence ; kill switch < 5 s |
| P2 ✓ | Features, backtest, **baseline sans IA** | Chiffres de référence publiés et rejouables — *franchie, et le résultat est négatif : voir ci-dessous* |
| P3 ~ | Premier agent, en mode fantôme | > 98 % de sorties structurées valides sur ≥ 30 appels ; coût connu — *mesuré le 5 sept. : 100 % de sorties valides, 0,1335 $/cycle ; indéterminé pour l'Avocat du diable (15 appels sur 30 requis)* |
| **P4** | Graphe complet, toujours fantôme | 2 semaines sans mandat violant un invariant |
| P5 | Paper trading temps réel | **Bat les baselines net de tous les coûts, LLM inclus, sur 4 semaines** |
| P6 | Live micro-capital (200–500 USDC) | 4 semaines sans intervention d'urgence |
| P7 | Montée en charge | Tout palier de capital est réversible |

La porte P5 est celle qu'il faut refuser de franchir. Si le desk multi-agents
ne bat pas un croisement de moyennes mobiles, il ne faut pas passer en live —
il faut itérer.

**Le P2 ajoute une condition qui n'était pas prévue.** Les baselines mesurées
sur données réelles ne sont pas seulement modestes : elles sont statistiquement
nulles (détail plus bas). Battre une référence qui vaut zéro ne prouve rien.
Le P5 doit donc démontrer un edge **distinguable de zéro** — pas un PnL
supérieur à celui d'une baseline qui n'en a pas.

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
