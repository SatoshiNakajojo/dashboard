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
    assert v.VERSION == 1
    assert v.FIGE_LE == "2026-09-16"
    assert v.empreinte() == "24bb1eeb6f90263c"


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


def test_le_criblage_peut_voir():
    """Le plancher de p doit passer sous le seuil BH au rang 1.

    Sinon le criblage est aveugle par construction : aucune cellule ne peut
    survivre, et son verdict ne décrit que le nombre de tirages.
    """
    plancher = 1 / (v.TIRAGES + 1)
    seuil_rang1 = 0.05 / v.DENOMINATEUR_DECLARE
    assert plancher < seuil_rang1, (
        f"plancher {plancher:.6f} contre seuil {seuil_rang1:.6f} : il "
        f"faudrait au moins {int(v.DENOMINATEUR_DECLARE / 0.05)} tirages")


def test_le_denominateur_declare_est_celui_des_sequences():
    """Huit types, longueurs 1 et 2 : 8 + 64."""
    seqs = v.sequences_declarees()
    assert len(seqs) == v.DENOMINATEUR_DECLARE == 72
    assert len(set(seqs)) == len(seqs), "aucune séquence en double"
    assert sum(1 for s in seqs if len(s) == 1) == len(v.EVENEMENTS)


def test_l_ordre_d_une_sequence_compte():
    """« Qui se succèdent DANS UN ORDRE ». Confondre (A,B) et (B,A) diviserait
    le dénominateur par deux en fusionnant des hypothèses distinctes."""
    seqs = set(v.sequences_declarees())
    assert ("cassure_haute", "volume_extreme") in seqs
    assert ("volume_extreme", "cassure_haute") in seqs


def test_une_sequence_peut_repeter_un_type():
    """Deux cassures hautes à trois jours d'écart est un motif, pas une erreur."""
    assert ("cassure_haute", "cassure_haute") in set(v.sequences_declarees())


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
    """Passer à 3 ferait 584 hypothèses, donc un seuil BH au rang 1 de
    0,000086, donc plus de 11 600 tirages nécessaires — et des séquences trop
    rares pour franchir le plancher d'occurrences de toute façon.

    Ce test n'interdit pas d'y aller ; il oblige à monter les tirages en même
    temps, ce qui est précisément le couplage qu'on oublie.
    """
    plancher = 1 / (v.TIRAGES + 1)
    hypotheses = sum(len(v.EVENEMENTS) ** n
                     for n in range(1, v.LONGUEUR_MAX + 1))
    assert plancher < 0.05 / hypotheses


def test_aucun_detecteur_ne_regarde_l_avenir():
    """Chaque description se formule sur la bougie courante et les
    PRECEDENTES. Un événement défini sur une bougie future se validerait tout
    seul — et la relecture d'une description est la seule barrière avant que
    le détecteur n'existe."""
    for e in v.EVENEMENTS:
        assert "suivant" not in e.quoi and "futur" not in e.quoi, e.cle
        assert "precedent" in e.quoi or "des N jours" in e.quoi \
            or "consecutives" in e.quoi, e.cle
