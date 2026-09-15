# Déploiement de l'Enregistreur sur un VPS Ubuntu

L'API Hyperliquid ne sert **aucun historique** de carnet, de liquidations ni
d'open interest : `l2Book` renvoie l'instantané courant, et il n'existe pas
d'endpoint de liquidations. On ne peut donc pas backtester la microstructure —
il faut l'enregistrer en avant, et ce délai n'a aucun raccourci. C'est la
seule raison d'être de ce service, et pourquoi il est le point 1 de la
feuille de route : les données s'accumulent pendant qu'on travaille au reste.

## Ce que ça coûte en disque — mesuré, pas estimé

Débits relevés le 6 septembre 2026 sur BTC/ETH/SOL, 60 s de flux réel :

| canal | msg/s (3 actifs) | extrapolé 7 actifs |
|---|---:|---:|
| `activeAssetCtx` | 3,0 | 179 Mo/jour |
| `bbo` | 9,6 | 265 Mo/jour |
| `l2Book` | 0,6 | 183 Mo/jour |
| `trades` | 1,0 | 151 Mo/jour |
| **total JSON brut** | | **778 Mo/jour** |
| **après Parquet + zstd** | | **≈ 100 Mo/jour, ~3 Go/mois** |

**Ce relevé date d'un marché calme.** Une cascade de liquidations multiplie le
débit de `trades` par un à deux ordres de grandeur pendant quelques minutes.
Le dimensionnement doit tenir cette pointe, pas la moyenne :

> **Prévoyez 100 Go de SSD.** Trois ans de marge au débit calme, et de quoi
> absorber des journées de forte volatilité sans jamais approcher le seuil.

Le service s'arrête d'écrire — et le hurle dans le journal — sous **2 Go
libres**. Écrire jusqu'à saturation ferait tomber le VPS entier, pas seulement
l'enregistreur.

## Mettre à jour : une seule commande

Après la première installation, tout passe par là — code, dépendances,
unités systemd, activation, état :

```bash
sudo bash /opt/desk/src/desk/deploy/installer.sh
```

Il est **idempotent** : on le relance après chaque changement, autant de fois
qu'on veut. Il refuse de tourner s'il trouve des modifications locales dans le
dépôt — quelqu'un a peut-être corrigé quelque chose à la main, en urgence, et
écraser ce correctif en silence détruirait aussi la trace de sa raison d'être.

Il active le service continu et les **timers**, jamais les services `oneshot`
eux-mêmes : les activer les lancerait à chaque démarrage, hors de leur
cadence — et un rituel hebdomadaire qui tourne à chaque reboot n'est plus
hebdomadaire.

## Installation

```bash
# 1. Système
sudo apt update && sudo apt install -y python3.11 python3.11-venv git
sudo useradd --system --create-home --home-dir /opt/desk desk
sudo mkdir -p /var/lib/desk/enregistrement
sudo chown -R desk:desk /opt/desk /var/lib/desk

# 2. Code
sudo -u desk git clone https://github.com/SatoshiNakajojo/dashboard.git /opt/desk/src
sudo -u desk git -C /opt/desk/src checkout claude/trading-desk-p3-launch-e16cdi
sudo -u desk python3.11 -m venv /opt/desk/.venv
sudo -u desk /opt/desk/.venv/bin/pip install --upgrade pip
sudo -u desk /opt/desk/.venv/bin/pip install \
    -r /opt/desk/src/desk/deploy/requirements-enregistreur.txt
sudo -u desk /opt/desk/.venv/bin/pip install -e /opt/desk/src/desk --no-deps

# 3. Vérification AVANT de lancer le service — 60 s sur un seul actif
sudo -u desk /opt/desk/.venv/bin/python -m trading_desk.enregistreur \
    --coins BTC --racine /var/lib/desk/essai &
sleep 60 && kill %1
find /var/lib/desk/essai -name '*.parquet' | head   # doit lister des fichiers
# Pas /tmp : c'est un tmpfs (< 2 Go, en RAM) sur beaucoup de VPS, et
# l'enregistreur s'y arrete sur DISQUE PLEIN. Verifier avec `df -h /tmp`.

# 4. Service
sudo cp /opt/desk/src/desk/deploy/enregistreur.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now enregistreur
```

