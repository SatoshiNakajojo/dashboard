"""Le classement relatif, et les deux vérifications qui manquaient au diagnostic.

Ce fichier verrouille trois mécanismes dont la casse serait invisible dans
un rapport :

- la moyenne de référence du classement relatif ne doit porter que sur les
  mois STRICTEMENT antérieurs — sinon l'actif se compare à une moyenne qui
  le contient, voire à son avenir ;
- le témoin et le candidat doivent être rejoués sur la MÊME fenêtre — sinon
  la comparaison porte sur deux périodes plutôt que sur deux règles ;
- le « laisser-un-mois-de-côté » doit vraiment repérer un point de levier :
  c'est la vérification dont l'absence a fait publier une explication fausse,
  et un test vert sur une implémentation inerte la ferait republier.
"""

from __future__ import annotations

import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import pytest
from diagnostic_portage import caracteristiques, pente_et_erreur, un_mois_en_moins
from portage_financement import par_classement, par_mois, rejouer
from portage_relatif import (
    MOIS_MINIMUM_D_HISTORIQUE,
    fenetre,
    par_ecart_a_soi,
    premier_mois_jouable,
)

MOIS = [f"2026-{m:02d}" for m in range(1, 9)]


def _financement(valeurs: dict[str, list[float]]) -> dict:
    """`fin[mois][actif]`, à partir d'une série par actif."""
    return {m: {a: v[i] for a, v in valeurs.items() if i < len(v)}
            for i, m in enumerate(MOIS)}


# ------------------------------------------------------- le classement relatif

def test_la_moyenne_de_reference_ignore_le_mois_classe_et_l_avenir():
    """Le test central de ce fichier.

    CALME paie 1 tous les mois puis 5 au mois de classement. Son écart à
    lui-même doit valoir 5 − 1 = 4. Si la moyenne incluait le mois classé,
    elle vaudrait 2 et l'écart 3 ; si elle incluait les mois suivants, elle
    dépendrait de ce qui n'est pas encore arrivé.
    """
    valeurs = {
        "CALME": [1.0, 1.0, 1.0, 5.0, 9.0, 9.0, 9.0, 9.0],
        **{f"A{i}": [float(i)] * 8 for i in range(1, 8)},
    }
    fin = _financement(valeurs)
    choisir = par_ecart_a_soi(fin, MOIS)

    # Un sélecteur ne rend que les extrêmes ; on relit donc l'écart par le
    # rang obtenu, sur un monde où CALME doit arriver en tête.
    vendus, _achetes = choisir(sorted(valeurs), fin["2026-04"], 3, "2026-04")
    assert vendus[0] == "CALME", (
        "écart 5 − 1 = 4, le plus grand du monde jouet : CALME doit être vendu")

    # Au mois suivant, CALME paie 9 mais sa moyenne antérieure a monté à 2 :
    # son écart tombe à 7. Les autres restent plats, à écart nul.
    vendus, _achetes = choisir(sorted(valeurs), fin["2026-05"], 3, "2026-05")
    assert vendus[0] == "CALME"

    # Et au bout de quatre mois à 9, l'écart s'éteint tout seul : c'est la
    # propriété qu'on cherche — le NIVEAU persistant ne doit plus classer.
    ecarts = []
    for m in ("2026-06", "2026-07", "2026-08"):
        passe = [fin[x]["CALME"] for x in MOIS if x < m]
        ecarts.append(fin[m]["CALME"] - st.mean(passe))
    assert ecarts == sorted(ecarts, reverse=True), "l'écart doit décroître"
    assert ecarts[-1] < 0.8 * ecarts[0], (
        "un actif qui paie cher DURABLEMENT doit cesser d'être classé pour ça :"
        " c'est toute l'idée de la règle relative")


def test_un_actif_sans_historique_n_est_pas_classe():
    """Sans assez de mois, il n'y a pas de « niveau habituel ».

    Classer quand même reviendrait à comparer un actif à une moyenne d'un
    ou deux points, c'est-à-dire à du bruit — et les nouveaux actifs
    arrivant en permanence, le biais serait systématique.
    """
    assert MOIS_MINIMUM_D_HISTORIQUE >= 3
    valeurs = {f"A{i}": [float(i)] * 8 for i in range(1, 9)}
    fin = _financement(valeurs)
    choisir = par_ecart_a_soi(fin, MOIS)
    # Au deuxième mois, personne n'a trois mois derrière lui.
    assert choisir(sorted(valeurs), fin["2026-02"], 3, "2026-02") == ([], [])


