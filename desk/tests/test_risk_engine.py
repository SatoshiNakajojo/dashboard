"""Tests du moteur de risque.

Le fil conducteur : **un controle qui ne peut pas etre evalue est un controle
en echec**. La moitie de ces tests verifie que l'ignorance bloque, parce que
c'est la propriete qui distingue un desk prudent d'un desk qui trade a
l'aveugle apres une panne partielle.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.contracts import (
    Bias, DeskMode, FeedHealth, FeedStatus, HaltReason, Mandate, OrderIntent,
    OrderPurpose, Position, Side, now_ms,
)
from trading_desk.execution import make_cloid
from trading_desk.risk import Invariant, evaluate, reduce_only_verdict


def test_contexte_sain_approuve(healthy_ctx):
    v = evaluate(healthy_ctx)
    assert v.approved, v.reason
    assert v.blocking == ()
    assert len(v.checks) == 12


# --------------------------------------------------------------------------
#  L'ignorance bloque
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [
        ("account", None, Invariant.I01_RECONCILED),
        ("reconciled", False, Invariant.I01_RECONCILED),
        ("reconciliation_age_ms", None, Invariant.I01_RECONCILED),
        ("day_realized_pnl_usd", None, Invariant.I03_DAILY_LOSS),
        ("mandate", None, Invariant.I06_MANDATE_ALIVE),
        ("feeds", (), Invariant.I09_FRESH_DATA),
        ("clock_drift_ms", None, Invariant.I09_FRESH_DATA),
        ("kill_switch_ready", False, Invariant.I10_KILL_SWITCH),
        ("prompt_isolation_enabled", False, Invariant.I11_PROMPT_ISOLATION),
        ("signer_is_agent_wallet", False, Invariant.I12_SIGNER_ISOLATION),
        ("signer_can_withdraw", True, Invariant.I12_SIGNER_ISOLATION),
    ],
)
def test_information_manquante_ou_fausse_bloque(healthy_ctx, field, value, expected):
    ctx = healthy_ctx.model_copy(update={field: value})
    v = evaluate(ctx)
    assert not v.approved
    assert expected in v.blocking, f"{field}={value} devait bloquer {expected}"


# --------------------------------------------------------------------------
#  Invariants individuels
# --------------------------------------------------------------------------

def test_i02_position_sans_stop_bloque_et_arrete(healthy_ctx, account):
    naked = Position(
        asset="ETH", side=Side.LONG, size=Decimal("1"),
        entry_price=Decimal("3000"), mark_price=Decimal("3000"),
        leverage=Decimal("2"), protective_stop_cloid=None,
    )
    ctx = healthy_ctx.model_copy(
        update={"account": account.model_copy(update={"positions": (naked,)})}
    )
    v = evaluate(ctx)
    assert Invariant.I02_STOPS_AT_EXCHANGE in v.blocking
    assert v.halt_reason is HaltReason.UNPROTECTED_POSITION


def test_i02_position_protegee_passe(healthy_ctx, account, open_position):
    ctx = healthy_ctx.model_copy(
        update={"account": account.model_copy(update={"positions": (open_position,)})}
    )
    assert evaluate(ctx).approved


def test_i03_perte_du_jour_arrete_le_desk(healthy_ctx):
    # Limite par defaut : 2 % de 1000 USD = 20 USD.
    ctx = healthy_ctx.model_copy(update={"day_realized_pnl_usd": Decimal("-20.01")})
    v = evaluate(ctx)
    assert Invariant.I03_DAILY_LOSS in v.blocking
    assert v.halt_reason is HaltReason.DAILY_LOSS_LIMIT


def test_i03_juste_sous_la_limite_passe(healthy_ctx):
    ctx = healthy_ctx.model_copy(update={"day_realized_pnl_usd": Decimal("-19.99")})
    assert evaluate(ctx).approved


def test_i04_levier_effectif_plafonne(healthy_ctx, account):
    # 4 positions de 1000 USD sur 1000 USD d'equite = levier 4x > 3x.
    big = tuple(
        Position(asset=f"A{i}", side=Side.LONG, size=Decimal("1"),
                 entry_price=Decimal("1000"), mark_price=Decimal("1000"),
                 leverage=Decimal("4"), protective_stop_cloid="0x" + "b" * 32)
        for i in range(4)
    )
    ctx = healthy_ctx.model_copy(
        update={"account": account.model_copy(update={"positions": big})}
    )
    assert Invariant.I04_NOTIONAL_LEVERAGE in evaluate(ctx).blocking


def test_i06_mandat_expire_bloque(healthy_ctx, live_mandate):
    old = live_mandate.model_copy(
        update={"issued_at_ms": now_ms() - live_mandate.ttl_ms - 1}
    )
    ctx = healthy_ctx.model_copy(update={"mandate": old})
    v = evaluate(ctx)
    assert Invariant.I06_MANDATE_ALIVE in v.blocking
    assert "expiré" in v.check(Invariant.I06_MANDATE_ALIVE).detail


def test_i06_actif_hors_univers_refuse(healthy_ctx, live_mandate):
    intent = OrderIntent(
        intent_id="i1", mandate_id=live_mandate.mandate_id, asset="DOGE",
        side=Side.LONG, purpose=OrderPurpose.ENTRY, size=Decimal("1"),
        limit_price=Decimal("0.1"),
    )
    v = evaluate(healthy_ctx, intent, make_cloid(intent))
    assert Invariant.I06_MANDATE_ALIVE in v.blocking


def test_i06_mauvais_sens_refuse(healthy_ctx, live_mandate):
    """Le mandat est LONG : une vente d'entree ne doit jamais passer."""
    intent = OrderIntent(
        intent_id="i1", mandate_id=live_mandate.mandate_id, asset="BTC",
        side=Side.SHORT, purpose=OrderPurpose.ENTRY, size=Decimal("0.01"),
        limit_price=Decimal("60000"),
    )
    assert Invariant.I06_MANDATE_ALIVE in evaluate(healthy_ctx, intent, make_cloid(intent)).blocking


