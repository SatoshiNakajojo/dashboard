"""Envoi d'ordres : idempotence, timeouts, et stop obligatoire.

Trois regles, dans cet ordre de priorite :

1. **Un timeout ne se renvoie jamais a l'aveugle.** Quand la reponse se perd,
   le sort de l'ordre est inconnu : il faut demander a l'exchange ce qui
   existe reellement, jamais supposer l'echec. C'est le scenario qui double
   les positions, et c'est un `except` distinct pour cette raison.
2. **Une entree sans stop n'existe pas.** Le stop est poste dans la foulee de
   l'entree. S'il echoue, on ferme la position immediatement — une position
   nue est plus dangereuse qu'une opportunite manquee (invariant I02).
3. **Sortir reste toujours possible.** Les ordres reducteurs passent par
   `reduce_only_verdict`, qui ignore l'etat general du desk. Un systeme qui
   s'interdit de reduire son risque quand il va mal est le vrai danger.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from itertools import count

from ..contracts.common import EntryStyle, Frozen, Side, now_ms
from ..contracts.mandate import Mandate
from ..contracts.orders import (
    AccountState, OrderIntent, OrderPurpose, OrderRecord, OrderStatus, Position,
)
from ..risk import RiskContext, evaluate, reduce_only_verdict
from .cloid import make_cloid
from .exchange import Exchange, ExchangeError, ExchangeRejected, ExchangeTimeout

log = logging.getLogger(__name__)


class SubmitOutcome(Frozen):
    """Resultat d'une soumission. `unknown` n'est jamais confondu avec `echec`."""

    accepted: bool
    record: OrderRecord | None = None
    cloid: str = ""
    unknown: bool = False
    reason: str = ""

    @property
    def needs_reconciliation(self) -> bool:
        return self.unknown


class OpenOutcome(Frozen):
    """Resultat d'une ouverture complete : entree + stop protecteur."""

    opened: bool
    entry: SubmitOutcome | None = None
    stop: SubmitOutcome | None = None
    flattened: bool = False
    reason: str = ""


