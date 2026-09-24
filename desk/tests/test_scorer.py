"""Le scorer — « est-ce que ça vaut le coup », pas « est-ce que c'est réel ».

La seconde question est celle de `epreuves.py`, et elle se pose en premier.
Ce module de test protège la frontière entre les deux, plus les quatre
manières d'obtenir une note flatteuse sans le mériter :

1. **annualiser en divisant** — surestime, et du côté qui fait déployer ;
2. **comparer à un achat-conservation qui ne paie pas ses frais** ;
3. **déduire le R du budget de risque** au lieu de le lire sur le trade ;
4. **sommer les pertes** au lieu de lire le repli sur la courbe.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk import scorer
from trading_desk.backtest.data import load_from_file
from trading_desk.backtest.engine import limites_de_mesure, run_backtest
from trading_desk.backtest.strategies import BASELINES
from trading_desk.risk.limits import RiskLimits

# LES LIMITES DE MESURE, pas celles du desk deploye. Ce fichier note des
# STRATEGIES : leurs proprietes doivent rester comparables d'une mesure a
# l'autre, et le passage du desk a 3,75 % de risque par trade multiplierait
# par 7,5 tout ce qui est note ici sans qu'aucune strategie n'ait change.
LIM = limites_de_mesure(1600)


def _noter(nom, actif, intervalle="1h", **params):
    bars = load_from_file(f"data/{actif}_{intervalle}_real.json", actif, intervalle)
    r = run_backtest(bars, BASELINES[nom](**params), limits=LIM,
                     interval=intervalle, initial_equity_usd=Decimal("1000"))
    return scorer.noter(r, bars), r, bars


# ────────────────────────────────── les portes décident, pas la note

def test_les_portes_decident_PAS_la_note():
    """**La propriété qui fait tenir tout le module.**

    Une stratégie à 9/10 qui ne bat pas l'achat-conservation n'est pas une
    bonne stratégie mal classée : c'est une façon compliquée de faire moins
    bien que ne rien faire. La note ne peut pas la sauver.
    """
    n, _, _ = _noter("supertrend", "SOL")
    assert n.note_sur_10 > 0, "elle a bien une note"
    assert n.deployable is False
    assert "Bat l'achat-conservation" in n.resume()


def test_une_porte_ratee_nomme_LAQUELLE():
    """« Non déployable » sans motif envoie chercher partout."""
    n, _, _ = _noter("supertrend", "BTC")
    ratees = [p for p in n.portes if not p.passee]
    assert ratees, "BTC perd de l'argent, une porte au moins doit tomber"
    assert all(p.titre and p.detail for p in ratees)


def test_trop_peu_de_trades_ferme_la_porte_du_rendement():
    """Un rendement annualisé sur douze trades décrit douze trades."""
    n, _, _ = _noter("momentum_residuel", "ETH")
    porte = next(p for p in n.portes if p.cle == "annualise")
    if n.trades < scorer.TRADES_MIN:
        assert porte.passee is False
        assert "plancher" in porte.detail


# ───────────────────────────────────────── les quatre erreurs évitées

def test_l_annualisation_est_GEOMETRIQUE():
    """Diviser par la durée surestime, et du côté qui fait déployer.

    +48 % sur 365 jours doit rendre +48 %, pas autre chose ; et +10 % sur
    182,6 jours doit rendre +21 % (composé), pas +20 % (divisé).
    """
    assert scorer.annualiser(0.48, 365.25) == pytest.approx(48.0, abs=0.01)
    compose = scorer.annualiser(0.10, 365.25 / 2)
    assert compose == pytest.approx(21.0, abs=0.1)
    assert compose > 20.0, "le composé dépasse le naïf, et c'est le bon sens"


def test_l_annualisation_ne_compose_pas_une_ruine():
    """Une équité à zéro ne se compose pas : (1+r) négatif à une puissance
    fractionnaire n'a pas de sens réel."""
    assert scorer.annualiser(-1.0, 100) == -100.0
    assert scorer.annualiser(-1.5, 100) == -100.0


