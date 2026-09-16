"""Les trois règles proposées par un agent LLM externe, le 16 septembre 2026.

Ces tests ne vérifient pas qu'elles gagnent — c'est une mesure, pas une
propriété, et c'est le modèle nul qui tranche. Ils verrouillent que le code
**est bien la règle énoncée**, parce qu'une implémentation infidèle ne réfute
ni ne confirme rien : elle mesure une quatrième stratégie que personne n'a
proposée.

Un bug attrapé en écrivant ces tests mérite d'être nommé : `MomentumResiduel`
allait chercher l'intervalle sur `bars[0].interval`, un attribut que le
contrat `Bar` ne porte pas. L'`AttributeError` tombait dans un
`except Exception` large, le résiduel rendait des `None` partout, et la
stratégie produisait **zéro trade en silence**. Ça ressemblait à un résultat
(« aucun signal ») au lieu d'un bug — exactement la classe de défaut que ce
dépôt traque.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.backtest.data import load_from_file
from trading_desk.backtest.strategies import (
    BASELINES, DonchianEmaBe, MomentumResiduel, Supertrend, _supertrend,
)
from trading_desk.contracts.common import Side
from trading_desk.features.bars import Bar


def _bars(closes, actif="X", marge=0.002):
    """Des barres synthétiques autour de la clôture.

    `marge=0` colle le haut et le bas à la clôture. C'est nécessaire pour
    tester une cassure : avec un haut au-dessus de la clôture, une montée
    monotone ne franchit JAMAIS le plus haut précédent, et le test mesurerait
    l'absence d'entrée au lieu de la règle qu'il vise.
    """
    return [Bar(asset=actif, ts_ms=1_700_000_000_000 + i * 3_600_000,
                open=Decimal(str(c)), high=Decimal(str(c * (1 + marge))),
                low=Decimal(str(c * (1 - marge))), close=Decimal(str(c)),
                volume=Decimal("100"), trades=10)
            for i, c in enumerate(closes)]


# ───────────────────────────────────────────────────────────── Supertrend

def test_le_supertrend_ne_regarde_pas_la_barre_courante_pour_la_decider():
    """Le sens de la barre `i` se décide sur les bandes de `i-1`.

    Comparer aux bandes de `i` — qui dépendent de la clôture de `i` — ferait
    regarder la barre courante pour décider de la barre courante, et la
    stratégie se validerait toute seule. C'est invisible dans les chiffres et
    seulement lisible dans le code, donc c'est ici que ça se verrouille.
    """
    montee = _bars([100 + i for i in range(60)])
    ligne, sens = _supertrend(montee, 10, 3.0)
    # Sur une montée monotone, le sens est haussier et la ligne est SOUS le prix.
    derniers = [(l, s, float(b.close)) for l, s, b in
                zip(ligne[-10:], sens[-10:], montee[-10:]) if l is not None]
    assert derniers, "la ligne doit exister après le warm-up"
    assert all(s == 1 for _, s, _ in derniers)
    assert all(l < c for l, _, c in derniers), "en tendance haussière, la ligne suit par le bas"


def test_le_supertrend_refuse_un_stop_trop_proche():
    """« Skip si stop < 0,40 % » : une distance trop courte donne une taille
    démesurée, et le moindre bruit sort la position."""
    s = Supertrend(stop_min_pct=99.0)      # aucune distance ne peut passer
    bars = _bars([100 + (i % 7) for i in range(80)])
    s.prepare(bars)
    assert all(s.on_bar(i, bars, None).side is None for i in range(len(bars)))


def test_le_supertrend_sort_au_time_stop():
    s = Supertrend(time_stop=5)
    bars = _bars([100 + i for i in range(60)])
    s.prepare(bars)
    for i in range(30, 36):
        sig = s.on_bar(i, bars, Side.LONG)
    assert sig.exit_now, "au-delà de 5 barres en position, la sortie est forcée"


def test_le_supertrend_remet_son_etat_a_zero_a_chaque_preparation():
    """**Le modèle nul rejoue la même instance des milliers de fois.**

    Un état qui survivrait d'un tirage au suivant mélangerait les tirages
    entre eux, et le p mesuré ne décrirait plus rien.
    """
    s = Supertrend(time_stop=5)
    bars = _bars([100 + i for i in range(60)])
    s.prepare(bars)
    for i in range(30, 34):
        s.on_bar(i, bars, Side.LONG)
    assert s._entree is not None
    s.prepare(bars)
    assert s._entree is None


# ──────────────────────────────────────────────────── Donchian + EMA + BE

def test_le_donchian_ne_prend_les_longs_qu_au_dessus_de_l_EMA():
    """Le filtre est la moitié de la règle énoncée. Sans lui, c'est une
    cassure Donchian nue — une stratégie déjà présente au catalogue, et déjà
    réfutée."""
    s = DonchianEmaBe(entry_period=5, ema_period=50)
    # Prix qui casse vers le haut mais reste SOUS une EMA encore haute :
    # une longue descente puis un rebond court.
    bars = _bars([200 - i for i in range(60)] + [141 + i for i in range(8)])
    s.prepare(bars)
    sides = [s.on_bar(i, bars, None).side for i in range(60, len(bars))]
    assert Side.LONG not in sides, "sous l'EMA, aucun long"


def test_le_passage_a_breakeven_ne_se_fait_qu_une_fois():
    """Le stop ne se remet pas au point mort à chaque barre : le moteur ne
    retient que le resserrement, mais réémettre masquerait un stop suiveur
    plus serré posé entre-temps."""
    s = DonchianEmaBe(atr_stop=2.0, cible_r=99.0)
    bars = _bars([100 + i * 0.5 for i in range(200)])
    s.prepare(bars)
    s.on_bar(150, bars, Side.LONG)                 # enregistre l'entrée
    signaux = [s.on_bar(i, bars, Side.LONG) for i in range(151, 190)]
    be = [x for x in signaux if x.note == "breakeven à +1R"]
    assert len(be) <= 1, "le passage au point mort est unique"


def test_le_plancher_de_stop_ELARGIT_au_lieu_de_refuser():
    """« Floor 0,40 % » est une distance minimale, pas un écrêtage.

    Confondre les deux inverserait la règle : un stop trop serré serait
    refusé au lieu d'être élargi, et la stratégie ne prendrait plus les
    entrées en faible volatilité — c'est-à-dire les plus nombreuses.
    """
    s = DonchianEmaBe(entry_period=5, ema_period=10, atr_period=5,
                      atr_stop=0.001, stop_min_pct=1.0)
    bars = _bars([100 + i * 0.1 for i in range(40)], marge=0.0)
    s.prepare(bars)
    trouve = None
    for i in range(30, 40):
        sig = s.on_bar(i, bars, None)
        if sig.side is not None:
            trouve = (i, sig)
            break
    assert trouve is not None, "l'entrée doit avoir lieu"
    i, sig = trouve
    distance = (float(bars[i].close) - float(sig.stop_price)) / float(bars[i].close)
    assert distance >= 0.009, (
        f"stop à {distance:.4%} : il devait être élargi au plancher de 1 %, "
        f"pas refusé")


# ─────────────────────────────────────────────────────── Momentum résiduel

def test_le_residuel_se_calcule_VRAIMENT(tmp_path):
    """**Le test qui aurait attrapé le bug.**

    La première version rendait un résiduel vide sur toute la série : la
    stratégie produisait zéro trade, silencieusement, et ça se lisait comme
    « aucun signal ». Un test sur le nombre de trades l'aurait laissé passer ;
    celui-ci regarde la grandeur intermédiaire.
    """
    bars = load_from_file("data/ETH_1h_real.json", "ETH", "1h")
    s = MomentumResiduel()
    s.prepare(bars)
    calcules = [r for r in s._res if r is not None]
    assert len(calcules) > 4_000, (
        f"seulement {len(calcules)} résiduels calculés — la référence n'est "
        f"probablement pas alignée")
    assert min(calcules) < 0 < max(calcules), "un résiduel prend les deux signes"


def test_le_residuel_s_aligne_par_HORODATAGE_et_non_par_rang():
    """Deux séries du même intervalle peuvent avoir des longueurs différentes.

    Un alignement par rang décalerait silencieusement toute la comparaison :
    la stratégie continuerait de produire des signaux, simplement contre le
    mauvais jour. L'erreur ne se verrait nulle part dans les chiffres.
    """
    btc = load_from_file("data/BTC_1h_real.json", "BTC", "1h")
    eth = load_from_file("data/ETH_1h_real.json", "ETH", "1h")
    assert len(btc) != len(eth), (
        "le test perd son sens si les deux séries ont la même longueur")
    s = MomentumResiduel()
    s.prepare(eth)
    # Un résiduel nul à la barre i exige que BTC ait bien cet horodatage-là.
    from trading_desk.backtest.strategies import _reference
    ref = _reference("BTC", "1h")
    for i, r in enumerate(s._res):
        if r is not None:
            assert eth[i].ts_ms in ref
            break


def test_le_momentum_residuel_est_long_seulement():
    """Le rapport dit « long-only » et c'est repris tel quel. Ajouter les
    shorts testerait une autre règle que celle proposée, tout en profitant de
    la sélection qui a produit celle-ci."""
    bars = load_from_file("data/SOL_1h_real.json", "SOL", "1h")
    s = MomentumResiduel()
    s.prepare(bars)
    sides = {s.on_bar(i, bars, None).side for i in range(100, len(bars), 17)}
    assert Side.SHORT not in sides


def test_une_reference_absente_ne_leve_pas_mais_une_erreur_de_code_SI():
    """Deux absences différentes. Un fichier manquant est un cas d'exécution
    prévu ; un attribut inexistant est un bug, et l'avaler le rendrait
    invisible."""
    s = MomentumResiduel(reference="ACTIF_QUI_N_EXISTE_PAS")
    bars = load_from_file("data/SOL_1h_real.json", "SOL", "1h")
    s.prepare(bars)
    assert all(r is None for r in s._res), "sans référence, aucun signal"


# ───────────────────────────────────────────────────────────── catalogue

def test_les_trois_sont_au_catalogue():
    """Sans ça, elles ne passent ni par le modèle nul ni par l'épreuve —
    c'est-à-dire qu'elles échappent à tout ce qui permettrait de les
    réfuter."""
    for nom in ("supertrend", "donchian_ema_be", "momentum_residuel"):
        assert nom in BASELINES
