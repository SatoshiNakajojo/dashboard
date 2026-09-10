# Monter le VPS pas à pas — sans rien supposer

Ce guide part du principe que vous n'avez jamais administré de serveur Linux.
Chaque commande est expliquée, et **chaque étape se termine par une
vérification** : si la vérification échoue, ne passez pas à la suivante.

Tapez les commandes une par une. Ne collez pas un bloc entier.

> **Convention.** `vous@mac$` = à taper dans le Terminal de votre Mac.
> `vous@vps$` = à taper une fois connecté au VPS. Le `$` ne se tape pas.

---

## Étape 0 — Commander le VPS

N'importe quel hébergeur fait l'affaire (Hetzner, Scaleway, OVH, DigitalOcean).
Ce qu'il faut demander :

| | valeur | pourquoi |
|---|---|---|
| Système | **Ubuntu 24.04 LTS** | supportée jusqu'en 2029, Python 3.12 inclus |
| Disque | **100 Go SSD** | ~3 Go/mois mesurés, plus la marge pour les pointes |
| RAM | 2 Go suffisent | le service est plafonné à 1 Go |
| CPU | 1 ou 2 cœurs | il lit un socket et écrit des fichiers |

L'hébergeur vous donne une **adresse IP** et un mot de passe `root`, ou vous
demande une clé SSH. Notez l'IP : elle remplace `VOTRE_IP` partout ci-dessous.

---

## Étape 1 — Créer une clé SSH sur votre Mac

Une clé SSH remplace le mot de passe. C'est plus sûr **et** plus pratique :
vous ne taperez plus jamais de mot de passe.

```bash
vous@mac$ ls ~/.ssh/id_ed25519.pub
```

- **Le fichier existe** → vous avez déjà une clé, passez à l'étape 2.
- **`No such file or directory`** → créez-la :

```bash
vous@mac$ ssh-keygen -t ed25519 -C "desk-vps"
```

Appuyez sur Entrée trois fois (emplacement par défaut, puis une phrase de
passe vide — ou choisissez-en une, macOS la retiendra dans son trousseau).

**Vérification :**

```bash
vous@mac$ cat ~/.ssh/id_ed25519.pub
```

Vous devez voir une ligne commençant par `ssh-ed25519`. C'est votre clé
**publique** — celle qu'on peut partager. Le fichier sans `.pub` est la clé
privée : **elle ne quitte jamais votre Mac.**

---

## Étape 2 — Se connecter et déposer la clé

Si l'hébergeur vous a donné un mot de passe root :

```bash
vous@mac$ ssh-copy-id root@VOTRE_IP
```

Tapez le mot de passe une dernière fois. Puis :

```bash
vous@mac$ ssh root@VOTRE_IP
```

**Vérification :** vous êtes connecté **sans mot de passe** et l'invite
ressemble à `root@nom-du-serveur:~#`.

---

## Étape 3 — Mettre à jour et sécuriser

Un serveur exposé à Internet est scanné et attaqué **dans l'heure** qui suit
sa mise en ligne. Ces cinq minutes ne sont pas optionnelles.

```bash
vous@vps$ apt update && apt upgrade -y
```

(Deux à cinq minutes. Si une fenêtre bleue apparaît, choisissez « keep the
local version currently installed ».)

### Le pare-feu

```bash
vous@vps$ ufw allow OpenSSH
vous@vps$ ufw --force enable
vous@vps$ ufw status
```

**Vérification :** `Status: active` et une ligne `OpenSSH ALLOW`.

Seul SSH est ouvert. L'enregistreur n'a besoin d'**aucun** port entrant : il
se connecte *vers* Hyperliquid, personne ne se connecte vers lui.

### Interdire la connexion par mot de passe

À ne faire **qu'après** avoir vérifié à l'étape 2 que la clé fonctionne.

```bash
vous@vps$ sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
vous@vps$ systemctl restart ssh
```

**Vérification, sans fermer la session en cours.** Ouvrez un **deuxième**
onglet de Terminal sur votre Mac :

```bash
vous@mac$ ssh root@VOTRE_IP
```

Si ça marche, fermez le premier onglet. **Si ça ne marche pas, ne fermez
surtout pas la session ouverte** — vous y êtes encore et pouvez annuler avec
`sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config && systemctl restart ssh`.

### Le redémarrage automatique après une panne de courant

```bash
vous@vps$ apt install -y unattended-upgrades fail2ban
vous@vps$ systemctl enable --now fail2ban
```

