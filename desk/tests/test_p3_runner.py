"""Tests de la commande de la porte P3.

Ce que ces tests protegent est moins le code que la **validite de la mesure**.
Une porte qui se franchit trop facilement est pire qu'aucune porte : elle
autorise le passage au P4 sur une preuve qui n'en est pas une.
"""

from __future__ import annotations

import json
from decimal import Decimal

import pytest

from trading_desk.agents.__main__ import WINDOW_BARS, _windows, main
from trading_desk.backtest.data import DataUnavailable
from trading_desk.features import synthetic_bars

BARS = synthetic_bars(count=1200, seed=3)


# --------------------------------------------------------------------------
#  Les fenetres : ce qui rend la mesure credible
# --------------------------------------------------------------------------

def test_les_fenetres_couvrent_des_moments_de_marche_differents():
    """Trente cycles sur la meme fenetre ne mesureraient que la variance du
    modele a prompt constant. On veut sa tenue face a des marches differents,
    ce qui suppose que les fenetres se ressemblent peu."""
    fenetres = _windows(BARS, 30)
    assert len(fenetres) == 30
    assert all(len(f) == WINDOW_BARS for f in fenetres)

    debuts = [f[0].ts_ms for f in fenetres]
    assert len(set(debuts)) == 30, "aucune fenetre ne doit en repeter une autre"

    # Et elles sont reparties, pas empilees au debut de l'historique.
    etendue = debuts[-1] - debuts[0]
    total = BARS[-1].ts_ms - BARS[0].ts_ms
    assert etendue > total * 0.6, "les fenetres doivent balayer la periode"


def test_un_historique_trop_court_est_refuse_plutot_que_rogne():
    """Rogner la fenetre ferait tourner les agents sur des indicateurs encore
    en rechauffement : on mesurerait le rechauffement, pas le desk."""
    with pytest.raises(DataUnavailable):
        _windows(synthetic_bars(count=100), 30)


def test_les_fenetres_ne_lisent_pas_au_dela_de_l_historique():
    fenetres = _windows(BARS, 30)
    assert fenetres[-1][-1].ts_ms <= BARS[-1].ts_ms


# --------------------------------------------------------------------------
#  La commande
# --------------------------------------------------------------------------

def _lance(monkeypatch, *argv: str) -> int:
    import sys
    monkeypatch.setattr(sys, "argv", ["trading_desk.agents", *argv])
    return main()


def test_dry_run_tourne_sans_cle_et_sans_depense(monkeypatch, capsys):
    """Le mode qui permet de verifier le cablage avant de payer quoi que ce
    soit. Meme chemin de code, modele scripte."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert _lance(monkeypatch, "--dry-run", "--runs", "30") == 0
    sortie = capsys.readouterr().out
    assert "0.0000 $" in sortie
    assert "PORTE P3" in sortie


def test_sans_cle_la_commande_refuse_au_lieu_d_echouer_plus_tard(
        monkeypatch, capsys):
    """Echouer a l'appel numero un apres avoir charge les donnees serait un
    message d'erreur obscur ; refuser d'emblee dit quoi faire.

    Les variables sont retirees par la fixture `_aucune_cle_reelle`, qui les
    lit dans `API_KEY_VARS` : ce test ne peut donc pas partir appeler l'API
    parce qu'une variable a ete ajoutee au desk sans etre ajoutee ici.
    """
    assert _lance(monkeypatch, "--runs", "30") == 2
    err = capsys.readouterr().err
    assert "Aucune clé Anthropic" in err
    assert "--dry-run" in err


def test_les_barres_synthetiques_sont_signalees(monkeypatch, capsys):
    """Sans ce rappel, un chiffre obtenu sur du bruit finit par etre cite
    comme un resultat."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    _lance(monkeypatch, "--dry-run", "--runs", "30")
    assert "ATTENTION" in capsys.readouterr().out


def test_la_porte_se_juge_agent_par_agent(monkeypatch, capsys, tmp_path):
    """Une moyenne globale masque l'agent qui echoue — et c'est precisement
    celui qui doit bloquer le passage au P4."""
    from trading_desk.agents import metrics as m

    reel = m.summarize

    def faible(runs):
        out = reel(runs)
        if out.agent == "avocat_du_diable":
            return out.model_copy(update={"valid": 0})
        return out

    monkeypatch.setattr(m, "summarize", faible)
    monkeypatch.setattr("trading_desk.agents.__main__.summarize", faible)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    code = _lance(monkeypatch, "--dry-run", "--runs", "30")
    sortie = capsys.readouterr().out
    assert code == 1, "un agent en echec doit faire echouer la commande"
    assert "NON FRANCHIE" in sortie
    assert "avocat_du_diable" in sortie


