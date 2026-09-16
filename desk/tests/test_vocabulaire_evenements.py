"""Le vocabulaire d'événements — une déclaration, et les verrous qui la tiennent.

Ce module de test ne vérifie aucun résultat : il n'y en a pas encore, et c'est
le propos. Il verrouille les trois propriétés sans lesquelles la déclaration ne
vaudrait rien.

**L'empreinte.** Sans elle, « ajuster légèrement un seuil » suffirait à
transformer rétroactivement un échec en succès — et il suffirait de le faire
une fois pour que plus aucune mesure du dépôt ne veuille rien dire.

**Le criblage doit pouvoir voir.** Un test de randomisation a un plancher de p
à `1/(tirages+1)`. Si ce plancher dépasse le seuil de Benjamini–Hochberg au
rang 1, aucune cellule ne peut survivre quelle que soit la donnée, et le
« zéro survivant » qui en sortirait ne dirait rien du marché. C'est arrivé au
dépôt sur `baselines/grille.json`, tourné à 200 tirages.

**Les détecteurs ne regardent pas l'avenir.** Un événement défini sur une
bougie future se validerait tout seul.
"""

from __future__ import annotations

import pytest

from trading_desk.sentinelle import vocabulaire_evenements as v


def test_l_empreinte_est_verrouillee():
    """La changer exige d'incrémenter VERSION, ce qui repart d'un dénominateur
    neuf et d'un journal qui distingue les deux régimes."""
    assert v.VERSION == 2
    assert v.FIGE_LE == "2026-09-16"
    assert v.empreinte() == "31916f7e3cb78557"


def test_l_empreinte_couvre_les_PARAMETRES_des_detecteurs():
    """Un vocabulaire dont l'empreinte ignorerait les paramètres laisserait
    passer le réglage silencieux : même clés, autres seuils, autre hypothèse.
    """
    avant = v.empreinte()
    original = v.EVENEMENTS[0].parametres["periode"]
    try:
        object.__setattr__(v.EVENEMENTS[0], "parametres", {"periode": 21})
        assert v.empreinte() != avant, (
            "changer une période change l'événement, donc l'hypothèse")
    finally:
        object.__setattr__(v.EVENEMENTS[0], "parametres", {"periode": original})
    assert v.empreinte() == avant


def test_le_plancher_de_p_ne_depend_PAS_du_nombre_de_tirages():
    """**L'erreur de la version 1, verrouillée pour ne pas revenir.**

    Elle vérifiait `1/(TIRAGES+1) < alpha/m` et se déclarait mesurable. La
    vérification était juste et portait sur le mauvais plancher : le nombre de
    réalisations distinctes d'un nul PAR BLOC est le nombre d'offsets
    disponibles, pas le nombre de fois qu'on en tire un. Tirer cinq mille fois
    dans une plage de cent-dix offsets produit cent-dix nuls, rééchantillonnés.
    """
    assert v.plancher_de_p(110) == pytest.approx(1 / 111)
    assert v.plancher_de_p(5000) == pytest.approx(1 / 5001)
    # Et le nul est exhaustif : il n'y a plus de nombre de tirages du tout.
    assert not hasattr(v, "TIRAGES")
    assert v.NUL_EXHAUSTIF is True


def test_le_criblage_peut_voir_avec_la_plage_REELLE():
    """À 365 jours d'historique minimal, la plage vaut 171 offsets.

    Plancher 0,00581 contre un seuil BH au rang 1 de 0,05/8 = 0,00625. La
    marge est mince, et c'est pour ça qu'elle est testée : une hypothèse de
    plus la ferait basculer.
    """
    plage = 171
    plancher = v.plancher_de_p(plage)
    seuil_rang1 = 0.05 / v.DENOMINATEUR_DECLARE
    assert plancher < seuil_rang1, (
        f"plancher {plancher:.5f} contre seuil {seuil_rang1:.5f}")
    assert v.hypotheses_supportees(plage) == v.DENOMINATEUR_DECLARE


def test_une_hypothese_de_plus_rendrait_le_criblage_aveugle():
    """La contrainte qui a fait tomber la version 1, dans l'autre sens."""
    plage = 171
    assert v.plancher_de_p(plage) >= 0.05 / (v.DENOMINATEUR_DECLARE + 1)


def test_le_denominateur_declare_est_celui_des_sequences():
    """Version 2 : les huit types seuls, sans les paires."""
    seqs = v.sequences_declarees()
    assert len(seqs) == v.DENOMINATEUR_DECLARE == 8
    assert len(set(seqs)) == len(seqs), "aucune séquence en double"
    assert all(len(s) == 1 for s in seqs)


def test_les_paires_demanderaient_un_historique_qui_n_existe_pas():
    """**La réponse à l'idée des séquences : pas sur cette donnée.**

    64 paires exigent une plage de 1 280 offsets, donc plus de 1 480 jours
    d'historique commun à tous les actifs retenus. Aucun univers de perpétuels
    crypto sans biais du survivant ne l'offre.
    """
    plage_requise = int(64 / 0.05)
    assert plage_requise > 1_200
    # Et l'historique commun qu'il faudrait, avec la marge de bloc des deux
    # côtés :
    assert plage_requise + 2 * v.MARGE_BLOC > 1_400


def test_relever_le_seuil_d_historique_couterait_le_biais_du_survivant():
    """La colonne qui décide n'est pas la résolution, c'est la composition.

    Un perpétuel délisté est court par construction. L'univers de 234 perps a
    été collecté précisément pour ne pas avoir ce biais ; acheter de la
    résolution en montant le seuil revient à payer avec sa seule propriété
    rare. Mesuré : 21,3 % de délistés à 365 jours contre 11,8 % à 730.
    """
    assert v.HISTORIQUE_MIN_J == 365


def test_la_marge_du_nul_par_bloc_est_non_nulle():
    """Le défaut historique : une plage bornée par le plus court historique,
    donc chaque tirage recouvrant l'observation. Le contrôle ne pouvait pas
    échouer, donc il validait tout."""
    assert v.MARGE_BLOC > 0


def test_le_volume_nul_est_ecarte():
    """32 % des cotations publient des bougies à volume nul : des prix de
    marque, pas des exécutions. Une séquence déclenchée dessus mesurerait un
    mouvement que personne n'aurait pu trader."""
    assert v.VOLUME_MIN_REQUIS is True


def test_la_longueur_reste_dans_ce_que_la_donnee_porte():
    """Le couplage qu'on oublie : allonger les séquences exige de la
    résolution, et la résolution ne s'achète qu'en historique commun.

    Ce test n'interdit pas d'allonger ; il oblige à vérifier la plage en même
    temps. À 365 jours d'historique minimal, la plage vaut 171 offsets.
    """
    hypotheses = sum(len(v.EVENEMENTS) ** n
                     for n in range(1, v.LONGUEUR_MAX + 1))
    assert hypotheses == v.DENOMINATEUR_DECLARE
    assert v.plancher_de_p(171) < 0.05 / hypotheses


def test_aucun_detecteur_ne_regarde_l_avenir():
    """Chaque description se formule sur la bougie courante et les
    PRECEDENTES. Un événement défini sur une bougie future se validerait tout
    seul — et la relecture d'une description est la seule barrière avant que
    le détecteur n'existe."""
    for e in v.EVENEMENTS:
        assert "suivant" not in e.quoi and "futur" not in e.quoi, e.cle
        assert "precedent" in e.quoi or "des N jours" in e.quoi \
            or "consecutives" in e.quoi, e.cle
