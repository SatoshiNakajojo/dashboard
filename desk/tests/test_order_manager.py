"""Tests de la couche d'execution.

Ce sont les tests qui protegent l'argent. Ils reproduisent les pannes qui
coutent cher, pas le chemin heureux :

- la reponse HTTP perdue alors que l'ordre est passe (le scenario qui double
  les positions) ;
- l'entree servie mais le stop refuse (le scenario qui laisse une position
  nue) ;
- la position decouverte au demarrage dont le desk n'a aucune trace (le
  scenario d'apres-crash).

Chacun doit avoir une reponse deterministe et testee, pas une intention.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.contracts import (
    Bias, DeskMode, FeedHealth, FeedStatus, Mandate, OrderIntent, OrderPurpose,
    OrderStatus, Position, Side, now_ms,
)
from trading_desk.execution import (
    FakeExchange, FaultProfile, OrderManager, make_cloid, protect_or_flatten,
    reconcile, reconcile_and_protect,
)
from trading_desk.risk import RiskContext, RiskLimits


# --------------------------------------------------------------------------
#  Montage
# --------------------------------------------------------------------------

def _mandate() -> Mandate:
    return Mandate(
        bias=Bias.LONG, universe=("BTC",), max_notional_usd=Decimal("500"),
        max_leverage=Decimal("2"), max_concurrent_positions=2,
        journal_ref="jr_test",
    )


def _ex(equity: str = "10000") -> FakeExchange:
    """Faux exchange avec de la marge de manoeuvre.

    L'equite est large a dessein : ces tests portent sur l'idempotence et la
    reconciliation, pas sur les plafonds de risque (couverts ailleurs). Une
    equite serree ferait echouer la deuxieme entree sur l'invariant I04 et
    masquerait ce qu'on cherche a prouver.
    """
    return FakeExchange(equity_usd=Decimal(equity))


def _ctx(exchange: FakeExchange, mandate: Mandate | None = None, **over) -> RiskContext:
    """Contexte sain, adosse a l'etat reel du faux exchange."""
    base = dict(
        mode=DeskMode.TESTNET,
        limits=RiskLimits(),
        account=exchange.account_state(),
        reconciled=True,
        reconciliation_age_ms=500,
        day_realized_pnl_usd=Decimal("0"),
        mandate=mandate if mandate is not None else _mandate(),
        feeds=(FeedHealth(name="trades:BTC", status=FeedStatus.LIVE,
                          last_message_ms=now_ms(), max_age_ms=20_000),),
        clock_drift_ms=2,
        kill_switch_ready=True,
        prompt_isolation_enabled=True,
        signer_is_agent_wallet=True,
        signer_can_withdraw=False,
    )
    base.update(over)          # `over` a toujours le dernier mot
    return RiskContext(**base)


def _ex_with(cls, **faults) -> FakeExchange:
    return cls(equity_usd=Decimal("10000"), faults=FaultProfile(**faults))


def _entry(manager: OrderManager, mandate: Mandate, *, intent_id=None) -> OrderIntent:
    return OrderIntent(
        intent_id=intent_id or manager.next_intent_id("e"),
        mandate_id=mandate.mandate_id, asset="BTC", side=Side.LONG,
        purpose=OrderPurpose.ENTRY, size=Decimal("0.005"),
        limit_price=Decimal("60000"),
    )


# --------------------------------------------------------------------------
#  Idempotence — le scenario qui double les positions
# --------------------------------------------------------------------------

def test_renvoyer_la_meme_intention_ne_double_pas_la_position():
    """Deux requetes, un seul ordre, une seule position.

    Le contexte est capture UNE fois puis reutilise : c'est fidele au reel.
    Quand un appelant croit avoir echoue et renvoie, il n'a pas reconcilie
    entre-temps — il rejoue la meme decision avec la meme vision du monde.
    """
    ex = _ex()
    om = OrderManager(ex)
    m = _mandate()
    intent = _entry(om, m)
    ctx = _ctx(ex, m)

    first = om.submit(intent, ctx)
    second = om.submit(intent, ctx)

    assert first.accepted and second.accepted
    assert first.cloid == second.cloid
    assert ex.requests_received == 2, "l'exchange a bien recu deux requetes"
    assert ex.orders_created == 1, "mais n'a cree qu'un ordre"
    assert len(ex.account_state().positions) == 1
    assert ex.account_state().positions[0].size == Decimal("0.005")


