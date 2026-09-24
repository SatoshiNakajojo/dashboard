"""IPv4 d'abord. **Aucune dependance**, et une raison mesuree.

Le 24 septembre 2026, depuis le VPS, toutes les sources de donnees se sont
mises a repondre la meme chose :

    SSL: UNEXPECTED_EOF_WHILE_READING

DefiLlama, CoinGecko, le miroir statique — tout, d'un coup. La sonde du
depot en a conclu « elles sont passees payantes. Il faut changer de
source », ce qui aurait envoye reecrire un collecteur pour rien.

Trois faits rendaient cette these intenable :

- `api.llama.fi/protocols` repondait **200** pendant que
  `api.llama.fi/emissions` cassait en TLS. Meme hote, meme certificat : un
  serveur ne peut pas reussir sa poignee de main pour un chemin et la rater
  pour un autre, le chemin n'etant pas encore transmis a ce stade ;
- CoinGecko `/coins/list` rendait 489 identifiants, et `/ping` cassait une
  minute plus tard ;
- `curl` sortait en code 35, `TLS connect error` — pendant la poignee de
  main, pas apres.

La mesure a tranche en une commande :

    v4  200, 200, 200, 200, 200      (5 sur 5)
    v6  echec, echec, echec          (0 sur 3)

**La route IPv6 du VPS est cassee.** Elle etablit le TCP — d'ou un echec au
niveau TLS et non a la connexion — puis meurt sur la poignee de main, ce qui
est la signature d'une decouverte de MTU defaillante.

## Pourquoi reordonner, et surtout pas filtrer

`socket.create_connection` parcourt les adresses rendues par `getaddrinfo`
et s'arrete a la premiere qui repond. Il suffit donc de mettre l'IPv4
devant : elle repond, et l'IPv6 n'est jamais essayee.

**Filtrer l'IPv6 serait un correctif qui casse ailleurs.** Un hote joignable
uniquement en v6 deviendrait injoignable, et le message d'erreur ne
nommerait pas la cause. En reordonnant, une liste qui ne contient que des
adresses v6 sort inchangee : le seul cas ou l'on perdrait quelque chose est
precisement celui ou l'on ne touche a rien.

## Pourquoi ici et pas dans `/etc/gai.conf`

Un reglage systeme ne voyage pas avec le depot. Le prochain VPS retomberait
dans le meme trou, avec le meme message qui ne nomme pas sa cause, et
quelqu'un y perdrait la meme heure. Regler `gai.conf` en plus reste utile
pour `curl` et `git` — mais ce fichier-ci est ce qui garantit que la
collecte tient.
"""

from __future__ import annotations

import os
import socket

# Le garde-fou : sur une machine ou l'IPv4 serait l'exception, on veut
# pouvoir annuler sans modifier le code.
VARIABLE = "DESK_PREFERER_IPV4"

_ORIGINAL = socket.getaddrinfo
_APPLIQUE = False


def _ipv4_d_abord(*args, **kwargs):
    """`getaddrinfo`, avec les adresses IPv4 en tete. Rien n'est retire."""
    resultats = _ORIGINAL(*args, **kwargs)
    return sorted(resultats, key=lambda r: 0 if r[0] == socket.AF_INET else 1)


def demande() -> bool:
    """L'utilisateur veut-il la preference ? Oui par defaut."""
    return (os.getenv(VARIABLE) or "1").strip().lower() not in ("0", "false", "non")


def appliquer() -> bool:
    """Installe la preference. Idempotent, et renvoie si elle est active.

    A appeler au demarrage des scripts qui sortent sur le reseau. Ne rien
    faire quand la variable dit non — et le dire, plutot que de laisser
    croire que la preference s'applique.
    """
    global _APPLIQUE
    if not demande():
        return False
    if not _APPLIQUE:
        socket.getaddrinfo = _ipv4_d_abord
        _APPLIQUE = True
    return True


def retirer() -> None:
    """Remet `getaddrinfo` d'origine. Pour les tests, et pour le depannage."""
    global _APPLIQUE
    socket.getaddrinfo = _ORIGINAL
    _APPLIQUE = False
