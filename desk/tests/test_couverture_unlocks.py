"""Le diagnostic de couverture : mesurer la fuite avant de poser un tuyau.

Le calendrier couvre 68 jetons sur 234 perpétuels cotés, et 21 seulement ont
encore un déblocage à venir. Avant de brancher une seconde source de données,
il faut savoir si les 166 manquants sont absents de DefiLlama ou simplement
ratés par notre propre filtre.

Ces tests portent sur la partie du diagnostic qui ne dépend pas du réseau —
la lecture d'un calendrier et le classement d'un jeton. Le reste se vérifie
en le lançant depuis le VPS, seul endroit d'où les sources répondent.
"""

from __future__ import annotations

import importlib.util
import time
from pathlib import Path

_racine = Path(__file__).resolve().parents[1]


def _module(nom: str):
    spec = importlib.util.spec_from_file_location(nom, _racine / "scripts" / f"{nom}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sonde = _module("sonder_couverture_unlocks")
fetch = _module("fetch_unlocks")

JOUR = 86_400
MAINTENANT = int(time.time() * 1000)


def _detail(evts, offre=1000.0):
    """Un fichier DefiLlama minimal : une offre plate, des déblocages datés."""
    return {
        "gecko_id": "essai",
        "metadata": {"unlockEvents": [
            {"timestamp": ts, "summary": {"totalTokensCliff": jetons}}
            for ts, jetons in evts]},
        "documentedData": {"data": [
            {"data": [{"timestamp": 0, "unlocked": offre}]}]},
    }


# --------------------------------------------------------------------------
#  La lecture doit être un décalque de celle de la collecte
# --------------------------------------------------------------------------

def test_le_diagnostic_lit_le_calendrier_comme_la_collecte():
    """S'ils divergeaient, le diagnostic promettrait une couverture que la
    collecte ne livrerait pas.

    C'est le défaut exact que ce dépôt passe son temps à débusquer : un
    chiffre qui a l'air d'un résultat et qui décrit autre chose. Ici il
    annoncerait « 40 jetons récupérables » pour en livrer douze.
    """
    maintenant_s = MAINTENANT // 1000
    detail = _detail([(maintenant_s + 30 * JOUR, 30.0),
                      (maintenant_s + 90 * JOUR, 50.0),
                      (maintenant_s - 400 * JOUR, 25.0)])
    a = [(e["ts_ms"], round(e["part_offre"], 9))
         for e in sonde.evenements_du_detail(detail)]
    b = [(e["ts_ms"], round(e["part_offre"], 9))
         for e in fetch.evenements(detail)]
    assert a == b, f"les deux lectures divergent :\n  sonde {a}\n  fetch {b}"


def test_un_deblocage_purement_lineaire_n_est_pas_un_evenement():
    """Sans falaise, il n'y a pas de date — donc rien à anticiper."""
    detail = _detail([])
    detail["metadata"]["unlockEvents"] = [
        {"timestamp": MAINTENANT // 1000 + 30 * JOUR,
         "summary": {"totalTokensCliff": 0, "totalTokensLinear": 500.0}}]
    assert sonde.evenements_du_detail(detail) == []


def test_une_offre_nulle_n_est_pas_divisee():
    """Le premier déblocage d'un jeton n'a pas d'offre antérieure."""
    detail = _detail([(MAINTENANT // 1000 + 30 * JOUR, 30.0)], offre=0.0)
    assert sonde.evenements_du_detail(detail) == []


def test_une_forme_inattendue_ne_leve_jamais():
    """La source est externe : le diagnostic doit l'ignorer, pas tomber."""
    for bancal in ({}, {"metadata": None}, {"metadata": {"unlockEvents": "non"}},
                   {"metadata": {"unlockEvents": [None, 3, "x"]}}):
        assert sonde.evenements_du_detail(bancal) == []


# --------------------------------------------------------------------------
#  Le classement
# --------------------------------------------------------------------------

def test_un_jeton_avec_un_deblocage_a_venir_est_recuperable():
    evts = [{"ts_ms": MAINTENANT + 30 * JOUR * 1000, "part_offre": 0.03}]
    classe, n = sonde.classer(evts, MAINTENANT)
    assert classe == sonde.RATE and n == 1


def test_un_vesting_termine_ne_compte_pas_dans_la_couverture():
    """Le compter gonflerait un chiffre qui ne se traduit par aucune position.

    C'est la distinction qui fait passer « 68 jetons couverts » à « 21 qui
    rapporteront quelque chose ».
    """
    evts = [{"ts_ms": MAINTENANT - 400 * JOUR * 1000, "part_offre": 0.03}]
    classe, n = sonde.classer(evts, MAINTENANT)
    assert classe == sonde.EPUISE and n == 0


def test_des_deblocages_trop_petits_ne_sont_pas_un_vesting_actif():
    """Sous 2 % de l'offre, aucun des six contrôles ne survit. Un jeton qui
    ne débloque que des miettes n'apporte pas de position."""
    evts = [{"ts_ms": MAINTENANT + 30 * JOUR * 1000, "part_offre": 0.001}]
    classe, n = sonde.classer(evts, MAINTENANT)
    assert classe == sonde.TROP_PETIT and n == 0


def test_le_classement_applique_la_deduplication_de_la_regle():
    """Deux déblocages à trois jours d'écart produisent des fenêtres qui se
    recouvrent, donc UNE position. Les compter deux fois surestimerait ce
    qu'une nouvelle couverture rapporte."""
    evts = [{"ts_ms": MAINTENANT + 30 * JOUR * 1000, "part_offre": 0.03},
            {"ts_ms": MAINTENANT + 33 * JOUR * 1000, "part_offre": 0.04},
            {"ts_ms": MAINTENANT + 60 * JOUR * 1000, "part_offre": 0.03}]
    classe, n = sonde.classer(evts, MAINTENANT)
    assert classe == sonde.RATE and n == 2


def test_le_diagnostic_n_invente_aucun_rapprochement():
    """Associer deux homonymes daterait les événements du mauvais actif, et
    rien ne le signalerait ensuite. Le script exige que le `gecko_id` du
    fichier confirme l'identifiant cherché."""
    source = (_racine / "scripts" / "sonder_couverture_unlocks.py").read_text()
    assert 'detail.get("gecko_id") or ""' in source
    assert "order=market_cap_desc" in source, (
        "l'homonyme se tranche par capitalisation, pas par ordre d'arrivée")
