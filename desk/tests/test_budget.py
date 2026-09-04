"""Tests du plafond de depense.

Ce module est le seul du projet dont une defaillance se paie directement en
dollars. Les tests portent donc moins sur son bon fonctionnement que sur ses
modes de contournement : ce qui compte n'est pas qu'il compte juste, c'est
qu'aucun chemin de code ne puisse depenser sans passer par lui.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.agents import ScriptedLLM
from trading_desk.agents.budget import BudgetedLLM, BudgetExceeded
from trading_desk.agents.llm import LLMError, LLMResponse
from trading_desk.agents.runner import run_agent
from trading_desk.contracts.signals import RegimeRead


class CostlyLLM:
    """Modele fictif qui facture un montant fixe par appel.

    Le cout est derive des tokens de sortie, comme en vrai : coder un
    `cost_usd` arbitraire testerait un chemin qui n'existe pas dans le code
    de production.
    """

    def __init__(self, *, per_call_usd: str = "0.10",
                 model: str = "claude-opus-5", script: list | None = None):
        self.output_tokens = int(Decimal(per_call_usd) * 1_000_000 / 25)
        self.model = model
        self.calls = 0
        self._script = ScriptedLLM(list(script) * 40) if script else None

    def structured(self, *, system, user, schema, max_tokens=4000):
        self.calls += 1
        if self._script is not None:
            output, _ = self._script.structured(
                system=system, user=user, schema=schema, max_tokens=max_tokens)
        else:
            output = schema(regime="RANGE", confidence=Decimal("0.5"))
        return output, LLMResponse(
            model=self.model, input_tokens=0, output_tokens=self.output_tokens,
        )


CYCLE_SCRIPT = [
    {"regime": "RANGE", "confidence": "0.6"},
    {"inputs_digest": "x", "momentum": "0.1"},
    {"asset": "BTC", "bias": "LONG", "thesis_summary": "Support tenu."},
    {"asset": "BTC", "side": "LONG", "entry_price": "64000",
     "stop_price": "63000", "target_price": "66500", "conviction": "0.75"},
    {"targets_setup": "BTC", "severity": "0.2", "veto": False},
    {"size_factor": "0.9"},
    {"decision": "APPROVE", "reasoning": "ok", "size_factor": "1"},
]


def _budgete(max_usd: str, **kw) -> tuple[BudgetedLLM, CostlyLLM]:
    inner = CostlyLLM(**kw)
    return BudgetedLLM(inner, max_usd=Decimal(max_usd)), inner


def _appel(llm) -> None:
    llm.structured(system="s", user="u", schema=RegimeRead)


# --------------------------------------------------------------------------
#  Le plafond arrete reellement les appels
# --------------------------------------------------------------------------

def test_au_dela_du_plafond_plus_aucun_appel_ne_part(): 
    """La propriete qui compte : le refus coupe l'acces au modele, il ne se
    contente pas de signaler un depassement."""
    llm, inner = _budgete("0.25")           # 0,10 $ par appel
    for _ in range(3):
        _appel(llm)
    assert inner.calls == 3
    assert llm.spent_usd == Decimal("0.30")

    with pytest.raises(BudgetExceeded):
        _appel(llm)
    assert inner.calls == 3, "aucun appel n'a atteint le modele"


def test_le_depassement_ne_peut_exceder_un_appel():
    """Le cout se connait apres coup : le plafond est donc franchi d'au plus
    un appel. C'est la garantie honnete — pretendre l'appliquer a l'avance
    demanderait une estimation qui serait fausse."""
    llm, _ = _budgete("1.00", per_call_usd="0.40")
    for _ in range(3):
        _appel(llm)
    assert llm.spent_usd == Decimal("1.20")
    assert llm.spent_usd <= Decimal("1.00") + Decimal("0.40")
    with pytest.raises(BudgetExceeded):
        _appel(llm)


def test_un_plafond_nul_est_refuse_a_la_construction():
    """Un plafond a zero autoriserait le premier appel avant de se declencher,
    ce qui n'est ni ce qu'on demande ni ce qu'on croit avoir demande."""
    with pytest.raises(ValueError):
        BudgetedLLM(ScriptedLLM([]), max_usd=Decimal("0"))
    with pytest.raises(ValueError):
        BudgetedLLM(ScriptedLLM([]), max_usd=Decimal("-1"))


