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
        monkeypatch, capsys, tmp_path):
    """Echouer a l'appel numero un apres avoir charge les donnees serait un
    message d'erreur obscur ; refuser d'emblee dit quoi faire."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.setattr("pathlib.Path.home", lambda: tmp_path)

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
