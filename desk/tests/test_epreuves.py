"""L'avocat du diable, et les trois façons de le rendre inoffensif.

Ce module de test protège une idée simple et fragile : **un contrôle qui ne
peut pas échouer est pire qu'aucun contrôle**, parce qu'il inspire confiance.
Le dépôt s'est déjà fait avoir une fois — le nul par bloc des cotations tirait
son décalage dans une plage bornée par le plus court historique, si bien que
chaque tirage recouvrait l'observation. Il validait tout.

Les trois façons de neutraliser l'épreuve, et les tests qui les ferment :

1. **Traiter « pas mesurable » comme « réussi ».** Une épreuve dont la donnée
   manque doit rendre INCOMPLETE, jamais RETENUE.
2. **Laisser une épreuve indisponible masquer un échec réel.** Le verdict
   afficherait « donnée absente » là où la vraie cause est un refus à 70 %.
3. **Corriger le p sur la ligne qu'on regarde** au lieu de tout le registre de
   même origine.
"""

from __future__ import annotations

import pytest

from trading_desk import epreuves
from trading_desk.epreuves import (
    ECHOUEE, INCOMPLETE, INDISPONIBLE, REFUSEE, RETENUE, REUSSIE, SANS_OBJET,
    soumettre,
)


def ligne(**champs):
    """Une candidate qui passe tout, sur laquelle on casse une chose à la fois."""
    base = {
        "signature": "aaaa", "p": 0.004, "tirages": 2000,
        "trades": 60, "rejets": 2, "net_usd": 120.0,
        "mois": {"2026-01": 40.0, "2026-02": 45.0, "2026-03": 35.0},
    }
    base.update(champs)
    return base


def par_cle(verdict, cle):
    return next(e for e in verdict.epreuves if e.cle == cle)


# ───────────────────────────────────────────── la propriété fondamentale

def test_une_epreuve_indisponible_ne_vaut_pas_une_epreuve_reussie():
    """C'est TOUTE la raison d'être des trois états.

    Sans ce comportement, une candidate dont on n'a pas pu mesurer le retrait
    d'un mois serait retenue comme si le retrait avait été fait et réussi.
    C'est exactement le contrôle inerte, sous une autre forme.
    """
    v = soumettre(ligne(mois=None))
    assert par_cle(v, "retrait").etat == INDISPONIBLE
    assert v.etat == INCOMPLETE, "une donnée manquante ne se retient pas"
    assert not any(e.etat == ECHOUEE for e in v.epreuves)


def test_une_candidate_complete_est_retenue():
    v = soumettre(ligne())
    assert v.etat == RETENUE
    assert v.fatale is None


def test_sans_objet_ne_bloque_pas():
    """« Ne s'applique pas à cette classe » n'est pas « on n'a pas pu ».

    Un nul par bloc sur un actif unique n'a pas de sens : il n'y a pas de
    coupe transversale dont préserver la structure. Confondre les deux
    rendrait toute candidate mono-actif INCOMPLETE à perpétuité, et l'épreuve
    deviendrait du bruit qu'on apprend à ignorer.
    """
    v = soumettre(ligne(), classe="prix_mono")
    assert par_cle(v, "bloc").etat == SANS_OBJET
    assert par_cle(v, "rang").etat == SANS_OBJET
    assert v.etat == RETENUE


# ─────────────────────────────────────── l'échec ne doit jamais être masqué

def test_un_echec_reel_prime_sur_une_epreuve_indisponible():
    """Le défaut trouvé en branchant l'épreuve sur le registre réel.

    `fatale` renvoyait la première épreuve bloquante dans l'ordre du tuple.
    Une épreuve indisponible placée avant un échec réel devenait le motif
    affiché : le verdict disait REFUSEE et la raison affichée disait « donnée
    absente », ce qui envoie chercher la donnée au lieu de la cause.
    """
    v = soumettre(ligne(mois=None, rejets=200))  # indisponible AVANT l'échec
    assert v.etat == REFUSEE
    assert v.fatale is not None
    assert v.fatale.cle == "refus", "un échec réel doit primer"
    assert v.fatale.etat == ECHOUEE


# ──────────────────────────────────────────────────── les sept épreuves

def test_un_p_au_plancher_est_refuse():
    """1/(D+1) est la borne de l'instrument, pas une mesure."""
    v = soumettre(ligne(p=1 / 2001, tirages=2000))
    assert par_cle(v, "plancher").etat == ECHOUEE
    assert "plancher" in par_cle(v, "plancher").motif


def test_un_p_sans_tirages_est_indisponible_pas_reussi():
    v = soumettre(ligne(tirages=None))
    assert par_cle(v, "plancher").etat == INDISPONIBLE


def test_trop_peu_de_trades():
    v = soumettre(ligne(trades=12))
    assert par_cle(v, "trades").etat == ECHOUEE
    assert v.etat == REFUSEE


def test_le_refus_du_moteur_de_risque_ecarte_tsmom():
    """La mesure réelle : 84 trades, 197 rejets, soit 70 %."""
    v = soumettre(ligne(trades=84, rejets=197))
    e = par_cle(v, "refus")
    assert e.etat == ECHOUEE
    assert "70%" in e.motif


def test_le_refus_juste_sous_le_plafond_passe():
    v = soumettre(ligne(trades=80, rejets=20))  # 20 %
    assert par_cle(v, "refus").etat == REUSSIE


