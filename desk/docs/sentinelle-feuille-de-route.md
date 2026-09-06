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

---

## Déclencheur n°7 : le déblocage annoncé — **le seul dont l'edge est mesuré**

Les six précédents réveillent le desk sur une condition de PRIX, et la
campagne de validation a été nette : **zéro survivant sur 98 cellules** pour
la direction. Ils savent dire qu'il se passe quelque chose, pas dans quel
sens.

Celui-ci est d'une autre nature. Il réveille sur un **calendrier public**,
sept jours avant un déblocage de jetons, avec une hypothèse baissière posée
d'avance. Son edge a survécu à six contrôles : dénominateurs aberrants,
jackknife par jeton, coupe temporelle, neutralisation par BTC, décalage
calendaire, et décalage calendaire sur le rendement net. +290 bps sur la
tranche 2-5 %.

`sentinelle.deblocage_annonce`. Trois propriétés le distinguent des autres :

- **Il n'a pas de seuil à régler.** Ses bornes — 2 % et 25 % de l'offre —
  ne sont pas des paramètres mais les limites du domaine validé. En dessous
  aucun contrôle ne survit ; au-dessus on sort de la plage mesurée, et un
  déblocage de 65 % de l'offre n'est pas un gros déblocage, c'est un autre
  événement.
- **Il lit des dates futures, et ce n'est pas regarder l'avenir.** Le
  calendrier est public au moment du réveil. La frontière est ailleurs : il
  ne lit jamais un PRIX postérieur, et un test le vérifie en tronquant la
  série juste après le réveil.
- **Il n'appelle aucun modèle.** C'est du Python pur sur un calendrier —
  exactement la forme d'agent algorithmique que le pivot demandait.

Ce qu'il ne prouve pas : que l'effet tienne demain. Six contrôles
historiques partagent le même défaut, qui ne se corrige pas — ils ont été
construits en connaissant les données. `scripts/journal_unlocks.py` inscrit
les positions avant les faits ; c'est la seule réponse possible, et elle
prend six mois à un an.

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
