"""La famille, et la seule direction d'erreur qui soit interdite.

Regrouper des variantes ASSOUPLIT la porte : moins de familles que de
signatures, donc un seuil au rang 1 plus genereux. Un module qui assouplit
une correction doit etre tenu par ses tests plus serre qu'un module qui la
durcit, parce que ses bugs ressemblent tous a des bonnes nouvelles.

Trois facons de le rendre laxiste, et les tests qui les ferment :

1. **Fondre des lignes qu'on ne sait pas identifier.** Le premier jet le
   faisait : les champs absents se repliaient sur `"?"`, trois cents cellules
   anonymes tombaient dans UNE famille, m valait 1, et le seuil au rang 1
   remontait a alpha. La correction ne rejetait plus rien.
2. **Faire passer une variante au score de sa voisine.** Le p de famille
   certifie « la meilleure des V », pas chacune des V.
3. **Oublier que le plancher monte avec le nombre de variantes.** Prendre la
   meilleure de dix ne peut pas etre dix fois plus surprenant que la meilleure
   d'une seule.
"""

from __future__ import annotations

import pytest

from trading_desk import familles
from trading_desk.epreuves import ECHOUEE, REUSSIE, soumettre


def cellule(strategie="ema_cross", actif="SOL", intervalle="4h",
            signature="aaaa", p=0.004, tirages=2000, **champs):
    base = {
        "signature": signature, "p": p, "tirages": tirages,
        "strategie": strategie, "actif": actif, "intervalle": intervalle,
        "origine": "main",
        "trades": 60, "rejets": 2, "net_usd": 120.0,
        "mois": {"2026-01": 40.0, "2026-02": 45.0, "2026-03": 35.0},
    }
    base.update(champs)
    return base


def denominateur(verdict):
    return next(e for e in verdict.epreuves if e.cle == "denominateur")


# ───────────────────────────────────────────────────── le regroupement

def test_les_variantes_d_une_cellule_font_une_famille():
    """Dix reglages sur les memes barres posent une question, pas dix."""
    lot = [cellule(signature=f"v{i}", p=0.01 * (i + 1)) for i in range(10)]
    fams = familles.construire(lot)
    assert len(fams) == 1
    assert fams[0].taille == 10
    assert fams[0].cle == "main/ema_cross/SOL/4h"


def test_deux_marches_restent_deux_familles():
    """Le nul est construit sur CES barres : changer d'actif change l'hypothese.

    Les fondre paierait une recherche a la place de deux — le sens laxiste.
    """
    lot = [cellule(actif="SOL", signature="a"),
           cellule(actif="BTC", signature="b"),
           cellule(actif="SOL", intervalle="1d", signature="c")]
    assert len(familles.construire(lot)) == 3


def test_deux_origines_restent_deux_familles():
    lot = [cellule(origine="main", signature="a"),
           cellule(origine="llm", signature="b")]
    assert len(familles.construire(lot)) == 2


def test_une_ligne_sans_cellule_identifiable_est_sa_propre_famille():
    """LE test de ce module. Fondre des inconnues absout ; les separer refuse.

    Sans strategie ni actif, on ne peut pas affirmer qu'une ligne est la
    variante de quoi que ce soit. La seule lecture defendable est « une
    hypothese de plus ».
    """
    anonymes = [{"signature": f"s{i}", "p": 0.30, "tirages": 2000}
                for i in range(300)]
    fams = familles.construire(anonymes)
    assert len(fams) == 300, (
        "300 lignes anonymes fondues en moins de 300 familles rendraient le "
        "denominateur inoffensif")
    assert all(f.taille == 1 for f in fams)


def test_un_champ_de_cellule_manquant_suffit_a_isoler():
    """La cle est tout ou rien : un actif sans intervalle n'identifie pas."""
    lot = [{"signature": "a", "p": 0.1, "strategie": "ema_cross",
            "actif": "SOL"},
           {"signature": "b", "p": 0.1, "strategie": "ema_cross",
            "actif": "SOL"}]
    assert len(familles.construire(lot)) == 2


def test_une_ligne_sans_origine_tombe_dans_main():
    """Comme `atelier.voisines` : l'ignorer allegerait le denominateur."""
    lot = [cellule(signature="a"), cellule(signature="b", origine=None)]
    fams = familles.construire(lot)
    assert len(fams) == 1 and fams[0].taille == 2


def test_les_lignes_sans_p_n_entrent_pas():
    """Une cellule sans trade n'est pas une hypothese testee."""
    lot = [cellule(signature="a"),
           cellule(signature="b", p=None),
           {"signature": "c", "strategie": "ema_cross", "actif": "SOL",
            "intervalle": "4h", "origine": "main"}]
    fams = familles.construire(lot)
    assert len(fams) == 1 and fams[0].taille == 1


