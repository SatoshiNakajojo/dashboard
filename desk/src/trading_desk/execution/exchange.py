"""Interface d'exchange, et un simulateur qui sait tomber en panne.

Le point de ce module n'est pas de parler a Hyperliquid : c'est de definir la
frontiere derriere laquelle Hyperliquid se cache, pour que toute la logique
d'execution soit testable sans compte, sans reseau et sans argent.

Le simulateur `FakeExchange` reproduit les pannes qui coutent cher :

- **la reponse perdue** : l'ordre arrive bien chez l'exchange, mais l'appelant
  recoit un timeout. C'est le scenario qui double les positions ;
- le rejet, la marge insuffisante, le service indisponible ;
- le fill partiel.

Un test qui ne reproduit que le chemin heureux ne prouve rien sur un systeme
qui manipule de l'argent.
"""

from __future__ import annotations

import random
from decimal import Decimal
from typing import Protocol

from ..contracts.common import Frozen, Side, now_ms
from ..contracts.orders import (
    AccountState, Fill, OrderIntent, OrderPurpose, OrderRecord, OrderStatus,
    Position,
)
from .cloid import make_cloid


class ExchangeError(RuntimeError):
    """Erreur nommee de l'exchange. Toujours typee, jamais un `except` nu."""


class ExchangeTimeout(ExchangeError):
    """La reponse n'est pas arrivee. **Le sort de l'ordre est inconnu.**

    C'est le seul cas ou l'on n'a pas le droit de renvoyer betement : il faut
    reconcilier d'abord. Une exception distincte force le code appelant a
    traiter ce cas separement d'un rejet franc.
    """


class ExchangeRejected(ExchangeError):
    """L'ordre a ete refuse. L'etat est connu : il n'existe pas."""


class Exchange(Protocol):
    """Tout ce dont la couche d'execution a besoin. Rien de plus."""

    def place(self, intent: OrderIntent) -> OrderRecord: ...
    def cancel(self, cloid: str) -> bool: ...
    def account_state(self) -> AccountState: ...
    def fills_since(self, ts_ms: int) -> list[Fill]: ...


class FaultProfile(Frozen):
    """Pannes a injecter. Toutes a zero par defaut : on choisit ses malheurs."""

    timeout_rate: float = 0.0          # reponse perdue, ordre pourtant accepte
    reject_rate: float = 0.0
    partial_fill_rate: float = 0.0
    unavailable_rate: float = 0.0      # panne franche, ordre NON accepte
    seed: int = 1234


