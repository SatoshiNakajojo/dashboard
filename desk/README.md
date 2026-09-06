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
> **Walk-forward, 5 septembre 2026 — le dernier survivant tombe.** `tsmom` sur
> BTC daily rendait +1,0 %/an hors échantillon sur 20 passes, que son lookback
> soit optimisé (WFE 26,7 %) ou figé au paramètre documenté (WFE 47,1 %).
> L'OOS est identique dans les deux cas : optimiser ne rapporte rien devant,
> ça n'enfle que l'in-sample de 64 %. Or la couche LLM à une décision par jour
> coûte ~3,4 %/an du capital. **Elle coûte trois fois ce que la meilleure
> stratégie rapporte hors échantillon.**
>
> Le chiffre qui compte pour la suite n'est pas le taux, c'est le prix :
> **0,1335 $ le cycle complet, soit ~1 154 $/mois à 12 décisions/h** (~68 $/mois
> à 1/h, ~2,85 $/mois à une décision par jour). Le P5 exige de battre les
> baselines *net de ce montant*. Sur 7 actifs en daily, la meilleure baseline
> nette +46 $/mois et la couche LLM à une décision par jour et par actif coûte
> ~20 $/mois — soit **43 % du net**. Lourd, mais pas disqualifiant : le verrou
> n'est pas le coût, c'est l'absence d'edge démontrable.
>
> **Le daily a été ouvert le même jour** : six ans de BTC en 1 j (2 209 barres)
> et deux stratégies documentées — cassure Turtle, momentum temporel. Aucune ne
> se distingue d'entrées aléatoires ; `rsi_reversion` est un perdant établi.
> Le backtest rejetait au passage 86 à 100 % des signaux en silence.
> [Détail et chiffres](#résultat-du-daily--les-stratégies-publiées-ne-survivent-pas-non-plus).

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
208 jours en 1 h, 833 jours en 4 h, six ans en 1 j. Demander davantage ne
renvoie pas d'erreur — juste une série plus courte. Les deux outils le
signalent désormais explicitement.

**C'est pourquoi `data/` est versionné.** Ces séries sont périssables : la
fenêtre glisse, et l'historique qui en sort n'est plus récupérable auprès de
l'API. Dans un an, personne ne pourra refetcher le BTC daily de 2020. Les
8 Mo de JSON ne sont pas de l'encombrement — ce sont les seules données qui
rendent les baselines rejouables, et donc la seule chose qui empêche la
référence du P5 de devenir invérifiable.

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
python -m pytest tests -q        # 372 tests
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
| `backtest/strategies.py` | Les baselines sans IA : croisement d'EMA, retour à la moyenne RSI, **cassure Turtle**, **momentum temporel**. |
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

## Résultat du daily — les stratégies publiées ne survivent pas non plus

Le P2 tournait sur 208 jours de BTC en 1 h, la limite de `candleSnapshot` à
cet intervalle. En 1 j la même API conserve **2 209 barres, soit six ans**
(19 août 2020 → 5 septembre 2026) — c'est le rétablissement de l'accès réseau
qui l'a rendu récupérable. Deux stratégies documentées ont été ajoutées et
testées sur cet historique :

- **`turtle_breakout`** — le « Système 2 » des Turtles (Dennis & Eckhardt,
  1983) : entrée sur cassure du canal Donchian 55, sortie sur cassure opposée
  du canal 20, stop à 2N. Le Système 2 plutôt que le Système 1 parce qu'il n'a
  pas la règle de saut, qui ferait dépendre le backtest de son propre
  historique.
- **`tsmom`** — momentum temporel, la règle de Moskowitz, Ooi & Pedersen
  (2012), confirmée sur BTC/ETH/XRP par Liu & Tsyvinski (2018, 2021) sur des
  horizons d'une à quatre semaines. Le signal est le signe du rendement passé.
  Rien d'autre : ni seuil, ni filtre, ni paramètre ajusté sur ces données.

### Ce que le backtest a d'abord répondu — et pourquoi c'était faux

| stratégie | net | trades | **rejets** | expo | verdict initial |
|---|---:|---:|---:|---:|---|
| `turtle_breakout` | +22,35 | 4 | **110** | 3 % | *« BAT LE HASARD, p = 0,010 »* |
| `tsmom` | +0,00 | 0 | **2 040** | 0 % | *absent du tableau* |

Le moteur de risque refuse toute distance de stop hors de
`[min_stop_distance_bps, max_stop_distance_bps]`, et le plafond par défaut est
de **500 bps** — calibré pour l'intraday. Or un stop ATR en daily vaut 800 à
1 230 bps : **86 à 100 % des signaux étaient rejetés en silence.** Le rapport
affichait « 0 trades » sans dire pourquoi.

Les rares trades survivants n'étaient pas un échantillon aléatoire : le
plafond porte sur la distance de stop, donc sur la volatilité. Le backtest ne
mesurait que **les moments les plus calmes**. C'est ainsi qu'une non-edge
s'affichait au percentile 100 avec p = 0,010.

Le compteur `rejected_by_risk` existait dans `BacktestResult` et était
correctement alimenté — il n'était simplement **jamais affiché**. Il l'est
désormais, avec une alerte dès qu'il dépasse le nombre de trades, et
`--max-stop-bps` rend le plafond réglable au lieu d'être un blocage invisible.

### Ce que le backtest répond une fois les signaux admis

BTC 1 j, 2 209 barres, 1000 USDC, `--max-stop-bps 2500` :

| stratégie | net | net % | Sharpe | DD max | trades | expo | vs hasard | p |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| `buy_and_hold` | +5 640,25 | +564 % | 0,82 | 80,0 % | 1 | 98 % | — | — |
| `turtle_breakout` | +254,14 | +25,4 % | 0,64 | 10,4 % | 29 | 58 % | **non distinguable** | 0,48 |
| `tsmom` | +36,36 | +3,6 % | 0,23 | 4,9 % | 33 | 89 % | **non distinguable** | 0,71 |
| `ema_cross` | +25,81 | +2,6 % | 0,31 | 3,8 % | 33 | 20 % | **non distinguable** | 0,20 |
| `rsi_reversion` | −87,27 | −8,7 % | −0,98 | 8,9 % | 73 | 33 % | **pire que le hasard** | 0,96 |

`turtle_breakout` est dix fois meilleure que l'ancienne meilleure baseline, et
sa perte maximale est huit fois plus faible que celle du buy-and-hold. Mais le
modèle nul est sans appel : **des entrées tirées au hasard, à profil de risque
et exposition identiques, rapportent +231,98 en moyenne contre +254,14
observés.** Percentile 52. Le gain vient de la dérive du marché et du temps
passé exposé, pas du signal de cassure.

`rsi_reversion`, elle, est désormais un perdant statistiquement établi
(p = 0,01, IC 95 % entièrement négatif) — sur les 208 jours en 1 h elle était
seulement « indécise ».

**Aucune des quatre baselines, y compris les deux tirées de la littérature,
ne démontre d'edge sur BTC daily 2020-2026.** Le buy-and-hold les écrase
toutes en absolu, à un coût : 80 % de perte maximale.

> `--max-stop-bps 2500` sert à *mesurer* les stratégies daily, pas à
> recommander un stop de 25 % en production. Élargir le plafond en live est
> une décision de risque, distincte de celle de pouvoir tester.

---

## Grille de robustesse — un seul survivant sur cinquante-six

`scripts/robustness_grid.py` fait tourner les quatre baselines sur sept actifs
(BTC, ETH, SOL, BNB, XRP, DOGE, AVAX) et deux intervalles, chaque cellule avec
son modèle nul à 2000 tirages. Horizons convertis à l'échelle de temps,
plafond de stop identique partout, **zéro rejet**.

```
  cellules testees                            56
  p < 0.05 brut                               14
  attendues par pur hasard a 5%              2.8
  survivantes apres Benjamini-Hochberg         1

    tsmom  BTC 1d  net +244.89  142 trades  p 0.0005

  Significativement PIRES que le hasard : 6 cellules
    rsi_reversion      6 cellules
```

**Le résultat de fond n'a pas changé : aucun edge robuste.** Un signal qui
survit sur exactement une cellule sur quatorze est la définition de la
non-robustesse, et cette grille a été recalculée quatre fois avec des
spécifications différentes — les degrés de liberté du chercheur sont réels et
doivent être comptés.

Le signal le plus **constant** de toute la grille pointe dans l'autre sens :
`rsi_reversion` est significativement pire que le hasard dans six cellules, et
perd 501 $ *avant tout coût* sur les sept actifs en daily. Le retour à la
moyenne n'est pas une bonne stratégie abîmée par les frais.

### Le contrefactuel a d'abord donné huit survivants — c'était un artefact

Avec la première version du modèle nul, la grille annonçait **huit** cellules
survivant à Benjamini-Hochberg. Le contrefactuel promettait de garder « tout
de la stratégie sauf le moment où elle entre » ; il n'en gardait pas les
sorties. Les quatre stratégies sortent sur signal, le bras aléatoire ne
pouvait sortir qu'au stop, et ses positions tenaient **1,4 à 6,7 fois plus
longtemps**. Cas limite mesuré sur série synthétique : sans durée imitée, le
hasard produit **un seul trade tenu 546 barres**.

Une stratégie qui coupe vite paraissait donc brillante face à un
contrefactuel qui encaissait toutes les reprises. Corrigé :

| cellule | ancien p | corrigé |
|---|---:|---:|
| `ETH 4h turtle_breakout` | 0,0005 | 0,0598 |
| `DOGE 4h tsmom` | 0,0010 | 0,0133 |

### L'hypothèse pré-enregistrée mérite d'être lue à part

Liu & Tsyvinski portent spécifiquement sur **BTC, ETH et XRP**, à un horizon
d'une à quatre semaines. Ce n'est pas une cellule trouvée en fouillant :

| actif | 1 j | 4 h |
|---|---:|---:|
| BTC | **p 0,0005** | 0,34 |
| ETH | 0,0475 | 0,085 |
| XRP | 0,077 | 0,043 |

Cinq des six cellules sont positives en PnL, trois sont sous 0,05, et la
direction est constante. Mais **ces trois actifs sont fortement corrélés** :
ce ne sont pas trois confirmations indépendantes, et une méthode de
combinaison qui suppose l'indépendance surestimerait la significativité.
Suggestif, pas établi.

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


---

## Baisser le coût de décision : mesuré, pas estimé

Trois politiques de modèles sur **les mêmes 10 fenêtres** de
`data/BTC_1h_real.json`, effort moyen. Mesure du 5 septembre 2026, 2,45 $
au total.

| politique | $/cycle | vs uniforme | sorties valides | étapes atteintes |
|---|---:|---:|---:|---|
| `uniforme` (tout Opus 5) | 0,1123 | — | **100 %** | 6 sans setup, 2 conviction, 1 objection, 1 lecture |
| `economique` | 0,0730 | **−35 %** | **100 %** | 5 sans setup, 4 conviction, 1 lecture |
| `diversifie` | 0,0600 | **−47 %** | **100 %** | 6 sans setup, 4 conviction |

**Aucun échec de schéma, sur aucun agent, sous aucune politique.** C'était le
risque principal : un modèle plus petit qui rate le décodage contraint
s'abstient, le cycle s'arrête, et l'économie apparente vient de ce que le desk
ne décide plus rien.

### L'économie est plus grande que le rapport des tarifs

| agent | modèle | $/appel | tokens sortie/appel |
|---|---|---:|---:|
| `quant` | opus-5 → haiku-4-5 | 0,0327 → **0,0020** | 1 039 → **173** |
| `regime` | opus-5 → haiku-4-5 | 0,0152 → **0,0013** | 349 → **50** |
| `avocat_du_diable` | opus-5 → sonnet-5 | 0,0564 → **0,0161** | 1 874 → **1 243** |

J'avais prédit −27 % pour `economique`, en raisonnant à tokens constants sur
le seul rapport des tarifs (Haiku coûte 1/5 d'Opus). Le résultat est −35 %, et
l'écart vient d'ailleurs : le Quant est **16 fois** moins cher, pas 5. Les
tokens de sortie s'effondrent en même temps que le prix unitaire, parce que
Haiku 4.5 n'a pas de réflexion adaptative — il n'émet pas de jetons de
raisonnement.

**Et c'est exactement la réserve à poser.** Six fois moins de sortie, ce n'est
pas six fois moins de gaspillage : c'est six fois moins de ce que l'agent dit.
Le schéma est respecté à 100 %, mais la validité de forme ne mesure pas la
qualité du contenu — et les `divergences` du Quant alimentent la Stratégie.

### Les décisions ne sont pas les mêmes

C'est visible dans la colonne des étapes : sous les politiques bon marché, la
Stratégie propose **4 setups** là où `uniforme` en proposait 2. Aucun n'a
produit de mandat — tous ont échoué sur la conviction — mais le desk ne se
comporte pas de la même façon.

Sur 10 cycles je ne peux pas dire si cette différence est un gain ou une
perte. Et tant que le P2 n'a pas montré d'edge, « mieux décider » n'a pas
encore de définition mesurable. **Ce qui est établi est le coût ; ce qui ne
l'est pas est la qualité de décision.** Trancher demande les 30 cycles de la
porte P3 sous chaque politique, et un critère de qualité qui ne soit pas la
conformité au schéma.

### Les leviers, classés par ce qu'ils rapportent réellement

| levier | facteur | mesuré ? |
|---|---:|---|
| **cadence** (12/h → 1/jour) | **÷288** | oui, arithmétique |
| politique `diversifie` | ÷1,9 | **oui, 10 cycles** |
| politique `economique` | ÷1,5 | **oui, 10 cycles** |
| effort `low` | ÷1,25 | oui, campagne antérieure |
| enveloppe hors des prompts aval | ÷1,015 | oui, 30 % de 1 634 caractères |
| cache de prompt | ÷1,02 | oui — plafond mesuré à 2,3 % |

La cadence écrase tout le reste de deux ordres de grandeur, et elle ne se
justifie que par un edge. À 1 154 $/mois à cadence nominale contre une
meilleure baseline à +66,77 $ bruts sur 208 jours, **le premier levier de coût
reste de ne pas décider douze fois par heure.**


---

## La qualité de décision, enfin mesurée — et le desk n'a jamais tranché

85 cycles sur `data/BTC_1h_real.json`, politique `diversifie`, 5,14 $. Chaque
setup formulé est confronté aux barres qui ont réellement suivi sa fenêtre.

```
  LECTURE          1    1,2 %
  PAS_DE_SETUP    37   43,5 %
  VETO             1    1,2 %
  OBJECTION        2    2,4 %
  CONVICTION      44   51,8 %
  MANDAT           0    0,0 %
```

### Zéro mandat, et la raison n'est pas celle qu'on croit

Ce n'est pas que la porte est sévère. **La conviction de la Stratégie n'a
jamais atteint le seuil, sur aucun des 47 setups** : elle va de 0,34 à 0,55,
la porte est à 0,60. Zéro sur quarante-sept.

Le prompt de la Stratégie **ne mentionnait nulle part le mot conviction**. Le
champ existait au schéma avec un défaut de 0, le graphe l'écartait sous 0,60,
et l'agent n'avait jamais su ni que ce nombre existe, ni sur quelle échelle il
vit, ni qu'une décision en dépend. C'est l'image en miroir de
`strategies_allowed`, produit et jamais lu : ici le champ est **lu et jamais
expliqué**. Corrigé — la mesure ci-dessus décrit l'état antérieur.

Trois portes ne se sont jamais déclenchées : `QUOTA`, `ASYMETRIE`,
`REJET_CHEF`. Cette dernière est la plus parlante : **le Chef de desk n'a
jamais été appelé.** Le graphe s'arrêtait toujours avant lui.

### Le desk rejette-t-il des trades gagnants ? Non — c'était mon instrument

Le registre annonçait **+0,35 R** sur les 47 setups rejetés, ce qui se lit
« le desk jette des trades qui gagnaient ». Le modèle nul confirmait même à
p ≈ 0,03 contre des entrées au hasard.

**Les deux mesuraient un défaut du registre, pas une propriété du desk.**

Un setup n'est pas un trade. La Stratégie propose un *prix* d'entrée, et
**38 % des siens sont à plus de 50 bps du dernier cours vu** — des ordres à
cours limité, qui n'existent que si le marché revient les chercher. Le
registre ne vérifiait jamais cette exécution. Un setup dont l'entrée n'est
jamais atteinte a son stop de l'autre côté du marché : il n'est donc jamais
touché, et la cible finit souvent par l'être.

| population | n | espérance |
|---|---:|---:|
| entrée **jamais atteinte** en 24 h | 7 | **+2,07 R** — profit fictif |
| entrée réellement atteinte | 40 | **+0,05 R** |
| *total publié à tort* | *47* | *+0,35 R* |

Sept setups sur quarante-sept, jamais ouverts, portaient toute la conclusion.
Corrigé : `ShadowBook.amorcer()` exige que le prix touche le niveau d'entrée,
`resolve()` ignore les entrées non exécutées, et une entrée jamais atteinte
sort avec `pnl_r = None` — pas zéro, qui se mêlerait aux vrais résultats.

L'amorçage passe **avant** la résolution sur chaque barre : une mèche qui
touche l'entrée puis le stop donne un trade pris puis stoppé, pas un trade
ignoré.

### Rejouée proprement, l'espérance est négative

Les `pnl_r` stockés venaient tous de la résolution défectueuse. Rejoués en
exigeant l'exécution, et en balayant l'horizon — que cette campagne ne
persistait pas encore :

| horizon | non exécutés | cible | stop | réussite | espérance |
|---:|---:|---:|---:|---:|---:|
| 24 h | 7 | 5 | 24 | 17 % | **−0,39 R** |
| 48 h | 6 | 8 | 30 | 21 % | −0,37 R |
| 72 h | 5 | 10 | 30 | 25 % | −0,28 R |
| 168 h et au-delà | 3 | 12 | 32 | 27 % | **−0,23 R** |

**Le signe ne dépend d'aucune hypothèse d'horizon.** À 168 h : −0,234 R sur
44 setups, IC 95 % [−0,59 ; +0,16], P(espérance ≥ 0) = 0,115. Avec la perte
réelle mesurée au Monte-Carlo (−1,27 R au stop) : **−0,430 R, IC
[−0,83 ; −0,004]** — l'intervalle exclut zéro, de justesse.

Ce qu'on peut défendre : **ces setups n'ont pas d'espérance positive, et tout
pointe vers le négatif.**

### L'agent n'est pas calibré, il est surconfiant

Il annonce une conviction moyenne de **50 %**. Le taux de réussite réel des
trades tranchés est de **17 à 27 %** selon l'horizon. L'écart n'est pas du
bruit : c'est un biais de 25 à 30 points dans le même sens.

Et ça retourne complètement la lecture du « zéro mandat » :

> **La porte fait son travail.** Elle bloque des setups qui perdent de
> l'argent. Un desk qui les aurait émis aurait perdu ~0,23 à 0,43 R par
> trade. Le verrou n'est pas un défaut à lever — c'est la seule partie de la
> chaîne dont on ait mesuré qu'elle protège le capital.

Le correctif de prompt sur la conviction, lui, **n'a rien changé** : sondé sur
20 des mêmes fenêtres, l'agent reste entre 0,50 et 0,55, et l'étendue s'est
même resserrée (0,21 → 0,05). Expliquer l'échelle ne suffit pas à corriger la
surconfiance. Mon hypothèse — « il ne savait pas ce qu'on lui demandait » —
est réfutée par la mesure.

Le registre affiche désormais son intervalle bootstrap et la mention
« compatible avec zéro » à côté de chaque espérance : un nombre nu se lit
comme un fait, et celui-là s'est lu comme une alarme pendant une heure.

### La conviction ne prédit rien

| moitié | conviction moyenne | résultat |
|---|---:|---:|
| basse | 0,47 | **+0,39 R** sur 23 setups |
| haute | 0,55 | **+0,31 R** sur 24 setups |

Écart **−0,08 R** : légèrement inversé, c'est-à-dire du bruit. Réserve
importante — l'amplitude de conviction est minuscule (0,47 contre 0,55), donc
ce test est faible par construction. On ne peut pas conclure « la conviction
est inutile » ; on peut conclure que **sur la plage que l'agent utilise
réellement, elle ne sépare rien**.

### Ce que ça change — la conviction est retirée au modèle

`agents/scoring.py`. L'agent Stratégie n'a **plus de champ pour un chiffre de
confiance** : c'est structurel, pas une consigne de prompt. Il remplit un
champ `evaluation` avec une étiquette par dimension, et un calcul
déterministe en fait le score.

| dimension | étiquettes | apport |
| --- | --- | --- |
| régime | `REGIME_CONTRE` / `_NEUTRE` / `_AVEC` | 0 → 0,25 |
| niveau d'entrée | `NIVEAU_AUCUN` / `_FLOU` / `_NET` | 0 → 0,20 |
| stop | `STOP_ARBITRAIRE` / `_PLAUSIBLE` / `_STRUCTUREL` | 0 → 0,20 |
| confluence | `CONFLUENCE_1` / `_2` / `_3P` | 0 → 0,20 |
| confiance du régime | *calculée*, pas jugée | 0 → 0,15 |
| obstacle | `OBSTACLE_AUCUN` / `_MINEUR` / `_MAJEUR` | 0 → −0,30 |
| sévérité de l'objection | *calculée*, pas jugée | 0 → −0,40 |

La somme des maxima vaut **1,00 exactement**, et un test le vérifie par le
haut. Sans ça, une porte relevée un jour à 0,90 fermerait le desk
définitivement, et l'absence de mandat passerait pour un jugement de marché
alors qu'elle serait un défaut d'arithmétique.

**Ce score n'est pas une probabilité.** 0,75 ne veut pas dire « gagne trois
fois sur quatre ». Les poids sont un a priori posé à la main, probablement
faux dans le détail, et le seuil de 0,60 est **hérité de l'ancienne porte,
pas dérivé**. Ce qui est gagné n'est pas la justesse, c'est trois propriétés
que le nombre du modèle n'avait pas :

- **reproductible** — le modèle donnait 0,55 puis 0,62 sur la même situation ;
- **inspectable** — `Note.termes` dit ce que chaque critère a apporté, donc
  un score peut être contesté ligne par ligne ;
- **ajustable** — les poids sont un tableau de nombres dans un fichier. Quand
  le registre fantôme aura assez d'issues résolues, ils se calent sur des
  données. Des jetons dans un modèle ne se calent sur rien.

#### Le défaut que le budget de schéma a évité de justesse

La première version demandait **cinq champs séparés**. Le décodage contraint
de l'API refuse au-delà de douze champs optionnels — mesure faite contre
l'API réelle, 12 passent et 13 non — et le schéma en demandait quatorze.
Chaque appel Stratégie aurait reçu un 400, l'agent se serait abstenu **100 %
du temps**, et le symptôme aurait été « le modèle ne propose plus rien » :
un défaut de format déguisé en jugement de marché.

`test_aucun_schema_ne_depasse_le_seuil_de_l_api` l'a arrêté au premier essai.
L'évaluation tient maintenant dans **un seul champ** à étiquettes fermées, et
le schéma redescend à dix.

C'est la même famille de panne que le rejet de la réflexion adaptative par
Haiku 4.5 : invisible en test unitaire, fatale en production, et attribuée à
la compétence de l'agent plutôt qu'au câblage.

#### Ce qui n'est pas encore mesuré

Le desk n'a jamais émis de mandat parce que la conviction du modèle
plafonnait vers 0,55. Le scorer rend l'échelle atteignable — un setup franc
note 0,84 en test — mais **savoir si le modèle produit des évaluations
franches sur un vrai marché demande des appels réels.** Rien ici ne le
prouve, et le chemin de bout en bout n'est vérifié que sur réponses
scriptées.

## Étape 2 — les déclencheurs de la Sentinelle, cartographiés

98 cellules : 4 déclencheurs × 7 actifs × 3 intervalles (15 min, 1 h, 4 h) ×
4 horizons (H+15 min, H+1 h, H+4 h, H+12 h). 15 838 événements. Zéro dollar
d'API.

Deux questions **distinctes**, mesurées séparément — les confondre est la
faute qui rendrait ce résultat illisible.

### Direction — le déclencheur prédit-il le SENS ?

```
  cellules testées                            98
  p < 0,05 brut                               14
  attendues par pur hasard                   4,9
  survivantes après Benjamini-Hochberg         0
```

**Aucune.** Quatorze cellules à p < 0,05 pour 4,9 attendues par le bruit de
98 tests : le compte est trop proche du hasard pour qu'une seule survive.
Aucun déclencheur ne prédit la direction, à aucun horizon, sur aucun actif.

C'est aussi la réponse à « où l'edge est-il maximal » : **nulle part.** La
carte des rendements signés existe dans les résultats bruts, mais tant
qu'aucune cellule ne survit à la correction, son maximum est celui d'un
échantillon bruité, pas celui d'un edge.

### Amplitude — prédit-il qu'il se PASSE quelque chose ?

```
  cellules testées                            98
  p < 0,05 brut                               63
  attendues par pur hasard                   4,9
  survivantes après Benjamini-Hochberg        59
```

**Cinquante-neuf.** Dont 24 à p = 0,0005 — le plancher de 2 000 tirages,
c'est-à-dire *aucun* tirage aléatoire n'a fait aussi bien. **C'est la
première chose mesurée comme non aléatoire de tout le projet.**

Ratio de l'amplitude observée à celle du hasard :

| déclencheur | H+15 min | H+1 h | H+4 h | H+12 h | n |
|---|---:|---:|---:|---:|---:|
| `cascade_liquidations` | **2,72** | **2,18** | 1,04 | 1,12 | 54 |
| `pic_volume` | **1,78** | 1,50 | 1,49 | 1,31 | 4 433 |
| `rupture_volatilite` | 1,26 | 1,20 | 1,20 | 1,17 | 10 541 |
| `funding_extreme` | — | 0,84 | 0,87 | 0,92 | 883 |

### La demi-vie que vous aviez prédite est là, et elle est mesurée

**La cascade de liquidations est violente et très courte** : 2,72× l'amplitude
normale à 15 minutes, 2,18× à une heure, **absorbée à quatre heures** (1,04,
soit le hasard). Exactement l'intuition — le déséquilibre se résorbe en moins
de quatre heures. Réserve : 54 événements seulement, c'est le déclencheur le
plus rare et le moins solidement mesuré.

**Le pic de volume décroît lentement** : 1,78 → 1,50 → 1,49 → 1,31. Il reste
informatif à douze heures, sur 4 433 événements.

**Le funding extrême fait l'inverse de ce qu'on attendait** : ratio *inférieur
à 1* à tous les horizons. Il marque des marchés plus CALMES que la normale —
un positionnement chargé et immobile, pas une veille de mouvement. C'est un
résultat, pas une absence de résultat.

### Ce que ça change pour l'architecture

**L'architecture Sentinelle est validée, l'espoir d'edge ne l'est pas.**

Un déclencheur qui multiplie par 1,8 l'amplitude attendue fait exactement son
travail : réveiller le desk quand il se passe quelque chose. Le desk n'aura
toujours rien d'exploitable à en dire — le P3 l'a établi — mais l'appel de
0,06 $ est désormais dépensé sur des moments démontrablement moins ordinaires
que la moyenne, au lieu d'être dépensé douze fois par heure sur du bruit.

### Deux corrections faites en chemin

**Le seuil de `rupture_volatilite` était inatteignable.** 2,5 issu de la
littérature, alors que le ratio vol₂₄/vol₁₆₈ a pour maximum 1,96 à 2,38 sur
les sept actifs. Le déclencheur ne s'est jamais déclenché de la première
campagne — ce n'était pas un résultat, c'était une erreur de spécification.
Il lit désormais un centile **glissant** de sa propre distribution, choisi
sans jamais regarder les rendements.

Contrepartie assumée : un seuil au centile se déclenche par construction sur
une fraction fixe des barres, et il détecte la **bascule**, pas le régime —
quand un régime agité persiste, il remplit la fenêtre de référence et devient
la norme. Un test le vérifie plutôt que de prétendre le contraire.

**Le centile calculé sur toute la série regardait l'avenir**, et le test de
troncature de ce dépôt l'a attrapé. Un déclencheur qui voit le futur
fabriquerait un edge que la validation mesurerait consciencieusement, avant
que le desk ne se réveille en retard sur du vide en direct.


---

## Horizons longs (1 j à 14 j) : l'hypothèse est réfutée, l'intuition économique non

Deuxième campagne, sur 6 ans de données journalières et 4 h : 112 cellules,
horizons H+24 h, H+72 h, H+168 h, H+336 h.

### La survie statistique s'effondre aux longs horizons

| campagne | cellules | survivantes BH (amplitude) | taux |
|---|---:|---:|---:|
| courts (15 min → 12 h) | 98 | 59 | **60 %** |
| longs (24 h → 336 h) | 112 | 7 | **6 %** |

Le ratio amplitude/hasard décroît de façon monotone et **passe sous 1** à deux
semaines :

| | H+15min | H+1h | H+4h | H+12h | H+24h | H+72h | H+168h | H+336h |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `pic_volume` | 1,78 | 1,50 | 1,49 | 1,31 | 1,23 | 1,18 | 1,02 | **0,94** |
| `rupture_volatilite` | 1,26 | 1,20 | 1,20 | 1,17 | 1,12 | 1,05 | 1,03 | **0,91** |

**L'anomalie est réellement de courte durée.** Passer en journalier ou en
hebdomadaire ne l'améliore pas — ça la dilue jusqu'à la faire disparaître.
Direction : 0 survivante sur 112, comme sur les horizons courts.

### Mais le coût de transaction déplace l'optimum, et c'est décisif

Le modèle de coûts du dépôt facture **15 bps l'aller-retour** (9 de frais
taker, 6 de slippage). Confronté à l'excès d'amplitude apporté par
`pic_volume` :

| horizon | amplitude | excès / hasard | **excès net de coûts** | rapport au coût |
|---|---:|---:|---:|---:|
| H+15 min | 30 bps | +13 | **−2** | −0,1× |
| H+1 h | 49 | +16 | **+1** | +0,1× |
| H+4 h | 123 | +41 | **+26** | +1,7× |
| H+12 h | 195 | +46 | **+31** | +2,1× |
| **H+24 h** | 362 | +68 | **+53** | **+3,6×** |
| **H+72 h** | 612 | +91 | **+76** | **+5,1×** |
| H+168 h | 847 | +20 | **+5** | +0,3× |
| H+336 h | 1 193 | −70 | **−85** | −5,6× |

**Le signal le plus significatif est le moins exploitable.** À 15 minutes,
l'excès d'amplitude (13 bps) est *inférieur* au coût d'un aller-retour
(15 bps) : statistiquement écrasant, économiquement mort-né. La fenêtre où le
signal dépasse franchement le coût est **H+24 h à H+72 h**.

> ### La lecture qu'il ne faut surtout pas faire
>
> **Cet excès net n'est pas un profit.** C'est de l'AMPLITUDE — la taille du
> mouvement dans lequel on serait positionné, pas son sens. Sans edge
> directionnel, et il n'y en a aucun sur 210 cellules testées, l'espérance
> reste nulle moins les frais.
>
> Ce tableau dit **où un edge directionnel serait économiquement capturable
> si on en trouvait un**. Il ne dit pas qu'il en existe un.

### Ce que ça fixe pour la suite

L'horizon de travail du desk est **1 à 3 jours**, pas 15 minutes. C'est la
seule fenêtre où un signal, s'il existait, survivrait aux frais. Et c'est
exactement l'horizon naturel des **token unlocks** — événements datés,
publics, dont l'effet se joue sur plusieurs jours.

---

## Token unlocks — le premier edge directionnel mesuré du projet

Toutes les campagnes précédentes ont conclu à l'absence d'edge directionnel :
zéro survivant sur 56 cellules pour les stratégies classiques, zéro sur 98
pour la direction des déclencheurs de la Sentinelle, zéro sur 210 pour les
horizons longs. Celle-ci conclut autrement, et c'est la première.

**Les données.** 2 074 déblocages extraits de `defillama-datasets`, sur 68
jetons ayant un historique de bougies journalières. Seuls les déblocages
*cliff* sont retenus — un déblocage linéaire n'a pas de date, le tester
comme un événement daté reviendrait à mesurer un jour au hasard dans une
rampe. Le dénominateur exclut le déblocage lui-même : l'y inclure écraserait
mécaniquement les gros événements.

**L'hypothèse, posée avant la mesure.** Trois fenêtres tirées de la
littérature — anticipation (J-7 → J-1), impact (J → J+1), digestion
(J+1 → J+3) — toutes **baissières** (`sens = -1`). Tester « et si c'était
l'inverse » après avoir vu les résultats serait retourner sa veste.

### Le résultat

La fenêtre qui ressort est l'**anticipation** : le marché vend *avant* la
date, pas le jour même. Après mise en commun des jetons et correction de
Benjamini-Hochberg, **4 cellules survivent**, avec une réponse à la dose
monotone : plus le déblocage est gros en part de l'offre en circulation,
plus la baisse anticipée est forte.

| tranche  | effet (bps) | p       |
| -------- | ----------- | ------- |
| 0,5-2 %  | +133,2      | 0,3378  |
| 2-5 %    | +290,4      | 0,0095  |
| > 5 %    | +445,7      | 0,0010  |
| toutes   | +264,0      | 0,0005  |

> **Positif signifie que le prix a BAISSÉ.** `sens = -1` retourne déjà le
> signe. Le premier rapport annonçait l'inverse dans sa légende, ce qui
> aurait fait lire exactement le contraire des données ; c'est corrigé et un
> test le verrouille.

Les chiffres ci-dessus sont ceux **après neutralisation du marché** — le
rendement du jeton moins celui de BTC sur exactement la même fenêtre. C'est
le point le plus notable : l'effet ne survit pas seulement à la
neutralisation, il en **sort renforcé** (+236 → +264 bps). Les déblocages ne
mesuraient donc pas un marché baissier commun.

### Les cinq contrôles, et ce que chacun peut tuer

Un effet mesuré n'est pas un effet réel. Chaque contrôle ci-dessous est une
façon différente de faire disparaître le résultat, et chacun est vérifié par
un test qui le fait effectivement disparaître sur un cas construit.

| contrôle                | ce qu'il tue                                     | verdict |
| ----------------------- | ------------------------------------------------ | ------- |
| Dénominateurs aberrants | un effet porté par quelques parts d'offre absurdes | tient (+223 bps à ≤ 25 %) |
| Jackknife par jeton     | un effet porté par un seul jeton                  | tient (pire exclusion p = 0,0035) |
| Coupe temporelle        | un edge mort, déjà arbitré                        | tient des deux côtés (p = 0,012 / 0,011) |
| Neutralisation du marché | un effet de marché déguisé                       | tient, et se renforce |
| Décalage calendaire     | des événements comptés en double                  | tient (3 tranches sur 4) |

Les quatre premiers partagent la même faiblesse, et c'est pour elle
qu'existe le cinquième.

### Pourquoi le cinquième contrôle existe

Les quatre premiers utilisent tous le même bras aléatoire : **une date tirée
indépendamment par événement**. Ce bras suppose que 852 événements sont 852
observations. Ils ne le sont pas. Beaucoup de projets débloquent aux mêmes
dates ; quand vingt jetons débloquent le même jour, leurs vingt rendements
partagent la même semaine de marché. Le nombre effectif d'observations est
inférieur — et un p calculé comme s'ils étaient indépendants est **trop
petit, c'est-à-dire trop flatteur**.

La neutralisation retire le facteur commun, mais pas toute la corrélation
résiduelle : deux jetons du même secteur bougent ensemble même à BTC
constant.

Le remède est de changer de bras aléatoire. Au lieu de tirer une date par
événement, `decalage_calendaire` **décale tout le calendrier du même nombre
de jours**. Les groupements, les intervalles, les voisinages sont conservés
à l'identique ; seul change l'alignement sur les vraies dates de déblocage.
Les décalages de moins de 14 jours sont exclus — en deçà, la fenêtre décalée
chevauche encore la vraie et le bras « aléatoire » mesurerait une partie de
l'effet qu'il sert de référence.

**Le nul est un ensemble clos, pas un échantillon.** Il n'existe que
`2 × (amplitude − 13)` alignements possibles ; tirer davantage ne l'agrandit
pas. Ils sont donc tous énumérés — le p est un p de permutation exact, sans
graine et sans bruit d'échantillonnage — mais il ne peut pas descendre sous
`1 / (nombre de décalages + 1)`. Ce plancher est affiché dans le rapport :
un p qui l'atteint signifie « aucun alignement ne fait aussi bien », pas
« p = 0,001 ».

### Ce que le contrôle vaut, mesuré sur des cas construits

Sur douze jetons quasi identiques dont les six dates de déblocage sont
communes, le bras par événement **sature** : il annonce p = 0,0010 quel que
soit le choc, parce qu'il construit son nul sur 72 tirages indépendants dont
l'écart-type est faussement petit d'un facteur √12. Un test qui rend le même
verdict pour une preuve mince et pour une preuve épaisse ne mesure plus rien.

Le décalage en bloc, lui, refuse ces mondes dans 4 cas sur 5 — et le
cinquième est un monde où l'alignement commun est réellement rare, où il a
donc raison de valider. Sur un effet réparti, chaque jeton ayant ses propres
dates, il valide au plancher ; le même fixture avec le choc retiré donne
p = 0,32. Les deux sens sont vérifiés, sans quoi un contrôle qui refuse tout
passerait pour un contrôle sévère.

### Le cinquième contrôle : mesuré, et il tient

| tranche | n | observé | hasard | p |
| --- | --- | --- | --- | --- |
| 0,5-2 % | 368 | +119,7 | +58,5 | 0,3234 |
| 2-5 % | 318 | +276,9 | +66,2 | **0,0128** |
| > 5 % | 217 | +367,8 | +92,5 | **0,0129** |
| toutes | 852 | +236,0 | +67,7 | **0,0014** |

Trois tranches sur quatre survivent, et la réponse à la dose reste monotone :
la petite tranche ne ressort pas, les deux grosses oui.

**Le 0,0014 de la dernière ligne est exactement le plancher du test** —
1/705, pour 704 alignements énumérés. Il ne se lit pas « p = 0,0014 » mais
« **aucun des 704 décalages possibles ne fait aussi bien** ». C'est la
déclaration la plus forte que ce test sait produire, et elle est censurée
par le haut, pas par la force de l'effet.

Deux choses à noter dans ce tableau, parce qu'elles disent que le contrôle
fait son travail :

- **Le bras aléatoire n'est pas centré sur zéro** : +67,7 bps. Un alignement
  quelconque montre déjà une baisse, parce que ces jetons dérivent vers le
  bas. L'observé est 3,5 fois cela, et c'est cet écart qui compte.
- **Les p des sous-tranches ont monté**, de 0,0095 et 0,0010 à 0,0128 et
  0,0129. C'est exactement l'effet attendu : le nul par événement avait un
  écart-type trop petit parce qu'il traitait des jetons corrélés comme
  indépendants. Les p corrigés sont moins flatteurs, et ce sont les bons.

### Ce que ça ne dit toujours pas

Les cinq contrôles répondent à « l'effet existe-t-il ? » et **à rien
d'autre**. Trois questions restent, dont deux peuvent tuer le résultat, et
`scripts/economie_unlocks.py` les pose :

- **La moyenne est-elle portée par une poignée de coups ?** Le tableau par
  jeton montre USUAL à +1 335 bps et EIGEN à +925. Si l'effet disparaît en
  retirant les 5 % meilleurs, ce n'est pas un edge, c'est un billet de
  loterie.
- **Combien de paris indépendants cela fait-il ?** Le décalage calendaire
  vient d'établir que les événements sont groupés. Ce qui était une objection
  statistique devient une contrainte d'allocation : l'unité de décision est
  la semaine, pas l'événement.
- **Que reste-t-il après les coûts ?** Le financement est mesurable sur l'API
  Hyperliquid, et il n'est pas un coût : une position courte le *reçoit*
  quand il est positif. L'écart et le glissement ne sont pas mesurables — le
  carnet historique n'existe pas — donc le script les traite en paramètre et
  répond à la question renversée : **jusqu'à quel coût aller-retour l'edge
  survit-il ?** Un seuil se compare à un carnet réel ; une hypothèse de coût
  inventée ne se compare à rien.

### L'économie, mesurée — tranche 2-5 %, 318 événements sur 39 jetons

| | brut | financement inclus |
| --- | --- | --- |
| moyenne | +276,9 bps | +264,1 bps |
| **médiane** | **+337,2 bps** | **+323,0 bps** |
| écart-type | 1 272 bps | 1 245 bps |
| part gagnante | 59,4 % | 59,7 % |
| sans les 5 % meilleurs | +146,3 bps | +130,9 bps |

**La médiane dépasse la moyenne.** C'est l'inverse exact d'un billet de
loterie : un billet de loterie a une médiane nulle et une moyenne tirée par
la queue haute ; ici c'est la queue *basse* qui tire la moyenne vers le bas.
Le trade typique est meilleur que la moyenne, et l'effet survit au retrait
des 5 % meilleurs. La question 1 est tranchée dans le bon sens.

Le **financement** ne pèse presque rien : médiane +4,9 bps reçus par le
short, moyenne −22,0 bps, soit −13 bps sur l'edge. Il a été lu sur l'API pour
288 des 318 fenêtres — les 30 manquantes sont des événements antérieurs à la
cotation du jeton sur Hyperliquid.

Par semaine, qui est l'unité de décision : **+264,9 bps**, 62,5 % de semaines
gagnantes, Sharpe annualisé **1,81**, et un **seuil de rentabilité à 265 bps
d'aller-retour**. Un aller-retour réel sur ces jetons se compte en dizaines
de points de base, pas en centaines : la marge est d'un facteur cinq à dix.

### Les deux chiffres que ce tableau ne donne pas

**136 semaines distinctes sur environ 130 semaines de données.** La stratégie
est active pratiquement chaque semaine de la période. Elle porte donc une
**exposition courte permanente aux altcoins**, et une partie du résultat peut
venir de là plutôt que des déblocages. La neutralisation par BTC avait déjà
répondu statistiquement — l'effet en sortait renforcé — mais la version
*implémentable* n'est pas la même stratégie : short nu, ou short adossé à un
achat de BTC. `economie_unlocks.py` chiffre maintenant les deux.

**Un Sharpe de 1,81 à 76 % de volatilité annualisée est compatible avec la
perte de la moitié du capital en chemin.** La moyenne ne dit pas dans quel
ordre les semaines sont arrivées, et c'est l'ordre qui décide si une
stratégie est tenable. Le script compose maintenant les rendements — un
compte compose, les additionner sous-estimerait le repli — et rapporte repli
maximal, pire semaine et plus longue série perdante. Au-delà de 50 % de
repli il le dit avec le mot **INTENABLE**.

L'analogue direct sur actions — les *lockup expiries* des IPO — reste le
candidat naturel pour tester si l'effet est propre à la crypto ou général.
