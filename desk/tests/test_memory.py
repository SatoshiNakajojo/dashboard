"""Tests de la boucle d'apprentissage : post-mortem et mémoire.

Deux propriétés à protéger :

1. **La mémoire est lue.** Une mémoire qu'on écrit sans jamais la relire est
   du théâtre — les tests vérifient que les leçons arrivent réellement dans le
   prompt de l'agent qui propose.
2. **Elle ne se dilue pas.** Une leçon vide, une abstention, ou une expérience
   qu'on n'a pas vécue ne doivent pas prendre la place d'une leçon utile au
   moment du rappel.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.agents import (
    Lesson, ScriptedLLM, SqliteLessonStore, cause_histogram, format_for_prompt,
    learn_from_trade, lesson_from, run_desk_cycle, run_postmortem,
)
from trading_desk.contracts import PostMortem, Regime, Side
from trading_desk.features import synthetic_bars
from trading_desk.storage import SqliteStore

BARS = synthetic_bars(count=150, seed=13)


def _pm(**o) -> dict:
    return {"primary_cause": "STOP_TROP_SERRE",
            "what_happened": "Sorti au plus bas, puis rebond de 3 %.",
            "lesson": "Sur BTC en range, un stop sous 1,5 ATR se fait balayer.",
            "would_take_again": True, "tags": ["stop", "range"], **o}


def _trade(**o) -> dict:
    return {"asset": "BTC", "side": "LONG", "entree": 64000, "sortie_prix": 63000,
            "sortie": "stop", "pnl_r": -1.0, "duree_h": 6, **o}


def _lesson(**o) -> Lesson:
    base = dict(lesson_id="l1", asset="BTC", regime=Regime.RANGE, side=Side.LONG,
                outcome="stop", pnl_r=Decimal("-1"),
                lesson="Stop trop serré sur support.", tags=("stop",))
    base.update(o)
    return Lesson(**base)


# --------------------------------------------------------------------------
#  Post-mortem
# --------------------------------------------------------------------------

def test_le_post_mortem_produit_une_lecon():
    run = run_postmortem(llm=ScriptedLLM([_pm()]), trade=_trade())
    assert run.succeeded
    assert run.output.primary_cause == "STOP_TROP_SERRE"
    assert "ATR" in run.output.lesson


def test_la_cause_vient_d_un_ensemble_ferme():
    """Des causes en texte libre ne se comptent pas.

    C'est tout l'intérêt du schéma : au bout de trente trades, on sait que
    40 % des sorties sont des stops balayés par le bruit.
    """
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        PostMortem(primary_cause="pas de chance")


def test_l_histogramme_des_causes_ordonne_par_frequence():
    pms = [
        PostMortem(primary_cause="STOP_TROP_SERRE", lesson="a"),
        PostMortem(primary_cause="STOP_TROP_SERRE", lesson="b"),
        PostMortem(primary_cause="COUTS", lesson="c"),
        PostMortem(abstained=True, abstain_reason="données manquantes"),
    ]
    histo = cause_histogram(pms)
    assert list(histo) == ["STOP_TROP_SERRE", "COUTS"]
    assert histo["STOP_TROP_SERRE"] == 2
    assert sum(histo.values()) == 3, "l'abstention ne compte pas"


def test_une_lecon_vide_n_est_pas_memorisee():
    """Écrire des leçons creuses dilue la mémoire : au rappel, elles prennent
    la place de celles qui disent quelque chose."""
    vide = PostMortem(primary_cause="EVENEMENT_EXTERNE", lesson="   ")
    assert lesson_from(vide, asset="BTC", side=Side.LONG) is None

    abstenu = PostMortem(abstained=True, abstain_reason="trade illisible")
    assert lesson_from(abstenu, asset="BTC", side=Side.LONG) is None


def test_la_boucle_complete_ecrit_en_memoire(tmp_path):
    memory = SqliteLessonStore(tmp_path / "m.db")
    store = SqliteStore(tmp_path / "j.db")

    run, lesson = learn_from_trade(
        llm=ScriptedLLM([_pm()]), trade=_trade(), memory=memory,
        asset="BTC", side=Side.LONG, regime=Regime.RANGE,
        pnl_r=Decimal("-1"), store=store,
    )
    assert run.succeeded
    assert lesson is not None
    assert memory.count() == 1
    assert "agent_post_mortem" in [r["kind"] for r in store.recent_journal(5)]
    memory.close()
    store.close()


def test_une_abstention_est_journalisee_sans_polluer_la_memoire(tmp_path):
    memory = SqliteLessonStore(tmp_path / "m.db")
    store = SqliteStore(tmp_path / "j.db")
    from trading_desk.agents import LLMError

    run, lesson = learn_from_trade(
        llm=ScriptedLLM([LLMError("x"), LLMError("x")]), trade=_trade(),
        memory=memory, asset="BTC", side=Side.LONG, store=store,
    )
    assert run.abstained
    assert lesson is None
    assert memory.count() == 0
    assert store.recent_journal(5), "l'abstention part quand même au journal"
    memory.close()
    store.close()


# --------------------------------------------------------------------------
#  Rappel
# --------------------------------------------------------------------------

def test_le_rappel_privilegie_le_contexte_exact(tmp_path):
    """Filtre du plus strict au plus large : même actif, même régime, même sens
    avant tout le reste."""
    memory = SqliteLessonStore(tmp_path / "m.db")
    memory.remember(_lesson(lesson_id="exact", asset="BTC", regime=Regime.RANGE,
                            side=Side.LONG, lesson="exact"))
    memory.remember(_lesson(lesson_id="autre_actif", asset="ETH",
                            regime=Regime.RANGE, side=Side.LONG, lesson="eth"))
    memory.remember(_lesson(lesson_id="autre_regime", asset="BTC",
                            regime=Regime.TREND_UP, side=Side.LONG, lesson="trend"))

    rappel = memory.recall(asset="BTC", regime=Regime.RANGE, side=Side.LONG, limit=1)
    assert [x.lesson_id for x in rappel] == ["exact"]
    memory.close()


def test_le_rappel_s_elargit_quand_il_manque_de_matiere(tmp_path):
    memory = SqliteLessonStore(tmp_path / "m.db")
    memory.remember(_lesson(lesson_id="btc_trend", regime=Regime.TREND_UP))

    # Rien en RANGE : la strate suivante ramène la leçon BTC quand même.
    rappel = memory.recall(asset="BTC", regime=Regime.RANGE, side=Side.LONG, limit=3)
    assert [x.lesson_id for x in rappel] == ["btc_trend"]
    memory.close()


def test_le_recouvrement_lexical_departage(tmp_path):
    memory = SqliteLessonStore(tmp_path / "m.db")
    memory.remember(_lesson(lesson_id="funding",
                            lesson="Le funding a mangé le gain sur un swing long."))
    memory.remember(_lesson(lesson_id="liquidite",
                            lesson="Carnet trop mince au-dessus de la résistance."))

    rappel = memory.recall(asset="BTC", regime=Regime.RANGE, side=Side.LONG,
                           limit=2, context_text="carnet mince résistance")
    assert rappel[0].lesson_id == "liquidite"
    memory.close()


def test_memoire_vide_ne_casse_rien(tmp_path):
    memory = SqliteLessonStore(tmp_path / "m.db")
    assert memory.recall(asset="BTC", regime=Regime.RANGE, side=Side.LONG) == []
    assert format_for_prompt([]) == ""
    memory.close()


# --------------------------------------------------------------------------
#  Présentation à l'agent
# --------------------------------------------------------------------------

def test_les_pertes_sont_marquees():
    """Une mémoire qui présente ses succès et ses échecs sur le même ton
    n'apprend rien à personne."""
    texte = format_for_prompt([
        _lesson(lesson_id="a", pnl_r=Decimal("-1"), lesson="stop balayé"),
        _lesson(lesson_id="b", pnl_r=Decimal("2.5"), lesson="cible atteinte"),
    ])
    assert "PERTE" in texte
    assert "gain" in texte
    assert "-1.00 R" in texte