def test_deux_intentions_distinctes_creent_deux_ordres():
    """Le pendant du test precedent : la deduplication ne doit pas avaler une
    seconde entree legitime.

    On passe par `open_position`, donc chaque entree repart d'une position
    protegee — sinon l'invariant I02 bloque la seconde, ce qui est le sujet du
    test suivant.
    """
    ex = _ex()
    om = OrderManager(ex)
    m = _mandate()

    for _ in range(2):
        out = om.open_position(
            mandate=m, ctx=_ctx(ex, m), asset="BTC", side=Side.LONG,
            size=Decimal("0.005"), entry_price=Decimal("60000"),
            stop_price=Decimal("58000"),
        )
        assert out.opened, out.reason

    assert ex.account_state().positions[0].size == Decimal("0.01")
    assert ex.account_state().positions[0].is_protected


def test_une_position_nue_bloque_tout_nouvel_ordre():
    """Consequence directe de l'invariant I02, et elle vaut d'etre nommee.

    Une entree brute, sans stop, laisse une position nue. Tant qu'elle l'est,
    le desk refuse d'emettre quoi que ce soit d'autre : la seule action
    raisonnable est de la proteger ou de la fermer.
    """
    ex = _ex()
    om = OrderManager(ex)
    m = _mandate()

    first = om.submit(_entry(om, m), _ctx(ex, m))
    assert first.accepted

    second = om.submit(_entry(om, m), _ctx(ex, m))
    assert not second.accepted
    assert "I02" in second.reason
    assert "sans stop" in second.reason


# --------------------------------------------------------------------------
#  Timeout — la reponse perdue
# --------------------------------------------------------------------------

def test_timeout_retrouve_l_ordre_au_lieu_de_le_renvoyer():
    """L'ordre est passe, la reponse s'est perdue.

    Le manager doit aller VOIR chez l'exchange, pas supposer l'echec et
    renvoyer — c'est exactement la ou les positions doublent.
    """
    ex = _ex_with(FakeExchange, timeout_rate=1.0)
    om = OrderManager(ex)
    m = _mandate()

    outcome = om.submit(_entry(om, m), _ctx(ex, m))

    assert outcome.accepted, "l'ordre existe : il doit etre reconnu comme accepte"
    assert "retrouve" in outcome.reason
    assert ex.orders_created == 1
    assert len(ex.account_state().positions) == 1


def test_timeout_sans_trace_signale_un_sort_inconnu():
    """Quand on ne retrouve rien, `unknown` — jamais un simple echec.

    La distinction compte : un echec autorise un renvoi, un sort inconnu
    exige une reconciliation d'abord.
    """
    class Muet(FakeExchange):
        def fills_since(self, ts_ms):
            return []                      # l'exchange ne montre rien

        def account_state(self):
            state = super().account_state()
            return state.model_copy(update={"open_orders": ()})

    ex = _ex_with(Muet, timeout_rate=1.0)
    om = OrderManager(ex)
    m = _mandate()

    outcome = om.submit(_entry(om, m), _ctx(ex, m))

    assert not outcome.accepted
    assert outcome.unknown
    assert outcome.needs_reconciliation
    assert "inconnu" in outcome.reason


def test_renvoi_apres_timeout_est_inoffensif():
    """Si l'appelant renvoie quand meme, la deduplication par cloid protege."""
    ex = _ex_with(FakeExchange, timeout_rate=1.0)
    om = OrderManager(ex)
    m = _mandate()
    intent = _entry(om, m)

    om.submit(intent, _ctx(ex, m))
    om.submit(intent, _ctx(ex, m))          # renvoi identique

    assert ex.orders_created == 1
    assert ex.account_state().positions[0].size == Decimal("0.005")


# --------------------------------------------------------------------------
#  Le stop obligatoire
# --------------------------------------------------------------------------

def test_ouverture_pose_le_stop_dans_la_foulee():
    ex = _ex()
    om = OrderManager(ex)
    m = _mandate()

    out = om.open_position(
        mandate=m, ctx=_ctx(ex, m), asset="BTC", side=Side.LONG,
        size=Decimal("0.005"), entry_price=Decimal("60000"),
        stop_price=Decimal("58000"),
    )

    assert out.opened
    assert out.stop is not None and out.stop.accepted
    state = ex.account_state()
    assert state.positions[0].is_protected
    assert not state.unprotected_positions


def test_stop_impossible_ferme_la_position():
    """Une position nue est plus dangereuse qu'une opportunite manquee."""
    class StopRefuse(FakeExchange):
        def place(self, intent):
            if intent.purpose is OrderPurpose.STOP_LOSS:
                from trading_desk.execution import ExchangeRejected
                raise ExchangeRejected("stop refuse")
            return super().place(intent)

    ex = StopRefuse(equity_usd=Decimal('10000'))
    om = OrderManager(ex)
    m = _mandate()

    out = om.open_position(
        mandate=m, ctx=_ctx(ex, m), asset="BTC", side=Side.LONG,
        size=Decimal("0.005"), entry_price=Decimal("60000"),
        stop_price=Decimal("58000"),
    )

    assert not out.opened
    assert out.flattened
    assert "fermee" in out.reason
    assert ex.account_state().positions == (), "la position doit avoir ete soldee"