def test_le_fichier_de_bougies_reelles_est_accepte(monkeypatch, capsys, tmp_path):
    chemin = tmp_path / "bougies.json"
    chemin.write_text(json.dumps([
        {"t": b.ts_ms, "T": b.ts_ms + 3_599_999, "s": "BTC", "i": "1h",
         "o": str(b.open), "h": str(b.high), "l": str(b.low),
         "c": str(b.close), "v": "1", "n": 1}
        for b in BARS
    ]), encoding="utf-8")

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert _lance(monkeypatch, "--dry-run", "--runs", "30",
                  "--file", str(chemin)) == 0
    sortie = capsys.readouterr().out
    assert "ATTENTION" not in sortie, "des donnees reelles ne portent pas l'avertissement"


def test_le_plafond_par_defaut_est_reel_et_borne():
    """Un oubli de `--budget-usd` ne doit pas signifier depense illimitee.

    Le test lit le parser de la commande, pas un parser reconstruit pour
    l'occasion — sinon il verifierait argparse et non ce projet.
    """
    from trading_desk.agents.__main__ import build_parser

    defauts = build_parser().parse_args([])
    assert defauts.budget_usd > 0
    assert defauts.budget_usd <= 10, "un plafond par defaut doit rester modeste"
    assert defauts.runs >= 30, "la porte P3 exige au moins 30 executions"
    assert defauts.dry_run is False, "le mode reel reste le mode par defaut"


def test_le_plafond_de_la_ligne_de_commande_atteint_le_client(monkeypatch, capsys):
    """Verification de bout en bout : `--budget-usd` doit reellement borner le
    client, et pas seulement etre lu par le parser."""
    from trading_desk.agents.budget import BudgetedLLM

    vus: list[Decimal] = []
    vrai = BudgetedLLM.__init__

    def espion(self, inner, *, max_usd):
        vus.append(max_usd)
        vrai(self, inner, max_usd=max_usd)

    monkeypatch.setattr(BudgetedLLM, "__init__", espion)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    _lance(monkeypatch, "--dry-run", "--runs", "30", "--budget-usd", "0.37")
    assert vus == [Decimal("0.37")]


# --------------------------------------------------------------------------
#  Resolution de la cle
# --------------------------------------------------------------------------

def test_la_variable_du_projet_prime_sur_celle_du_sdk(monkeypatch):
    """`ANTHROPIC_API_KEY` est un nom reserve sur certaines plateformes : elle
    peut y etre ignoree, filtree, ou porter une identite qui n'est pas celle
    qu'on veut facturer. Un nom propre au projet leve l'ambiguite."""
    from trading_desk.agents.llm import api_key_source, desk_api_key

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-sdk")
    monkeypatch.setenv("DESK_ANTHROPIC_API_KEY", "sk-desk")
    assert desk_api_key() == "sk-desk"
    assert api_key_source() == "DESK_ANTHROPIC_API_KEY"

    monkeypatch.delenv("DESK_ANTHROPIC_API_KEY")
    assert desk_api_key() == "sk-sdk", "le repli reste, pour une machine locale"
    assert api_key_source() == "ANTHROPIC_API_KEY"


def test_une_variable_vide_ou_blanche_ne_compte_pas(monkeypatch):
    """Une variable posee a vide est le cas le plus perfide : elle existe,
    donc un test de presence passe, et l'appel echoue plus loin avec un
    message de transport incomprehensible."""
    from trading_desk.agents.llm import desk_api_key

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("DESK_ANTHROPIC_API_KEY", "   ")
    assert desk_api_key() is None


def test_la_source_ne_revele_jamais_la_cle(monkeypatch):
    """Le diagnostic renvoie le NOM de la variable, pas sa valeur — meme
    tronquee. Une valeur tronquee finit dans un journal ou une capture."""
    from trading_desk.agents.llm import api_key_source

    monkeypatch.setenv("DESK_ANTHROPIC_API_KEY", "sk-ant-api03-SECRET")
    assert "SECRET" not in api_key_source()
    assert api_key_source() == "DESK_ANTHROPIC_API_KEY"


