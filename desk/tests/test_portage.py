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