def test_retirer_un_mois_qui_fait_tout_le_resultat():
    """Le bêta du portage passait de −0,54 à +0,08 en retirant un seul mois."""
    v = soumettre(ligne(net_usd=100.0,
                        mois={"2026-07": 10.0, "2026-08": 95.0,
                              "2026-09": -5.0}))
    e = par_cle(v, "retrait")
    assert e.etat == ECHOUEE
    assert "2026-08" in e.motif


def test_le_retrait_est_sans_objet_sur_un_net_negatif():
    """Il n'y a pas de gain à expliquer, et c'est une absence, pas un manque."""
    v = soumettre(ligne(net_usd=-40.0))
    assert par_cle(v, "retrait").etat == SANS_OBJET


def test_le_denominateur_porte_sur_tout_le_registre():
    """Seule, la candidate survit ; parmi cent, elle ne survit plus.

    C'est la propriété que l'atelier existe pour faire respecter, et c'est
    aussi ce qui distingue l'épreuve d'un barème : le même p rend un verdict
    différent selon le nombre d'hypothèses réellement testées.
    """
    seule = soumettre(ligne(p=0.004))
    assert par_cle(seule, "denominateur").etat == REUSSIE

    foule = [{"signature": f"s{i}", "p": 0.30, "tirages": 2000}
             for i in range(99)]
    v = soumettre(ligne(p=0.004), voisines=foule)
    assert par_cle(v, "denominateur").etat == ECHOUEE
    assert "100 signatures" in par_cle(v, "denominateur").motif


def test_un_essai_relance_ne_compte_pas_deux_fois():
    """Le moteur est déterministe : la même signature est une hypothèse."""
    meme = [ligne(p=0.004) for _ in range(40)]
    v = soumettre(ligne(p=0.004), voisines=meme)
    assert "1 signatures" in par_cle(v, "denominateur").motif


def test_un_criblage_aveugle_est_indisponible_pas_reussi():
    """Si le plancher dépasse alpha, aucune cellule ne peut survivre.

    Un « zéro survivant » rendu par un criblage aveugle ne dit rien du marché.
    Le déclarer INDISPONIBLE plutôt qu'ÉCHOUÉ est la distinction qui compte :
    la candidate n'est pas réfutée, elle n'a pas été testée.
    """
    v = soumettre(ligne(p=0.05, tirages=10))
    assert par_cle(v, "denominateur").etat == INDISPONIBLE
    assert "aveugle" in par_cle(v, "denominateur").motif


def test_le_nul_par_bloc_est_exige_des_regles_evenementielles():
    v = soumettre(ligne(), classe="evenement")
    assert par_cle(v, "bloc").etat == INDISPONIBLE
    assert v.etat == INCOMPLETE


def test_un_nul_par_bloc_inerte_est_un_echec():
    """Le défaut historique : plage nulle, donc chaque tirage recouvre tout."""
    v = soumettre(ligne(nul_bloc={"p": 0.001, "plage": None, "marge": 0}),
                  classe="evenement")
    e = par_cle(v, "bloc")
    assert e.etat == ECHOUEE
    assert "ne peut pas échouer" in e.motif or "ne controle rien" in e.motif


def test_le_nul_par_bloc_des_cotations_refute():
    """La mesure réelle après correction de la plage : p = 0,164."""
    v = soumettre(ligne(nul_bloc={"p": 0.164, "plage": [1, 115], "marge": 100}),
                  classe="evenement")
    assert par_cle(v, "bloc").etat == ECHOUEE
    assert "0.1640" in par_cle(v, "bloc").motif


def test_pearson_et_spearman_de_signes_opposes():
    """Les vrais chiffres : −0,64 contre +0,10 sur 53 points."""
    v = soumettre(ligne(correlation={"pearson": -0.64, "spearman": 0.10}))
    assert par_cle(v, "rang").etat == ECHOUEE


def test_une_correlation_sans_son_rang_est_indisponible():
    v = soumettre(ligne(correlation={"pearson": -0.64}))
    assert par_cle(v, "rang").etat == INDISPONIBLE
    assert v.etat == INCOMPLETE


def test_une_classe_inconnue_leve():
    with pytest.raises(ValueError, match="classe inconnue"):
        soumettre(ligne(), classe="au_pif")


def test_le_verdict_se_serialise_entierement():
    """Le panneau lit du JSON ; une épreuve perdue à la sérialisation serait
    une épreuve qui ne protège plus rien."""
    d = soumettre(ligne(trades=3)).en_dict()
    assert d["etat"] == REFUSEE
    assert d["fatale"] == "trades"
    assert len(d["epreuves"]) == 7
    assert all({"cle", "titre", "etat", "motif"} <= set(e) for e in d["epreuves"])


def test_la_decomposition_mensuelle_date_par_l_entree():
    """Dater par la sortie déplacerait les trades à cheval sur deux mois.

    Sur une stratégie à détention longue, ça changerait le mois qui porte le
    résultat, donc le verdict du retrait.
    """
    class T:
        def __init__(self, entree, sortie, net):
            self.entry_ts_ms, self.exit_ts_ms, self.net_pnl_usd = entree, sortie, net

    # entrée le 31 janvier, sortie le 2 février
    janvier_fin = 1_769_817_600_000   # 2026-01-31T00:00:00Z
    fevrier_debut = 1_769_990_400_000  # 2026-02-02T00:00:00Z
    mois = epreuves.nets_par_mois([T(janvier_fin, fevrier_debut, 50.0)])
    assert mois == {"2026-01": 50.0}