def test_la_representante_est_la_plus_petite_p():
    lot = [cellule(signature="a", p=0.20), cellule(signature="b", p=0.002),
           cellule(signature="c", p=0.05)]
    fam = familles.construire(lot)[0]
    assert fam.representante["signature"] == "b"


# ──────────────────────────────────────────────────────── la borne de Šidák

def test_la_borne_ne_descend_jamais_sous_le_p_minimum():
    """Une correction qui rendrait un p plus petit que la mesure fabriquerait
    un edge. C'est la propriete a ne jamais casser."""
    for p in (0.0001, 0.004, 0.05, 0.3, 0.9):
        for v in (1, 2, 10, 100):
            assert familles.p_sidak(p, v) >= p - 1e-15


def test_la_borne_monte_avec_le_nombre_de_variantes():
    suite = [familles.p_sidak(0.004, v) for v in (1, 2, 5, 10, 50)]
    assert suite == sorted(suite)
    assert suite[0] == pytest.approx(0.004)


def test_une_famille_d_une_variante_ne_paie_aucune_recherche():
    """Ne pas avoir cherche ne doit rien couter."""
    assert familles.p_sidak(0.004, 1) == pytest.approx(0.004)
    assert familles.p_sidak(0.004, 0) == pytest.approx(0.004)


def test_la_borne_reste_une_probabilite():
    assert familles.p_sidak(0.9, 1000) <= 1.0


# ──────────────────────────────────────────────── le maximum exact

def test_le_maximum_sur_une_variante_rend_le_p_de_randomisation():
    """Une variante seule : le maximum de V=1 est la variante elle-meme."""
    nuls = [[1.0, 2.0, 3.0, 4.0]]
    # observe = 3.5 : un seul tirage (4.0) fait mieux -> (1+1)/(4+1)
    assert familles.p_maximum(nuls, [3.5]) == pytest.approx(2 / 5)


def test_le_maximum_prend_le_meilleur_de_chaque_tirage():
    """Deux variantes, tirages alignes : c'est le max PAR TIRAGE qui compte."""
    nuls = [[1.0, 9.0, 1.0, 1.0],
            [9.0, 1.0, 1.0, 1.0]]
    # maxima par tirage : 9, 9, 1, 1 ; observe = 5 -> deux tirages font mieux
    assert familles.p_maximum(nuls, [5.0, 4.0]) == pytest.approx(3 / 5)


def test_le_maximum_refuse_des_tirages_non_alignes():
    """Des graines differentes melangent des univers : le nuage devient plus
    disperse, donc plus laxiste. On refuse plutot que de chiffrer."""
    with pytest.raises(ValueError, match="non alignes"):
        familles.p_maximum([[1.0, 2.0], [1.0, 2.0, 3.0]], [1.0, 1.0])


def test_le_maximum_refuse_une_famille_vide():
    with pytest.raises(ValueError):
        familles.p_maximum([], [])


# ─────────────────────────────────────────────────────────── le plancher

def test_le_plancher_monte_avec_les_variantes_sous_la_borne():
    """Prendre la meilleure de dix ne peut pas etre dix fois plus surprenant."""
    seul = familles.plancher(2000, 1, familles.BORNE)
    dix = familles.plancher(2000, 10, familles.BORNE)
    assert seul == pytest.approx(1 / 2001)
    assert dix > seul
    assert dix == pytest.approx(1 - (1 - 1 / 2001) ** 10)


def test_le_plancher_reste_celui_de_l_instrument_sous_le_maximum():
    """Le maximum est UN test, pas V : c'est la seconde raison de lancer les
    familles d'un bloc."""
    assert familles.plancher(2000, 10, familles.MAXIMUM) == pytest.approx(1 / 2001)


def test_une_famille_collee_a_son_plancher_est_dite_aveugle():
    lot = [cellule(signature=f"v{i}", p=1 / 2001) for i in range(4)]
    fam = familles.construire(lot)[0]
    assert fam.aveugle


# ──────────────────────────────────────── le p annonce par un lot d'un bloc

def test_un_lot_lance_d_un_bloc_garde_son_p_exact():
    lot = [cellule(signature=f"v{i}", p=0.02 + i / 100,
                   famille_p=0.017, famille_methode=familles.MAXIMUM,
                   famille_variantes=3) for i in range(3)]
    fam = familles.construire(lot)[0]
    assert fam.methode == familles.MAXIMUM
    assert fam.p == pytest.approx(0.017)