def test_le_reste_disponible_ne_devient_jamais_negatif():
    llm, _ = _budgete("0.25")
    for _ in range(3):
        _appel(llm)
    assert llm.remaining_usd == Decimal("0")
    assert llm.exhausted


# --------------------------------------------------------------------------
#  Ce qui pourrait le rendre inoperant
# --------------------------------------------------------------------------

def test_un_modele_hors_grille_est_signale_et_non_compte_comme_gratuit():
    """Le mode de contournement silencieux : un identifiant de modele inconnu
    coute zero selon la grille, donc un plafond ne se declencherait jamais.
    On ne peut pas le facturer — on peut refuser de faire semblant."""
    llm, _ = _budgete("0.25", model="modele-inconnu-2027")
    for _ in range(10):
        _appel(llm)
    assert llm.spent_usd == Decimal("0")
    assert not llm.exhausted, "aucun cout connu : le plafond ne peut pas jouer"
    assert llm.unpriced_calls == 10, "mais cela doit se voir dans le rapport"


def test_le_depassement_est_une_LLMError_donc_l_agent_s_abstient():
    """Un depassement ne doit pas remonter jusqu'a l'arret du processus au
    milieu d'un cycle : il se comporte comme n'importe quel echec d'appel, et
    l'agent s'abstient proprement."""
    assert issubclass(BudgetExceeded, LLMError)

    llm, _ = _budgete("0.05")               # epuise des le premier appel
    _appel(llm)
    run = run_agent(name="regime", llm=llm, system="s", user="u",
                    schema=RegimeRead)
    assert not run.succeeded
    assert run.abstained
    assert any("plafond" in e for e in run.errors)


def test_le_graphe_entier_depense_a_travers_l_enveloppe():
    """La verification qui compte : le graphe recoit `BudgetedLLM` comme un
    client ordinaire et n'a aucun chemin pour atteindre celui qu'il enveloppe.

    On le prouve en faisant tourner un cycle complet : chaque appel doit
    apparaitre au compteur, et un plafond serre doit l'arreter en cours de
    route au lieu de le laisser aller au bout.
    """
    from trading_desk.agents import run_desk_cycle
    from trading_desk.features import synthetic_bars

    bars = synthetic_bars(count=400, seed=5)

    llm, inner = _budgete("100.00", script=CYCLE_SCRIPT)
    res = run_desk_cycle(llm=llm, bars=bars)
    assert llm.calls == inner.calls >= 7, "tous les appels passent par l'enveloppe"
    assert llm.spent_usd == Decimal("0.10") * llm.calls
    assert res.is_directional, "le cycle complet doit aboutir sans plafond"

    # Plafond serre : le cycle s'arrete en chemin, sans exception non rattrapee,
    # et le mandat reste FLAT — l'action par defaut quand on ne sait pas.
    serre, inner2 = _budgete("0.25", script=CYCLE_SCRIPT)
    res2 = run_desk_cycle(llm=serre, bars=bars)
    assert inner2.calls <= 3, "le modele n'est plus appele apres le plafond"
    assert not res2.is_directional
    assert any(not r.succeeded for r in res2.runs)


def test_le_compteur_suit_les_couts_reels_pas_une_estimation():
    """Le plafond s'appuie sur les tokens factures renvoyes par l'API, pas sur
    un cout suppose a l'avance."""
    llm, _ = _budgete("10.00", per_call_usd="0.075")
    for _ in range(4):
        _appel(llm)
    assert llm.spent_usd == Decimal("0.30")
    assert llm.calls == 4