def test_le_registre_fantome_est_signale_comme_tel():
    """Un setup rejeté puis suivi n'est pas une expérience vécue : ni
    slippage, ni fill partiel, ni la tentation d'en sortir trop tôt."""
    texte = format_for_prompt([_lesson(was_taken=False)])
    assert "registre fantôme" in texte
    assert "non pris" in texte


def test_les_lecons_sont_presentees_comme_des_precedents():
    """Pas comme des règles : un contexte semblable peut appeler une décision
    opposée."""
    texte = format_for_prompt([_lesson()])
    assert "précédents, pas des règles" in texte


# --------------------------------------------------------------------------
#  La mémoire est réellement lue
# --------------------------------------------------------------------------

def _script_cycle() -> ScriptedLLM:
    return ScriptedLLM([
        {"regime": "RANGE", "confidence": "0.7"},
        {"inputs_digest": "abc", "momentum": "0.2"},
        {"asset": "BTC", "bias": "LONG", "thesis_summary": "Support tenu."},
        {"asset": "BTC", "side": "LONG", "entry_price": "64000",
         "stop_price": "63000", "target_price": "66500", "conviction": "0.75"},
        {"targets_setup": "BTC", "severity": "0.2", "veto": False},
        {"size_factor": "0.9"},
        {"decision": "APPROVE", "reasoning": "ok", "size_factor": "1"},
    ])


def test_les_lecons_arrivent_dans_le_prompt_de_la_strategie(tmp_path):
    """La vérification qui compte : sans elle, la mémoire ne serait qu'un
    journal de plus."""
    memory = SqliteLessonStore(tmp_path / "m.db")
    memory.remember(_lesson(lesson="Stop sous 1,5 ATR balayé sur ce support."))

    llm = _script_cycle()
    run_desk_cycle(llm=llm, bars=BARS, memory=memory)

    prompt_strategie = next(c["user"] for c in llm.calls
                            if "Un setup précis" in c["user"])
    assert "Leçons de trades passés" in prompt_strategie
    assert "1,5 ATR" in prompt_strategie
    memory.close()


def test_sans_memoire_le_cycle_fonctionne_a_l_identique():
    """La mémoire est un enrichissement, pas une dépendance."""
    llm = _script_cycle()
    res = run_desk_cycle(llm=llm, bars=BARS, memory=None)
    prompt_strategie = next(c["user"] for c in llm.calls
                            if "Un setup précis" in c["user"])
    assert "Leçons de trades passés" not in prompt_strategie
    assert res.is_directional


def test_le_rappel_suit_le_regime_identifie(tmp_path):
    """Le rappel se fait APRÈS la classification : on veut les leçons du
    régime réellement identifié, pas celles de l'actif en général."""
    memory = SqliteLessonStore(tmp_path / "m.db")
    memory.remember(_lesson(lesson_id="range", regime=Regime.RANGE,
                            lesson="leçon de range"))
    memory.remember(_lesson(lesson_id="trend", regime=Regime.TREND_UP,
                            lesson="leçon de tendance"))

    llm = _script_cycle()          # le régime scripté est RANGE
    run_desk_cycle(llm=llm, bars=BARS, memory=memory)

    prompt = next(c["user"] for c in llm.calls if "Un setup précis" in c["user"])
    assert "leçon de range" in prompt
    memory.close()