def test_un_lot_complete_apres_coup_retombe_sur_la_borne():
    """Melanger un bloc et des essais ajoutes ensuite : on ne sait plus a quel
    point les variantes se ressemblaient. On reprend le choix conservateur."""
    lot = [cellule(signature=f"v{i}", p=0.004,
                   famille_p=0.017, famille_methode=familles.MAXIMUM,
                   famille_variantes=3) for i in range(3)]
    lot.append(cellule(signature="tardive", p=0.004))
    fam = familles.construire(lot)[0]
    assert fam.methode == familles.BORNE
    assert fam.p == pytest.approx(familles.p_sidak(0.004, 4))
    # A nombre de variantes EGAL, la borne majore toujours l'exact ; comparer
    # deux tailles de famille differentes ne dirait rien.
    assert familles.p_sidak(0.004, 3) > 0.004


# ──────────────────────────────────── ce que la porte en fait vraiment

def test_dix_variantes_ne_passent_pas_ou_une_seule_passerait():
    """La recherche de reglages est payee, meme regroupee.

    Une cellule seule a p = 0,004 passe. Les memes 0,004 obtenus comme
    meilleur de dix ne passent pas : c'est exactement la recherche que la
    correction existe pour facturer.
    """
    # Quatre autres cellules au registre : le seuil au rang 1 vaut alpha/5.
    fond = [cellule(actif=a, signature=a, p=0.30)
            for a in ("BTC", "ETH", "AVAX", "ARB")]

    seule = cellule(signature="seule", p=0.004)
    assert denominateur(soumettre(seule, voisines=fond)).etat == REUSSIE

    fratrie = [cellule(signature=f"v{i}", p=0.004 + i / 100) for i in range(1, 10)]
    v = soumettre(cellule(signature="v0", p=0.004), voisines=fratrie + fond)
    assert denominateur(v).etat == ECHOUEE
    assert "10 variante(s)" in denominateur(v).motif


def test_une_variante_ne_passe_pas_au_score_de_sa_voisine():
    """Le p de famille certifie la meilleure des V, pas la troisieme."""
    meilleure = cellule(signature="top", p=0.0001)
    moyenne = cellule(signature="moyenne", p=0.03)
    v = soumettre(moyenne, voisines=[meilleure])
    e = denominateur(v)
    assert e.etat == ECHOUEE
    assert "une autre variante y fait mieux" in e.motif


def test_regrouper_assouplit_le_seuil_sans_effacer_le_denominateur():
    """La propriete entiere du bloc, en un test.

    Trente-cinq signatures dont trente sont des reglages de deux cellules :
    le seuil au rang 1 doit remonter, mais les cellules DISTINCTES doivent
    toutes rester comptees.
    """
    lot = [cellule(actif="BTC", signature=f"btc{i}", p=0.3) for i in range(15)]
    lot += [cellule(actif="ETH", signature=f"eth{i}", p=0.3) for i in range(15)]
    lot += [cellule(actif=a, signature=a, p=0.3) for a in ("SOL", "AVAX", "ARB")]
    fams = familles.construire(lot)
    assert len(fams) == 5, "deux familles de reglages + trois cellules seules"

    # Le seuil au rang 1 passe de alpha/33 a alpha/5.
    cible = cellule(actif="SOL", signature="SOL", p=0.009)
    autres = [x for x in lot if x["signature"] != "SOL"]
    assert denominateur(soumettre(cible, voisines=autres)).etat == REUSSIE


# ─────────────────────────── l'identite quand la cellule n'est pas lisible

def test_des_tickets_sans_signature_ne_fusionnent_pas():
    """Meme piege que les lignes anonymes, par un autre champ.

    Un ticket de bibliotheque porte `cle`, pas `signature`. Se reposer sur le
    seul `signature` rendait None pour tous, et tous tombaient dans la meme
    famille — la fusion que ce module existe pour empecher.
    """
    tickets = [{"cle": f"tk{i}", "p": 0.2} for i in range(50)]
    assert len(familles.construire(tickets)) == 50


def test_une_ligne_sans_aucun_champ_d_identite_est_hachee():
    """A defaut de signature et de cle, le contenu fait l'identite.

    Deux lignes differentes restent deux hypotheses ; deux lignes identiques
    n'en font qu'une, ce qui est la bonne lecture — c'est le meme essai.
    """
    a, b = {"p": 0.1, "net_usd": 1.0}, {"p": 0.1, "net_usd": 2.0}
    assert familles.cle(a) != familles.cle(b)
    assert len(familles.construire([a, b])) == 2
    assert len(familles.construire([a, dict(a)])) == 1


def test_l_identite_de_repli_est_stable_entre_deux_lectures():
    """Une cle qui bougerait d'une execution a l'autre rendrait le
    denominateur non reproductible."""
    ligne = {"p": 0.1, "net_usd": 1.0, "trades": 42}
    assert familles.cle(ligne) == familles.cle(dict(ligne))
