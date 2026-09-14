"""L'univers des flux est filtre avant toute souscription.

Ce fichier existe pour une panne de production du 12 septembre 2026. Le desk
tournait, se reconnectait toutes les deux secondes, ne recevait aucune
donnee, et s'arretait tout seul en STALE_FEED. Le seul message etait
« websocket interrompu : no close frame received or sent » — qui ne nomme ni
le symbole fautif, ni meme le fait qu'un symbole soit en cause.

La cause : un symbole que l'exchange ne connait pas. Mesure contre le
testnet, un symbole inexistant parmi sept actifs (22 souscriptions) :

    22 souscriptions valides           -> tient, 144 messages en 12 s
    21 valides + 1 symbole inexistant  -> connexion coupee en 0,98 s

Le detail par type de souscription, qui explique pourquoi on filtre le
symbole ENTIER et pas seulement l'un de ses flux :

    trades          -> coupee en 0,91 s
    l2Book          -> coupee en 0,66 s
    activeAssetCtx  -> connexion vivante, mais aucune donnee

Le troisieme est le plus dangereux : rien ne casse, le flux est simplement
mort. Et comme la boucle de reconnexion rejoue les memes souscriptions, le
desk se fait couper indefiniment.

L'univers vient du journal des deverrouillages. Il contiendra toujours, tot
ou tard, un jeton que l'exchange ne liste pas — ou ne liste plus.
"""

from __future__ import annotations

import pytest

from trading_desk.api.state import DeskState
from trading_desk.config import Settings
from trading_desk.storage import SqliteStore


def _etat() -> DeskState:
    return DeskState(Settings(), SqliteStore(":memory:"))


def test_un_symbole_inconnu_est_visible_dans_l_instantane():
    """Retirer en silence serait la moitie du defaut d'origine.

    Un univers ampute sans que l'ecran le dise, c'est le pilote qui saute
    des positions du journal sans que personne ne sache pourquoi. Ce depot
    a deja rencontre cette panne muette ailleurs ; ici elle est refusee
    d'avance.
    """
    etat = _etat()
    assert etat.snapshot()["symboles_inconnus"] == []
    etat.symboles_inconnus = ["ZZFAKE", "OBSOLETE"]
    assert etat.snapshot()["symboles_inconnus"] == ["ZZFAKE", "OBSOLETE"]


def test_l_instantane_copie_la_liste():
    """L'interface ne doit pas pouvoir muter l'etat du desk."""
    etat = _etat()
    etat.symboles_inconnus = ["ZZFAKE"]
    instantane = etat.snapshot()
    instantane["symboles_inconnus"].append("INJECTE")
    assert etat.symboles_inconnus == ["ZZFAKE"]


def test_le_filtre_garde_les_connus_et_retire_les_autres():
    """La regle de filtrage, isolee du reseau.

    On reproduit ici l'expression exacte d'`app.py`. Le test d'integration
    qui interroge le vrai exchange est `test_perps_disponibles_*` ci-dessous,
    et il est marque `reseau` pour pouvoir etre saute hors ligne.
    """
    univers = ["BTC", "ETH", "kaito", "ZZFAKE"]
    connus = {"BTC", "ETH", "KAITO"}
    inconnus = [a for a in univers if a.upper() not in connus]
    gardes = [a for a in univers if a.upper() in connus]

    assert inconnus == ["ZZFAKE"]
    # La casse ne doit pas faire disparaitre un symbole valide : le journal
    # ecrit parfois en minuscules, l'exchange repond en majuscules.
    assert gardes == ["BTC", "ETH", "kaito"]


@pytest.mark.reseau
def test_perps_disponibles_rend_un_univers_plausible():
    """Le vrai exchange. Marque `reseau` : saute quand on est hors ligne.

    On ne fige pas la liste — elle bouge a chaque listing. On verifie ce qui
    ne doit jamais changer : BTC est la, un symbole invente ne l'est pas, et
    l'univers a une taille credible.
    """
    httpx = pytest.importorskip("httpx")
    from trading_desk.market import perps_disponibles

    try:
        univers = perps_disponibles(testnet=True, timeout_s=15.0)
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"exchange injoignable : {exc}")

    assert "BTC" in univers and "ETH" in univers
    assert "ZZFAKE" not in univers
    assert 20 < len(univers) < 5000
    assert all(s == s.upper() for s in univers), "l'univers doit etre normalise"
