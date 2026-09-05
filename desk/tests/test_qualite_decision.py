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
    return Bar(asset="BTC", ts_ms=0, open=Decimal("100"), high=Decimal(high),
               low=Decimal(low), close=Decimal("100"))


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
