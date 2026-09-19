# Runbook — la validation hors échantillon des déblocages

Ce runbook couvre la seule mesure du dépôt qui ne puisse pas être trafiquée
après coup : **175 positions écrites avant les faits**, dans un fichier en
ajout seul, versionné.

Tout le reste — six contrôles, jackknife, coupe temporelle, neutralisation,
décalage calendaire — a été construit en connaissant les données. Ça ne se
répare pas. Une seule chose le peut : prédire avant de savoir.

---

## 1. Ce qui est déjà fait, et qui n'est pas à refaire

Le journal est **déjà amorcé et commité** : `data/journal_unlocks.jsonl`,
175 positions, de septembre 2026 à mars 2030. La date du commit git est la
preuve, et elle ne dépend d'aucune machine.

Chaque ligne porte :

| champ | à quoi il sert |
|---|---|
| `entree_ms` / `sortie_ms` | la fenêtre J-7 → J-1, figée |
| `part_offre` | la taille du déblocage au calendrier du jour d'inscription |
| `horizon_j` | le préavis — 0 jour ou 900, ce n'est pas la même prédiction |
| `calendrier` | l'empreinte du calendrier dont elle sort |
| `protocole` | l'empreinte de la règle qui la NOTERA |
| `version` | la version de la règle qui l'a produite |

`protocole` est le champ qui manquait jusqu'ici. Savoir d'avance ce qu'on
inscrit ne sert à rien si l'on choisit après coup comment le compter.

**Ne jamais réécrire ce fichier.** `--purger-version` existe, et il refuse
dès qu'une seule fenêtre de la version visée est close — le refus est dans
le code, pas dans une promesse.

---

## 2. Le rituel hebdomadaire, sur le VPS

Le service `rituel-deblocages` **n'a jamais été installé**. C'est pour ça
que l'horizon d'inscription est passé à « tout l'avenir » : la preuve ne
doit pas dépendre de la régularité de l'exploitant. Mais le rituel reste
nécessaire pour deux choses que rien d'autre ne fait :

1. **rafraîchir le calendrier** — chaque jeton que DefiLlama ajoute
   rapproche la conclusion, et c'est le seul levier qui existe ;
2. **relever les fenêtres closes**.

### Installation

L'installateur pose déjà les deux unités et active le timer. Sur le VPS,
dans le clone de travail :

```bash
cd ~/dashboard && git pull origin claude/trading-desk-p3-launch-e16cdi
sudo bash ~/dashboard/desk/deploy/installer.sh
```

Si l'installateur refuse parce que `/opt/desk/src` porte des modifications
locales ou n'est pas à jour, les deux unités s'installent aussi à la main :

```bash
sudo cp ~/dashboard/desk/deploy/rituel-deblocages.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rituel-deblocages.timer
systemctl list-timers --no-pager rituel-deblocages.timer
```

> Le fichier d'unité pointe sur `/opt/desk/src/desk`. Si le clone de travail
> est ailleurs, corriger `WorkingDirectory=`, `ExecStart=` et
> `ReadWritePaths=` **avant** le `daemon-reload` — sinon systemd refuse de
> démarrer avec un message qui ne nomme pas le chemin fautif.

### Vérifier qu'il a réellement tourné

`systemctl status` affiche « active » qu'il ait collecté ou non. Ce qui se
regarde :

```bash
systemctl list-timers --no-pager rituel-deblocages.timer   # la prochaine
journalctl -u rituel-deblocages -n 60 --no-pager           # la dernière
git -C ~/dashboard log --oneline -3 -- desk/data/journal_unlocks.jsonl
```

Le service est `Type=oneshot` **sans `Restart=`** : un échec doit RESTER en
échec. Un service qui se relance tout seul efface la trace de la panne.

### Renvoyer le journal

Le journal vit sur la machine qui le remplit. Pour qu'il compte, il doit
revenir dans git :

```bash
cd ~/dashboard
git add desk/data/journal_unlocks.jsonl desk/data/unlocks.json
git commit -m "Releve hebdomadaire des deblocages"
git push origin claude/trading-desk-p3-launch-e16cdi
```

---

## 3. Lire un relevé

```bash
python3 scripts/journal_unlocks.py --resoudre
```

Ce qui compte, dans l'ordre :

**L'excès, pas la moyenne.** Le relevé imprime `observé`, `hasard` et
`excès`. C'est la troisième colonne qui mesure la règle. Vendre un altcoin
au hasard six jours, couvert en BTC, rapportait +123,5 bps sur la période
historique : une moyenne de +150 bps n'est pas un succès, c'est un échec.

**La mesure primaire est le net de BTC**, déclarée d'avance dans
`trading_desk.pronostic`. Le brut s'affiche en second et ne tranche rien.

**L'avancement.** Sous 103 positions closes, le relevé refuse de conclure et
le dit. Avec un écart-type de 1 131 bps par position, dix trades gagnants ne
sont que du bruit, quelle que soit leur allure.

**Le détail par préavis.** Une prédiction écrite sept jours à l'avance et
une écrite huit cents jours à l'avance sont toutes deux hors échantillon,
mais pas de la même qualité. Le préavis long dilue ; il ne biaise pas.

---

## 4. Ce que ce test peut et ne peut pas donner

| | |
|---|---|
| positions inscrites | 175 (176 éligibles, une fenêtre déjà ouverte le jour du gel) |
| première clôture | 25 septembre 2026 |
| 103 closes — une chance sur deux | vers le milieu de 2027 |
| 210 closes — quatre chances sur cinq | **hors d'atteinte de ce calendrier** |

Le calendrier couvre 68 jetons ; Hyperliquid en cote 234. Élargir la
couverture est le seul levier qui raccourcisse l'attente, et il passe par le
rituel — `api.llama.fi` n'est pas joignable depuis l'environnement de
développement, seulement depuis le VPS.

---

## 5. Ce qu'il ne faut pas faire

- **Ne pas relancer `--resoudre` jusqu'à ce qu'il plaise.** La graine du
  bras de hasard est figée : deux relevés du même jour donnent le même
  chiffre. C'est volontaire.
- **Ne pas ajuster la règle en cours de route.** Toute modification de
  `pronostic` change son empreinte et casse un test, ce qui oblige à
  incrémenter la VERSION — donc à noter les positions déjà inscrites sur le
  protocole sous lequel elles ont été écrites.
- **Ne pas retirer les lignes d'un déblocage repoussé.** Le nouveau
  s'ajoute, l'ancien reste. Retirer celui qui est devenu caduc supposerait
  de décider, après avoir vu le prix, laquelle des deux dates était la
  bonne.
- **Ne pas conclure sur une jolie série.** Le relevé le dit lui-même à
  chaque passage, et c'est le seul garde-fou qui tienne quand le chiffre est
  flatteur.