`fail2ban` bannit les adresses qui multiplient les tentatives de connexion.
`unattended-upgrades` applique les correctifs de sécurité tout seul.

---

## Étape 4 — Créer l'utilisateur et les dossiers

Faire tourner un service en `root` signifie qu'un défaut du service devient
un défaut de la machine entière. On lui donne donc un utilisateur à lui, sans
mot de passe et sans shell de connexion.

```bash
vous@vps$ apt install -y python3 python3-venv python3-pip git
vous@vps$ adduser --system --group --home /opt/desk --shell /usr/sbin/nologin desk
vous@vps$ mkdir -p /var/lib/desk/enregistrement
vous@vps$ chown -R desk:desk /opt/desk /var/lib/desk
```

**Vérification :**

```bash
vous@vps$ python3 --version
vous@vps$ id desk
```

Python doit être **3.11 ou plus** (Ubuntu 24.04 fournit 3.12). `id desk` doit
afficher un `uid=` et un `gid=`.

---

## Étape 5 — Installer le code

```bash
vous@vps$ sudo -u desk git clone https://github.com/SatoshiNakajojo/dashboard.git /opt/desk/src
vous@vps$ sudo -u desk git -C /opt/desk/src checkout claude/trading-desk-p3-launch-e16cdi
vous@vps$ sudo -u desk python3 -m venv /opt/desk/.venv
vous@vps$ sudo -u desk /opt/desk/.venv/bin/pip install --upgrade pip
vous@vps$ sudo -u desk /opt/desk/.venv/bin/pip install -r /opt/desk/src/desk/deploy/requirements-enregistreur.txt
vous@vps$ sudo -u desk /opt/desk/.venv/bin/pip install -e /opt/desk/src/desk --no-deps
```

> **Le `checkout` n'est pas optionnel.** Tout le travail récent —
> l'enregistreur, la Sentinelle, l'analyse des déblocages — vit sur la branche
> `claude/trading-desk-p3-launch-e16cdi`, pas sur `main`. Un clone
> sans cette ligne donne une version qui ne contient rien de tout ça, et
> l'étape 6 échouera sur `ModuleNotFoundError`.

Un *environnement virtuel* (`venv`) est un dossier Python isolé : ce qu'on y
installe ne touche pas au Python du système.

`--no-deps` sur la dernière ligne est **voulu** : les dépendances viennent du
fichier précédent, qui exclut FastAPI, uvicorn et le SDK Anthropic. Le VPS
n'expose aucune API et n'appelle aucun modèle — lui installer le desk complet
élargirait sa surface d'attaque pour rien.

**Vérification :**

```bash
vous@vps$ sudo -u desk /opt/desk/.venv/bin/python -c "import trading_desk.enregistreur; print('ok')"
```

Doit afficher `ok`.

---

## Étape 6 — L'essai à blanc, AVANT le service

Ne lancez jamais un service que vous n'avez pas vu tourner à la main.

```bash
vous@vps$ sudo -u desk /opt/desk/.venv/bin/python -m trading_desk.enregistreur \
    --coins BTC --racine /var/lib/desk/essai
```

> **Pas `/tmp`, et ce n'est pas un détail de style.** Sur beaucoup de VPS —
> dont les Hetzner récents — `/tmp` est un `tmpfs`, c'est-à-dire un disque
> qui vit dans la mémoire vive : moins de 2 Go, et il disparaît à chaque
> redémarrage. L'enregistreur s'y arrête au bout de quelques minutes sur
> `DISQUE PLEIN`, ce qui ressemble à une panne du programme alors que c'est
> le dossier qui est trop petit. `/var/lib/desk` est le vrai disque.
>
> Pour vérifier sur votre machine : `df -h /tmp` — si la colonne
> « Filesystem » affiche `tmpfs`, vous êtes dans ce cas.

Laissez tourner **une minute**, puis `Ctrl+C`.

Vous devez voir défiler :

```
INFO    enregistreur : 1 actifs (BTC), flux trades, l2Book, bbo, activeAssetCtx, ...
INFO    connecte a wss://api.hyperliquid.xyz/ws, 4 souscriptions
INFO    ... recu — vidage des tampons puis arret
INFO    enregistreur arrete proprement
```

**Vérification — la seule qui compte :**

```bash
vous@vps$ find /var/lib/desk/essai -name '*.parquet' | head
```

Des fichiers doivent apparaître. **S'il n'y en a aucun, arrêtez-vous ici** et
envoyez-moi la sortie complète : le service ne servirait à rien.

