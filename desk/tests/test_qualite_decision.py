"""Le suivi d'un setup contre les barres qui ont suivi sa fenêtre.

Une seule propriété compte ici, et elle inverserait le résultat si elle
tombait : la confrontation se fait **barre par barre et dans l'ordre**. Un
stop touché à la barre 3 clôt le suivi, même si la cible est atteinte à la
barre 40. Agréger l'extrême de la période conclurait « cible atteinte » et
transformerait une perte en gain.
"""

from __future__ import annotations

import importlib.util
from decimal import Decimal
from pathlib import Path

import pytest

from trading_desk.agents.shadow_book import ShadowBook, ShadowEntry
from trading_desk.contracts import Side
from trading_desk.features import Bar

_spec = importlib.util.spec_from_file_location(
    "qualite_decision",
    Path(__file__).resolve().parents[1] / "scripts" / "qualite_decision.py")
qualite = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(qualite)


def _bar(high: str, low: str) -> Bar:
    """Une bougie dont on ne fixe que les extrêmes.

    `open` et `close` sont placés au milieu : le contrat `Bar` exige qu'ils
    tiennent dans [low, high], et aucun test ici ne dépend de leur valeur —
    sauf la clôture d'horizon, qui lit `close` et pour laquelle le milieu est
    une valeur parfaitement définie.
    """
    milieu = (Decimal(high) + Decimal(low)) / 2
    return Bar(asset="BTC", ts_ms=0, open=milieu, high=Decimal(high),
               low=Decimal(low), close=milieu)


def _livre(target="110", stop="95") -> tuple[ShadowBook, ShadowEntry]:
    book = ShadowBook()
    entree = ShadowEntry(
        ts_ms=0, stage="VETO", reason="test", asset="BTC", side=Side.LONG,
        entry_price=Decimal("100"), stop_price=Decimal(stop),
        target_price=Decimal(target))
    book.entries.append(entree)
    return book, entree


def test_le_stop_tot_bat_la_cible_tard():
    book, entree = _livre()
    suite = [_bar("101", "94")] + [_bar("111", "100")] * 40   # stop, puis cible
    qualite.suivre(book, entree, suite, "BTC", 100)
    assert book.entries[0].outcome == "stop"
    assert book.entries[0].pnl_r == Decimal("-1")


def test_la_cible_tot_est_bien_prise():
    book, entree = _livre()
    suite = [_bar("111", "99")] + [_bar("101", "94")] * 40    # cible, puis stop
    qualite.suivre(book, entree, suite, "BTC", 100)
    assert book.entries[0].outcome == "cible"
    assert book.entries[0].pnl_r == Decimal("2")   # 10 de gain / 5 de risque


def test_lhorizon_borne_vraiment_le_suivi():
    """Un stop hors horizon ne doit pas compter — sinon l'horizon ne veut
    rien dire et le setup est jugé sur une durée qu'il n'a pas demandée."""
    book, entree = _livre()
    suite = [_bar("101", "99")] * 5 + [_bar("101", "94")] * 10
    qualite.suivre(book, entree, suite, "BTC", 5)
    assert book.entries[0].outcome == "horizon", book.entries[0].outcome


def test_un_setup_qui_ne_bouge_pas_est_clos_a_lhorizon():
    book, entree = _livre()
    qualite.suivre(book, entree, [_bar("101", "99")] * 10, "BTC", 10)
    resolu = book.entries[0]
    assert resolu.outcome == "horizon"
    # Clôturé au close de la dernière barre de l'horizon : 100, soit 0 R.
    assert resolu.pnl_r == Decimal("0")


def test_un_short_est_suivi_dans_le_bon_sens():
    book = ShadowBook()
    entree = ShadowEntry(
        ts_ms=0, stage="VETO", reason="t", asset="BTC", side=Side.SHORT,
        entry_price=Decimal("100"), stop_price=Decimal("105"),
        target_price=Decimal("90"))
    book.entries.append(entree)
    qualite.suivre(book, entree, [_bar("101", "89")] * 3, "BTC", 3)
    assert book.entries[0].outcome == "cible"
    assert book.entries[0].pnl_r == Decimal("2")   # 10 / 5


def test_une_suite_vide_laisse_le_setup_ouvert():
    """Les dernières fenêtres n'ont pas de futur. Les clore à zéro les
    ferait passer pour neutres, ce qui biaiserait l'espérance vers 0."""
    book, entree = _livre()
    qualite.suivre(book, entree, [], "BTC", 10)
    assert not book.entries[0].resolved


@pytest.mark.parametrize("interval,heures,attendu", [
    ("1h", 24.0, 24), ("4h", 24.0, 6), ("1d", 24.0, 1), ("1d", 12.0, 1),
])
def test_lhorizon_se_convertit_en_barres(interval, heures, attendu):
    """`horizon_hours` est en heures ; le suivi compte en barres. Sans
    conversion, un horizon de 24 h vaudrait 24 JOURS en daily."""
    n = max(1, int(heures * qualite.BARRES_PAR_HEURE[interval]))
    assert n == attendu


