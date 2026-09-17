# Runbook — la ferme de calcul sur le VPS

Ce document existe parce qu'une seule chose dans ce dépôt est réellement
bornée par le calcul, et qu'il vaut mieux savoir laquelle avant d'acheter des
cœurs.

## Ce qui coûte, et ce qui ne coûte pas

Mesuré le 17 septembre 2026, sur la machine de développement (4 cœurs) :

| travail | coût | borné par |
|---|---|---|
| la grille stratégie × saison, 26 actifs | **6 s** | l'information |
| un balayage, 1 règle × 26 actifs en 4 h | **552 s** | le calcul |
| 11 règles × 26 actifs en 4 h | **~1,7 h** séquentiel | le calcul |

Ce qui coûte, ce sont les **modèles nuls de randomisation** : 2 000 backtests
complets par cellule. Tout le reste est instantané à côté.

**Ne lancez pas la ferme pour gagner de la puissance statistique.** Elle n'en
donne pas. Chaque cellule entre au dénominateur de son origine : six balayages
ont déjà porté `balayage` à 157 familles, soit un seuil au rang 1 de 0,00032.
La ferme pose les questions **plus vite**, elle n'en rend aucune plus facile.

## Lancer

```bash
sudo bash /opt/desk/src/desk/deploy/installer.sh   # idempotent
sudo systemctl start ferme
journalctl -u ferme -f
```

Pas de timer, et c'est délibéré : un balayage est une décision, pas une
routine. Pour un lot précis, à la main :

```bash
cd /opt/desk/src/desk
/opt/desk/.venv/bin/python scripts/ferme.py \
    --strategies tsmom supertrend --intervalle 4h --coeurs 6
```

## Deux propriétés à connaître

**La reprise est par signature.** Une ferme tuée à la troisième heure reprend
où elle en était : elle saute les cellules déjà au registre **avec au moins**
le nombre de tirages demandé. Une cellule inscrite à 600 tirages n'est pas une
cellule à 2 000, et elle sera refaite. `--tout-refaire` désactive la reprise.

**La ferme cède le pas à l'enregistreur** (`Nice=10`, `CPUWeight=20`). Celui-ci
lit un flux temps réel : un message raté est perdu pour toujours, alors qu'une
cellule retardée est juste retardée. Sans ça, huit processus de backtest
prennent la machine et l'historique se troue en silence.

## Si la ferme se fait tuer par l'OOM

Baissez `--coeurs` **avant** de monter `MemoryMax`. La mémoire par ouvrier
(~200 Mo) ne dépend pas du nombre d'ouvriers ; le total, si.

## Ramener le travail

Le registre est en ajout seul, donc un `git pull` ne le fusionnera pas tout
seul si les deux côtés ont écrit. Depuis le VPS :

```bash
cd /opt/desk/src/desk
git add data/registre_atelier.jsonl baselines/
git commit -m "Ferme du <date> : <n> cellules"
git push origin <branche>
```

En cas de conflit sur le registre, **gardez les deux côtés** : c'est un
journal, pas un état. Deux lots d'essais sont deux lots d'essais, et
`dernier_par_signature` fait le tri à la lecture.

## Ce qui manque au dépôt et qui n'est QUE sur le VPS

`data/unlocks.json` et `baselines/unlocks.json` **ne sont pas dans le dépôt** —
vérifié le 17 septembre 2026, jamais commités. C'est la donnée et l'artefact
de la **seule règle validée du projet** (852 événements, +236 bps contre +75
au hasard, p = 0,0010).

Conséquence : cette règle n'est pas reproductible ailleurs que sur le VPS, et
`api.llama.fi/emissions` répond désormais **402 Payment Required**. Si le VPS
est perdu, la donnée l'est aussi.

**C'est le premier travail à faire sur le VPS, avant tout balayage :**

```bash
cd /opt/desk/src/desk
ls -lh data/unlocks.json baselines/unlocks.json
git add -f data/unlocks.json baselines/unlocks.json
git commit -m "Rapatrie la donnee des deblocages : elle n'existait que sur le VPS"
git push origin <branche>
```