```bash
vous@vps$ rm -rf /var/lib/desk/essai
```

---

## Étape 7 — Installer le service

```bash
vous@vps$ cp /opt/desk/src/desk/deploy/enregistreur.service /etc/systemd/system/
vous@vps$ systemctl daemon-reload
vous@vps$ systemctl enable --now enregistreur
```

`enable` = démarre au boot. `--now` = démarre aussi tout de suite.

**Vérification :**

```bash
vous@vps$ systemctl status enregistreur
```

Cherchez deux choses :

- `Active: active (running)` en vert ;
- `Loaded: ... enabled` — c'est ce qui garantit le redémarrage au boot.

Puis regardez le journal en direct (`Ctrl+C` pour sortir, ça n'arrête pas le
service) :

```bash
vous@vps$ journalctl -u enregistreur -f
```

---

## Étape 8 — L'épreuve du redémarrage

C'est **l'étape que la plupart des gens sautent**, et celle qui explique
pourquoi un service « marche » puis disparaît trois semaines plus tard après
une coupure.

```bash
vous@vps$ reboot
```

Vous êtes déconnecté. Attendez une minute, puis reconnectez-vous :

```bash
vous@mac$ ssh root@VOTRE_IP
vous@vps$ systemctl status enregistreur
```

**Vérification :** `active (running)` **sans que vous ayez rien fait**. Si le
service est mort, il n'était pas `enabled` — reprenez l'étape 7.

---

## Vivre avec, au quotidien

Le service écrit son état toutes les cinq minutes :

```
up 18.3 h · 2841902 msg · 2836114 lignes ecrites · 412 segments · file 0 ·
flux vivants 28/28 · perdues file 0 disque 0 · erreurs 0 ·
reconnexions forcees 2 · libre 94210 Mo
```

**Les quatre chiffres à surveiller**, dans cet ordre de gravité :

| ce qui monte | ce que ça veut dire | quoi faire |
|---|---|---|
| `perdues disque` | seuil des 2 Go franchi, **collecte arrêtée** | libérer de la place tout de suite |
| `erreurs` | échecs d'écriture | `journalctl -u enregistreur \| grep ERROR` |
| `perdues file` | le disque ne suit plus les rafales | tolérable si occasionnel |
| `flux vivants` qui **baisse** | un actif ne publie plus | souvent normal la nuit |

`reconnexions forcees` qui monte lentement est **normal** : c'est le chien de
garde qui fait son travail. Plusieurs par heure signalent un souci réseau.

### Les trois commandes à retenir

```bash
vous@vps$ systemctl status enregistreur          # il tourne ?
vous@vps$ journalctl -u enregistreur -n 50       # les 50 dernières lignes
vous@vps$ df -h /var/lib/desk                    # il reste combien de place ?
```

### Rapatrier les données sur votre Mac

```bash
vous@mac$ rsync -avz --include='*/' --include='*.parquet' --exclude='partiel/' \
    --exclude='*' root@VOTRE_IP:/var/lib/desk/enregistrement/ ./enregistrement/
```

`--exclude='partiel/'` évite le jour en cours, dont les segments seront de
toute façon fusionnés à l'heure suivante.

### Mettre à jour le code plus tard

```bash
vous@vps$ sudo -u desk git -C /opt/desk/src pull origin claude/trading-desk-p3-launch-e16cdi
vous@vps$ systemctl restart enregistreur
vous@vps$ systemctl status enregistreur
```

Le redémarrage envoie SIGTERM, que le service intercepte pour vider ses
tampons — vous ne perdez rien.

---

## Si quelque chose ne va pas

| symptôme | cause la plus fréquente | commande |
|---|---|---|
| `Active: failed` | erreur Python au démarrage | `journalctl -u enregistreur -n 100` |
| Aucun `.parquet` après 10 min | pas de connexion sortante | `curl -s -o /dev/null -w '%{http_code}' https://api.hyperliquid.xyz/info -X POST -d '{"type":"meta"}' -H 'Content-Type: application/json'` — doit dire `200` |
| `Permission denied` | droits sur les dossiers | `chown -R desk:desk /opt/desk /var/lib/desk` |
| Le service meurt en boucle | dépendance manquante | rejouez l'étape 6 à la main, l'erreur s'affichera |

En cas de doute, envoyez-moi la sortie de :

```bash
vous@vps$ systemctl status enregistreur --no-pager -l
vous@vps$ journalctl -u enregistreur -n 100 --no-pager
```
