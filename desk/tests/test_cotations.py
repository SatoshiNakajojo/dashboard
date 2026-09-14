"""L'étude des cotations, et le contrôle qui a failli mentir.

Ce fichier ne verrouille pas une conclusion — une conclusion se mesure. Il
verrouille les mécanismes qui, en cassant, fabriqueraient une conclusion en
silence. Deux d'entre eux ont réellement cassé pendant l'étude :

- des bougies existent AVANT que le perpétuel ne s'échange (volume nul), et
  les laisser entrer fabrique des rendements inexécutables — un seul actif
  déplaçait la moyenne de vingt-cinq points de pourcentage ;
- le modèle nul par bloc est borné par le plus court historique du lot ; un
  seul actif jeune réduisait la plage de décalage à [0, 25] jours, si bien
  que le « hasard » recouvrait l'observation. Le contrôle rendait alors un
  faux négatif — qui ressemble exactement à un contrôle réussi.
"""

from __future__ import annotations

import datetime as dt
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import pytest
from controles_cotations import MARGE_BLOC, nul_par_bloc
from valider_cotations import (
    FENETRES,
    SEUIL_COTATION,
    TRANCHES,
    evenements,
    rendement,
    serie,
)

JOUR_MS = 86_400_000


def _actif(depart: dt.date, jours: int, *, volume: float = 1000.0,
           prix: float = 100.0, amplitude: float = 0.5,
           delisté: bool = False) -> dict:
    """Un actif jouet : prix plat, amplitude choisie au premier jour."""
    j0 = int(dt.datetime.combine(depart, dt.time(), dt.UTC).timestamp()) // 86_400
    bougies = []
    for i in range(jours):
        h = prix * (1 + amplitude / 2) if i == 0 else prix
        b = prix * (1 - amplitude / 2) if i == 0 else prix
        bougies.append({"t": (j0 + i) * JOUR_MS, "o": prix, "h": h, "l": b,
                        "c": prix, "v": volume})
    return {"delisté": delisté, "premiere_ms": bougies[0]["t"],
            "derniere_ms": bougies[-1]["t"], "bougies": bougies}


# ------------------------------------------------------- la négociabilité

def test_un_perpetuel_a_volume_nul_est_ecarte():
    """LE défaut trouvé par la première exécution.

    L'exchange publie des bougies avant que quoi que ce soit ne se négocie.
    Un tiers des cotations étaient dans ce cas. Ce ne sont pas des prix
    auxquels on peut entrer : PANDORA affichait +3 823 % sur sept jours et
    zéro échange sur huit.
    """
    actifs = {
        "MUET": _actif(dt.date(2024, 1, 1), 200, volume=0.0),
        "VIVANT": _actif(dt.date(2024, 1, 1), 200, volume=500.0),
    }
    noms = {e["symbole"] for e in evenements(actifs, 30)}
    assert noms == {"VIVANT"}


def test_un_volume_median_nul_sur_la_fenetre_ecarte_aussi():
    """Entrer ne suffit pas : il faut pouvoir sortir."""
    a = _actif(dt.date(2024, 1, 1), 200, volume=0.0)
    a["bougies"][0]["v"] = 9_999.0            # un seul jour échangé
    noms = {e["symbole"] for e in evenements({"X": a}, 30)}
    assert noms == set()


# --------------------------------------------------- le cadre d'échantillon

def test_les_majeures_a_historique_repris_sont_ecartees():
    """BTC, ETH, ATOM, BNB, DOGE et LTC commencent toutes le 2020-08-19 —
    une reprise de données, pas une cotation. Les compter comme des cotations
    daterait l'événement six ans trop tôt."""
    ancien = _actif(dt.date(2020, 8, 19), 2000)
    recent = _actif(dt.date(2024, 3, 1), 300)
    noms = {e["symbole"] for e in evenements({"VIEUX": ancien, "NEUF": recent}, 30)}
    assert noms == {"NEUF"}
    assert dt.date(2023, 1, 1) < SEUIL_COTATION, "franchement après l'ouverture"