`pip install -e --no-deps` est délibéré : les dépendances viennent de
`requirements-enregistreur.txt`, qui exclut FastAPI, uvicorn et le SDK
Anthropic. Le VPS n'expose aucune API et n'appelle aucun modèle — lui
installer le desk complet élargirait sa surface d'attaque pour rien.

## Surveillance

```bash
systemctl status enregistreur
journalctl -u enregistreur -f
journalctl -u enregistreur --since "1 hour ago" | grep -E "ERROR|WARNING"
```

Le service journalise son état toutes les 5 minutes :

```
up 18.3 h · 2841902 msg · 2836114 lignes ecrites · 412 segments · file 0 ·
flux vivants 28/28 · perdues file 0 disque 0 · erreurs 0 ·
reconnexions forcees 2 · libre 94210 Mo
```

**Les quatre chiffres à surveiller**, dans cet ordre :

| ce qui monte | ce que ça veut dire |
|---|---|
| `perdues file` | le disque n'arrive plus à suivre les rafales |
| `perdues disque` | seuil des 2 Go franchi — **la collecte est arrêtée** |
| `erreurs` | échecs d'écriture : disque, permissions, corruption |
| `flux vivants` **qui baisse** | un actif ne publie plus |

`reconnexions forcees` qui monte lentement est **normal** : c'est le chien de
garde qui fait son travail sur des connexions à moitié mortes. Plusieurs par
heure signalent en revanche un problème réseau côté VPS.

## Ce qui est produit

```
/var/lib/desk/enregistrement/
  BTC/
    BTC_trades_2026-09-06.parquet     ← fichiers journaliers (compactés)
    BTC_book_2026-09-06.parquet
    BTC_bbo_2026-09-06.parquet
    BTC_ctx_2026-09-06.parquet
    partiel/
      BTC_trades_2026-09-07_034347866.parquet   ← jour en cours, segments
```

Les **segments** sont des fichiers courts, clos toutes les 20 000 lignes ou
5 minutes. C'est ce qui rend la collecte survivable : un `ParquetWriter` gardé
ouvert 24 h laisse, si le processus est tué, un fichier **sans pied de page —
illisible en entier, pas tronqué**. On perdrait une journée complète pour un
incident de trois secondes. Ici, au pire un segment.

Le **compactage** tourne toutes les heures depuis le processus lui-même, sur
les jours révolus uniquement. Il ne supprime les segments qu'après avoir relu
le fichier fusionné et vérifié son compte de lignes. À lancer à la main si
besoin :

```bash
/opt/desk/.venv/bin/python -m trading_desk.enregistreur.compactage \
    --racine /var/lib/desk/enregistrement
```

## Le rituel hebdomadaire des déblocages — à ne plus lancer à la main

Deux choses tournent sur le VPS, et elles n'ont ni la même nature ni la même
cadence. La confusion entre les deux est la raison d'être de cette section.

**L'enregistreur tourne en continu et n'a rien à relancer.** `Restart=always`
et `systemctl enable` suffisent : il redémarre tout seul après une panne,
après un `reboot`, après une mise à jour. S'il est « à relancer chaque
semaine », c'est un symptôme — vérifiez d'abord `systemctl is-enabled
enregistreur` et `journalctl -u enregistreur --since '7 days ago' | tail`.

**Le rituel des déblocages, lui, est bien hebdomadaire** — et c'est la seule
chose qui l'était. Trois étapes qui allaient à la main :

```bash
python3 scripts/fetch_unlocks.py          # le calendrier
python3 scripts/journal_unlocks.py        # inscrire les fenêtres à venir
python3 scripts/journal_unlocks.py --resoudre   # relever les closes
```

`scripts/rituel_hebdomadaire.py` les enchaîne, et un timer systemd le
déclenche :

