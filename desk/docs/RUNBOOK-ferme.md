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

## D'abord : on ne DEVIENT pas `desk`, on exécute EN TANT QUE `desk`

Trois choses à savoir avant la première commande. Elles ont chacune coûté un
message d'erreur trompeur.

**`desk` est un compte SYSTÈME, sans shell de connexion.** Il est créé par
`useradd --system`, donc `sudo -i -u desk` répond *This account is currently
not available* — et c'est voulu, pas cassé : un compte de service qui ne peut
pas ouvrir de session est une surface d'attaque en moins. On n'ouvre donc pas
de session, on exécute une commande à la fois :

```bash
sudo -u desk <commande>
```

C'est exactement ce que fait `installer.sh`, ligne par ligne.

**Le dépôt git est `/opt/desk/src`, pas `/opt/desk/src/desk`.** Le second est
le sous-dossier du desk À L'INTÉRIEUR du dépôt. Pointer git sur le mauvais
fait remonter l'arbre jusqu'au vrai et rend un message qui parle d'autre
chose.

**Ne lancez pas git en root.** `sudo git …` sur un arbre appartenant à `desk`
déclenche *detected dubious ownership*, et la solution que git propose
(`safe.directory`) traite le symptôme : la vraie réponse est de ne pas être
root. En `sudo -u desk`, la question ne se pose pas.

```bash
# Où est-ce, et à qui ?
sudo ls -ld /opt/desk /opt/desk/src /opt/desk/src/desk

# Est-ce bien un dépôt, et sur quelle branche ?
sudo -u desk git -C /opt/desk/src rev-parse --abbrev-ref HEAD
sudo -u desk git -C /opt/desk/src status --short
```

Si `cd` depuis votre compte rend *Permission denied* alors que le dossier
final est en `drwxr-xr-x`, c'est un PARENT qui bloque la traversée.
`namei -l /opt/desk/src/desk` montre lequel en une ligne. Ça ne gêne en rien :
`sudo -u desk` ne traverse pas depuis votre compte.

Si `ls -ld` répond *No such file or directory*, l'installeur n'a jamais tourné
sur cette machine : voir `deploy/README.md`, section Installation.

## Lancer

```bash
sudo bash /opt/desk/src/desk/deploy/installer.sh   # idempotent, à lancer en root
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

**C'est le premier travail à faire sur le VPS, avant tout balayage.** En tant
que `desk` (voir plus haut), et sans supposer que les fichiers sont là :

```bash
# 1. Est-ce que la donnée existe, et sous quel nom ?
sudo ls -lh /opt/desk/src/desk/data/ /opt/desk/src/desk/baselines/
sudo find / -name 'unlocks*.json' -not -path '/proc/*' 2>/dev/null

# 2. Le rituel a-t-il seulement tourné ?
systemctl status rituel-deblocages.service --no-pager
journalctl -u rituel-deblocages -n 50 --no-pager

# 3. S'ils sont là, les rapatrier. Les chemins sont RELATIFS à /opt/desk/src,
#    la racine du dépôt — donc préfixés par `desk/`. Et `-f` parce que `data/`
#    peut être ignoré.
sudo -u desk git -C /opt/desk/src add -f desk/data/unlocks.json desk/baselines/unlocks.json
sudo -u desk git -C /opt/desk/src commit -m "Rapatrie la donnee des deblocages"
sudo -u desk git -C /opt/desk/src push origin claude/trading-desk-p3-launch-e16cdi
```

Le `push` demandera de quoi s'authentifier auprès de GitHub. Si `desk` n'a pas
d'identifiants — c'est le cas par défaut, l'installeur ne fait que `fetch` —
la voie la plus simple reste de copier les deux fichiers hors de l'arbre et de
les pousser depuis votre compte :

```bash
sudo cp /opt/desk/src/desk/data/unlocks.json ~/ && sudo chown "$USER" ~/unlocks.json
```

Si l'étape 1 ne trouve rien et que l'étape 2 montre un service en échec, alors
la donnée n'existe nulle part — et la seule règle validée du projet repose sur
une mesure que plus personne ne peut reproduire. Le dire est plus utile que de
chercher un fichier qui n'a jamais été écrit.