def test_une_cotation_trop_recente_est_ecartee():
    """Sans recul, la fenêtre serait tronquée par le PRÉSENT — ce qui n'est
    pas un délistage mais un manque de données, et se lirait comme un
    rendement nul."""
    vieux = _actif(dt.date(2024, 1, 1), 400)
    neuf = _actif(dt.date(2024, 1, 1), 400)
    # `neuf` commence 10 jours avant la fin de l'univers : pas 30 jours de recul.
    decalage = 390 * JOUR_MS
    for b in neuf["bougies"][:]:
        b["t"] += decalage
    neuf["bougies"] = neuf["bougies"][:10]
    neuf["premiere_ms"] = neuf["bougies"][0]["t"]
    neuf["derniere_ms"] = neuf["bougies"][-1]["t"]
    noms = {e["symbole"] for e in evenements({"A": vieux, "B": neuf}, 30)}
    assert "B" not in noms


def test_les_fenetres_et_les_tranches_sont_figees():
    """Elles ont été déclarées avant la mesure. Les élargir après coup — une
    troisième fenêtre, une quatrième tranche — serait ajouter des hypothèses
    sans les compter, ce qui est la façon la plus simple de fabriquer un
    survivant."""
    assert [f for f, _ in FENETRES] == ["J+1_J+7", "J+1_J+30"]
    assert [t for t, _, _ in TRANCHES] == ["< 15 %", "15-30 %", "> 30 %"]


# ------------------------------------------------------ le rendement mesuré

def test_une_fenetre_tronquee_prend_la_derniere_cloture():
    """L'actif coté puis retiré en trois semaines est un événement, pas une
    donnée manquante. L'écarter retirerait les pires cas — ce qui jouerait
    contre l'hypothèse de baisse, et flatterait donc sa réfutation."""
    a = _actif(dt.date(2024, 1, 1), 40)
    for i, b in enumerate(a["bougies"]):
        b["c"] = 100.0 if i < 10 else 50.0
    par_jour = serie(a)
    debut = min(par_jour)
    r, tronque = rendement(par_jour, debut, debut + 100)
    assert tronque is True
    assert r == pytest.approx(-0.5), "clôture finale connue / clôture d'entrée"


def test_un_jour_d_entree_absent_ne_rend_pas_de_rendement():
    a = _actif(dt.date(2024, 1, 1), 40)
    par_jour = serie(a)
    r, tronque = rendement(par_jour, min(par_jour) - 500, min(par_jour) - 470)
    assert (r, tronque) == (0.0, False)


# ---------------------------------------------- LE contrôle qui a failli mentir

def test_le_nul_par_bloc_refuse_de_tourner_sur_une_plage_ecrasee():
    """LE test de ce fichier.

    Le décalage commun est borné par le plus court historique du lot. Un seul
    actif jeune suffit à réduire la plage à quelques jours — et chaque tirage
    « au hasard » recouvre alors la fenêtre observée. Le contrôle rend un p
    élevé et paraît avoir tué l'effet, alors qu'il a mesuré l'observation
    elle-même.

    C'est arrivé : la plage valait [0, 25] jours, le nul rendait p = 0,15, et
    j'ai failli publier une réfutation obtenue par un contrôle inerte.
    """
    btc = serie(_actif(dt.date(2023, 1, 1), 1200))
    # Un lot sain, plus UN actif dont l'historique est trop court.
    evs = []
    for i in range(12):
        a = _actif(dt.date(2024, 1, 1), 600)
        evs.extend(evenements({f"A{i}": a}, 30))
    court = _actif(dt.date(2024, 1, 1), 32)
    evs.extend(evenements({"COURT": court}, 30))

    _nuls, plage, gardes = nul_par_bloc(evs, btc, 50, random.Random(0))
    assert gardes == 12, "l'actif trop court doit être exclu du contrôle"
    assert plage >= MARGE_BLOC, (
        "la plage de décalage doit rester exploitable, sinon le contrôle "
        "mesure l'observation")


def test_le_nul_par_bloc_ne_tire_jamais_un_decalage_nul():
    """Un décalage de zéro EST l'observation. L'autoriser mettrait
    l'observation dans son propre modèle nul."""
    btc = serie(_actif(dt.date(2023, 1, 1), 1200))
    evs = []
    for i in range(12):
        evs.extend(evenements({f"A{i}": _actif(dt.date(2024, 1, 1), 600)}, 30))
    nuls, plage, _ = nul_par_bloc(evs, btc, 200, random.Random(1))
    assert nuls and plage > 0
    # Prix plats : tout décalage rend exactement zéro, y compris l'observation.
    # Ce qu'on vérifie ici est la MÉCANIQUE — la plage et le nombre de tirages.
    assert len(nuls) == 200