def test_l_achat_conservation_PAIE_ses_frais():
    """Le comparer à une stratégie qui paie les siens sur cent trades sans lui
    faire payer ses deux siens serait une comparaison truquée."""
    bars = load_from_file("data/BTC_1h_real.json", "BTC", "1h")
    avec = scorer.buy_and_hold_pct(bars, cout_aller_retour_bps=9.0)
    sans = scorer.buy_and_hold_pct(bars, cout_aller_retour_bps=0.0)
    assert avec < sans
    assert sans - avec == pytest.approx(0.0009, abs=1e-9)


def test_le_R_est_LU_sur_le_trade_pas_deduit_du_budget():
    """Le déduire du budget serait faux dès qu'un plafond de notionnel mord.

    Mesuré : risque médian 2,64 $ pour un budget de 5 $ sur `supertrend BTC`.
    L'estimation se tromperait d'un facteur deux sur la moitié des trades.
    """
    _, r, _ = _noter("supertrend", "BTC")
    risques = sorted(float(t.risque_usd) for t in r.trades)
    budget = 0.005 * 1000
    assert risques, "il faut des trades"
    assert _mediane(risques) < budget * 0.9, (
        "au moins un plafond mord — c'est ce qui rend l'estimation fausse")
    assert all(t.r_multiple is not None for t in r.trades)


def test_un_trade_sans_risque_n_a_pas_de_R_plutot_qu_un_R_nul():
    """Le compter comme nul tirerait l'espérance vers le bas sans raison."""
    from trading_desk.backtest.engine import BacktestTrade
    from trading_desk.contracts.common import Side
    t = BacktestTrade(asset="X", side=Side.LONG, entry_ts_ms=0, exit_ts_ms=1,
                      entry_price=Decimal("1"), exit_price=Decimal("2"),
                      size=Decimal("1"), gross_pnl_usd=Decimal("1"),
                      fees_usd=Decimal("0"), funding_usd=Decimal("0"),
                      reason="x", risque_usd=Decimal("0"))
    assert t.r_multiple is None


def test_le_repli_se_lit_sur_la_COURBE():
    """Dix pertes séparées par des gains ne font pas un repli de dix pertes."""
    # descente à −20 %, remontée, puis nouvelle descente à −10 %
    courbe = [100, 80, 100, 90, 100]
    assert scorer.repli_max_pct(courbe) == pytest.approx(20.0)
    # la somme des baisses vaudrait 30 %, et ce serait faux
    assert scorer.repli_max_pct(courbe) < 30.0


# ───────────────────────────────────────────────────────── le relief

def test_le_relief_bouge_un_parametre_a_la_fois():
    """« Ce réglage est-il un sommet isolé ? » se teste en descendant d'un cran
    dans chaque direction, pas en sautant dans le coin opposé."""
    p = {"atr_period": 10, "mult": 3.0}
    v = scorer.voisins(p)
    for voisin in v:
        differents = [k for k in p if voisin[k] != p[k]]
        assert len(differents) == 1, f"{voisin} bouge {len(differents)} paramètres"


def test_un_parametre_entier_bouge_VRAIMENT():
    """10 % de 5 arrondi à zéro laisserait le voisin identique à l'original,
    et le relief compterait une stratégie comme son propre voisin — donc un
    relief parfait, toujours."""
    v = scorer.voisins({"exit_period": 5})
    assert v, "un entier petit doit quand même produire des voisins"
    assert all(x["exit_period"] != 5 for x in v)


def test_le_relief_distingue_un_sommet_d_un_plateau():
    """Mesuré : `supertrend` a 12 % de relief sur BTC et 100 % sur SOL.

    Le premier est un sommet isolé — on a trouvé la cellule où le bruit était
    favorable. Le second est un vrai plateau. Que SOL échoue quand même à la
    porte de l'achat-conservation est précisément pourquoi le relief est une
    composante et non une porte.
    """
    p = dict(atr_period=10, mult=3.0, stop_min_pct=0.40, time_stop=72)
    btc, _, _ = scorer.relief("supertrend", "BTC", "1h", p)
    sol, _, _ = scorer.relief("supertrend", "SOL", "1h", p)
    assert btc < 0.5 < sol


