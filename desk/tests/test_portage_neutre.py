"""Les trois tentatives de sauvetage du portage, et leur pièce commune.

Le portage en coupe transversale a été réfuté trois fois : classement brut,
classement par le résidu, jambes appariées en bêta. Ce fichier ne teste pas
les conclusions — une conclusion n'est pas testable, elle est mesurée. Il
verrouille les mécanismes qui, s'ils cassaient, fabriqueraient une
conclusion sans qu'on le voie :

- un bêta estimé en regardant l'avenir donnerait une couverture que personne
  n'aurait pu poser, et il ferait paraître neutre un livre qui ne l'était
  pas ;
- un sélecteur qui reçoit le mauvais mois classerait sur des données qu'il
  ne pouvait pas connaître ;
- une pondération qui ne renormalise pas gonflerait le résultat par le seul
  effet du levier, sans que le rapport en dise rien.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import pytest
from diagnostic_portage import beta, correlation, jambes
from portage_financement import par_mois, rejouer
from portage_neutre import (
    POIDS_MAX,
    POIDS_MIN,
    betas_jusqu_a,
    rejouer_apparie,
)
from portage_residuel import par_residu, regression, residus_par_mois


def _monde(betas: dict[str, float], marche: dict[str, float],
           financement: dict[str, float] | None = None) -> dict:
    """Un monde jouet où chaque actif suit le marché avec le bêta demandé.

    `marche` donne le rendement du mois, mois par mois. Le prix de fin de
    mois est reconstruit pour que le rendement observé vaille exactement
    bêta × marché : c'est ce qui rend le bêta estimé vérifiable à la main.
    """
    financement = financement or {a: 1e-5 for a in betas}
    actifs = {}
    for nom, b in betas.items():
        f, c = {}, {}
        prix = 100.0
        for m in sorted(marche):
            for j in range(1, 29):
                jour = f"{m}-{j:02d}"
                f[jour] = financement[nom]
                # Prix plat sur le mois sauf le dernier jour : le rendement
                # du mois est mesuré entre la première et la dernière
                # clôture, donc il vaut exactement bêta × marché.
                c[jour] = prix * (1 + b * marche[m]) if j == 28 else prix
            prix = prix * (1 + b * marche[m])
        actifs[nom] = {"funding": f, "close": c}
    return actifs


# Un marché qui BOUGE, et dans les deux sens. Un marché plat rendrait toute
# régression indéfinie, et les tests de bêta passeraient en ne mesurant rien.
MARCHE = {"2026-01": 0.03, "2026-02": -0.02, "2026-03": 0.05, "2026-04": -0.04,
          "2026-05": 0.06, "2026-06": -0.05, "2026-07": 0.02, "2026-08": -0.06}


# ---------------------------------------------------------------- l'avenir

def test_le_beta_n_est_estime_que_sur_le_passe():
    """Le test central. Un bêta qui voit l'avenir fabrique la neutralité.

    L'actif RETOURNE a un bêta de +2 sur les quatre premiers mois puis de
    −2 ensuite. Estimé à la borne du cinquième mois, son bêta doit valoir
    +2 : le retournement n'a pas encore eu lieu. Une implémentation qui
    régresserait sur toute la période rendrait une valeur bien plus basse,
    et personne ne le verrait dans le rapport final.
    """
    # Douze actifs stables autour d'un seul qui se retourne : le marché
    # observé est la moyenne des actifs, et il ne doit pas se retourner
    # avec lui — sinon le retournement devient invisible à la régression.
    betas = {f"S{i:02d}": 1.0 for i in range(12)} | {"RETOURNE": 2.0}
    actifs = _monde(betas, MARCHE)
    # On réécrit les derniers mois de RETOURNE à bêta −2.
    prix = 100.0
    for m in sorted(MARCHE):
        b = 2.0 if m <= "2026-04" else -2.0
        for j in range(1, 29):
            jour = f"{m}-{j:02d}"
            actifs["RETOURNE"]["close"][jour] = (
                prix * (1 + b * MARCHE[m]) if j == 28 else prix)
        prix = prix * (1 + b * MARCHE[m])

    mois, _fin, prixs = par_mois(actifs)
    marche_obs = {m: sum(prixs[m].values()) / len(prixs[m]) for m in mois}

    avant = betas_jusqu_a(mois, prixs, marche_obs, "2026-05")
    # La même régression, à la main, sur les quatre mois antérieurs.
    attendu = beta([(marche_obs[m], prixs[m]["RETOURNE"])
                    for m in mois if m < "2026-05"])
    sur_tout = beta([(marche_obs[m], prixs[m]["RETOURNE"]) for m in mois])

    assert avant["RETOURNE"] == pytest.approx(attendu), (
        "l'estimation à la borne doit être celle du passé, exactement")
    assert abs(attendu - sur_tout) > 0.5, (
        "le retournement doit changer le bêta — sinon le test ne teste rien")


def test_le_beta_ignore_le_mois_de_la_borne_lui_meme():
    """La borne est STRICTE. Inclure le mois qu'on est en train de jouer,
    c'est connaître son rendement avant de le tenir — la forme la plus
    directe de regard sur l'avenir, et un `<=` au lieu d'un `<` suffit.
    """
    actifs = _monde({"A": 1.0, "B": 1.8, "C": 0.3}, MARCHE)
    mois, _fin, prixs = par_mois(actifs)
    marche_obs = {m: sum(prixs[m].values()) / len(prixs[m]) for m in mois}

    series: dict[str, list] = {}
    for m in mois:
        if m < "2026-05":
            for a, r in prixs[m].items():
                series.setdefault(a, []).append((marche_obs[m], r))
    attendu = {a: beta(pts) for a, pts in series.items()}
    obtenu = betas_jusqu_a(mois, prixs, marche_obs, "2026-05")
    assert set(obtenu) == {"A", "B", "C"}, "sans bêta rendu, le test est vide"
    for a, b in obtenu.items():
        assert abs(b - attendu[a]) < 1e-9, f"{a} : la borne fuit"


def test_un_beta_sur_trop_peu_de_mois_n_est_pas_rendu():
    """Trois points ne font pas une pente. Rendre quand même un bêta
    donnerait une couverture au hasard, et le rapport la présenterait
    comme une correction mesurée."""
    trois = {m: v for m, v in list(MARCHE.items())[:3]}
    actifs = _monde({"A": 1.0, "B": 1.5}, trois)
    mois, _fin, prixs = par_mois(actifs)
    marche_obs = {m: sum(prixs[m].values()) / len(prixs[m]) for m in mois}
    assert betas_jusqu_a(mois, prixs, marche_obs, mois[-1]) == {}


# ------------------------------------------------------------ la pondération

def test_a_betas_egaux_l_appariement_ne_change_rien():
    """Si les deux jambes ont le même bêta, il n'y a rien à corriger.

    Le test attrape une renormalisation qui dériverait : des poids qui ne
    se ramènent pas à un notionnel brut de 2k changeraient le résultat
    même quand la couverture est neutre, et l'écart passerait pour un
    effet de la stratégie.
    """
    betas = {f"A{i:02d}": 1.0 for i in range(20)}
    fin = {f"A{i:02d}": i * 1e-5 for i in range(20)}
    mois, f, p = par_mois(_monde(betas, MARCHE, fin))

    sans = rejouer_apparie(mois, f, p, 5, apparier=False)
    avec = rejouer_apparie(mois, f, p, 5, apparier=True)
    assert abs(sans["net"] - avec["net"]) < 1e-12


def test_le_temoin_apparie_reproduit_le_portage_simple():
    """`apparier=False` doit rendre EXACTEMENT le portage déjà publié.

    Sans cette égalité, le témoin du rapport n'est pas la stratégie
    réfutée mais une variante — et la comparaison ne dirait plus rien.
    """
    betas = {f"A{i:02d}": 0.5 + i / 10 for i in range(20)}
    fin = {f"A{i:02d}": i * 1e-5 for i in range(20)}
    mois, f, p = par_mois(_monde(betas, MARCHE, fin))

    from portage_financement import par_classement

    a = rejouer(mois, f, p, 5, par_classement)
    b = rejouer_apparie(mois, f, p, 5, apparier=False)
    for poste in ("portage", "cours", "frais", "net"):
        assert abs(a[poste] - b[poste]) < 1e-12, poste


def test_les_poids_restent_bornes_meme_face_a_un_beta_minuscule():
    """Un bêta estimé peut être minuscule. Peser à son inverse donnerait un
    levier de vingt sur une jambe, et le rapport n'en dirait rien.

    Le monde ci-dessous est fait pour ça : la jambe achetée a un bêta de
    0,05, dont l'inverse vaut 20. Les poids effectivement appliqués doivent
    rester dans la bande.
    """
    assert 0 < POIDS_MIN < 1 < POIDS_MAX
    assert POIDS_MAX <= 3, "au-delà, ce n'est plus une couverture"

    # Financement croissant avec l'indice, bêta DÉcroissant : la jambe
    # vendue est à fort bêta, l'achetée à bêta quasi nul.
    betas = {f"A{i:02d}": 2.5 - 0.13 * i for i in range(20)}
    fin = {f"A{i:02d}": i * 1e-5 for i in range(20)}
    mois, f, p = par_mois(_monde(betas, MARCHE, fin))

    r = rejouer_apparie(mois, f, p, 5, apparier=True)
    assert r["poids"], "le monde jouet doit produire des rebalancements"
    appliques = [x for couple in r["poids"] for x in couple]
    assert max(appliques) <= POIDS_MAX + 1e-12
    assert min(appliques) >= POIDS_MIN - 1e-12
    assert max(appliques) > 1.0 + 1e-9, (
        "sur ce monde l'appariement doit vraiment peser, sinon rien n'est testé")


# ----------------------------------------------------------------- le résidu

def test_le_selecteur_recoit_le_mois_du_CLASSEMENT():
    """Le mois passé au sélecteur est celui sur lequel on classe, jamais
    celui qu'on tient.

    Le sélecteur par résidu va chercher sa table dans ce mois-là. S'il
    recevait le mois tenu, il classerait sur des résidus calculés à partir
    de rendements pas encore observés : toute la stratégie deviendrait
    clairvoyante, et son résultat magnifique.
    """
    vus: list[str] = []

    def espion(eligibles, classement, k, mois=None):
        vus.append(mois)
        ordre = sorted(eligibles, key=lambda a: -classement[a])
        return ordre[:k], ordre[-k:]

    betas = {f"A{i:02d}": 1.0 for i in range(20)}
    mois, f, p = par_mois(_monde(betas, MARCHE))
    rejouer(mois, f, p, 3, espion)

    assert vus, "le monde jouet doit produire au moins un rebalancement"
    # Le mois vu à chaque tour est le PRÉCÉDENT, pas le courant.
    assert vus == mois[:len(vus)]
    assert mois[len(vus)] not in vus


def test_le_residu_annule_ce_que_le_rendement_explique():
    """Quand le financement est une fonction affine exacte du rendement,
    il ne reste rien : tous les résidus sont nuls.

    C'est la définition même de l'opération. Si elle échoue, le
    « classement par le résidu » classe encore par le financement brut et
    le candidat n'est qu'un témoin déguisé.
    """
    betas = {f"A{i:02d}": 0.2 * i for i in range(12)}
    actifs = _monde(betas, MARCHE)
    mois, fin, prix = par_mois(actifs)
    # Financement = 3e-4 + 2e-3 × rendement du mois, exactement.
    for m in mois:
        for a in fin[m]:
            fin[m][a] = 3e-4 + 2e-3 * prix[m][a]

    res = residus_par_mois(mois, fin, prix)
    assert res, "la régression doit tourner sur ce monde"
    for m, table in res.items():
        assert max(abs(v) for v in table.values()) < 1e-12, m


def test_la_regression_ne_pente_pas_sans_variance():
    """Sans variance en abscisse, la pente n'est pas définie. La forcer
    donnerait un résidu arbitraire, et un classement qui s'en sert
    rangerait les actifs par du bruit numérique."""
    a, b = regression([5.0] * 6, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0])
    assert b == 0.0
    assert a == pytest.approx(3.5)


def test_le_selecteur_par_residu_se_tait_sur_un_mois_sans_table():
    """Pas de table pour ce mois : aucune position.

    Inventer un classement de repli — le financement brut, par exemple —
    ferait silencieusement jouer le témoin à la place du candidat sur les
    mois où la régression n'a pas pu tourner.
    """
    choisir = par_residu({"2026-02": {"A": 1.0, "B": 2.0, "C": 3.0, "D": 4.0}})
    assert choisir(["A", "B", "C", "D"], {}, 2, "2026-01") == ([], [])
    v, a = choisir(["A", "B", "C", "D"], {}, 2, "2026-02")
    assert (v, a) == (["D", "C"], ["B", "A"])


# ------------------------------------------------------------- le diagnostic

def test_le_beta_du_diagnostic_retrouve_une_pente_connue():
    """Toute la correction publiée repose sur ces deux fonctions. Si elles
    se trompent, la cause nommée est fausse à son tour."""
    droite = [(0.01, 0.02), (0.02, 0.04), (-0.01, -0.02), (0.03, 0.06)]
    assert beta(droite) == pytest.approx(2.0)
    assert beta([(x, 0.0) for x, _ in droite]) == pytest.approx(0.0)
    assert beta(droite[:3]) is None, "trois points ne font pas une pente"
    assert beta([(0.01, 0.5)] * 4) is None, "sans variance en abscisse, rien"


def test_la_correlation_du_diagnostic_retrouve_un_signe_connu():
    assert correlation([1, 2, 3, 4], [2, 4, 6, 8]) == pytest.approx(1.0)
    assert correlation([1, 2, 3, 4], [8, 6, 4, 2]) == pytest.approx(-1.0)
    assert correlation([1, 2, 3], [1, 1, 1]) is None, "sans variance, rien à dire"


def test_le_diagnostic_classe_du_meme_cote_que_le_backtest():
    """Le diagnostic rejoue la sélection de son côté. S'il ne sélectionnait
    pas les mêmes actifs que le backtest, il expliquerait une stratégie qui
    n'a jamais tourné.
    """
    betas = {f"A{i:02d}": 0.2 * i for i in range(20)}
    fin = {f"A{i:02d}": i * 1e-5 for i in range(20)}
    # Un marché en hausse tous les mois : la jambe à fort bêta monte plus.
    hausse = {m: 0.01 * (i + 1) for i, m in enumerate(sorted(MARCHE))}
    mois, f, p = par_mois(_monde(betas, hausse, fin))

    lignes = jambes(mois, f, p, 5)
    assert lignes
    for ligne in lignes:
        # Le côté vendu est celui au financement le plus élevé : dans ce
        # monde, les indices hauts, donc les bêtas hauts.
        assert ligne["vendu"] > ligne["achete"], (
            "marché en hausse, jambe vendue à fort bêta : elle doit monter plus")