def test_entree_refusee_ne_pose_pas_de_stop():
    ex = _ex()
    om = OrderManager(ex)
    m = _mandate()

    # Actif hors mandat : l'entree est refusee par l'invariant I06.
    out = om.open_position(
        mandate=m, ctx=_ctx(ex, m), asset="DOGE", side=Side.LONG,
        size=Decimal("100"), entry_price=Decimal("0.4"),
        stop_price=Decimal("0.38"),
    )

    assert not out.opened
    assert out.stop is None
    assert ex.orders_created == 0


def test_entree_au_sort_inconnu_ne_pose_pas_de_stop_a_l_aveugle():
    """Sort inconnu : on s'arrete et on laisse la reconciliation trancher.

    Poser un stop sur une position peut-etre inexistante creerait un ordre
    orphelin ; renvoyer l'entree pourrait doubler.
    """
    class Muet(FakeExchange):
        def fills_since(self, ts_ms):
            return []

        def account_state(self):
            return super().account_state().model_copy(update={"open_orders": ()})

    ex = _ex_with(Muet, timeout_rate=1.0)
    om = OrderManager(ex)
    m = _mandate()

    out = om.open_position(
        mandate=m, ctx=_ctx(ex, m), asset="BTC", side=Side.LONG,
        size=Decimal("0.005"), entry_price=Decimal("60000"),
        stop_price=Decimal("58000"),
    )

    assert not out.opened
    assert out.stop is None
    assert "reconciliation" in out.reason


# --------------------------------------------------------------------------
#  Sorties : toujours possibles
# --------------------------------------------------------------------------

def test_sortie_possible_meme_desk_en_defaut():
    """Un systeme qui s'interdit de reduire son risque quand il va mal est
    plus dangereux que le probleme qu'il evite."""
    ex = _ex()
    om = OrderManager(ex)
    m = _mandate()
    om.open_position(mandate=m, ctx=_ctx(ex, m), asset="BTC", side=Side.LONG,
                     size=Decimal("0.005"), entry_price=Decimal("60000"),
                     stop_price=Decimal("58000"))

    # Desk casse : plus de flux, plus de compte, plus de mandat.
    broken = _ctx(ex, m).model_copy(update={
        "account": None, "feeds": (), "mandate": None,
        "day_realized_pnl_usd": None, "reconciled": False,
    })

    outcomes = om.flatten_all(broken)
    assert all(o.accepted for o in outcomes), [o.reason for o in outcomes]
    assert ex.account_state().positions == ()


def test_flatten_all_lit_les_positions_chez_l_exchange():
    """Au moment ou l'on veut tout fermer, l'etat local est precisement ce a
    quoi on ne peut plus se fier."""
    ex = _ex()
    om = OrderManager(ex)
    m = _mandate()
    ex.inject_orphan_position(Position(
        asset="ETH", side=Side.SHORT, size=Decimal("1"),
        entry_price=Decimal("3000"), mark_price=Decimal("3000"),
        leverage=Decimal("1"),
    ))

    outcomes = om.flatten_all(_ctx(ex, m))
    assert len(outcomes) == 1
    assert outcomes[0].accepted
    assert ex.account_state().positions == ()


def test_ordre_reducteur_doit_etre_reduce_only():
    ex = _ex()
    om = OrderManager(ex)
    m = _mandate()
    intent = _entry(om, m)          # reduce_only=False
    out = om.submit_reduce(intent, _ctx(ex, m))
    assert not out.accepted
    assert "reduce_only" in out.reason


# --------------------------------------------------------------------------
#  Reconciliation — le scenario d'apres-crash
# --------------------------------------------------------------------------

def test_position_orpheline_detectee():
    ex = _ex()
    ex.inject_orphan_position(Position(
        asset="BTC", side=Side.LONG, size=Decimal("0.01"),
        entry_price=Decimal("59000"), mark_price=Decimal("60000"),
        leverage=Decimal("2"),
    ))

    report = reconcile(ex, known_assets=set())
    assert report.converged
    assert report.orphan_positions == ("BTC",)
    assert report.unprotected_positions == ("BTC",)
    assert not report.is_safe


def test_position_orpheline_recoit_un_stop():
    ex = _ex()
    om = OrderManager(ex)
    m = _mandate()
    ex.inject_orphan_position(Position(
        asset="BTC", side=Side.LONG, size=Decimal("0.01"),
        entry_price=Decimal("59000"), mark_price=Decimal("60000"),
        leverage=Decimal("2"),
    ))

    report = reconcile_and_protect(ex, om, _ctx(ex, m), RiskLimits())

    assert report.stops_placed == ("BTC",)
    assert report.unprotected_positions == ()
    assert report.is_safe
    assert ex.account_state().positions[0].is_protected


