"""La comptabilité du portage de financement.

Un backtest qui se trompe de signe ou de normalisation produit des chiffres
parfaitement présentables et parfaitement faux. Ces tests portent sur les
trois choses qui, si elles cassent, ne se voient pas à l'œil : la
décomposition, les signes, et la facturation de la rotation.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from portage_financement import (  # noqa: E402
    COUT_PAR_JAMBE_BPS,
    par_classement,
    par_mois,
    rejouer,
    tour,
)


def _monde(n_actifs: int = 20, mois: int = 3) -> dict:
    """Un monde jouet : financement croissant avec l'indice, prix plats."""
    actifs = {}
    for i in range(n_actifs):
        f, c = {}, {}
        for m in range(1, mois + 1):
            for j in range(1, 29):
                jour = f"2026-{m:02d}-{j:02d}"
                f[jour] = i * 1e-5          # plus l'indice est haut, plus ça paie
                c[jour] = 100.0             # prix strictement plat
        actifs[f"A{i:02d}"] = {"funding": f, "close": c}
    return actifs


def test_la_decomposition_somme_au_net():
    """portage + prix − frais = net. Sans ça, le rapport ment sur lui-même."""
    mois, fin, prix = par_mois(_monde())
    r = rejouer(mois, fin, prix, 3, par_classement)
    assert abs(r["portage"] + r["cours"] - r["frais"] - r["net"]) < 1e-12


def test_la_serie_mensuelle_somme_au_net():
    """Le net ET la série mensuelle décrivent la MÊME stratégie.

    Le test précédent ne vérifie que la définition de `net` à partir des
    trois accumulateurs. Il resterait vert si un mois était compté dans le
    total sans entrer dans `mensuel`, ou l'inverse — et c'est un accident
    facile : les accumulateurs et la liste sont alimentés par quatre lignes
    séparées, et un `continue` mal placé n'en saute que certaines.

    L'écart serait invisible là où il compte le plus : l'écart-type, le
    Sharpe et le compte de mois positifs sont tous calculés sur `mensuel`,
    le titre du rapport sur `net`. Ils se décriraient l'un l'autre en
    silence tout en portant sur des périodes différentes.
    """
    mois, fin, prix = par_mois(_monde())
    r = rejouer(mois, fin, prix, 3, par_classement)
    assert r["mensuel"], "un monde jouet de trois mois doit tenir deux mois"
    assert abs(sum(r["mensuel"]) - r["net"]) < 1e-12


def test_vendre_le_financement_eleve_l_encaisse():
    """Le signe. Un financement positif est payé PAR les longs AUX shorts.

    Inverser ce signe donnerait une stratégie qui paie ce qu'elle croit
    encaisser, et le total resterait plausible — c'est exactement le genre
    d'erreur qu'aucun coup d'œil ne rattrape.
    """
    mois, fin, prix = par_mois(_monde())
    r = rejouer(mois, fin, prix, 3, par_classement)
    assert r["portage"] > 0, "vendre le haut du classement doit encaisser"
    assert abs(r["cours"]) < 1e-9, "prix plats : l'effet prix doit être nul"


def test_une_position_reconduite_ne_paie_pas_de_frais():
    """On ne facture que ce qui change.

    Facturer tout le panier chaque mois surestimerait les frais d'autant que
    le classement est persistant — or c'est précisément la persistance qu'on
    mesure. Le biais irait donc contre la conclusion qu'on cherche à tester.
    """
    v = {"A", "B"}
    a = {"Y", "Z"}
    assert tour(v, a, v, a, 2) == 0.0
    # Une seule jambe change : deux mouvements (une sortie, une entrée).
    change = tour({"A", "C"}, a, v, a, 2)
    assert abs(change - 2 * COUT_PAR_JAMBE_BPS / 10_000 / 4) < 1e-15


def test_tout_est_rapporte_au_notionnel_brut():
    """k longs et k shorts d'une unité, c'est 2k déployés.

    Rapporter à k doublerait tous les chiffres sans rien changer à la
    réalité — une convention flatteuse qu'on ne remarque plus une fois
    écrite.
    """
    monde = _monde(n_actifs=20)
    mois, fin, prix = par_mois(monde)
    r = rejouer(mois, fin, prix, 5, par_classement)
    # Financement attendu : moyenne des 5 du haut moins celle des 5 du bas,
    # divisée par 2 (brut), sur 28 jours, pour chaque mois tenu.
    haut = sum(range(15, 20)) * 1e-5
    bas = sum(range(0, 5)) * 1e-5
    attendu = (haut - bas) / 10 * 28 * len(r["mensuel"])
    assert abs(r["portage"] - attendu) < 1e-9


def test_un_actif_sans_prix_n_est_pas_selectionne():
    """Classer sur un mois puis tenir un actif dont on n'a pas le prix,
    c'est choisir après coup ceux qui ont survécu."""
    monde = _monde(n_actifs=20)
    # Le mieux payé perd ses prix sur le dernier mois.
    monde["A19"]["close"] = {j: v for j, v in monde["A19"]["close"].items()
                             if not j.startswith("2026-03")}
    mois, fin, prix = par_mois(monde)
    assert "A19" not in prix["2026-03"]
    r = rejouer(mois, fin, prix, 3, par_classement)
    assert r["mensuel"], "les autres mois restent jouables"


def test_un_mois_incomplet_ne_compte_pas():
    """Un actif fraîchement listé ne doit pas être classé sur quatre jours.

    Sa somme de financement est mécaniquement minuscule : il se retrouverait
    « le plus bas du classement » et serait acheté pour une raison purement
    comptable. Le biais serait systématique et invisible — les nouveaux
    actifs arrivent tout le temps, et ils se rangeraient toujours du même
    côté.
    """
    from portage_financement import JOURS_MINIMUM

    monde = _monde(n_actifs=20)
    # Un nouvel entrant : quatre jours seulement sur le dernier mois.
    monde["NEUF"] = {
        "funding": {f"2026-03-{j:02d}": 1e-5 for j in range(1, 5)},
        "close": {f"2026-03-{j:02d}": 100.0 for j in range(1, 5)},
    }
    _mois, fin, prix = par_mois(monde)
    assert "NEUF" not in fin["2026-03"], "classé sur un mois incomplet"
    assert "NEUF" not in prix["2026-03"]
    assert JOURS_MINIMUM >= 20
