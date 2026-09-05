"""Le routage par role : un modele different selon qui appelle.

Ce qui est verifie ici n'est pas « le routage marche » mais les trois facons
dont il peut echouer SILENCIEUSEMENT, et qui coutent de l'argent :

1. un agent oublie dans la table tombe sur un modele arbitraire ;
2. l'identifiant renvoye par l'API ne correspond pas a la grille tarifaire,
   le cout compte pour zero, et le plafond de depense cesse d'exister ;
3. le nom d'agent ne traverse pas les enveloppes (budget, runner) et tout
   part sur le modele du Chef sans que rien ne le signale.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.agents.budget import BudgetedLLM
from trading_desk.agents.llm import (
    PRICING_USD_PER_MTOK, LLMResponse, RoutedLLM, ScriptedLLM, tarif_de,
)
from trading_desk.agents.roster import DIVERSIFIE, ECONOMIQUE, POLITIQUES, ModelPolicy
from trading_desk.contracts.signals import QuantRead, RegimeRead

# --- les agents reellement cables, lus a la source ------------------------
#
# En dur, cette liste se perimerait au premier agent ajoute. On la derive des
# appels a `run_agent`, pour que l'ajout d'un huitieme role fasse echouer le
# test au lieu de le laisser passer sur une liste obsolete.
import pathlib
import re

_SRC = pathlib.Path(__file__).resolve().parents[1] / "src" / "trading_desk" / "agents"
AGENTS_CABLES = sorted({
    m.group(1)
    for f in _SRC.glob("*.py")
    for m in re.finditer(r'run_agent\(\s*\n?\s*name="([a-z_]+)"', f.read_text())
})


def test_la_liste_des_agents_nest_pas_vide():
    """Garde-fou du test suivant : une regex cassee le rendrait vacant."""
    assert len(AGENTS_CABLES) >= 8, AGENTS_CABLES


@pytest.mark.parametrize("nom", sorted(POLITIQUES))
def test_chaque_agent_cable_est_connu_de_chaque_politique(nom):
    """Aucun agent ne doit tomber dans le repli.

    Le repli sur le Chef existe pour les erreurs de cablage, pas pour les
    agents qu'on a simplement oublie d'inscrire : sur `ECONOMIQUE`, un oubli
    ferait payer le prix fort un role qu'on croyait avoir rendu bon marche.
    """
    routeur = RoutedLLM(POLITIQUES[nom])
    manquants = [a for a in AGENTS_CABLES if a not in routeur._par_agent]
    assert not manquants, f"agents absents de la table de routage : {manquants}"


def test_un_agent_inconnu_retombe_sur_le_modele_du_chef():
    politique = ModelPolicy(chef="claude-opus-5", quant="claude-haiku-4-5")
    routeur = RoutedLLM(politique)
    assert routeur.modele_de("agent_qui_nexiste_pas") == "claude-opus-5"
    assert routeur.modele_de("") == "claude-opus-5"


def test_economique_ne_touche_quaux_roles_de_lecture():
    """Les roles qui TRANCHENT restent sur le modele principal.

    Si cette assertion tombe, ce n'est pas un detail de configuration : la
    decision finale du desk aurait change de modele sans que le nom de la
    politique le dise.
    """
    r = RoutedLLM(ECONOMIQUE)
    for lecteur in ("news", "quant", "regime", "post_mortem"):
        assert r.modele_de(lecteur) == "claude-haiku-4-5"
    for decideur in ("analyste", "strategie", "avocat_du_diable",
                     "risk_advisor", "chef_de_desk"):
        assert r.modele_de(decideur) == "claude-opus-5"


def test_diversifie_donne_a_lavocat_un_modele_different_de_la_strategie():
    """La raison d'etre de cette politique, pas un effet de bord.

    L'Avocat attaque la proposition de la Strategie. Sur le meme modele, on
    lui demande de trouver ses propres angles morts.
    """
    r = RoutedLLM(DIVERSIFIE)
    assert r.modele_de("avocat_du_diable") != r.modele_de("strategie")


# --- le piege tarifaire ---------------------------------------------------

def test_un_identifiant_date_reste_tarife():
    """L'API renvoie l'identifiant RESOLU, pas celui qu'on a demande.

    `claude-haiku-4-5` revient en `claude-haiku-4-5-20251001`. Une egalite
    stricte manquerait la grille, le cout serait compte a zero, et le plafond
    de depense laisserait passer un nombre illimite d'appels.
    """
    date = LLMResponse(model="claude-haiku-4-5-20251001",
                       input_tokens=1_000_000, output_tokens=1_000_000)
    assert date.pricing_known
    assert date.cost_usd == Decimal("6")  # 1 $ entree + 5 $ sortie


def test_le_prefixe_le_plus_long_gagne():
    """Une future ligne plus specifique ne doit pas etre avalee par la courte."""
    PRICING_USD_PER_MTOK["claude-opus-5-turbo"] = (Decimal("9"), Decimal("9"))
    try:
        assert tarif_de("claude-opus-5-turbo-20260101") == (Decimal("9"), Decimal("9"))
        assert tarif_de("claude-opus-5-20260101") == (Decimal("5"), Decimal("25"))
    finally:
        del PRICING_USD_PER_MTOK["claude-opus-5-turbo"]


def test_un_modele_hors_grille_reste_signale():
    """La correspondance par prefixe ne doit pas rendre tout « connu »."""
    inconnu = LLMResponse(model="gpt-quelque-chose", input_tokens=1000)
    assert not inconnu.pricing_known
    assert inconnu.cost_usd == Decimal("0")


# --- la traversee du nom d'agent -----------------------------------------

def test_le_nom_dagent_traverse_le_plafond_de_depense():
    """`BudgetedLLM` s'interpose ; s'il avale `agent`, tout va chez le Chef."""
    inner = ScriptedLLM([{"regime": "TREND_UP", "confidence": "0.7"}])
    plafonne = BudgetedLLM(inner, max_usd=Decimal("1"))
    plafonne.structured(system="s", user="u", schema=RegimeRead, agent="regime")
    assert inner.calls[0]["agent"] == "regime"


def test_le_runner_annonce_le_nom_de_lagent():
    """Le maillon le plus facile a oublier, et le plus silencieux."""
    from trading_desk.agents.runner import run_agent

    inner = ScriptedLLM([{"regime": "TREND_UP", "confidence": "0.7"}])
    run_agent(name="regime", llm=inner, system="s", user="u", schema=RegimeRead)
    assert inner.calls[0]["agent"] == "regime"


def test_le_routeur_choisit_bien_un_client_par_modele():
    """Deux agents sur le meme modele partagent le client, donc son cache."""
    construits: list[str] = []

    def fabrique(modele: str):
        construits.append(modele)
        return ScriptedLLM([{"regime": "RANGE", "confidence": "0.5"}] * 5,
                           model=modele)

    r = RoutedLLM(ECONOMIQUE, factory=fabrique)
    for agent in ("quant", "regime", "news"):  # tous trois sur Haiku
        r.structured(system="s", user="u", schema=RegimeRead, agent=agent)
    assert construits == ["claude-haiku-4-5"]

    r.structured(system="s", user="u", schema=RegimeRead, agent="chef_de_desk")
    assert construits == ["claude-haiku-4-5", "claude-opus-5"]


# --- hygiene des prompts aval --------------------------------------------

def test_lavis_transmis_ne_porte_pas_lenveloppe_du_runner():
    """Ce qu'un agent lit d'un autre : son avis, pas sa facture.

    Le runner ecrit `cost_usd`, `latency_ms`, `model_id` APRES l'appel. Les
    remettre dans le prompt du suivant, c'est lui offrir « cet avis a coute
    cher, donc il compte » comme raccourci disponible.
    """
    from trading_desk.agents.roster import _avis
    from trading_desk.agents.runner import ENVELOPPE

    q = QuantRead(liquidity_note="carnet normal", latency_ms=20200,
                  cost_usd=Decimal("0.0316"), model_id="claude-opus-5",
                  journal_ref="jr-1")
    avis = _avis(q)
    for champ in ENVELOPPE:
        assert champ not in avis, f"{champ} ne doit pas partir dans le prompt aval"
    assert avis["liquidity_note"] == "carnet normal"


def test_labstention_survit_au_nettoyage():
    """Un aval DOIT savoir qu'un amont s'est abstenu, et pourquoi.

    C'est la limite du nettoyage : `abstained` et `abstain_reason` sont
    l'avis lui-meme, pas de la metadonnee d'appel.
    """
    from trading_desk.agents.roster import _avis

    q = QuantRead(abstained=True, abstain_reason="indicateurs incoherents",
                  cost_usd=Decimal("0.03"))
    avis = _avis(q)
    assert avis["abstained"] is True
    assert avis["abstain_reason"] == "indicateurs incoherents"
    assert "cost_usd" not in avis