def test_stop_de_secours_est_large_pas_serre():
    """On ignore la these qui a ouvert cette position : un stop serre la
    ferait sortir sur du bruit. C'est un filet, pas une gestion."""
    from trading_desk.execution import default_stop_price

    limits = RiskLimits()
    pos = Position(asset="BTC", side=Side.LONG, size=Decimal("0.01"),
                   entry_price=Decimal("60000"), mark_price=Decimal("60000"),
                   leverage=Decimal("2"))
    stop = default_stop_price(pos, limits)
    distance_bps = (pos.mark_price - stop) / pos.mark_price * Decimal("10000")
    assert distance_bps == limits.max_stop_distance_bps


def test_stop_impossible_a_la_reconciliation_ferme_la_position():
    class StopRefuse(FakeExchange):
        def place(self, intent):
            if intent.purpose is OrderPurpose.STOP_LOSS:
                from trading_desk.execution import ExchangeRejected
                raise ExchangeRejected("stop refuse")
            return super().place(intent)

    ex = StopRefuse(equity_usd=Decimal('10000'))
    om = OrderManager(ex)
    m = _mandate()
    ex.inject_orphan_position(Position(
        asset="BTC", side=Side.LONG, size=Decimal("0.01"),
        entry_price=Decimal("59000"), mark_price=Decimal("60000"),
        leverage=Decimal("2"),
    ))

    report = reconcile_and_protect(ex, om, _ctx(ex, m), RiskLimits())

    assert report.positions_flattened == ("BTC",)
    assert report.unprotected_positions == ()
    assert ex.account_state().positions == ()


def test_exchange_illisible_ne_converge_pas():
    """Mieux vaut un desk inerte qu'un desk qui trade sur un etat suppose."""
    from trading_desk.execution import ExchangeError

    class Aveugle(FakeExchange):
        def account_state(self):
            raise ExchangeError("API injoignable")

    report = reconcile(Aveugle(equity_usd=Decimal('10000')))
    assert not report.converged
    assert not report.is_safe
    assert "injoignable" in report.error


def test_position_connue_et_protegee_ne_declenche_rien():
    ex = _ex()
    om = OrderManager(ex)
    m = _mandate()
    om.open_position(mandate=m, ctx=_ctx(ex, m), asset="BTC", side=Side.LONG,
                     size=Decimal("0.005"), entry_price=Decimal("60000"),
                     stop_price=Decimal("58000"))
    orders_before = ex.orders_created

    report = reconcile_and_protect(ex, om, _ctx(ex, m), RiskLimits(),
                                   known_assets={"BTC"})

    assert report.is_safe
    assert report.orphan_positions == ()
    assert report.stops_placed == ()
    assert ex.orders_created == orders_before, "aucun ordre inutile"


# --------------------------------------------------------------------------
#  Debit et journalisation
# --------------------------------------------------------------------------

def test_comptage_du_debit_d_ordres():
    ex = _ex()
    om = OrderManager(ex)
    m = _mandate()
    ctx = _ctx(ex, m)               # capture avant toute position
    for _ in range(3):
        om.submit(_entry(om, m), ctx)
    assert om.orders_last_minute() == 3
    # Une minute plus tard, la fenetre glissante s'est vidée.
    assert om.orders_last_minute(now_ms() + 61_000) == 0


def test_les_intent_id_sont_sequentiels_pas_horodates():
    """Un horodatage rendrait deux tentatives de la meme intention
    differentes, et l'idempotence disparaitrait."""
    om = OrderManager(_ex())
    ids = [om.next_intent_id("e") for _ in range(3)]
    assert ids == ["e-000001", "e-000002", "e-000003"]


def test_tout_est_journalise(tmp_path):
    from trading_desk.storage import SqliteStore

    store = SqliteStore(tmp_path / "j.db")
    ex = _ex()
    om = OrderManager(ex, store=store)
    m = _mandate()

    om.submit(_entry(om, m), _ctx(ex, m))
    sans_mandat = _ctx(ex, m).model_copy(update={"mandate": None})
    om.submit(_entry(om, m), sans_mandat)                 # refuse par I06

    kinds = {row["kind"] for row in store.recent_journal(10)}
    assert "order_sent" in kinds
    assert "order_refused" in kinds
    store.close()


def test_rejet_de_l_exchange_est_propre():
    ex = _ex_with(FakeExchange, reject_rate=1.0)
    om = OrderManager(ex)
    m = _mandate()
    out = om.submit(_entry(om, m), _ctx(ex, m))
    assert not out.accepted
    assert not out.unknown, "un rejet franc n'est pas un sort inconnu"
    assert out.record is not None
    assert out.record.status is OrderStatus.REJECTED