def test_le_point_d_entree_n_est_pas_herite_silencieusement(monkeypatch):
    """`ANTHROPIC_BASE_URL` est souvent pose par l'outil qui execute le code
    et peut pointer vers un relais qui lui appartient. Herite, il enverrait la
    cle du desk a ce relais."""
    import anthropic

    from trading_desk.agents.llm import OFFICIAL_BASE_URL, AnthropicLLM

    monkeypatch.setenv("ANTHROPIC_BASE_URL", "https://relais-tiers.example")
    monkeypatch.setenv("DESK_ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.delenv("DESK_ANTHROPIC_BASE_URL", raising=False)

    client = AnthropicLLM()._lazy_client()
    assert str(client.base_url).rstrip("/") == OFFICIAL_BASE_URL
    assert "relais-tiers" not in str(client.base_url)


def test_le_point_d_entree_reste_surchargeable_par_le_projet(monkeypatch):
    """Un utilisateur sur Bedrock ou derriere son propre relais doit pouvoir
    le dire — mais explicitement, avec une variable qui lui appartient."""
    from trading_desk.agents.llm import AnthropicLLM

    monkeypatch.setenv("DESK_ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setenv("DESK_ANTHROPIC_BASE_URL", "https://mon-relais.example")
    client = AnthropicLLM()._lazy_client()
    assert "mon-relais" in str(client.base_url)


def test_le_message_d_erreur_nomme_les_deux_variables(monkeypatch, capsys, tmp_path):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("DESK_ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.setattr("pathlib.Path.home", lambda: tmp_path)

    assert _lance(monkeypatch, "--runs", "30") == 2
    err = capsys.readouterr().err
    assert "DESK_ANTHROPIC_API_KEY" in err
    assert "ANTHROPIC_API_KEY" in err
    assert "nom réservé" in err


def test_un_agent_conditionnel_ne_fait_pas_echouer_la_porte(monkeypatch, capsys):
    """Un echantillon court est une mesure a poursuivre, pas un echec.

    Le graphe est conditionnel : l'Avocat du diable n'est appele que s'il
    existe un setup a attaquer. Trente cycles ne font donc pas trente appels
    pour lui, et le code de sortie ne doit pas dire « echec » pour ca — sinon
    une CI refuse une porte dont la qualite est atteinte partout.
    """
    from trading_desk.agents import metrics as m

    reel = m.summarize

    def conditionnel(runs):
        out = reel(runs)
        if out.agent == "avocat_du_diable":
            return out.model_copy(update={"runs": 15, "valid": 15})
        return out

    monkeypatch.setattr(m, "summarize", conditionnel)
    monkeypatch.setattr("trading_desk.agents.__main__.summarize", conditionnel)

    code = _lance(monkeypatch, "--dry-run", "--runs", "30")
    sortie = capsys.readouterr().out

    assert "INDETERMINEE" in sortie
    assert "avocat_du_diable" in sortie
    assert "il manque des appels, pas de la fiabilite" in sortie
    assert code == 0, "un echantillon court ne doit pas valoir un code d'erreur"


def test_une_qualite_insuffisante_fait_bien_echouer(monkeypatch, capsys):
    """L'inverse : un agent qui ne respecte pas son schema bloque le P4, et
    le code de sortie doit le dire."""
    from trading_desk.agents import metrics as m

    reel = m.summarize

    def faible(runs):
        out = reel(runs)
        if out.agent == "avocat_du_diable":
            return out.model_copy(update={"valid": 0})
        return out

    monkeypatch.setattr(m, "summarize", faible)
    monkeypatch.setattr("trading_desk.agents.__main__.summarize", faible)

    code = _lance(monkeypatch, "--dry-run", "--runs", "30")
    sortie = capsys.readouterr().out

    assert "NON FRANCHIE" in sortie and "qualite" in sortie
    assert code == 1


def test_le_cout_d_un_cycle_est_annonce(monkeypatch, capsys):
    """Le chiffre qui tranchera le P5 est le cout d'un CYCLE : additionner les
    extrapolations par agent surestime ceux qui ne tournent pas a chaque tour."""
    _lance(monkeypatch, "--dry-run", "--runs", "30")
    sortie = capsys.readouterr().out
    assert "Cout d'un cycle complet" in sortie
    assert "$/mois a 12 decisions/h" in sortie
