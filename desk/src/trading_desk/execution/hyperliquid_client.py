"""Client HTTP Hyperliquid. Implemente le protocole `Exchange`.

Derniere piece du P1 : elle relie une `OrderIntent` a un ordre reellement
envoye. Tout le reste du desk ignore ce module — il ne connait que le
protocole `Exchange`, ce qui permet de le remplacer par `FakeExchange` dans
les tests sans rien changer d'autre.

**La distinction qui compte : quelles erreurs sont sures a renvoyer.**

- Une erreur de connexion *avant* l'envoi (DNS, refus de connexion) signifie
  que la requete n'est jamais partie : `ExchangeError`, renvoi sans danger.
- Un timeout de *lecture* signifie que la requete est partie et qu'on ignore
  ce qu'elle a produit : `ExchangeTimeout`. Le manager ira verifier plutot
  que renvoyer, et c'est ce qui empeche une position de doubler.
- Un rejet explicite de l'exchange est un etat connu : `ExchangeRejected`.

Confondre ces trois cas dans un `except Exception` unique est exactement la
facon dont on double une position en production.

AVERTISSEMENT — les formes de reponse proviennent de la documentation. Elles
n'ont PAS ete confrontees a l'API reelle depuis cet environnement (le reseau y
est bloque). Valider chaque parseur sur testnet fait partie de la porte P1.
"""

from __future__ import annotations

import json
import logging
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Protocol

from ..contracts.common import Side, now_ms
from ..contracts.orders import (
    AccountState, Fill, OrderIntent, OrderPurpose, OrderRecord, OrderStatus,
    Position,
)
from ..market.budget import RequestBudget
from .cloid import make_cloid
from .exchange import ExchangeError, ExchangeRejected, ExchangeTimeout
from .hyperliquid_format import AssetMeta
from .hyperliquid_wire import (
    cancel_action, exchange_request, order_to_wire, place_action, sign_l1_action,
)
from .nonce import MonotonicNonceSource, NonceSource, assert_nonce_window

log = logging.getLogger(__name__)

MAINNET = "https://api.hyperliquid.xyz"
TESTNET = "https://api.hyperliquid-testnet.xyz"


class Transport(Protocol):
    """POST JSON. Injecte pour que le client soit testable sans reseau."""

    def __call__(self, url: str, payload: dict[str, Any], timeout_s: float) -> Any: ...


def _dec(value: Any, default: Decimal | None = None) -> Decimal | None:
    try:
        d = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return default
    return d if d.is_finite() else default


class HttpxTransport:
    """Transport reel. Traduit les pannes httpx en erreurs typees du desk."""

    def __init__(self, verify: bool = True) -> None:
        import httpx

        self._client = httpx.Client(
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0),
            verify=verify,
            headers={"Content-Type": "application/json"},
        )

    def __call__(self, url: str, payload: dict[str, Any], timeout_s: float) -> Any:
        import httpx

        try:
            resp = self._client.post(url, json=payload, timeout=timeout_s)
        except httpx.ConnectError as exc:
            # Jamais partie : renvoi sans danger.
            raise ExchangeError(f"connexion impossible : {exc}") from exc
        except httpx.ConnectTimeout as exc:
            raise ExchangeError(f"delai de connexion depasse : {exc}") from exc
        except (httpx.ReadTimeout, httpx.WriteTimeout, httpx.RemoteProtocolError) as exc:
            # Partie, sort inconnu. C'est LE cas dangereux.
            raise ExchangeTimeout(f"reponse non recue : {exc}") from exc
        except httpx.HTTPError as exc:
            raise ExchangeError(f"erreur HTTP : {exc}") from exc

        if resp.status_code == 429:
            raise ExchangeError("limite de debit atteinte (429)")
        if resp.status_code >= 500:
            # 5xx sur /exchange : l'ordre a pu etre pris en compte malgre tout.
            raise ExchangeTimeout(f"erreur serveur {resp.status_code}")
        if resp.status_code >= 400:
            raise ExchangeRejected(f"requete refusee ({resp.status_code}) : {resp.text[:200]}")

        try:
            return resp.json()
        except (ValueError, json.JSONDecodeError) as exc:
            raise ExchangeError(f"reponse illisible : {exc}") from exc


