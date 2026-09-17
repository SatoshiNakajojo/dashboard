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


# ──────────────────────────────────────────── ce que l'écran a le droit de dire

def _ui(nom: str) -> str:
    from pathlib import Path
    racine = Path(__file__).resolve().parents[1]
    return (racine / "src" / "trading_desk" / "ui" / nom).read_text(encoding="utf-8")


def test_la_bande_des_saisons_ne_porte_ni_rouge_ni_vert():
    """Deux raisons se rejoignent, et aucune n'est esthétique.

    Le rouge et le vert sont réservés à la sévérité dans tout ce poste. Et
    « bull = vert » dirait « bull = bien », ce qui est faux pour un desk qui
    peut vendre à découvert : une saison n'est pas un état de santé.
    """
    css = _ui("desk.css")
    bloc = css[css.index("/* ---------- LES SAISONS ----------"):]
    for classe in (".sz-bull", ".sz-bear", ".sz-range"):
        ligne = next(l for l in bloc.splitlines() if l.strip().startswith(classe))
        assert "--ok" not in ligne and "--crit" not in ligne, ligne
        assert "--warn" not in ligne, ligne


def test_la_grille_des_saisons_n_est_pas_une_carte_de_chaleur():
    """Trente-trois cases qui scintillent en deux couleurs invitent à chercher
    des motifs dans du bruit, et le résultat mesuré est que rien ne franchit
    le seuil. Le validateur de palette refusait d'ailleurs la paire rouge/vert
    en thème clair : ΔE 5,6 en deutéranopie, sous le plancher.

    La grille porte donc des POINTS sur l'axe des p, dont un seul est coloré —
    les cellules trop maigres sont creuses.
    """
    css = _ui("desk.css")
    bloc = css[css.index("/* La grille : un point par cellule"):]
    pt = next(l for l in bloc.splitlines() if l.strip().startswith(".grilleg .pt "))
    maigre = next(l for l in bloc.splitlines() if ".pt-mgr" in l)
    assert "var(--accent)" in pt
    assert "fill:none" in maigre, "une cellule maigre doit être creuse, pas colorée"
    assert "--ok" not in bloc and "--crit" not in bloc


def test_l_ecran_affiche_toujours_la_version_et_l_empreinte():
    """Une mesure qui ne dirait pas sous quelle déclaration elle a été faite ne
    serait pas comparable à la suivante."""
    js = _ui("desk.js")
    bloc = js[js.index("function rendreSaisons("):js.index("const GS = {")]
    assert "sz.empreinte" in bloc and "sz.version" in bloc
    assert "sz.fige_le" in bloc


def test_l_ecran_annonce_la_resolution_avant_les_resultats():
    """Un criblage aveugle rend un « zéro survivant » qui ne dit rien du
    marché. Ça se lit avant le tableau, pas après."""
    js = _ui("desk.js")
    bloc = js[js.index("function rendreSaisons("):js.index("const GS = {")]
    assert "plage_decalages" in bloc and "plage_requise" in bloc
    assert "criblage_possible" in bloc


def test_l_ecran_dit_ce_que_le_hasard_donnerait():
    """« Une cellule sous alpha » se lit comme une trouvaille ; « quand le
    hasard en donnerait 1,65 » se lit comme ce que c'est."""
    js = _ui("desk.js")
    bloc = js[js.index("function grapheGrilleSaisons("):]
    assert "attendu_au_hasard" in bloc
    assert "maigres_sous_alpha" in bloc, (
        "une cellule sous alpha absente du graphe parce qu'elle est maigre "
        "doit être nommée, pas laissée chercher")
