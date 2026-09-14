"""Reconciliation : ce que l'exchange dit, contre ce que le desk croyait.

C'est la premiere chose que fait le desk au demarrage, **avant toute
decision**, et c'est ce qui rend un crash survivable. Le scenario type : le
processus meurt entre un fill et l'ecriture locale ; au redemarrage, le desk
se croit a plat alors qu'il porte une position a levier.

Un seul principe, applique sans exception : **l'exchange est la source de
verite**. Rien ici ne corrige l'exchange a partir de l'etat local ; tout
corrige l'etat local a partir de l'exchange.

Et une consequence qui merite d'etre nommee : une position decouverte sans
stop n'est pas une anomalie a signaler, c'est une anomalie a **corriger tout
de suite**. On pose le stop ; si on n'y arrive pas, on ferme.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from ..contracts.common import Frozen, Side
from ..contracts.orders import AccountState, OrderIntent, OrderPurpose, Position
from ..risk import RiskContext, RiskLimits
from .exchange import Exchange, ExchangeError
from .order_manager import OrderManager

log = logging.getLogger(__name__)


class ReconcileReport(Frozen):
    """Ce qu'on a trouve, et ce qu'on en a fait."""

    converged: bool
    account: AccountState | None = None
    orphan_positions: tuple[str, ...] = ()      # inconnues de l'etat local
    unprotected_positions: tuple[str, ...] = ()  # sans stop cote exchange
    stops_placed: tuple[str, ...] = ()
    positions_flattened: tuple[str, ...] = ()
    error: str = ""

    @property
    def is_safe(self) -> bool:
        """Vrai quand plus aucune position n'est nue.

        C'est la condition que l'invariant I01 traduit en verdict : tant
        qu'elle est fausse, le desk n'a pas le droit d'ouvrir quoi que ce soit.
        """
        return self.converged and not self.unprotected_positions


def default_stop_price(position: Position, limits: RiskLimits) -> Decimal:
    """Stop de secours pour une position trouvee sans protection.

    Place a la distance maximale autorisee, pas a la minimale : on vient de
    decouvrir cette position, on ignore la these qui l'a ouverte, et un stop
    trop serre la ferait sortir sur du bruit. C'est un filet, pas une gestion.
    """
    span = position.mark_price * limits.max_stop_distance_bps / Decimal("10000")
    return (position.mark_price - span if position.side is Side.LONG
            else position.mark_price + span)


def reconcile(
    exchange: Exchange,
    *,
    known_cloids: set[str] | None = None,
    known_assets: set[str] | None = None,
) -> ReconcileReport:
    """Lit l'etat reel. Ne modifie rien : constater d'abord, agir ensuite."""
    try:
        account = exchange.account_state()
    except ExchangeError as exc:
        # Echec de lecture : on ne converge pas, donc le desk reste bloque.
        # C'est exactement le comportement voulu — mieux vaut un desk inerte
        # qu'un desk qui trade sur un etat suppose.
        log.error("reconciliation impossible : %s", exc)
        return ReconcileReport(converged=False, error=str(exc))

    known_assets = known_assets or set()
    orphans = tuple(
        p.asset for p in account.positions if p.asset not in known_assets
    )
    unprotected = tuple(p.asset for p in account.unprotected_positions)

    if orphans:
        log.warning("positions inconnues de l'etat local : %s", ", ".join(orphans))
    if unprotected:
        log.error("positions sans stop cote exchange : %s", ", ".join(unprotected))

    return ReconcileReport(
        converged=True, account=account,
        orphan_positions=orphans, unprotected_positions=unprotected,
    )


def protect_or_flatten(
    report: ReconcileReport,
    manager: OrderManager,
    ctx: RiskContext,
    limits: RiskLimits,
) -> ReconcileReport:
    """Corrige les positions nues : un stop, ou la sortie.

    Passe par `submit_reduce`, donc fonctionne meme desk arrete — c'est
    precisement la situation dans laquelle on se trouve quand on decouvre une
    position orpheline apres un crash.
    """
    if report.account is None or not report.unprotected_positions:
        return report

    placed: list[str] = []
    flattened: list[str] = []
    by_asset = {p.asset: p for p in report.account.positions}

    for asset in report.unprotected_positions:
        position = by_asset.get(asset)
        if position is None:
            continue

        stop_price = default_stop_price(position, limits)
        exit_side = Side.SHORT if position.side is Side.LONG else Side.LONG
        intent = OrderIntent(
            intent_id=manager.next_intent_id("r"),
            mandate_id="reconciliation",
            asset=asset, side=exit_side, purpose=OrderPurpose.STOP_LOSS,
            size=position.size, trigger_price=stop_price, reduce_only=True,
        )
        outcome = manager.submit_reduce(intent, ctx)

        if outcome.accepted:
            log.info("stop de secours pose sur %s a %s", asset, stop_price)
            placed.append(asset)
            continue

        log.error("stop impossible sur %s (%s) — fermeture", asset, outcome.reason)
        closed = manager.flatten(asset, ctx, size=position.size, side=position.side)
        if closed.accepted:
            flattened.append(asset)
        else:
            # Ni protegee, ni fermable. Le desk doit rester bloque et
            # l'humain doit voir ca sur l'ecran de supervision.
            log.critical("position %s ni protegee ni fermable : %s",
                         asset, closed.reason)

    still_naked = tuple(
        a for a in report.unprotected_positions
        if a not in placed and a not in flattened
    )
    return report.model_copy(update={
        "stops_placed": tuple(placed),
        "positions_flattened": tuple(flattened),
        "unprotected_positions": still_naked,
    })


def reconcile_and_protect(
    exchange: Exchange,
    manager: OrderManager,
    ctx: RiskContext,
    limits: RiskLimits,
    *,
    known_assets: set[str] | None = None,
) -> ReconcileReport:
    """Sequence complete du demarrage : lire, puis corriger.

    A appeler avant d'autoriser la moindre entree. Le rapport renvoye alimente
    `RiskContext.reconciled`, donc l'invariant I01.
    """
    report = reconcile(exchange, known_assets=known_assets)
    if not report.converged:
        return report
    return protect_or_flatten(report, manager, ctx, limits)