class HyperliquidClient:
    """Client d'exchange. Un seul par agent wallet.

    La cle privee ne sert qu'a signer et n'est ni journalisee ni exposee. Ce
    client est destine au processus signer isole (invariant I12).
    """

    def __init__(
        self,
        *,
        account_address: str,
        private_key: str | None = None,
        testnet: bool = True,
        transport: Transport | None = None,
        nonce_source: NonceSource | None = None,
        budget: RequestBudget | None = None,
        vault_address: str | None = None,
    ) -> None:
        self.base = TESTNET if testnet else MAINNET
        self.is_mainnet = not testnet
        self.account_address = account_address
        self._key = private_key
        self.transport = transport or HttpxTransport()
        self.nonces = nonce_source or MonotonicNonceSource()
        self.budget = budget or RequestBudget()
        self.vault_address = vault_address
        self._meta: dict[str, AssetMeta] = {}

    # ------------------------------------------------------------------ info

    def _info(self, body: dict[str, Any], *, weight: int = 2) -> Any:
        if not self.budget.can_spend(weight):
            raise ExchangeError(
                "budget de requetes epuise — WebSocket d'abord, polling jamais"
            )
        self.budget.spend(weight)
        return self.transport(f"{self.base}/info", body, 10.0)

    def load_meta(self) -> dict[str, AssetMeta]:
        """Charge l'univers des perpetuels.

        L'index de l'actif dans `universe` est ce que le format filaire attend
        dans le champ `a` — pas le nom. Une erreur ici enverrait un ordre sur
        le mauvais marche, d'ou le cache : on le lit une fois, au demarrage.
        """
        data = self._info({"type": "meta"})
        universe = (data or {}).get("universe") or []
        metas: dict[str, AssetMeta] = {}
        for index, row in enumerate(universe):
            name = row.get("name")
            if not name:
                continue
            metas[name.upper()] = AssetMeta(
                name=name,
                index=index,
                sz_decimals=int(row.get("szDecimals", 0)),
                max_leverage=int(row.get("maxLeverage", 1) or 1),
            )
        self._meta = metas
        return metas

    def meta_for(self, asset: str) -> AssetMeta:
        meta = self._meta.get(asset.upper())
        if meta is None:
            raise ExchangeError(
                f"metadonnees inconnues pour {asset} — appeler load_meta() au demarrage"
            )
        return meta

    # ------------------------------------------------------- etat du compte

    def account_state(self) -> AccountState:
        """Photo du compte : la source de verite du desk.

        Trois appels : l'etat de marge, les ordres au carnet (en version
        `frontendOpenOrders`, qui seule expose les declencheurs), et le
        rapprochement des deux pour savoir quelles positions sont protegees.
        """
        state = self._info({"type": "clearinghouseState", "user": self.account_address})
        orders_raw = self._info(
            {"type": "frontendOpenOrders", "user": self.account_address}
        )

        open_orders = tuple(self._parse_order(o) for o in (orders_raw or []))
        open_orders = tuple(o for o in open_orders if o is not None)

        # Une position est protegee si un declencheur stop reduce_only existe
        # sur cet actif. C'est cette lecture, et elle seule, qui alimente I02.
        stops: dict[str, str] = {}
        for record in open_orders:
            if (
                record.intent.purpose is OrderPurpose.STOP_LOSS
                and record.status is OrderStatus.RESTING
            ):
                stops[record.intent.asset.upper()] = record.cloid

        summary = (state or {}).get("marginSummary") or {}
        equity = _dec(summary.get("accountValue"), Decimal("0")) or Decimal("0")
        used = _dec(summary.get("totalMarginUsed"), Decimal("0")) or Decimal("0")
        withdrawable = _dec((state or {}).get("withdrawable"), None)

        positions: list[Position] = []
        for row in (state or {}).get("assetPositions") or []:
            position = self._parse_position(row, stops)
            if position is not None:
                positions.append(position)

        return AccountState(
            equity_usd=equity,
            available_margin_usd=withdrawable if withdrawable is not None
            else max(equity - used, Decimal("0")),
            used_margin_usd=used,
            positions=tuple(positions),
            open_orders=open_orders,
            source="exchange",
        )

    def _parse_position(
        self, row: dict[str, Any], stops: dict[str, str]
    ) -> Position | None:
        """`szi` est signe : positif = long, negatif = short.

        Une taille nulle signifie qu'il n'y a plus de position — Hyperliquid
        laisse parfois l'entree en place. La traiter comme une position
        ouverte declencherait un stop de secours sur du vide.
        """
        pos = (row or {}).get("position") or {}
        coin = pos.get("coin")
        szi = _dec(pos.get("szi"))
        entry = _dec(pos.get("entryPx"))
        if not coin or szi is None or szi == 0 or entry is None or entry <= 0:
            return None

        side = Side.LONG if szi > 0 else Side.SHORT
        size = abs(szi)
        notional = _dec(pos.get("positionValue"))
        mark = (notional / size) if (notional and size > 0) else entry
        leverage = _dec((pos.get("leverage") or {}).get("value"), Decimal("1"))

        return Position(
            asset=coin,
            side=side,
            size=size,
            entry_price=entry,
            mark_price=mark if mark and mark > 0 else entry,
            leverage=leverage if leverage and leverage > 0 else Decimal("1"),
            unrealized_pnl_usd=_dec(pos.get("unrealizedPnl"), Decimal("0")) or Decimal("0"),
            liquidation_price=_dec(pos.get("liquidationPx")),
            protective_stop_cloid=stops.get(str(coin).upper()),
        )

    def _parse_order(self, row: dict[str, Any]) -> OrderRecord | None:
        coin = row.get("coin")
        size = _dec(row.get("sz"))
        if not coin or size is None or size <= 0:
            return None

        # "B" = bid (achat), "A" = ask (vente).
        side = Side.LONG if row.get("side") == "B" else Side.SHORT
        is_trigger = bool(row.get("isTrigger"))
        trigger_px = _dec(row.get("triggerPx"))
        order_type = str(row.get("orderType") or "").lower()

        if is_trigger and "take profit" in order_type:
            purpose = OrderPurpose.TAKE_PROFIT
        elif is_trigger:
            purpose = OrderPurpose.STOP_LOSS
        else:
            purpose = OrderPurpose.ENTRY

        cloid = row.get("cloid") or ""
        try:
            intent = OrderIntent(
                intent_id="remote",
                mandate_id="remote",
                asset=str(coin),
                side=side,
                purpose=purpose,
                size=size,
                limit_price=_dec(row.get("limitPx")) if not is_trigger else None,
                trigger_price=trigger_px if is_trigger else None,
                reduce_only=bool(row.get("reduceOnly", is_trigger)),
            )
        except ValueError as exc:
            # Un ordre qu'on ne sait pas modeliser ne doit pas faire echouer
            # toute la reconciliation : on le journalise et on l'ignore.
            log.warning("ordre distant illisible sur %s : %s", coin, exc)
            return None

        return OrderRecord(
            cloid=cloid,
            intent=intent,
            status=OrderStatus.RESTING,
            exchange_oid=int(row["oid"]) if row.get("oid") is not None else None,
        )

    def fills_since(self, ts_ms: int) -> list[Fill]:
        rows = self._info({
            "type": "userFillsByTime",
            "user": self.account_address,
            "startTime": ts_ms,
        })
        out: list[Fill] = []
        for row in rows or []:
            size, price = _dec(row.get("sz")), _dec(row.get("px"))
            coin, tid = row.get("coin"), row.get("tid")
            if not coin or size is None or price is None or size <= 0 or price <= 0:
                continue
            out.append(Fill(
                fill_id=str(tid or row.get("hash") or f"{coin}-{row.get('time')}"),
                cloid=row.get("cloid"),
                asset=str(coin),
                side=Side.LONG if row.get("side") == "B" else Side.SHORT,
                size=size,
                price=price,
                fee_usd=_dec(row.get("fee"), Decimal("0")) or Decimal("0"),
                is_maker=not bool(row.get("crossed", True)),
                ts_ms=int(row.get("time") or now_ms()),
            ))
        return out

    # --------------------------------------------------------------- ordres

    def place(self, intent: OrderIntent) -> OrderRecord:
        """Signe et envoie un ordre. Seul point d'ecriture vers l'exchange."""
        if self._key is None:
            raise ExchangeError("aucune cle de signature : client en lecture seule")

        meta = self.meta_for(intent.asset)
        wire = order_to_wire(intent, meta)
        action = place_action([wire])

        nonce = self.nonces.next_nonce()
        assert_nonce_window(nonce)
        signature = sign_l1_action(
            self._key, action, nonce,
            is_mainnet=self.is_mainnet, vault_address=self.vault_address,
        )
        body = exchange_request(action, signature, nonce,
                                vault_address=self.vault_address)

        if not self.budget.can_spend(1, exchange=True):
            raise ExchangeError("budget de requetes epuise cote exchange")
        self.budget.spend(1, exchange=True)

        raw = self.transport(f"{self.base}/exchange", body, 10.0)
        return self._parse_place_response(raw, intent, make_cloid(intent))

    def _parse_place_response(
        self, raw: Any, intent: OrderIntent, cloid: str
    ) -> OrderRecord:
        """Traduit la reponse en `OrderRecord`.

        Hyperliquid renvoie `status: "ok"` au niveau enveloppe meme quand
        l'ordre lui-meme est refuse : le vrai resultat est dans
        `response.data.statuses[0]`. Se fier a l'enveloppe seule ferait croire
        a un succes sur un ordre jamais cree.
        """
        if not isinstance(raw, dict):
            raise ExchangeError(f"reponse inattendue : {type(raw).__name__}")

        if raw.get("status") != "ok":
            raise ExchangeRejected(str(raw.get("response") or raw)[:300])

        statuses = (((raw.get("response") or {}).get("data") or {}).get("statuses")) or []
        if not statuses:
            raise ExchangeError("reponse sans statut d'ordre")

        status = statuses[0]
        if not isinstance(status, dict):
            raise ExchangeError(f"statut d'ordre illisible : {status!r}")

        if "error" in status:
            return OrderRecord(cloid=cloid, intent=intent,
                               status=OrderStatus.REJECTED,
                               error=str(status["error"])[:300])

        if "resting" in status:
            resting = status["resting"] or {}
            return OrderRecord(
                cloid=resting.get("cloid") or cloid, intent=intent,
                status=OrderStatus.RESTING,
                exchange_oid=int(resting["oid"]) if resting.get("oid") else None,
            )

        if "filled" in status:
            filled = status["filled"] or {}
            size = _dec(filled.get("totalSz"), Decimal("0")) or Decimal("0")
            return OrderRecord(
                cloid=filled.get("cloid") or cloid, intent=intent,
                status=OrderStatus.FILLED if size >= intent.size else OrderStatus.PARTIAL,
                exchange_oid=int(filled["oid"]) if filled.get("oid") else None,
                filled_size=size, avg_price=_dec(filled.get("avgPx")),
            )

        # Statut non reconnu : on ne devine pas. `UNKNOWN` force la
        # reconciliation, ce qui est le comportement sur.
        log.warning("statut d'ordre non reconnu : %s", status)
        return OrderRecord(cloid=cloid, intent=intent, status=OrderStatus.UNKNOWN,
                           error=f"statut non reconnu : {list(status)}")

    def cancel(self, cloid: str) -> bool:
        if self._key is None:
            raise ExchangeError("aucune cle de signature : client en lecture seule")

        # L'annulation par cloid exige l'index de l'actif, qu'on retrouve via
        # l'ordre au carnet — c'est aussi la garantie qu'il existe encore.
        target = next(
            (o for o in self.account_state().open_orders if o.cloid == cloid), None
        )
        if target is None:
            return False

        meta = self.meta_for(target.intent.asset)
        action = cancel_action([{"asset": meta.index, "cloid": cloid}])
        nonce = self.nonces.next_nonce()
        assert_nonce_window(nonce)
        signature = sign_l1_action(
            self._key, action, nonce,
            is_mainnet=self.is_mainnet, vault_address=self.vault_address,
        )
        body = exchange_request(action, signature, nonce,
                                vault_address=self.vault_address)

        self.budget.spend(1, exchange=True)
        raw = self.transport(f"{self.base}/exchange", body, 10.0)
        return isinstance(raw, dict) and raw.get("status") == "ok"