def test_i07_debit_ordres_arrete_le_desk(healthy_ctx):
    ctx = healthy_ctx.model_copy(update={"orders_last_minute": 21})
    v = evaluate(ctx)
    assert Invariant.I07_ORDER_RATE in v.blocking
    assert v.halt_reason is HaltReason.ORDER_RATE_EXCEEDED


def test_i07_quota_de_mandats_journalier(healthy_ctx):
    ctx = healthy_ctx.model_copy(update={"mandates_today": 9})
    assert Invariant.I07_ORDER_RATE in evaluate(ctx).blocking


def test_i08_cloid_falsifie_refuse(healthy_ctx, live_mandate):
    intent = OrderIntent(
        intent_id="i1", mandate_id=live_mandate.mandate_id, asset="BTC",
        side=Side.LONG, purpose=OrderPurpose.ENTRY, size=Decimal("0.01"),
        limit_price=Decimal("60000"),
    )
    v = evaluate(healthy_ctx, intent, "0x" + "0" * 32)
    assert Invariant.I08_DETERMINISTIC_CLOID in v.blocking


def test_i08_cloid_correct_accepte(healthy_ctx, live_mandate):
    intent = OrderIntent(
        intent_id="i1", mandate_id=live_mandate.mandate_id, asset="BTC",
        side=Side.LONG, purpose=OrderPurpose.ENTRY, size=Decimal("0.01"),
        limit_price=Decimal("60000"),
    )
    v = evaluate(healthy_ctx, intent, make_cloid(intent))
    assert v.approved, v.reason
    assert v.approved_size == Decimal("0.01")


def test_i09_flux_gele_arrete_le_desk(healthy_ctx):
    """Le cas dangereux : connecte, mais plus aucun tick."""
    frozen = FeedHealth(
        name="trades:BTC", status=FeedStatus.LIVE,
        last_message_ms=now_ms() - 60_000, max_age_ms=20_000, messages=999,
    )
    ctx = healthy_ctx.model_copy(update={"feeds": (frozen,)})
    v = evaluate(ctx)
    assert Invariant.I09_FRESH_DATA in v.blocking
    assert v.halt_reason is HaltReason.STALE_FEED


def test_i09_derive_horloge_bloque(healthy_ctx):
    ctx = healthy_ctx.model_copy(update={"clock_drift_ms": 5_000})
    assert Invariant.I09_FRESH_DATA in evaluate(ctx).blocking


def test_i09_divergence_de_prix_bloque(healthy_ctx):
    ctx = healthy_ctx.model_copy(update={"price_divergence_bps": Decimal("120")})
    assert Invariant.I09_FRESH_DATA in evaluate(ctx).blocking


# --------------------------------------------------------------------------
#  Mode et sorties
# --------------------------------------------------------------------------

def test_mode_shadow_nemet_aucun_ordre(healthy_ctx, live_mandate):
    """Invariants tous verts, mais SHADOW : l'ordre reste refuse."""
    intent = OrderIntent(
        intent_id="i1", mandate_id=live_mandate.mandate_id, asset="BTC",
        side=Side.LONG, purpose=OrderPurpose.ENTRY, size=Decimal("0.01"),
        limit_price=Decimal("60000"),
    )
    ctx = healthy_ctx.model_copy(update={"mode": DeskMode.SHADOW})
    v = evaluate(ctx, intent, make_cloid(intent))
    assert not v.approved
    assert v.blocking == ()          # rien n'est en defaut
    assert "SHADOW" in v.reason      # c'est la posture qui refuse


def test_sortie_autorisee_meme_desk_en_defaut(healthy_ctx):
    """Fermer une position reste possible quand tout va mal.

    Un systeme qui s'interdit de reduire son risque au pire moment est plus
    dangereux que le probleme qu'il essaie d'eviter.
    """
    broken = healthy_ctx.model_copy(
        update={"account": None, "feeds": (), "day_realized_pnl_usd": None}
    )
    assert not evaluate(broken).approved
    assert reduce_only_verdict(broken).approved


def test_verdict_liste_tous_les_bloquants(healthy_ctx):
    ctx = healthy_ctx.model_copy(
        update={"kill_switch_ready": False, "prompt_isolation_enabled": False}
    )
    v = evaluate(ctx)
    assert Invariant.I10_KILL_SWITCH in v.blocking
    assert Invariant.I11_PROMPT_ISOLATION in v.blocking
    assert len(v.blocking) == 2


def test_mandat_flat_bloque_toute_entree(healthy_ctx):
    flat = Mandate.flat()
    intent = OrderIntent(
        intent_id="i1", mandate_id=flat.mandate_id, asset="BTC",
        side=Side.LONG, purpose=OrderPurpose.ENTRY, size=Decimal("0.01"),
        limit_price=Decimal("60000"),
    )
    ctx = healthy_ctx.model_copy(update={"mandate": flat})
    assert Invariant.I06_MANDATE_ALIVE in evaluate(ctx, intent, make_cloid(intent)).blocking
    assert flat.bias is Bias.FLAT