def test_un_relief_non_mesure_n_est_pas_un_relief_NUL():
    """`None` veut dire « pas mesuré », ce qui n'est pas « mauvais ». Le
    traiter comme zéro punirait une stratégie pour un calcul qu'on n'a pas
    payé."""
    _, r, bars = _noter("supertrend", "BTC")
    sans = scorer.noter(r, bars, relief=None)
    zero = scorer.noter(r, bars, relief=0.0)
    assert sans.relief is None
    assert sans.note_sur_10 > zero.note_sur_10


# ──────────────────────────────────────────────── l'abattement live

def test_l_abattement_live_est_declare_pas_cache():
    """Ce n'est pas une mesure, c'est une hypothèse de travail — donc elle
    doit être lisible et discutable, pas noyée dans un calcul."""
    assert scorer.ABATTEMENT_LIVE == 0.30
    n, _, _ = _noter("supertrend", "SOL")
    assert n.live_espere_pct == pytest.approx(
        n.annualise_pct * scorer.ABATTEMENT_LIVE)


def test_la_note_se_serialise_entierement():
    n, _, _ = _noter("supertrend", "BTC")
    d = n.en_dict()
    assert set(d) >= {"note_sur_10", "deployable", "annualise_pct",
                      "buy_hold_annualise_pct", "esperance_r", "portes"}
    assert len(d["portes"]) == 2


def _mediane(xs):
    v = sorted(xs)
    n = len(v)
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2


# ─────────────── la composition : l'épreuve d'abord, le scorer ensuite

def test_deployable_par_le_scorer_n_est_PAS_retenue_par_l_epreuve():
    """**Les deux questions sont différentes, et l'ordre compte.**

    Mesuré sur le registre réel : `ema_cross SOL 4h` rend +4,5 %/an, bat
    l'achat-conservation, tient un repli de 4,7 % — le scorer la dit
    déployable. L'épreuve la refuse : son p ne survit pas à la correction sur
    les 35 signatures de même origine.

    Confondre les deux brancherait une stratégie économiquement séduisante et
    statistiquement indistinguable du hasard. C'est exactement la machine à
    faux positifs que ce dépôt existe pour ne pas être.
    """
    from trading_desk import atelier

    essais = atelier.lire()
    lignes = atelier.dernier_par_signature(essais)
    notees = [l for l in lignes if l.get("note")]
    if not notees:
        pytest.skip("registre sans note : lancer scripts/noter_registre.py")

    deployables = [l for l in notees if l["note"]["deployable"]]
    retenues = [l for l in notees
                if atelier.juger(l, essais=essais).etat == "RETENUE"]

    # La propriété : être déployable ne suffit pas, et le registre le montre.
    for l in deployables:
        verdict = atelier.juger(l, essais=essais)
        if verdict.etat != "RETENUE":
            assert verdict.fatale is not None, (
                "une cellule refusée doit dire par quelle épreuve")
            break
    else:
        if deployables:
            pytest.skip("toutes les déployables passent aussi l'épreuve")

    assert len(retenues) <= len(notees), "sanity"


def test_le_scorer_ne_decide_JAMAIS_seul():
    """Aucun chemin de code ne doit brancher une stratégie sur la seule note.

    Le scorer n'importe ni le pupitre, ni les pilotes, ni l'exécution : il lit
    un résultat de backtest et rend des chiffres. Si un jour il importait de
    quoi agir, ce test tomberait.
    """
    import inspect
    src = inspect.getsource(scorer)
    for interdit in ("Pupitre", "Intention", "order_manager", "flatten",
                     "regles_figees", "regles_llm"):
        assert interdit not in src, (
            f"{interdit} n'a rien à faire dans le scorer : il note, il ne "
            f"branche pas")