class FakeExchange:
    """Exchange en memoire, deterministe a seed fixee.

    Il dedoublonne par `cloid`, comme le vrai : c'est ce qui rend le renvoi
    d'une intention identique inoffensif, et c'est precisement la propriete
    qu'on veut prouver par des tests.
    """

    def __init__(
        self,
        *,
        equity_usd: Decimal = Decimal("1000"),
        marks: dict[str, Decimal] | None = None,
        faults: FaultProfile | None = None,
    ) -> None:
        self.equity_usd = equity_usd
        self.marks = marks or {"BTC": Decimal("60000"), "ETH": Decimal("3000")}
        self.faults = faults or FaultProfile()
        self._rng = random.Random(self.faults.seed)

        self._orders: dict[str, OrderRecord] = {}
        self._positions: dict[str, Position] = {}
        self._fills: list[Fill] = []
        self._next_oid = 1
        self._fill_seq = 0

        # Compteurs d'audit : ce sont eux qui prouvent l'idempotence dans les
        # tests ("l'exchange a bien recu 2 requetes, et cree 1 seul ordre").
        self.requests_received = 0
        self.orders_created = 0

    # -------------------------------------------------------------- ecriture

    def place(self, intent: OrderIntent) -> OrderRecord:
        self.requests_received += 1
        cloid = make_cloid(intent)

        if self._rng.random() < self.faults.unavailable_rate:
            # Panne franche : rien n'est cree cote exchange.
            raise ExchangeError("service indisponible")

        existing = self._orders.get(cloid)
        if existing is not None:
            # Deduplication. Le vrai Hyperliquid fait de meme sur un cloid
            # deja vu : c'est la garantie sur laquelle repose tout le systeme.
            return existing

        if self._rng.random() < self.faults.reject_rate:
            record = OrderRecord(
                cloid=cloid, intent=intent, status=OrderStatus.REJECTED,
                error="rejete par l'exchange",
            )
            self._orders[cloid] = record
            return record

        record = self._accept(cloid, intent)

        if self._rng.random() < self.faults.timeout_rate:
            # L'ordre EST accepte, mais l'appelant ne le saura pas. C'est le
            # scenario qui double les positions quand on renvoie a l'aveugle.
            raise ExchangeTimeout("aucune reponse recue")

        return record

    def _accept(self, cloid: str, intent: OrderIntent) -> OrderRecord:
        oid = self._next_oid
        self._next_oid += 1
        self.orders_created += 1

        if intent.purpose in (OrderPurpose.STOP_LOSS, OrderPurpose.TAKE_PROFIT):
            # Un ordre declencheur reste au carnet jusqu'a son trigger.
            record = OrderRecord(cloid=cloid, intent=intent,
                                 status=OrderStatus.RESTING, exchange_oid=oid)
            self._orders[cloid] = record
            return record

        partial = self._rng.random() < self.faults.partial_fill_rate
        filled = intent.size / 2 if partial else intent.size
        price = intent.limit_price or self.marks.get(intent.asset, Decimal("1"))

        record = OrderRecord(
            cloid=cloid, intent=intent,
            status=OrderStatus.PARTIAL if partial else OrderStatus.FILLED,
            exchange_oid=oid, filled_size=filled, avg_price=price,
        )
        self._orders[cloid] = record
        self._apply_fill(intent, filled, price, cloid)
        return record

    def _apply_fill(
        self, intent: OrderIntent, size: Decimal, price: Decimal, cloid: str
    ) -> None:
        self._fill_seq += 1
        self._fills.append(Fill(
            fill_id=f"f{self._fill_seq}", cloid=cloid, asset=intent.asset,
            side=intent.side, size=size, price=price,
            fee_usd=size * price * Decimal("0.00045"), ts_ms=now_ms(),
        ))

        current = self._positions.get(intent.asset)
        if intent.reduce_only or (current and current.side is not intent.side):
            if current is None:
                return
            remaining = current.size - size
            if remaining <= 0:
                del self._positions[intent.asset]
            else:
                self._positions[intent.asset] = current.model_copy(
                    update={"size": remaining}
                )
            return

        if current is None:
            self._positions[intent.asset] = Position(
                asset=intent.asset, side=intent.side, size=size,
                entry_price=price, mark_price=self.marks.get(intent.asset, price),
                leverage=Decimal("1"),
            )
        else:
            total = current.size + size
            avg = (current.entry_price * current.size + price * size) / total
            self._positions[intent.asset] = current.model_copy(
                update={"size": total, "entry_price": avg}
            )

    def cancel(self, cloid: str) -> bool:
        record = self._orders.get(cloid)
        if record is None or record.status.is_terminal:
            return False
        self._orders[cloid] = record.model_copy(
            update={"status": OrderStatus.CANCELLED}
        )
        return True

    # -------------------------------------------------------------- lecture

    def account_state(self) -> AccountState:
        """Photo du compte. C'est la SOURCE DE VERITE du systeme.

        Le champ `protective_stop_cloid` est rempli ici en cherchant, parmi les
        ordres au carnet, un stop reduce_only sur cet actif. C'est exactement
        ce que fait la reconciliation contre le vrai exchange : on ne croit pas
        l'etat local, on regarde ce qui existe reellement.
        """
        resting_stops = {
            r.intent.asset: r.cloid
            for r in self._orders.values()
            if r.status is OrderStatus.RESTING
            and r.intent.purpose is OrderPurpose.STOP_LOSS
        }
        positions = tuple(
            p.model_copy(update={
                "mark_price": self.marks.get(p.asset, p.mark_price),
                "protective_stop_cloid": resting_stops.get(p.asset),
            })
            for p in self._positions.values()
        )
        used = sum((p.notional_usd for p in positions), Decimal("0"))
        return AccountState(
            equity_usd=self.equity_usd,
            available_margin_usd=max(self.equity_usd - used, Decimal("0")),
            used_margin_usd=used,
            positions=positions,
            open_orders=tuple(
                r for r in self._orders.values() if r.status is OrderStatus.RESTING
            ),
        )

    def fills_since(self, ts_ms: int) -> list[Fill]:
        return [f for f in self._fills if f.ts_ms >= ts_ms]

    # ------------------------------------------------------------ utilitaires

    def set_mark(self, asset: str, price: Decimal) -> None:
        self.marks[asset] = price

    def inject_orphan_position(self, position: Position) -> None:
        """Cree une position sans passer par un ordre.

        Simule ce qu'on decouvre au demarrage apres un crash : une position
        bien reelle dont le desk n'a aucune trace locale.
        """
        self._positions[position.asset] = position