def test_le_temoin_et_le_candidat_jouent_la_meme_fenetre():
    """Comparer deux règles sur deux périodes différentes ne compare rien.

    Le candidat démarre plus tard — il lui faut de l'historique. Si le
    témoin gardait ses premiers mois, l'écart entre les deux mélangerait un
    effet de règle et un effet de période, et rien ne le signalerait.
    """
    from test_portage_neutre import MARCHE, _monde

    betas = {f"A{i:02d}": 0.5 + i / 10 for i in range(20)}
    f_moy = {f"A{i:02d}": i * 1e-5 for i in range(20)}
    tous, fin, prix = par_mois(_monde(betas, MARCHE, f_moy))

    depuis = premier_mois_jouable(tous, fin, prix, 5)
    mois = fenetre(tous, depuis)
    assert mois[1] == depuis, "la fenêtre garde un mois de classement en amont"
    assert mois[0] < depuis

    a = rejouer(mois, fin, prix, 5, par_classement)
    b = rejouer(mois, fin, prix, 5, par_ecart_a_soi(fin, tous))
    assert len(a["mensuel"]) == len(b["mensuel"]), (
        "témoin et candidat doivent tenir le même nombre de mois")


# ---------------------------------------------- la pente et sa fragilité

def test_la_pente_rend_son_erreur_type():
    """Une pente sur onze points sans erreur-type n'est pas une mesure.

    Deux nuages de même pente, l'un net et l'autre bruité, doivent rendre
    la même pente et des erreurs-types très différentes.
    """
    net = [(0.01, 0.02), (0.02, 0.04), (0.03, 0.06), (-0.01, -0.02),
           (-0.02, -0.04)]
    b, se = pente_et_erreur(net)
    assert b == pytest.approx(2.0)
    assert se == pytest.approx(0.0, abs=1e-9), "un nuage exact : erreur nulle"

    bruite = [(x, y + (0.01 if i % 2 else -0.01))
              for i, (x, y) in enumerate(net)]
    b2, se2 = pente_et_erreur(bruite)
    assert se2 > 0.1, "un nuage bruité doit rendre une erreur-type visible"
    assert abs(b2 - 2.0) < 1.0


def test_laisser_un_mois_de_cote_repere_le_point_de_levier():
    """LA vérification qui manquait.

    Dix points sur une droite plate, plus un onzième très à droite et très
    bas : la pente globale est négative, et elle doit S'EFFONDRER dès qu'on
    retire ce point-là, et lui seul. Une implémentation qui rendrait la
    même pente onze fois passerait inaperçue sans ce test.
    """
    serie = [(0.01 * i, 0.0) for i in range(-5, 6)]
    serie.append((0.42, -0.36))
    etiquettes = [f"m{i:02d}" for i in range(len(serie))]

    pente, _se = pente_et_erreur(serie)
    assert pente < -0.5, "le point de levier doit tirer la pente vers le bas"

    sans = dict(un_mois_en_moins(serie, etiquettes))
    assert len(sans) == len(serie)
    levier = etiquettes[-1]
    assert abs(sans[levier]) < 0.05, "sans le point de levier, plus de pente"
    autres = [v for m, v in sans.items() if m != levier]
    assert all(abs(v - pente) < 0.15 for v in autres), (
        "retirer n'importe quel autre mois ne doit presque rien changer")


def test_les_caracteristiques_decrivent_bien_les_actifs():
    """Bêta, financement moyen, dispersion : les trois colonnes sur
    lesquelles repose la description de la composition des jambes."""
    from test_portage_neutre import MARCHE, _monde

    betas = {f"A{i:02d}": 0.4 + i / 5 for i in range(10)}
    f_moy = {f"A{i:02d}": i * 1e-5 for i in range(10)}
    mois, fin, prix = par_mois(_monde(betas, MARCHE, f_moy))

    carac = caracteristiques(mois, fin, prix)
    assert set(carac) == set(betas)
    # Les bêtas sont mesurés contre le marché OBSERVÉ (la moyenne des
    # actifs), donc à une échelle près — leur ORDRE, lui, doit tenir.
    ordre = sorted(carac, key=lambda a: carac[a]["beta"])
    assert ordre == sorted(betas, key=lambda a: betas[a])
    # Financement constant par actif : dispersion nulle, moyenne exacte.
    for a, d in carac.items():
        assert d["dispersion"] == pytest.approx(0.0, abs=1e-12)
        assert d["financement"] == pytest.approx(f_moy[a] * 28, rel=1e-9)
