# Trading Desk — Hyperliquid

Desk de trading automatisé multi-agents. **Phases P0, P2, et la moitié du
P1** : ingestion de marché, moteur de risque, supervision, baselines
chiffrées sans IA, et la couche d'exécution — order manager, idempotence,
réconciliation.

**Le mode LIVE reste fermé.** Il n'engagera d'argent réel qu'après un
aller-retour réussi sur testnet, et c'est un acte délibéré, pas l'oubli
d'une variable d'environnement.

> **État au 11 septembre 2026 — le desk tourne sur le marché réel.**
> Douze invariants sur douze au vert contre le testnet Hyperliquid : flux
> live, réconciliation du compte, prix réels, PnL du jour calculé depuis les
> exécutions. Aucune clé n'est nécessaire pour cela — l'endpoint
> d'information rend l'état d'un compte à partir de sa seule adresse
> publique, donc le desk voit tout sans rien pouvoir signer.
>
> **La signature Hyperliquid est validée.** Chaque hash et chaque signature
> sont comparés octet pour octet à ceux du SDK officiel, sur 24 vecteurs
> couvrant ordres limite, Ioc, Alo, stops déclencheurs, prises de bénéfice,
> ordres groupés, annulations par cloid, coffres, expirations et nonce
> maximal, sur les deux réseaux. Les vecteurs sont figés dans
> `tests/vecteurs_signature.json` et rejoués à chaque test.
>
> **Cette validation a trouvé un vrai défaut.** Nous émettions `r` et `s`
> sur trente-deux octets pleins, zéros de tête compris, là où
> l'implémentation de référence émet le minimum : `0x4bce…` contre
> `0x04bce…`. Même entier, encodage différent — et sur 2 000 signatures les
> deux formes divergent dans **16,3 %** des cas. Le pire profil de panne
> possible : cinq ordres sur six passent, le sixième est refusé, avec de
> l'argent engagé et rien pour reproduire.
>
> **Le mode PAPER trade, sur le marché réel.** Chaîne complète vérifiée de
> bout en bout : journal → pilote → pupitre → moteur de risque →
> dimensionnement → order manager → simulateur → fills → état du compte.
> Une position SHORT BTC ouverte depuis une entrée de journal, stop au repos
> chez l'exchange, notionnel 31 $ pour un levier de 0,03×, douze invariants
> au vert. Il ne manque que le vrai journal de déblocages.
>
> **Le formatage est éprouvé sur tout l'univers de l'exchange** — 212 actifs,
> de zéro à cinq décimales de taille, prix et tailles vérifiés contre les
> règles publiées. 127 actifs ont **zéro** décimale de taille quand BTC en a
> cinq : un test qui ne vérifie que BTC ne prouve rien, c'est aux extrêmes
> que les règles se cassent. L'instantané est versionné
> (`tests/meta_hyperliquid.json`) pour que l'épreuve tourne hors réseau.
>
> Ce qui reste non validé : l'**écriture**. Les indices d'actifs, la lecture
> des comptes et le formatage sont confrontés au réel ; aucun ordre n'a
> jamais été envoyé. Le notionnel minimal, en particulier, vient de la
> documentation et d'aucun aller-retour — il est nommé et isolé
> (`NOTIONNEL_MINIMAL_USD`) pour qu'un premier essai puisse le corriger.

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
pip install -e ".[dev]"          # UNE SEULE FOIS, ou : uv sync
desk --demo                      # marché simulé, sans réseau
```

**`pip install` ne se refait pas.** Il pose la commande `desk` une bonne
fois ; ensuite il n'y a plus qu'un mot à taper, depuis n'importe quel
répertoire :

```bash
desk                             # le desk, avec sa supervision
desk --demo                      # marché simulé, sans réseau
DESK_MODE=PAPER desk             # exécution simulée sur le carnet réel
```

Le refaire à chaque lancement ne casse rien, mais recompile les
dépendances pour rien. `python -m trading_desk` reste équivalent, en plus
long.

`No module named trading_desk` signifie que `pip install -e` n'a pas tourné
dans l'interpréteur courant — typiquement une base conda différente de celle
où l'installation a eu lieu.

`PYTHONPATH=src` ne suffit PAS à réparer ça. Il résout le paquet, pas ses
dépendances : l'erreur suivante est `No module named 'uvicorn'`. Les scripts
de `scripts/` donnent le change parce qu'ils n'ont besoin que de `pydantic`,
souvent déjà présent — le desk et l'interface ont besoin de tout.

```bash
pip install -e ".[dev]"          # la bonne réponse, une fois pour toutes
python -m trading_desk           # plus besoin de PYTHONPATH ensuite
```

Vérifier dans quel interpréteur l'installation a atterri :

```bash
which python && python -c "import trading_desk, uvicorn; print('OK')"
```

Puis ouvrir <http://127.0.0.1:8787>. L'écran montre l'état des douze
invariants, le mandat en vigueur, la fraîcheur des flux et un kill switch.

Pour ingérer le vrai marché (testnet, toujours en lecture seule) :

```bash
cp .env.example .env
desk
```

`desk` retrouve le dépôt tout seul : `.env` et `data/journal_unlocks.jsonl`
sont cherchés d'abord à côté de vous, puis dans le dépôt. Lancer le desk
depuis la maison échouait auparavant sur « journal absent » — un message
qui ne disait pas la vraie cause, puisque le journal était bien là et que
c'était le répertoire qui ne l'était pas.

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

#### Le diagnostic : quatre critères sur cinq ne varient jamais

Une seconde exécution, instrumentée, 12 cycles pour 1,33 $ :

| terme | médiane | min | max | |
| --- | --- | --- | --- | --- |
| alignement | +0,25 | +0,25 | +0,25 | **constant** |
| invalidation | +0,20 | +0,20 | +0,20 | **constant** |
| confluence | +0,10 | +0,10 | +0,10 | **constant** |
| obstacle | −0,10 | −0,10 | −0,10 | **constant** |
| niveau | +0,10 | +0,10 | +0,20 | la seule qui varie |
| objection | −0,22 | −0,24 | −0,20 | quasi constant |

Le score se réduisait à `0,45 + niveau − objection`, d'où l'étendue observée
de 0,41 à 0,57. **Baisser le seuil n'aurait rien réparé** : ça aurait laissé
tout passer indistinctement.

La cause n'était pas le seuil, c'était la question. **Trois des cinq
demandaient à l'agent de noter son propre travail** — il avait choisi le
sens, l'entrée et le stop. Un agent qui s'auto-évalue rend le maximum :
c'est le défaut exact qui avait condamné l'ancien champ `conviction`, revenu
sous un autre costume.

Elles violaient de surcroît la règle écrite dans `contracts/signals.py` :
*les agents LLM ne produisent jamais un chiffre qu'un calcul pourrait
donner.* Un alignement de sens est une comparaison ; un niveau respecté est
un comptage ; un stop structurel est une inégalité sur un extrême.

#### `scoring.mesurer` — trois dimensions rendues au code

- **alignement** — le sens du setup contre le régime lu. En range, acheter le
  haut de l'étendue *contredit* le régime, quoi qu'en dise l'agent.
- **niveau** — les touches du prix d'entrée, comptées **par grappe** : vingt
  barres consécutives qui traversent le même prix sont une visite, pas
  vingt. Les compter séparément ferait passer une dérive lente pour un
  support respecté.
- **invalidation** — le stop est-il au-delà de l'extrême de la fenêtre ?
  Au-delà : structurel. Au-delà du seul extrême récent : plausible. Dedans :
  une distance de dimensionnement.

Le modèle ne garde que **confluence** et **obstacle** — compter des raisons
indépendantes demande de comprendre ce qu'elles mesurent ; connaître un
événement à venir demande de l'avoir lu. Le schéma passe de quinze
étiquettes à six, et **le calcul prime sur le modèle** : un setup relu qui
porterait encore `REGIME_AVEC` ne peut pas s'auto-absoudre, `_dimension`
retient la valeur la plus basse.

Le prompt de l'obstacle est corrigé aussi. J'y écrivais que `OBSTACLE_AUCUN`
vaut « si tu n'en vois pas — et non pas parce que tu n'as pas cherché » : un
modèle consciencieux ne cochait donc jamais « aucun ». J'avais rendu
l'option neutre moralement indéfendable.

#### Deux défauts trouvés en ancrant le banc d'essai

**Un stop hors limites faisait tomber le cycle.** `build_mandate` borne la
fourchette de stop par les limites dures ; au-delà de 500 bps elle sort avec
un minimum supérieur à son maximum et le schéma lève. Le commentaire du code
affirmait que le mandat serait « refusé à la construction » — il l'affirmait
depuis le début, et c'était faux. C'est maintenant une porte
(`STOP_HORS_LIMITES`), donc un refus ordinaire.

**Le dry-run répondait par rang, pas par rôle.** Ses cycles ne meurent pas
tous à la même porte, donc ils ne consomment pas le même nombre de réponses :
au premier cycle court, la liste se décalait et l'agent Régime recevait un
`size_factor`. Le rapport annonçait alors « qualité insuffisante : régime »
— un défaut du banc d'essai pris pour un défaut du modèle.

Le dry-run expose enfin une tension réelle qu'il ne doit pas masquer : sur
une fenêtre volatile, un stop **vraiment** structurel dépasse la limite dure
de 500 bps. Les deux critères se contredisent, et c'est la limite de risque
qui gagne.

#### Le plafond du compte, pris pour un défaut du modèle

La troisième exécution a rendu ce verdict :

```
PORTE P3 : NON FRANCHIE — qualite insuffisante : regime
```

**L'agent Régime n'avait jamais été sollicité.** L'API répondait
`400 — you have reached your specified API usage limits`, le runner
réessayait deux fois, l'agent s'abstenait, et le rapport concluait à un
défaut de qualité. Huit cycles sur douze sont morts ainsi.

J'ai d'abord soupçonné ma propre modification — l'ajout des quatre extrêmes
au contexte de marché. Une sonde à six appels a tranché : le contexte
enrichi et le contexte d'origine échouent **identiquement, 0/3 chacun**.
Ce n'était pas le contexte.

Deux dégâts, et le second est le pire : on dépense des appels contre une API
qui refuse, et **on accuse un modèle d'un défaut de facturation** — donc on
cherche au mauvais endroit. `QuotaEpuise` a maintenant son propre type : le
runner ne le réessaie pas, ne l'absorbe pas en abstention, et la campagne
s'arrête net avec un message qui nomme la vraie cause. Un test vérifie aussi
l'autre sens — une panne réseau ordinaire doit rester réessayée puis
absorbée, sinon une coupure ferait tomber la campagne entière.

Les trois cycles qui ont abouti avant le plafond montrent `invalidation`
sortir de zéro pour la première fois (max +0,10) et le score médian passer
de 0,38 à 0,44. **Trois observations ne concluent rien** — c'est noté ici
comme une indication à confirmer, pas comme un résultat.

#### Après refonte : trois corrections sur quatre ont pris

Même configuration, 12 cycles, 0,99 $. Comparaison terme à terme :

| terme | avant | après | |
| --- | --- | --- | --- |
| alignement | +0,25 constant | +0,25 méd., **min +0,00** | varie |
| niveau | +0,10 → +0,20 | +0,20 méd., min +0,10 | varie |
| obstacle | −0,10 constant | **+0,00** sur 6 | le prompt corrigé a pris |
| invalidation | +0,20 constant | **+0,00** sur 6 | voir ci-dessous |
| confluence | +0,10 constant | +0,10 constant | inchangé |
| **score** | méd. 0,46 (0,41–0,57) | méd. 0,38 (0,17–0,44) | étendue triplée |

L'étendue des scores passe de 0,16 à 0,27 : les mesures **discriminent**, ce
que l'auto-évaluation ne faisait pas. Le coût descend à 0,0826 $ le cycle.

#### Le résultat le plus instructif de la campagne

L'agent annonçait `STOP_STRUCTUREL` **cent fois sur cent**. Le code mesure
`STOP_ARBITRAIRE` **six fois sur six**. L'auto-évaluation gonflait le score
d'exactement une dimension entière — 0,20 sur une échelle de 1,00.

J'ai d'abord soupçonné une impossibilité géométrique : un stop au-delà du
plus bas de 120 barres dépasserait-il la limite dure de 500 bps ? **Vérifié,
et non** — distance médiane 327 bps, et la contrainte tient dans 75 % des
fenêtres. L'agent pouvait poser un stop structurel.

La vraie cause était ailleurs, et elle est de mon fait : **le contexte de
marché ne lui montrait que l'extrême à 20 barres.** Je le notais sur une
information qu'il n'avait pas. Le contexte porte désormais les extrêmes à
40 et 120 barres, et un test lie les deux — ajouter un horizon au barème
sans l'ajouter au contexte le fait tomber.

Ce n'est pas souffler le barème à l'agent : la porte d'asymétrie l'empêche
d'en abuser, puisqu'un stop plus large dégrade mécaniquement le gain/risque.
Les deux portes tirent en sens contraire, et un setup doit satisfaire les
deux.

#### La porte P3 en réel : le desk n'émet toujours rien

31 cycles sur `BTC_1h_real`, politique économique, 139 appels, **2,88 $**.

```
répartition des issues : CONVICTION 19, LECTURE 2, PAS_DE_SETUP 10
```

**Zéro mandat.** L'agent Stratégie s'est abstenu 10 fois sur 29 — c'est son
droit et c'est sain. Mais sur les **19 setups qu'il a proposés, les 19 ont
été arrêtés par la porte du score.** Pas un seul au-dessus de 0,60.

La qualité de schéma est de 100 % partout, sur les cinq modèles et les sept
rôles : le routage économique tient, `CAPACITES` fait son travail, et aucun
appel n'a échoué. Le câblage n'est pas en cause.

| agent | modèle | coût/décision | appels |
| --- | --- | --- | --- |
| régime | Haiku 4.5 | 0,0013 $ | 31 |
| quant | Haiku 4.5 | 0,0020 $ | 31 |
| stratégie | Opus 5 | 0,0374 $ | 29 |
| avocat du diable | Opus 5 | **0,0569 $** | 19 |

Un cycle complet coûte 0,0929 $, soit 803 $/mois à 12 décisions/heure.
L'avocat du diable est le poste le plus lourd — 1 842 jetons de sortie par
appel, 81 % de sa facture.

#### Mon erreur de calibration, et elle est nette

Les tests du scorer vérifiaient **les extrémités** de l'échelle : un setup
parfait note 1,00, un setup vide note 0,00. Ils ne vérifiaient rien entre
les deux — et c'est exactement là que vivent tous les setups réels.

Zéro sur dix-neuf n'est pas une série de décisions serrées, c'est un
plafond. Pour franchir 0,60 avec une objection de sévérité 0,5 (−0,20) et
un régime lu à 0,7 de confiance (+0,105), il faut au moins
`REGIME_AVEC + NIVEAU_NET + STOP_STRUCTUREL + CONFLUENCE_2` — soit 0,75 sur
un maximum qualitatif de 0,85. **Une seule dimension au palier moyen fait
échouer.** J'ai fixé des poids dont la somme atteint 1,00 sans jamais
regarder ce que note un setup simplement correct.

Le seuil de 0,60 est par ailleurs **hérité de l'ancienne échelle** — la
probabilité auto-déclarée du modèle — et appliqué à une échelle neuve sans
être re-dérivé. Je l'avais écrit dans la docstring de `scoring.py` et je
l'ai expédié quand même.

#### Le blocage est circulaire, et c'est le vrai problème

Le registre fantôme existe pour mesurer si les mandats du desk valent
quelque chose. `discrimination_r()` a besoin des **deux** populations —
émis et rejetés — pour dire quoi que ce soit. Avec zéro mandat émis, il n'en
reçoit qu'une.

Donc : la porte ne peut pas être calibrée sans données d'issue, et il n'y a
pas de données d'issue tant que la porte ne laisse rien passer. **En mode
fantôme, le coût d'un faux positif est nul** — c'est toute la raison d'être
du registre. Une porte réglée pour que rien ne passe ne protège de rien et
empêche d'apprendre.

#### L'outil qui manquait

Cette exécution a coûté 2,88 $ et n'a **rien laissé pour diagnostiquer** :
le détail de la note ne vivait que dans une chaîne de rejet jamais affichée,
et aucun journal n'était persisté. Le rapport imprime désormais la
distribution des scores et la médiane de chaque terme — de quoi voir d'un
coup d'œil si la porte est manquée de peu ou de loin, et quel critère
plafonne.

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

### La couverture ne détruit pas l'edge, elle l'améliore

| | nue | adossée à BTC |
| --- | --- | --- |
| moyenne / événement | +276,9 bps | +281,4 bps |
| écart-type | 1 272 bps | **1 051 bps** |
| part gagnante | 59,4 % | **64,5 %** |
| rendement / semaine | +262,8 bps | +300,4 bps |
| Sharpe annualisé | 1,80 | **2,46** |
| repli maximal (25 % du capital) | 15,3 % | **7,9 %** |
| capital final sur 135 semaines | 2,33 × | **2,66 ×** |

C'est la réponse à l'inquiétude des 136 semaines sur 130 : **si le résultat
n'était qu'une exposition courte permanente aux altcoins, la couverture
l'aurait détruit.** Elle l'améliore sur tous les axes.

Le gain vient surtout de la **variance**, pas du rendement : l'écart-type
tombe de 17 % et le taux de réussite monte de cinq points. La jambe longue
n'ajoute que +37,6 bps par semaine, soit 1,14 × de capital composé sur toute
la période — réel, mais loin d'être l'essentiel.

### Le test qui manquait, et c'est celui de la stratégie proposée

`marche_neutre` faisait le nul **par événement** sur le rendement net.
`decalage_calendaire` faisait le nul **par bloc** sur le rendement brut.
Aucun des deux ne testait la combinaison — c'est-à-dire exactement ce qui
serait tradé : un rendement net de marché, jugé contre un nul qui respecte
la dépendance entre jetons.

Le décalage calendaire tourne maintenant deux fois, brut puis net, et les
deux bras subissent la même soustraction : ne neutraliser que l'observé
fabriquerait un écart qui ne dirait rien.

### Un défaut de lecture corrigé

Le rapport annonçait « pire semaine −20,0 % » sous un titre disant
« notionnel = 25 % du capital par semaine ». Les deux chiffres sont vrais et
leur juxtaposition est fausse : cette semaine-là coûte **5 %** du compte, pas
20 %. C'est l'erreur de lecture la plus coûteuse que ce rapport puisse
provoquer — celle qui fait renoncer à une stratégie tenable. Les deux
chiffres sont maintenant affichés séparément et étiquetés.

### Le sixième contrôle : le plus sévère, et il tient

Le décalage calendaire **sur le rendement net de BTC** — un nul par bloc,
sur un rendement neutralisé. C'est exactement ce qui serait tradé, et aucun
des cinq contrôles précédents ne couvrait cette combinaison.

| tranche | n | observé | hasard | p |
| --- | --- | --- | --- | --- |
| 0,5-2 % | 367 | +133,2 | +108,8 | 0,4014 |
| 2-5 % | 317 | +290,4 | +116,4 | **0,0213** |
| > 5 % | 217 | +445,7 | +157,6 | **0,0057** |
| toutes | 850 | +264,0 | +122,0 | **0,0057** |

**Le nul est passé de +67,7 à +122,0 bps.** Un alignement quelconque de
« short alt / long BTC » rapportait déjà cela, parce qu'être short altcoin
contre BTC était en soi profitable sur la période. La neutralisation *relève
la barre* — et l'effet la franchit quand même. C'est le contrôle le plus
défavorable des six, et le seul dont le p n'est pas censuré par le plancher.

### Ce que six contrôles ne peuvent pas prouver

Ils partagent tous le même défaut, et il ne se corrige pas : **ils ont été
construits en connaissant les données.** La fenêtre J-7/J-1, les bornes des
tranches, la durée de six jours — chaque décision de méthode a été prise par
quelqu'un qui avait déjà vu le résultat. Rien n'indique qu'il y ait eu
tricherie ; tout indique qu'on ne peut pas le prouver.

Une seule chose le peut : **prédire avant de savoir.**

`scripts/journal_unlocks.py` écrit les positions à prendre avant que la
fenêtre ne s'ouvre, dans un fichier en **ajout seul**, puis relève le
résultat des semaines plus tard. Deux propriétés comptent plus que le
confort :

- **Une prédiction inscrite compte**, gagnante ou perdante. Un journal qu'on
  peut nettoyer ne mesure plus rien — il documente les trades dont on se
  souvient avec plaisir.
- **La règle est recopiée dans chaque ligne.** Si la méthode change, les
  anciennes prédictions restent jugées sur l'ancienne. Sans ça, « ajuster
  légèrement le seuil » suffirait à transformer rétroactivement un échec en
  succès.

#### Trois défauts trouvés par la première exécution réelle

Le journal v1 a inscrit seize positions, et trois d'entre elles n'auraient
pas dû exister. Chacune vient du même manquement : la règle du journal
n'était pas exactement celle qui a été validée.

- **XPL apparaissait deux fois, même date d'entrée**, à 3,2 % et 65 %. La
  validation applique `sans_chevauchement` : deux déblocages rapprochés
  produisent des fenêtres qui se recouvrent, donc une position tenue une
  fois. Le journal en inscrivait deux.
- **XPL à 65 % et 2Z à 47,7 %** sortaient de la plage validée. L'épreuve des
  dénominateurs tient jusqu'à 25 % (n = 832, +223,1 bps, p = 0,0025) ; vingt
  des 852 événements historiques la dépassent, et rien dans ces données ne
  dit ce que fait un déblocage de 65 % de l'offre. Ce n'est pas un gros
  déblocage, c'est un autre événement.
- **Aucune vérification que le jeton est cotable.** Ici les seize l'étaient,
  mais un déblocage sur un jeton qu'on ne peut pas vendre à découvert n'est
  pas une position, c'est une ligne dans un fichier.

Corrigé en **v2**. Les entrées v1 doivent être retirées, et c'est le seul
cas où l'ajout seul cède — encadré par le code, pas par une promesse :
`--purger-version` **refuse dès qu'une seule fenêtre de la version visée est
close**. Tant que rien n'est arrivé, il n'existe aucun résultat sur lequel
sélectionner. Une seconde après la première clôture, le refus est définitif.

Le relevé **refuse de conclure sous cinquante événements** et le dit à
chaque fois. Avec un écart-type de 1 050 bps, distinguer +290 de zéro en
demande cinquante à cent — soit six mois à un an. Dix trades gagnants ne
sont que du bruit, quelle que soit leur allure.

### L'edge est branché dans le desk

`sentinelle.deblocage_annonce` — le **septième** déclencheur, et le seul dont
l'edge directionnel ait été mesuré. Les six autres réveillent sur une
condition de prix, et la campagne a donné zéro survivant sur 98 cellules pour
la direction : ils savent dire qu'il se passe quelque chose, pas dans quel
sens.

Trois choses le distinguent :

- **Il n'a aucun seuil à régler.** Ses bornes — 2 % et 25 % de l'offre — ne
  sont pas des paramètres mais les limites du domaine validé.
- **Il lit des dates futures, et ce n'est pas regarder l'avenir.** Le
  calendrier de déblocage est public au moment du réveil ; DefiLlama le
  publie des mois à l'avance. La frontière est ailleurs : il ne lit jamais un
  *prix* postérieur, et un test le vérifie en tronquant la série juste après
  le réveil.
- **Il n'appelle aucun modèle.** Du Python pur sur un calendrier — la forme
  d'agent algorithmique que le pivot demandait.

### La règle du déblocage n'existe qu'à un seul endroit

`sentinelle.triggers` la définit ; le déclencheur, le journal des positions
et le rapport de validation la lisent. Trois lecteurs, une définition.

Ce n'est pas de l'élégance, c'est une réparation. **La duplication a mordu
deux fois dans ce projet :**

- `poolage` et `decalage_calendaire` ordonnaient différemment la
  déduplication et le filtre de débordement. Sur ces données les deux ordres
  donnaient les mêmes n — ils coïncidaient par chance ;
- le journal, à sa première exécution réelle, a inscrit XPL deux fois et un
  déblocage de 65 % de l'offre, parce qu'il redéfinissait la règle au lieu
  de la lire.

Une copie dérive un jour, et **la dérive ne se voit jamais dans les
chiffres** : elle se voit des mois plus tard, dans un score hors échantillon
qui ne mesure pas la stratégie qu'on croyait. Deux tests comparent
désormais les deux chemins sur un calendrier tordu — tailles aux bornes,
événements collés, entrée malformée — et exigent qu'ils rendent la même
liste.

La fusion a d'ailleurs corrigé un défaut au passage : **un déblocage sans
bougie à J-7 masque quand même son voisin de trois jours.** Il a eu lieu, la
position aurait été tenue, et le voisin reste contaminé. L'ancienne version
dédupliquait après avoir écarté les événements sans bougie, ce qui
promouvait un événement que le vrai calendrier masquait — exactement le
défaut que `poolage` et `decalage_calendaire` avaient déjà eu entre eux.

### Le chantier actions : pré-enregistré avant la moindre donnée

Le résultat crypto garde un défaut que le temps seul peut corriger — il a été
construit en connaissant les données. Le journal hors échantillon y répond en
six mois à un an.

**Une réplication sur une classe d'actifs entièrement différente y répond
autrement, et tout de suite.** Les *lockup expiries* d'IPO sont l'analogue
exact : une augmentation d'offre connue des mois à l'avance, à date fixe.

À une condition : que les règles soient écrites *avant* de voir les données.
C'est `docs/preenregistrement-lockup-actions.md`, daté et versionné — tout
écart ultérieur sera visible dans l'historique Git. Il fige la fenêtre
J-7/J-1, la convention des 180 jours post-introduction, les tranches, SPY
comme référence, et les six mêmes contrôles. Rien n'est ré-exploré.

Il écrit surtout **ce qui compterait comme réfutation**, la partie qui
engage :

- une réfutation ne détruirait pas le résultat crypto, elle le rendrait
  *propre à la crypto* — flottant étroit, détenteurs concentrés, pas de
  teneur de marché obligé ;
- sous 100 événements exploitables, rien n'est conclu, et il est dit que
  rien n'est conclu ;
- **un effet plus fort que le crypto sera traité avec méfiance.** Les
  actions sont plus liquides et plus arbitrées ; un résultat supérieur
  appellerait d'abord une recherche d'erreur dans la chaîne de données.

L'univers ne sera pas choisi à la main. Une liste écrite de mémoire ne
contiendrait que les IPO dont on se souvient — les grosses, les survivantes
— et ce biais suffirait à fabriquer l'effet.

`scripts/sonder_sources_actions.py` sonde sept sources candidates et ne parse
rien : il rapporte le code HTTP et la **structure** de ce qui revient, parce
qu'un parseur se casse sur une forme inattendue, jamais sur une valeur
inattendue. La politique réseau de l'environnement de développement les
refuse toutes (403 sur stooq, SEC, Nasdaq, Yahoo) ; la sonde tourne donc
ailleurs, et le parseur ne sera écrit qu'après lecture de sa sortie.

C'est la leçon de `fetch_unlocks.py`, écrit contre une API supposée devenue
payante et une structure devinée : propre, testé, entièrement faux.

---

## Le poste de pilotage — sept secteurs, et la règle qui les gouverne

`python -m trading_desk` sert l'interface sur `127.0.0.1:8787`. Elle ne passe
**aucun ordre** : elle peut arrêter le desk, elle ne peut pas le faire trader.
Un tableau de bord qui ouvre une position est un tableau de bord qu'on peut
cliquer par erreur.

Une règle unique la gouverne : **un artefact absent est une information, pas
une panne.** Chaque panneau vide nomme le fichier qu'il attend et donne la
commande qui le produit. Un vide qui ne s'explique pas finit par être lu comme
« tout va bien ».

| secteur | ce qu'il montre |
| --- | --- |
| **PRÉ-VOL** | la liste de vérifications, et ce qui bloque le décollage |
| **TÉLÉMÉTRIE** | la collecte Parquet : fichiers, flux, dernier battement |
| **NAVIGATION** | le journal hors échantillon des déblocages |
| **SOUFFLERIE** | les campagnes de validation, et les courbes contre HODL |
| **CONSOMMATION** | coût par décision, qualité de schéma, distribution des scores |
| **VOLS** | mandats, exécutions, P&L réalisé |
| **SYSTÈMES** | invariants, mandat, flux, budget, positions, journal |

**PRÉ-VOL remplace « trades en cours » et fait mieux que lui** : il dit
pourquoi il n'y en a pas. Chaque ligne est verte, orange ou rouge, et la
différence entre les deux dernières est celle qui compte — une attente se
résout avec du temps, un blocage demande une décision.

### Trois choses que cette interface refuse de faire

**Elle ne trace pas une ligne plate à zéro pour un P&L jamais commencé.** Le
panneau VOLS affiche « aucun vol effectué » et la cause mesurée : 19 setups
proposés, 19 arrêtés au portier du score, 0 mandat. Une ligne plate
suggérerait qu'on a tradé sans rien gagner, ce qui n'est pas ce qui s'est
passé.

**Elle n'additionne pas l'amplitude et la direction.** Les 59 cellules qui
survivent en amplitude ne disent pas dans quel sens. Les compter comme un edge
afficherait « 66 cellules survivent » sur un projet dont toutes les campagnes
directionnelles concluent à zéro.

**Elle ne trace pas une courbe issue de zéro trade.** Avec le plafond de stop
de production (500 bps), `tsmom BTC 1d` fait zéro trade et 2 158 rejets. La
courbe plate qui en résulterait, tracée à côté de « détenir BTC », se lirait
« la stratégie a perdu » alors qu'elle n'a jamais pris de position. Les
courbes utilisent le plafond des campagnes (5 000 bps), et l'endpoint expose
`sans_trade`.

### Le criblage annonce s'il pouvait voir

Nouveau, et ça mord sur les résultats déjà publiés. Un test de randomisation à
D tirages a un plancher de p à `1/(D+1)`. Benjamini-Hochberg exige `α/m` au
rang 1. Quand le plancher dépasse ce seuil, **aucune cellule ne peut survivre
quelle que soit la donnée**.

`baselines/grille.json` a été produit à 200 tirages : plancher 0,005, seuil de
rang 1 à 0,0009 sur 56 cellules. Il faudrait **huit cellules simultanément au
plancher** pour qu'une seule survive. Le « zéro survivant » qu'on lit dans ce
fichier ne réfute rien — il faudrait le relancer à 1 400 tirages au moins. Le
résultat publié plus haut (un survivant sur 56) vient d'une exécution à 2 000
tirages dont l'artefact n'est pas dans le dépôt.

La tentation était de **déduire** le nombre de tirages du plus petit p
observé. C'est faux : ce minimum majore le plancher sans le déterminer. Le
premier essai déclarait ainsi aveugle la campagne « direction » des
déclencheurs — tournée à 2 000 tirages, mais dont aucune cellule n'a saturé le
plancher. Transformer une réfutation solide en « on ne sait pas » est la pire
des deux erreurs possibles. Les artefacts inscrivent maintenant leurs tirages ;
quand ils se taisent, l'interface se tait aussi.

### Les déblocages : deux tests, deux conclusions, un seul fichier

`baselines/unlocks.json` porte désormais **les deux** tests de la même
hypothèse, et ils concluent l'inverse l'un de l'autre :

| test | tests | p < 0,05 | attendus | survivants BH |
| --- | ---: | ---: | ---: | ---: |
| criblage par jeton | 269 | 25 | 13,5 | **0** |
| test poolé | 16 | 4 | 0,8 | **4** |

Ce n'est pas une contradiction, c'est une différence de puissance. L'hypothèse
posée d'avance est un effet **commun** à tous les jetons. Le criblage
l'évalue 269 fois séparément sur des effectifs d'une vingtaine d'événements,
puis corrige sur 269 tests : un effet réel mais modeste ne peut pas y
survivre. Le poolage teste la même hypothèse sur 852 événements.

Le contrôle de résolution le confirme et c'est ce qui rend la lecture
tenable : à 2 000 tirages sur 269 cellules, il faudrait **trois cellules
simultanément au plancher** pour qu'une seule survive — il en faudrait 5 379
pour isoler un jeton. Le zéro du criblage par jeton est **sous-résolu, pas
réfutant**. Celui du poolage, à 16 tests, voit une cellule isolée : son
verdict porte sur la donnée.

**L'interface affiche les deux, dans cet ordre.** Jusqu'au 9 septembre 2026,
`--out` n'écrivait que le criblage par jeton : un tableau de bord qui l'aurait
lu aurait annoncé la mort du seul edge directionnel du dépôt.

### Brancher la collecte

Le panneau TÉLÉMÉTRIE dit « ailleurs » tant que `DESK_ENREGISTREUR_RACINE`
n'est pas posé. C'est exact sur une machine de développement : l'enregistreur
tourne sous systemd sur le VPS. Sur le VPS lui-même :

```bash
DESK_ENREGISTREUR_RACINE=/var/lib/desk python -m trading_desk
```

---

## Le mode PAPER — exécution simulée contre le carnet réel

Le desk passe des ordres. Pas de vrais : contre un simulateur qui remplit sur
le carnet L2 **du marché réel**, sans signer ni envoyer quoi que ce soit.

```bash
DESK_MODE=PAPER DESK_TESTNET=false DESK_MAX_STOP_DISTANCE_BPS=1600 python -m trading_desk
```

`DESK_TESTNET=false` n'est pas une imprudence : PAPER ne signe rien et
n'envoie rien, mais l'intérêt du moteur est de remplir sur un **vrai** carnet.
Les carnets testnet sont minces et figés — ils produiraient des fills qui ne
ressemblent à rien.

### Ce que ce moteur refuse de faire

Un moteur papier est facile à rendre menteur, et le mensonge ne se voit pas :
il produit une courbe plausible qui ne survit pas au premier ordre réel.
Quatre raccourcis, quatre refus :

| raccourci tentant | ce que fait ce moteur |
| --- | --- |
| remplir au mid | **traverse le carnet** — le prix est la moyenne pondérée de ce qu'on a mangé |
| remplir n'importe quelle taille | **tronque au-delà de 10 %** de la profondeur visible |
| servir un passif quand le prix touche la limite | exige une **impression**, au plus à concurrence du volume imprimé |
| ignorer le portage | **facture le funding** à l'heure, même modèle que les backtests |

Chacun est défendu par un test qui échoue si on prend le raccourci. Ce que le
moteur ne simule pas et qu'il faut garder en tête : l'impact permanent de
l'ordre sur le prix, la réaction des autres participants, et le fait qu'un
carnet peut disparaître pendant une cascade. **Le papier reste optimiste.**

### Le signal : les déblocages, et rien d'autre

Le desk d'agents n'émet aucun mandat et son quota revient le 1er octobre. Il
n'est pas sur le chemin. Le signal branché est la règle des déblocages —
mécanique, sans LLM, et le seul edge directionnel mesuré du dépôt.

**Il ne trade que ce que le journal contient déjà.** Un déblocage découvert et
tradé le même jour ne serait pas hors échantillon. Sans
`data/journal_unlocks.jsonl`, le mode PAPER **refuse de démarrer** plutôt que
de calculer des entrées à la volée.

### Deux écarts avec la règle validée, à connaître

**Le stop.** La règle mesurée n'en a pas : elle entre à J-7, sort à J-1. Mais
une position sans stop est refusée par les invariants, et `size_position` a
besoin d'une distance pour donner une taille. Le stop est donc posé à **15 %**
du prix d'entrée. **Son effet sur l'edge n'est pas mesuré** — c'est un
garde-fou opérationnel, pas une composante validée, et il rend le résultat
live légèrement différent du backtest.

**La bande de stop du déploiement.** Le défaut `[30, 500]` bps vise du BTC
intraday. À 5 %, un stop sur un alt tenu six jours se fait balayer par le
bruit. D'où `DESK_MAX_STOP_DISTANCE_BPS=1600`, qui est un choix explicite.

### Ce que le paper trading valide, et ce qu'il ne valide pas

Il valide **la machine** : construction d'ordre, dimensionnement, stops,
réconciliation, comptabilité. C'est ce qu'il faut valider avant d'engager quoi
que ce soit.

Il ne valide **pas l'edge**. À ~15 positions par mois, un mois de papier donne
15 observations — du bruit. La validation de l'edge reste le journal hors
échantillon, et lui est calendaire : 50 fenêtres closes vers janvier 2027.

### Six bugs trouvés en le construisant

Aucun n'aurait planté. Tous auraient produit des chiffres faux ou des trades
manqués, en silence :

1. **Une occasion consommée par un refus.** Le pilote rayait l'entrée dès la
   lecture ; le desk en amorçage la demandait, le risque refusait, et la
   fenêtre était perdue pour de bon. Vu sur le premier desk lancé : la
   position ETH n'a jamais été prise. Corrigé — on ne raye qu'à la
   confirmation d'ouverture.
2. **Le desk s'arrêtait définitivement une seconde après chaque démarrage**,
   sur des invariants qui échouaient légitimement avant la première
   connexion. L'arrêt était *latché* et exigeait un réarmement manuel. Le
   défaut valait aussi pour SHADOW, où il se voyait moins.
3. **`DESK_ASSETS=BTC,ETH` faisait planter le démarrage** — la valeur que
   `.env.example` documente. pydantic-settings décodait en JSON avant le
   validateur. Le bug était là depuis l'origine.
4. **Un ordre passif partiellement rempli cessait de se remplir.**
5. **Les fills n'arrivaient pas en base** : le desk tradait, le panneau VOLS
   restait vide.
6. **Un mandat de sept jours refusé par son propre contrat** — et le contrat
   avait raison : un mandat autorise les *entrées d'un cycle*, pas l'existence
   d'une position pendant six jours.