class OrderManager:
    """Seul chemin entre une intention et l'exchange.

    Rien d'autre dans le projet n'appelle `exchange.place()` : tout passe par
    ici, donc tout passe par le moteur de risque.
    """

    def __init__(self, exchange: Exchange, *, store=None) -> None:
        self.exchange = exchange
        self.store = store
        self._seq = count(1)
        self._sent_at: list[int] = []      # horodatages, pour le debit (I07)

    # ------------------------------------------------------------- comptage

    def orders_last_minute(self, at_ms: int | None = None) -> int:
        now = at_ms if at_ms is not None else now_ms()
        self._sent_at = [t for t in self._sent_at if now - t <= 60_000]
        return len(self._sent_at)

    def next_intent_id(self, prefix: str = "e") -> str:
        """Sequence, pas horodatage.

        Le cloid derive de `intent_id` : un horodatage rendrait deux tentatives
        de la meme intention differentes, et l'idempotence disparaitrait au
        moment ou l'on en a besoin.
        """
        return f"{prefix}-{next(self._seq):06d}"

    # ------------------------------------------------------------ soumission

    def submit(self, intent: OrderIntent, ctx: RiskContext) -> SubmitOutcome:
        """Soumet un ordre apres validation des douze invariants."""
        cloid = make_cloid(intent)
        verdict = evaluate(ctx, intent, cloid)
        if not verdict.approved:
            self._journal("order_refused", intent, cloid, verdict.reason)
            return SubmitOutcome(accepted=False, cloid=cloid, reason=verdict.reason)
        return self._send(intent, cloid)

    def submit_reduce(self, intent: OrderIntent, ctx: RiskContext) -> SubmitOutcome:
        """Soumet un ordre reducteur. Reste possible desk arrete."""
        if not intent.reduce_only:
            return SubmitOutcome(accepted=False,
                                 reason="un ordre reducteur doit etre reduce_only")
        cloid = make_cloid(intent)
        verdict = reduce_only_verdict(ctx)
        if not verdict.approved:
            return SubmitOutcome(accepted=False, cloid=cloid, reason=verdict.reason)
        return self._send(intent, cloid)

    def _send(self, intent: OrderIntent, cloid: str) -> SubmitOutcome:
        self._sent_at.append(now_ms())
        try:
            record = self.exchange.place(intent)
        except ExchangeTimeout as exc:
            # Le cas dangereux. On ne renvoie pas : on va voir.
            log.warning("timeout sur %s — verification aupres de l'exchange", cloid)
            found = self._find_remote(cloid)
            if found is not None:
                self._journal("order_recovered", intent, cloid, "retrouve apres timeout")
                return SubmitOutcome(accepted=True, record=found, cloid=cloid,
                                     reason="retrouve apres timeout")
            self._journal("order_unknown", intent, cloid, str(exc))
            return SubmitOutcome(accepted=False, cloid=cloid, unknown=True,
                                 reason=f"sort inconnu : {exc}")
        except ExchangeRejected as exc:
            self._journal("order_rejected", intent, cloid, str(exc))
            return SubmitOutcome(accepted=False, cloid=cloid, reason=str(exc))
        except ExchangeError as exc:
            # Panne franche : l'ordre n'existe pas. Un renvoi est sur, mais
            # c'est a l'appelant de decider s'il le veut.
            self._journal("order_failed", intent, cloid, str(exc))
            return SubmitOutcome(accepted=False, cloid=cloid, reason=str(exc))

        if record.status is OrderStatus.REJECTED:
            self._journal("order_rejected", intent, cloid, record.error or "")
            return SubmitOutcome(accepted=False, record=record, cloid=cloid,
                                 reason=record.error or "rejete")

        self._journal("order_sent", intent, cloid, record.status.value)
        return SubmitOutcome(accepted=True, record=record, cloid=cloid)

    def _find_remote(self, cloid: str) -> OrderRecord | None:
        """Cherche un cloid parmi ce que l'exchange connait reellement.

        C'est la reponse a "mon ordre est-il passe ?" apres un timeout. On
        regarde deux endroits : les ordres encore au carnet, et les fills
        recents — un ordre peut avoir ete servi entierement pendant que la
        reponse se perdait.
        """
        try:
            state = self.exchange.account_state()
        except ExchangeError:
            return None

        for record in state.open_orders:
            if record.cloid == cloid:
                return record

        for fill in self.exchange.fills_since(now_ms() - 300_000):
            if fill.cloid != cloid:
                continue
            return OrderRecord(
                cloid=cloid,
                intent=OrderIntent(
                    intent_id="recovered", mandate_id="recovered",
                    asset=fill.asset, side=fill.side,
                    purpose=OrderPurpose.ENTRY, size=fill.size,
                    limit_price=fill.price,
                ),
                status=OrderStatus.FILLED,
                filled_size=fill.size, avg_price=fill.price,
            )
        return None

    # ------------------------------------------------- ouverture d'une position

    def open_position(
        self,
        *,
        mandate: Mandate,
        ctx: RiskContext,
        asset: str,
        side: Side,
        size: Decimal,
        entry_price: Decimal,
        stop_price: Decimal,
        target_price: Decimal | None = None,
    ) -> OpenOutcome:
        """Entree + stop, dans cet ordre, avec repli si le stop echoue."""
        entry_intent = OrderIntent(
            intent_id=self.next_intent_id("e"),
            mandate_id=mandate.mandate_id,
            asset=asset, side=side, purpose=OrderPurpose.ENTRY,
            size=size, limit_price=entry_price,
        )
        entry = self.submit(entry_intent, ctx)
        if not entry.accepted:
            if entry.unknown:
                # Sort inconnu : surtout ne pas reessayer. La reconciliation
                # tranchera, et posera le stop si la position existe.
                return OpenOutcome(opened=False, entry=entry,
                                   reason="entree au sort inconnu, reconciliation requise")
            return OpenOutcome(opened=False, entry=entry, reason=entry.reason)

        filled = entry.record.filled_size if entry.record else size
        if filled <= 0:
            return OpenOutcome(opened=False, entry=entry, reason="aucun fill")

        stop = self._place_stop(mandate, ctx, asset, side, filled, stop_price)
        if not stop.accepted:
            # Position nue : on ne discute pas, on ferme.
            log.error("stop refuse sur %s (%s) — fermeture immediate",
                      asset, stop.reason)
            self.flatten(asset, ctx, size=filled, side=side)
            return OpenOutcome(opened=False, entry=entry, stop=stop, flattened=True,
                               reason=f"stop impossible ({stop.reason}), position fermee")

        return OpenOutcome(opened=True, entry=entry, stop=stop)

    def _place_stop(
        self, mandate: Mandate, ctx: RiskContext, asset: str, side: Side,
        size: Decimal, stop_price: Decimal,
    ) -> SubmitOutcome:
        exit_side = Side.SHORT if side is Side.LONG else Side.LONG
        intent = OrderIntent(
            intent_id=self.next_intent_id("s"),
            mandate_id=mandate.mandate_id,
            asset=asset, side=exit_side, purpose=OrderPurpose.STOP_LOSS,
            size=size, trigger_price=stop_price, reduce_only=True,
        )
        # Le stop passe par le chemin reducteur : il doit pouvoir etre pose
        # meme si le desk vient de basculer en defaut entre l'entree et ici.
        return self.submit_reduce(intent, ctx)

    # ---------------------------------------------------------------- sorties

    def flatten(
        self, asset: str, ctx: RiskContext, *,
        size: Decimal, side: Side,
    ) -> SubmitOutcome:
        """Ferme une position. Toujours autorise."""
        exit_side = Side.SHORT if side is Side.LONG else Side.LONG
        intent = OrderIntent(
            intent_id=self.next_intent_id("x"),
            mandate_id="flatten",
            asset=asset, side=exit_side, purpose=OrderPurpose.FLATTEN,
            size=size, reduce_only=True, style=EntryStyle.MARKET_IOC,
        )
        return self.submit_reduce(intent, ctx)

    def flatten_all(self, ctx: RiskContext) -> list[SubmitOutcome]:
        """Met le compte a plat. C'est ce qu'appelle le kill switch.

        Les positions sont relues chez l'exchange, pas prises dans l'etat
        local : au moment ou l'on veut tout fermer, l'etat local est
        precisement ce a quoi on ne peut plus se fier.
        """
        try:
            state = self.exchange.account_state()
        except ExchangeError as exc:
            return [SubmitOutcome(accepted=False,
                                  reason=f"positions illisibles : {exc}")]
        return [
            self.flatten(p.asset, ctx, size=p.size, side=p.side)
            for p in state.positions
        ]

    # ---------------------------------------------------------------- journal

    def _journal(self, kind: str, intent: OrderIntent, cloid: str, detail: str) -> None:
        if self.store is None:
            return
        self.store.journal(kind, {
            "cloid": cloid,
            "intent": intent.model_dump(mode="json"),
            "detail": detail,
        }, intent.mandate_id)
