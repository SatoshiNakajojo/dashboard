"""Les règles d'un agent externe, figées pour un test hors échantillon.

La mesure en échantillon les a **toutes refusées** — neuf cellules sur neuf,
et toutes les cellules positives meurent sur le retrait d'un seul mois. Ce
module de test protège la seule chose qui reste utile : que le test hors
échantillon, lui, soit honnête.

Trois verrous, et le troisième est celui qu'on oublie :

1. l'empreinte, sans quoi « ajuster légèrement un paramètre » transformerait
   rétroactivement un échec en succès ;
2. le dénominateur séparé, sans quoi six règles venues d'un agent externe et
   deux règles du dépôt se corrigeraient ensemble — faux dans les deux sens ;
3. **le nom du pilote**, sans quoi deux sources homonymes partageraient une
   entrée du registre des parts et la sortie de l'une fermerait la part de
   l'autre. Le défaut que `execution/parts.py` existe pour corriger,
   réintroduit par la porte de derrière.
"""

from __future__ import annotations

import pytest

from trading_desk.sentinelle import regles_figees, regles_llm
from trading_desk.sentinelle.pilote_regles import PiloteRegles


def test_l_empreinte_est_verrouillee():
    assert regles_llm.VERSION == 1
    assert regles_llm.FIGE_LE == "2026-09-16"
    assert regles_llm.empreinte_du_registre() == "9be087b8ab7c3f3c"


def test_changer_un_parametre_change_l_empreinte():
    """« Ajuster légèrement un seuil » suffirait sinon à transformer
    rétroactivement un échec en succès."""
    avant = regles_llm.empreinte_du_registre()
    r = regles_llm.REGLES[0]
    original = dict(r.parametres)
    try:
        object.__setattr__(r, "parametres", {**original, "mult": 3.1})
        assert regles_llm.empreinte_du_registre() != avant
    finally:
        object.__setattr__(r, "parametres", original)
    assert regles_llm.empreinte_du_registre() == avant


def test_le_denominateur_est_SEPARE_de_celui_du_depot():
    """Six règles d'un agent externe et deux règles du dépôt ne sont pas le
    même espace d'hypothèses. Les corriger ensemble punirait les deux et
    absoudrait les six."""
    assert regles_llm.DENOMINATEUR == 6
    assert regles_figees.DENOMINATEUR == 2
    cles_llm = {r.cle for r in regles_llm.REGLES}
    cles_depot = {r.cle for r in regles_figees.REGLES}
    assert not (cles_llm & cles_depot), "aucune clé partagée entre les deux"


def test_la_liste_est_celle_que_l_AGENT_a_designee():
    """**Pas la mienne, et c'est le point.**

    Le rapport porte une ligne « Paper » par stratégie : ON pour supertrend et
    donchian, « pas en paper pour l'instant » pour momentum_residuel. La
    troisième est donc absente — alors qu'elle est la seule dont une cellule
    ait battu le hasard (SOL, p = 0,0130).

    La retenir maintenant serait une sélection faite APRÈS avoir vu le
    résultat, c'est-à-dire exactement ce que ce module existe pour éviter.
    """
    strategies = {r.strategie for r in regles_llm.REGLES}
    assert strategies == {"supertrend", "donchian_ema_be"}
    assert "momentum_residuel" not in strategies


def test_chaque_regle_porte_l_annonce_ET_la_mesure():
    """La comparaison hors échantillon doit se faire contre la promesse
    écrite, pas contre un souvenir."""
    for r in regles_llm.REGLES:
        assert r.annonce and r.mesure
        assert "PF" in r.annonce and "PF" in r.mesure


def test_aucune_regle_ne_depasse_le_plafond_de_refus():
    """Au-delà, la règle qui tourne n'est plus celle qui a été mesurée. Le
    plafond est celui des règles du dépôt — il n'y a pas de raison qu'il soit
    plus doux pour une origine externe."""
    for r in regles_llm.REGLES:
        assert r.refus_mesure <= regles_figees.REFUS_MAXIMUM, r.cle


def test_les_trois_actifs_du_rapport_sont_couverts():
    for strategie in ("supertrend", "donchian_ema_be"):
        actifs = {r.actif for r in regles_llm.REGLES if r.strategie == strategie}
        assert actifs == {"BTC", "ETH", "SOL"}


# ──────────────────────────────── le nom du pilote, et la collision évitée

def test_deux_pilotes_de_regles_ne_portent_PAS_le_meme_nom():
    """Le registre des parts indexe sur (source, actif).

    Deux pilotes homonymes partageraient une entrée, et la sortie de l'un
    fermerait la part de l'autre — exactement le défaut corrigé par
    `execution/parts.py`, réintroduit par un nom de classe partagé.
    """
    depot = PiloteRegles("data/journal_regles.jsonl")
    externe = PiloteRegles("data/journal_regles_llm.jsonl", nom="regles_llm")
    assert depot.nom != externe.nom
    assert depot.nom == "regles_figees" and externe.nom == "regles_llm"


def test_le_nom_par_defaut_reste_celui_du_depot():
    """Les appels existants ne doivent pas changer de comportement."""
    assert PiloteRegles("x.jsonl").nom == "regles_figees"


def test_les_deux_familles_ecrivent_dans_des_journaux_DIFFERENTS():
    """Un journal partagé rendrait impossible de dire, dans six mois, sous
    quel dénominateur une ligne a été inscrite."""
    from trading_desk.config import Settings
    s = Settings()
    assert s.regles_journal != s.regles_llm_journal