```bash
sudo cp deploy/rituel-deblocages.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rituel-deblocages.timer

systemctl list-timers rituel-deblocages.timer   # la prochaine échéance
journalctl -u rituel-deblocages -n 80           # ce qu'a fait la dernière
sudo systemctl start rituel-deblocages.service  # forcer une exécution
```

### Les trois décisions qui font que ça marche sans surveillance

**`Persistent=true` dans le timer.** C'est la ligne qui rend le rituel
oubliable. Sans elle, une semaine où le VPS était éteint est une semaine
perdue, et *rien ne le dit*. Avec elle, systemd rattrape l'exécution manquée
au démarrage suivant.

**Le service ne se relance pas tout seul.** Pas de `Restart=` : un `oneshot`
qui échoue doit **rester** en échec. Un service qui se relance efface la
trace de la panne, et `systemctl status` afficherait « actif » sur une
collecte qui n'a rien collecté depuis un mois.

**On s'arrête à la première panne, et on n'inscrit rien.** Si le calendrier
ne se télécharge pas, `data/unlocks.json` garde sa version de la semaine
dernière. Inscrire depuis là produirait des positions calculées sur des dates
qui ont pu bouger — et **le journal est en ajout seul**, une inscription
fautive ne se retire pas. Mieux vaut une semaine manquante, visible dans
`list-timers`, qu'une position invérifiable.

Relancer le rituel ne duplique rien : la clé d'unicité d'une inscription est
(version, jeton, date de déblocage). Un rattrapage après un mois d'arrêt est
sans danger.

### Ce que le rituel demande au réseau

`defillama-datasets.llama.fi` (le miroir statique, gratuit et sans quota),
`api.coingecko.com` et `api.hyperliquid.xyz`. Si le VPS est derrière un
filtrage sortant, ce sont les trois hôtes à autoriser — et c'est aussi
pourquoi ce rituel ne peut pas tourner depuis n'importe quelle machine.

## Les règles de prix figées — une inscription par jour

Le second journal hors échantillon. Même discipline que les déblocages :
`scripts/journal_regles.py` demande à chaque règle figée, **à la clôture de la
barre journalière**, ce qu'elle veut faire à l'ouverture suivante, et
l'inscrit dans un fichier en ajout seul.

```bash
sudo cp deploy/regles-figees.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now regles-figees.timer

systemctl list-timers regles-figees.timer
journalctl -u regles-figees -n 40
```

**La cadence est celle de la règle, pas une préférence.** 00:10 UTC, soit dix
minutes après la clôture de la bougie journalière. Inscrire plus tard dans la
journée raterait l'ouverture, et le desk exécuterait au milieu de la barre —
ce qui n'est plus la règle qui a été mesurée.

**Ce que ce journal peut et ne peut pas prouver.** `regles_figees.py` porte le
détail, et il faut l'avoir lu avant d'espérer quoi que ce soit : à dix trades
par an, une règle de tendance journalière demande des années pour rendre un p
exploitable. Ce qui est utilisable en semaines est ailleurs — l'écart entre le
prix décidé et le prix obtenu, et la preuve que la règle s'exécute comme elle
a été simulée.

## Rapatriement pour analyse

```bash
rsync -avz --include='*/' --include='*.parquet' --exclude='*' \
    --exclude='partiel/' \
    desk@VOTRE_VPS:/var/lib/desk/enregistrement/ ./enregistrement/
```

`--exclude='partiel/'` évite de rapatrier le jour en cours, dont les segments
seront de toute façon fusionnés.

## Sauvegarde

Le service **n'en fait aucune**, délibérément : une sauvegarde silencieuse qui
échoue est pire qu'une absence de sauvegarde assumée. Ces données sont
irremplaçables — elles n'existent nulle part ailleurs et ne peuvent pas être
re-téléchargées. Un `rsync` quotidien vers une autre machine est le minimum,
et il vaut mieux le poser tout de suite qu'après le premier incident disque.
