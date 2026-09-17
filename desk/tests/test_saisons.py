"""La déclaration des saisons, et le seul test qui compte pour un tel fichier.

Un fichier qui déclare ne se teste pas sur ce qu'il calcule — il ne calcule
presque rien. Il se teste sur le fait qu'il n'a PAS bougé : une déclaration
qu'on peut ajuster après avoir vu les résultats n'est pas une déclaration,
c'est un paramètre de plus, et personne — pas même son auteur — ne peut
distinguer les deux cas après coup.

D'où l'empreinte verrouillée. Changer un seul nombre du découpage casse ce
test, ce qui oblige à incrémenter `VERSION` et à repartir d'un dénominateur
neuf, au lieu de retoucher les bornes jusqu'à ce qu'elles plaisent.
"""

from __future__ import annotations

from datetime import date

import pytest

from trading_desk import saisons


def test_l_empreinte_de_la_declaration_est_figee():
    """LE test de ce module."""
    assert saisons.empreinte() == "e938a665ab53e1de", (
        "la déclaration des saisons a changé sans que VERSION soit "
        "incrémentée — c'est exactement le geste qui transforme un découpage "
        "en paramètre ajusté")
    assert saisons.VERSION == 2
    assert saisons.FIGE_LE == "2026-09-17"


def test_le_denominateur_est_annonce_avant_la_mesure():
    """Onze stratégies × trois saisons. Prendre le maximum de trente-trois
    tirages bruités produit toujours un gagnant."""
    from trading_desk.backtest.strategies import BASELINES

    assert saisons.STRATEGIES_AU_CATALOGUE == len(BASELINES), (
        "le catalogue a bougé : le dénominateur déclaré ne correspond plus, "
        "et c'est une raison d'incrémenter VERSION, pas de le corriger")
    assert saisons.DENOMINATEUR == len(BASELINES) * len(saisons.SAISONS)


def test_la_confirmation_ne_cree_aucun_degre_de_liberte():
    """La version 2 corrige un défaut du découpage sans ajouter de nombre.

    `CONFIRMATION_BARRES` vaut `PENTE_BARRES`, déjà déclaré. Sur un découpage
    qui décide de trente-trois hypothèses, un degré de liberté de plus est
    exactement ce qu'on ne peut pas se permettre — et « vingt parce que ça
    marche mieux » serait un réglage, pas une déclaration.
    """
    assert saisons.CONFIRMATION_BARRES == saisons.PENTE_BARRES


def test_la_saison_est_calculee_avec_un_retard():
    """Sans retard, la saison est lue sur la barre qu'elle explique, et la
    « meilleure stratégie par saison » gagne parce qu'elle connaît la
    clôture."""
    assert saisons.RETARD_BARRES >= 1


def test_le_plancher_vient_des_decalages_pas_des_tirages():
    """La leçon de la version 2 du vocabulaire d'événements.

    Tirer cinq mille fois dans une plage de deux cents décalages ne produit
    pas cinq mille nuls : il en produit deux cents, rééchantillonnés.
    """
    assert saisons.plancher_de_p(200) == pytest.approx(1 / 201)
    assert saisons.plancher_de_p(200) != pytest.approx(1 / (saisons.TIRAGES + 1))
    with pytest.raises(ValueError, match="inerte"):
        saisons.plancher_de_p(0)


def test_la_plage_requise_est_calculable_avant_la_mesure():
    """Une précondition vérifiable, pas une excuse trouvée après coup."""
    requise = saisons.plage_requise()
    assert requise == 659
    assert not saisons.criblage_possible(requise - 100)
    assert saisons.criblage_possible(requise)


def test_le_jour_du_cycle_est_calculable_hors_historique():
    """Les quatre halvings sont inscrits, y compris les trois que les données
    de cette machine ne couvrent pas : ajouter un historique plus profond ne
    doit pas exiger de toucher à la déclaration."""
    assert saisons.jour_du_cycle(date(2024, 4, 19)) == 0
    assert saisons.cycle_de(date(2024, 4, 19)) == 4
    assert saisons.jour_du_cycle(date(2013, 1, 1)) == 34
    assert saisons.cycle_de(date(2013, 1, 1)) == 1
    assert saisons.jour_du_cycle(date(2010, 1, 1)) is None


def test_la_declaration_dit_ce_que_la_donnee_ne_permet_pas():
    """« Sur les 4 derniers cycles » a été demandé ; la machine en a 1,6.

    L'écart est inscrit dans la déclaration plutôt que dans un commentaire de
    commit, parce que c'est lui qui explique pourquoi le halving n'est qu'un
    observable et pas la définition des saisons.
    """
    assert saisons.CYCLES_DEMANDES == 4
    assert saisons.CYCLES_COMPLETS_DISPONIBLES == 1