def test_le_nul_par_bloc_se_tait_plutot_que_de_mentir():
    """Moins de dix événements avec assez de marge : le contrôle rend une
    liste vide, et l'appelant doit le dire. Un contrôle qui rend un p sur
    trois observations est pire qu'un contrôle absent."""
    btc = serie(_actif(dt.date(2023, 1, 1), 1200))
    evs = evenements({"A": _actif(dt.date(2024, 1, 1), 600)}, 30)
    nuls, plage, gardes = nul_par_bloc(evs, btc, 100, random.Random(2))
    assert nuls == [] and plage == 0 and gardes < 10


# ------------------------------------------- une campagne voyage avec ses contrôles

def test_une_campagne_refutee_par_un_controle_ne_compte_plus_comme_edge(
        tmp_path, monkeypatch):
    """LE risque d'affichage de cette étude.

    Le criblage d'une campagne ne connaît pas ses contrôles : il compte des
    cellules et rend des survivants. Sans ce câblage, l'artefact des
    cotations porterait « 1 survivant », l'interface l'afficherait comme un
    edge directionnel, et la ligne « edge » du pré-vol passerait au VERT —
    pour un effet que le nul par bloc réfute.
    """
    import json

    from trading_desk.api import recherche

    faux = tmp_path / "baselines"
    faux.mkdir()
    (faux / "cotations.json").write_text(json.dumps({
        "hypothese": "la cotation est suivie d'une baisse",
        "tirages": 20000, "alpha": 0.05,
        "cellules": [
            {"fenetre": "J+1_J+30", "tranche": "> 30 %", "n": 53,
             "p_net": 0.00005, "tirages": 20000},
            *[{"fenetre": f"f{i}", "tranche": "x", "n": 25,
               "p_net": 0.6, "tirages": 20000} for i in range(7)],
        ],
        "controles": {
            "verdict": "refute",
            "raison": "le nul par bloc rend +809 bps contre +1863 observés, p = 0,164",
        },
    }), encoding="utf-8")
    monkeypatch.setattr(recherche, "BASELINES", faux)
    recherche._cache.clear()

    c = {x["titre"]: x for x in recherche.campagnes()}["Cotations de perpétuels"]
    assert c["testees"] == 8
    assert c["refute_par_controle"] is True
    assert c["nb_survivants"] == 0, "un survivant réfuté ne compte pas"
    assert "bloc" in c["raison_refutation"]

    lignes = {x["cle"]: x for x in recherche.prevol(
        campagnes_=recherche.campagnes())}
    assert lignes["edge"]["etat"] != "ok", (
        "la ligne edge du pré-vol ne doit pas verdir sur un effet réfuté")


def test_un_controle_qui_tient_laisse_le_survivant_compter(tmp_path, monkeypatch):
    """Le câblage ne doit pas effacer un survivant légitime : il n'efface que
    ceux qu'un contrôle a explicitement réfutés."""
    import json

    from trading_desk.api import recherche

    faux = tmp_path / "baselines"
    faux.mkdir()
    (faux / "cotations.json").write_text(json.dumps({
        "tirages": 20000, "alpha": 0.05,
        "cellules": [{"fenetre": "J+1_J+30", "tranche": "> 30 %", "n": 53,
                      "p_net": 0.00005, "tirages": 20000},
                     *[{"fenetre": f"f{i}", "tranche": "x", "n": 25,
                        "p_net": 0.6, "tirages": 20000} for i in range(7)]],
        "controles": {"verdict": "tient", "raison": "survit au nul par bloc"},
    }), encoding="utf-8")
    monkeypatch.setattr(recherche, "BASELINES", faux)
    recherche._cache.clear()

    c = {x["titre"]: x for x in recherche.campagnes()}["Cotations de perpétuels"]
    assert c["nb_survivants"] == 1
    assert not c.get("refute_par_controle")


def test_l_ecran_dit_pourquoi_une_campagne_est_refutee():
    """Un zéro nu se lit « rien trouvé » alors qu'il faut lire « trouvé PUIS
    réfuté, et voici par quoi »."""
    js = (Path(__file__).resolve().parents[1] / "src" / "trading_desk" / "ui"
          / "desk.js").read_text(encoding="utf-8")
    assert "refute_par_controle" in js
    assert "Réfutée par un contrôle" in js
