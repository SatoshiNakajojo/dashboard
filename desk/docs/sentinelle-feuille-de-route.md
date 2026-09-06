# La Sentinelle — déclencheurs et protocole de validation

Le passage au déclencheur règle le **coût** (÷288, le levier dominant). Il ne
règle pas les −0,23 R du générateur de signal : réveiller le desk moins
souvent ne crée pas d'edge, **sauf si les déclencheurs sélectionnent des
moments où un edge existe.**

C'est une hypothèse, pas un acquis, et elle se teste — gratuitement, sur
l'historique déjà en dépôt, avant toute mise en production.

## Les six déclencheurs

| # | déclencheur | formule | testable aujourd'hui ? |
|---|---|---|---|
| 1 | Pic de volume | z-score du volume sur 168 barres > 3 | ✅ OHLCV |
| 2 | Funding extrême cumulé | Σ funding 24 h > 95ᵉ centile glissant **ET** prix contraire | ✅ `data/*_funding.json` |
| 3 | Cascade de liquidations (proxy) | range > 4×ATR **ET** volume z > 3 **ET** clôture dans le tiers opposé à la mèche | ✅ OHLCV |
| 4 | Rupture de régime de volatilité | vol 24 h / vol 168 h > 2,5 | ✅ OHLCV |
| 5 | Saut d'open interest | ΔOI 1 h > 3σ à prix stable | ❌ enregistrement requis |
| 6 | Smart money | prise de position massive d'un portefeuille suivi | ❌ enregistrement requis |

## Protocole de validation — le même que celui qui a recalé six stratégies

```
pour chaque déclencheur :
    fenêtres déclenchées  → distribution du rendement à H heures
    fenêtres au hasard    → même nombre, même actif, même horizon
    p = part des tirages nuls qui font aussi bien
    correction de Benjamini-Hochberg sur TOUTES les hypothèses ensemble
```

Un déclencheur qui échoue reste une économie légitime — il faut seulement
savoir lequel des deux on a acheté.

## Déclencheur n°6 : « Smart money »

### Le mécanisme est plus simple que prévu

Il n'est **pas** nécessaire d'interroger `clearinghouseState` en boucle. Le
flux WebSocket `trades` porte un champ `users` — les deux adresses de chaque
transaction :

```json
{"coin":"BTC","side":"A","px":"79889.0","sz":"0.00054",
 "users":["0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00",
          "0x4d2a7e458a9091cf678b3a4a21d4be019870ebaa"]}
```

Les exécutions d'un portefeuille suivi apparaissent donc **en temps réel dans
un flux qu'on enregistre déjà**, sans appel supplémentaire ni limite de débit.
C'est pour cette raison que `users` est conservé dans le schéma Parquet alors
que les contrats du desk le jettent : on ne savait pas encore qu'on en aurait
besoin, et un enregistrement qui préjuge de l'analyse fait perdre les données
qu'on n'avait pas prévu de vouloir.

### Le piège, et il a déjà tué deux hypothèses de ce projet

**Choisir des portefeuilles rentables *a posteriori*, puis mesurer s'il aurait
fallu les suivre, est un biais de survivance.** Sur des milliers d'adresses,
quelques-unes affichent un historique brillant par pur hasard — et rien ne
distingue, dans le passé, la compétence de la chance. C'est exactement
l'erreur que la correction de Benjamini-Hochberg a servi à écarter sur la
grille de stratégies.

Le protocole correct sépare la sélection de l'évaluation, dans le temps :

```
    fenêtre d'APPRENTISSAGE          fenêtre de TEST
    (sélection des portefeuilles)    (mesure du suivi)
    |------------------------------|------------------------|
       classer par P&L réalisé        aucun reclassement,
       retenir le top N               aucun remplacement
```

Trois règles qui rendent le test honnête :

1. **Aucun reclassement pendant le test.** Remplacer un portefeuille qui
   sous-performe réintroduit exactement le biais qu'on cherche à éviter.
2. **Compter la latence.** Suivre une position, c'est entrer après elle. Le
   test doit entrer à la barre *suivante*, jamais au prix de l'adresse suivie.
3. **Comparer au modèle nul**, avec le même nombre de trades, le même sens et
   les mêmes distances de stop, entrées au hasard. Un portefeuille brillant
   dans un marché haussier suit surtout le marché.

Sans les semaines d'enregistrement, ce protocole n'a pas de fenêtre de test :
c'est le point 6 de la feuille de route, pas le point 1.