# --------------------------------------------------------------------------
#  Lecture de la calibration
# --------------------------------------------------------------------------
#
# Une fonction d'analyse qui ment est pire que pas d'analyse : elle produit
# un chiffre qu'on cite ensuite. Ces trois cas fabriqués vérifient qu'elle
# distingue les trois situations qui comptent.

def _e(conv, pnl, outcome="cible"):
    return {"conviction": str(conv), "pnl_r": str(pnl), "resolved": True,
            "outcome": outcome}


def test_la_calibration_voit_une_conviction_informative():
    texte = qualite.calibration([_e(0.3, -1)] * 6 + [_e(0.8, 2)] * 6)
    assert "porte de l'information" in texte
    assert "+3.00 R" in texte


def test_la_calibration_voit_une_conviction_sans_rapport():
    """Le cas qui compte : si la conviction ne prédit rien, une porte à seuil
    n'y filtre que du bruit de notation."""
    texte = qualite.calibration(([_e(0.3, 2), _e(0.3, -1)] * 3
                                 + [_e(0.8, -1), _e(0.8, 2)] * 3))
    assert "n'en porte pas" in texte


def test_la_calibration_refuse_de_correler_une_conviction_constante():
    """Deux moitiés de même conviction moyenne ne se comparent pas : l'écart
    de P&L y serait du bruit d'échantillon présenté comme un signal."""
    texte = qualite.calibration([_e(0.6, 1)] * 6 + [_e(0.6, -1)] * 6)
    assert "ne varie presque pas" in texte


def test_la_mediane_nest_pas_la_centrale_haute():
    """Sur une distribution à deux modes, la centrale haute vaut le max et se
    lirait comme « tout est en haut »."""
    texte = qualite.calibration([_e(0.3, -1)] * 6 + [_e(0.8, 2)] * 6)
    assert "min 0.30  mediane 0.55  max 0.80" in texte


def test_la_calibration_refuse_un_echantillon_trop_court():
    texte = qualite.calibration([_e(0.5, 1)] * 9)
    assert "trop peu" in texte


# --------------------------------------------------------------------------
#  Un setup n'est pas un trade
# --------------------------------------------------------------------------

def _livre_limite(entree="90", stop="85", target="100"):
    """Un setup dont l'entrée est SOUS le marché — un ordre à cours limité."""
    book = ShadowBook()
    e = ShadowEntry(
        ts_ms=0, stage="VETO", reason="t", asset="BTC", side=Side.LONG,
        entry_price=Decimal(entree), stop_price=Decimal(stop),
        target_price=Decimal(target))
    book.entries.append(e)
    return book, e


def test_une_entree_jamais_atteinte_nest_pas_notee():
    """Le défaut qui produisait +0,35 R au lieu de +0,05 R.

    Le marché monte de 100 à 105 sans jamais redescendre à 90. Le stop, à 85,
    est de l'autre côté et n'est donc jamais touché ; la cible à 100 l'est
    immédiatement. Sans exiger l'exécution, ce setup encaissait +2 R sur une
    position qui n'a jamais été ouverte.
    """
    book, entree = _livre_limite()
    monte = [_bar(str(100 + i), str(99 + i)) for i in range(6)]
    qualite.suivre(book, entree, monte, "BTC", 10)
    resolu = book.entries[0]
    assert not resolu.filled
    assert resolu.outcome == "non_execute"
    assert resolu.pnl_r is None, "un setup non exécuté ne doit pas être chiffré"


def test_une_entree_atteinte_est_notee_normalement():
    book, entree = _livre_limite()
    # Le marché redescend toucher 90, puis remonte à la cible.
    suite = [_bar("101", "89")] + [_bar("101", "99")] * 3
    qualite.suivre(book, entree, suite, "BTC", 10)
    assert book.entries[0].filled
    assert book.entries[0].outcome == "cible"


def test_entree_et_stop_sur_la_meme_bougie_donnent_un_trade_stoppe():
    """Amorcer avant résoudre. L'ordre inverse ignorerait la mèche qui fait
    les deux, et transformerait une perte en trade jamais pris."""
    book, entree = _livre_limite()
    qualite.suivre(book, entree, [_bar("95", "84")], "BTC", 5)
    assert book.entries[0].filled
    assert book.entries[0].outcome == "stop"
    assert book.entries[0].pnl_r == Decimal("-1")


def test_un_setup_non_execute_sort_de_lesperance_sans_la_tirer_vers_zero():
    """`pnl_r=None` et non zéro : un zéro se mêlerait aux vrais résultats."""
    book = ShadowBook()
    for _ in range(30):
        b, e = _livre_limite()
        book.entries.append(b.entries[0])
    for e in list(book.entries):
        qualite.suivre(book, e, [_bar("105", "104")] * 3, "BTC", 3)
    assert all(x.outcome == "non_execute" for x in book.entries)
    assert book.rejected_expectancy_r() is None
