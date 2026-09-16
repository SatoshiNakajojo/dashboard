# Parité testnet — ce qu'il faut vérifier avant de croire un test

Le testnet Hyperliquid n'est pas le mainnet en plus petit. Ses carnets sont
minces, ses frais peuvent différer, et ses métadonnées d'actifs ne sont pas
toujours à jour. **Un desk qui passe sur testnet n'a pas prouvé qu'il passera
en mainnet** — il a prouvé qu'il ne casse pas sur les chemins communs.

Cette checklist sépare les deux.

## Ce que le testnet prouve vraiment

| Vérification | Prouvé sur testnet ? | Pourquoi |
|---|---|---|
| Signature et nonce acceptés | **oui** | même schéma cryptographique |
| Format du fil (`a`, `b`, `p`, `s`, `r`, `t`) | **oui** | même encodage |
| Arrondis de prix et de taille | **partiellement** | `szDecimals` peut différer par actif |
| Reduce-only honoré | **oui** | même moteur d'appariement |
| Rejets d'ordre et leurs messages | **oui** | mêmes codes |
| Slippage réel | **non** | carnets sans rapport |
| Funding | **non** | taux artificiels |
| Notionnel minimal | **à revérifier** | seuil susceptible de différer |

## Avant de passer en TESTNET

- [ ] `DESK_MODE=TESTNET` **et** `DESK_TESTNET=true` — la configuration refuse
      déjà la combinaison inverse, mais vérifier le message au démarrage.
- [ ] Clé de signature lue depuis `DESK_HYPERLIQUID_PRIVATE_KEY`, **jamais**
      dans un fichier de configuration.
- [ ] Le portefeuille signataire est un **agent**, pas le compte maître.
- [ ] Aucun droit de retrait sur la clé utilisée.
- [ ] La bande de stop du mandat couvre celle des règles branchées — le desk
      le vérifie au démarrage (`_verifier_la_bande_de_stop`), lire sa sortie.

## Les six chemins à exercer, dans cet ordre

Chacun produit une trace vérifiable. Un chemin non exercé est un chemin non
prouvé — et c'est celui qui cassera.

1. **Réconciliation au démarrage.** Le cockpit affiche
   `Réconciliation : convergée` avec son détail. Si elle dit `JAMAIS`, rien
   d'autre ne compte : I01 bloque toute entrée, et c'est voulu.
2. **Ouverture.** Une position, avec son stop posé côté exchange. Vérifier que
   `protected` est vrai dans le panneau des positions.
3. **Fermeture partielle.** `flatten(asset, ctx, size=…)` avec une taille
   inférieure à la position. Vérifier côté exchange que la position restante
   vaut bien la différence — c'est le point que la conversation signalait
   comme cassé, et qui ne l'est pas ici : le contrat porte `reduce_only`, le
   fil le transmet (`"r"`), et le notionnel minimal n'est **pas** appliqué aux
   ordres réducteurs.
4. **Fermeture totale.** Position à zéro, stop annulé, aucun ordre résiduel au
   carnet.
5. **Crash et redémarrage.** Tuer le processus position ouverte, relancer.
   La réconciliation doit trouver la position, la déclarer orpheline si elle
   n'est pas dans l'univers connu, et poser un stop ou fermer.
6. **Slippage.** Le panneau `Glissement réel` doit se remplir. Sur testnet le
   chiffre ne vaut rien en valeur — ce qu'on vérifie, c'est que la mesure
   s'écrit, avec le bon signe (positif = coût).

## Ce qu'il faut remesurer en mainnet, sans exception

- **Le slippage**, à la taille réellement engagée. La mesure du 15 septembre
  2026 donne 0,05 à 0,21 bps à la taille du desk, contre 3,0 bps supposés par
  le modèle de coûts.
- **Le funding**, qui est une charge réelle sur une position tenue.
- **Le notionnel minimal**, en ouvrant un ordre délibérément trop petit et en
  lisant le message de rejet.
- **Les `szDecimals` de chaque actif tradé**, via `meta`. Un arrondi qui passe
  sur testnet et casse en mainnet est le scénario le plus coûteux de la liste,
  parce qu'il ne se voit qu'à l'envoi.

## Ce que cette checklist ne couvre pas

La latence et le ping depuis le VPS. Ils ne se mesurent qu'en conditions
réelles, et ils font partie de l'écart entre le paper et le live que le
scorer prend en compte séparément.
