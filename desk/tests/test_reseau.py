"""IPv4 d'abord, et la sonde qui doit distinguer un refus d'une coupure.

Une heure a ete perdue le 24 septembre 2026 sur une panne qui n'en etait pas
une : toutes les sources repondaient « SSL: UNEXPECTED_EOF_WHILE_READING »,
et la sonde du depot en a conclu qu'elles etaient passees payantes. La cause
etait une route IPv6 cassee sur le VPS — mesure : 5 succes sur 5 en v4, 0
sur 3 en v6.

Ces tests verrouillent les deux corrections : la preference reseau, et le
verdict qui ne doit plus confondre un serveur qui refuse avec un transport
qui casse.
"""

from __future__ import annotations

import importlib.util
import socket
from pathlib import Path

import pytest

from trading_desk import reseau

_racine = Path(__file__).resolve().parents[1]


def _module(nom: str):
    spec = importlib.util.spec_from_file_location(nom, _racine / "scripts" / f"{nom}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(autouse=True)
def _resolution_intacte():
    """Aucun test ne doit laisser `getaddrinfo` modifie derriere lui.

    Sans ce garde-fou, un test qui applique la preference fait echouer un
    autre test plus loin, et le coupable n'est pas celui qui tombe.
    """
    avant = socket.getaddrinfo
    yield
    socket.getaddrinfo = avant


def _adresses(familles):
    return [(f, socket.SOCK_STREAM, 6, "", ("hote", 443)) for f in familles]


# --------------------------------------------------------------------------
#  La preference
# --------------------------------------------------------------------------

def test_l_ipv4_passe_devant(monkeypatch):
    monkeypatch.setattr(reseau, "_ORIGINAL",
                        lambda *a, **k: _adresses([socket.AF_INET6, socket.AF_INET,
                                                   socket.AF_INET6]))
    rendu = [x[0] for x in reseau._ipv4_d_abord("hote", 443)]
    assert rendu[0] == socket.AF_INET


def test_rien_n_est_retire_et_un_hote_v6_seul_survit(monkeypatch):
    """**Filtrer l'IPv6 serait un correctif qui casse ailleurs.**

    Un hote joignable uniquement en v6 deviendrait injoignable, et le message
    d'erreur ne nommerait pas la cause. En reordonnant, le seul cas ou l'on
    perdrait quelque chose est precisement celui ou l'on ne touche a rien.
    """
    v6 = _adresses([socket.AF_INET6, socket.AF_INET6])
    monkeypatch.setattr(reseau, "_ORIGINAL", lambda *a, **k: v6)
    assert reseau._ipv4_d_abord("hote", 443) == v6

    melange = _adresses([socket.AF_INET6, socket.AF_INET])
    monkeypatch.setattr(reseau, "_ORIGINAL", lambda *a, **k: melange)
    assert sorted(x[0] for x in reseau._ipv4_d_abord("hote", 443)) == \
        sorted(x[0] for x in melange)


def test_l_ordre_relatif_des_adresses_d_une_meme_famille_est_garde(monkeypatch):
    """`getaddrinfo` trie deja selon la politique du systeme. On ne fait que
    remonter la famille, pas rebattre les cartes."""
    lot = [(socket.AF_INET6, 1, 6, "", ("a", 443)),
           (socket.AF_INET, 1, 6, "", ("b", 443)),
           (socket.AF_INET, 1, 6, "", ("c", 443))]
    monkeypatch.setattr(reseau, "_ORIGINAL", lambda *a, **k: lot)
    assert [x[4][0] for x in reseau._ipv4_d_abord("h", 443)] == ["b", "c", "a"]


def test_la_preference_s_annule_par_variable_d_environnement(monkeypatch):
    """Sur une machine ou l'IPv4 serait l'exception, il faut pouvoir annuler
    sans modifier le code."""
    monkeypatch.setenv(reseau.VARIABLE, "0")
    assert reseau.demande() is False
    assert reseau.appliquer() is False
    assert socket.getaddrinfo is reseau._ORIGINAL
    monkeypatch.setenv(reseau.VARIABLE, "1")
    assert reseau.demande() is True


def test_appliquer_est_idempotent():
    try:
        assert reseau.appliquer() is True
        premier = socket.getaddrinfo
        assert reseau.appliquer() is True
        assert socket.getaddrinfo is premier, "la preference s'est empilee"
    finally:
        reseau.retirer()
    assert socket.getaddrinfo is reseau._ORIGINAL


def test_le_module_reseau_ne_depend_de_rien():
    """Il est importe par des scripts qui tournent avec le Python du systeme,
    sur un VPS qui n'heberge que la collecte."""
    source = (_racine / "src" / "trading_desk" / "reseau.py").read_text()
    imports = [l for l in source.splitlines() if l.startswith(("import ", "from "))]
    assert imports == ["from __future__ import annotations", "import os",
                       "import socket"], imports


def test_les_collecteurs_appliquent_la_preference():
    """Un correctif que les collecteurs n'appellent pas ne corrige rien."""
    for nom in ("fetch_unlocks", "journal_unlocks", "sonder_couverture_unlocks"):
        source = (_racine / "scripts" / f"{nom}.py").read_text()
        assert "from trading_desk.reseau import appliquer" in source, nom
        assert "_ipv4_d_abord()" in source, f"{nom} importe sans appliquer"


# --------------------------------------------------------------------------
#  Le verdict de la sonde
# --------------------------------------------------------------------------

def test_la_sonde_ne_confond_plus_un_refus_et_une_coupure(capsys):
    """Le defaut exact du 24 septembre.

    Six coupures TLS, et la sonde annoncait « elles sont passees payantes.
    Il faut changer de source » — un remede sans rapport avec la panne. Un
    endpoint devenu payant repond 402 AVEC un corps ; un transport qui casse
    ne repond rien. C'est visible, donc c'est dicible.
    """
    sonde = _module("sonder_sources_unlocks")
    etats = {"témoin gratuit": "200 OK"}

    def faux(url, timeout=25):
        for libelle, adresse, _ in sonde.SOURCES:
            if adresse == url:
                return etats.get(libelle, "transport"), "EOF in violation of protocol"
        return "transport", ""

    sonde.sonder = faux
    sonde.main()
    sortie = capsys.readouterr().out
    assert "AU TRANSPORT" in sortie
    assert "IPv6" in sortie, "la cause mesuree doit etre nommee"
    assert "passées payantes" not in sortie


def test_la_sonde_dit_payant_quand_c_est_vraiment_payant(capsys):
    """L'autre sens, sans quoi le test precedent ne vaut rien : un 402 est
    bien un refus delibere, et la reponse est alors de changer de source."""
    sonde = _module("sonder_sources_unlocks")
    etats = {"témoin gratuit": "200 OK"}

    def faux(url, timeout=25):
        for libelle, adresse, _ in sonde.SOURCES:
            if adresse == url:
                return etats.get(libelle, "402 Payment Required"), "{}"
        return "402 Payment Required", "{}"

    sonde.sonder = faux
    sonde.main()
    sortie = capsys.readouterr().out
    assert "REFUSENT" in sortie and "payant" in sortie
    assert "AU TRANSPORT" not in sortie
