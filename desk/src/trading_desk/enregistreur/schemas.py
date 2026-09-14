"""Schemas Parquet des flux Hyperliquid.

Trois principes, et le premier commande les deux autres.

**On enregistre le message brut, pas une interpretation.** Les contrats du
desk (`Trade`, `BookSnapshot`) valident et convertissent — ils perdent au
passage `users`, `tid`, `hash`, `n`. Or `users` est precisement ce qui rendra
detectables les liquidations et les portefeuilles suivis, et on ne saura ce
qu'on veut en faire que dans plusieurs semaines. Un enregistrement qui
prejuge de l'analyse fait perdre les donnees qu'on n'avait pas prevu de
vouloir.

**Les prix sont en `float64`, pas en `Decimal`.** Le depot travaille en
Decimal partout ailleurs et c'est delibere : sur une position, une erreur
d'arrondi devient de l'argent. Ici, non — ces fichiers ne servent qu'a
l'analyse. Un `float64` porte 15 a 16 chiffres significatifs quand un prix
crypto en demande une dizaine, et `decimal128` triplerait la taille pour une
precision dont aucun calcul de correlation n'a l'usage.

**Le carnet est en format LONG** — une ligne par niveau plutot qu'une ligne
de 80 colonnes. Plus verbeux a l'ecriture, mais Parquet encode par colonne :
`ts_ms`, `coin` et `side` se compressent en quasi-rien sur 40 lignes
identiques, et une requete « profondeur au-dela du niveau 5 » devient un
filtre au lieu d'une gymnastique de colonnes.
"""

from __future__ import annotations

import pyarrow as pa

# `ts_ms` est l'horodatage HYPERLIQUID quand le message en porte un, et celui
# de reception sinon. `recu_ms` est toujours celui de reception : leur ecart
# mesure la latence du flux, qui est elle-meme un signal de stress du marche.
TRADES = pa.schema([
    ("ts_ms", pa.int64()),
    ("recu_ms", pa.int64()),
    ("coin", pa.string()),
    ("px", pa.float64()),
    ("sz", pa.float64()),
    ("side", pa.string()),      # "A" = agressseur vendeur, "B" = acheteur
    ("tid", pa.int64()),
    ("hash", pa.string()),
    ("acheteur", pa.string()),  # users[0]
    ("vendeur", pa.string()),   # users[1]
])

BOOK = pa.schema([
    ("ts_ms", pa.int64()),
    ("recu_ms", pa.int64()),
    ("coin", pa.string()),
    ("cote", pa.int8()),        # 0 = bid, 1 = ask
    ("niveau", pa.int8()),      # 0 = meilleur
    ("px", pa.float64()),
    ("sz", pa.float64()),
    ("n", pa.int32()),          # nombre d'ordres agreges sur ce niveau
])

BBO = pa.schema([
    ("ts_ms", pa.int64()),
    ("recu_ms", pa.int64()),
    ("coin", pa.string()),
    ("bid_px", pa.float64()), ("bid_sz", pa.float64()), ("bid_n", pa.int32()),
    ("ask_px", pa.float64()), ("ask_sz", pa.float64()), ("ask_n", pa.int32()),
])

CTX = pa.schema([
    ("ts_ms", pa.int64()),
    ("recu_ms", pa.int64()),
    ("coin", pa.string()),
    ("funding", pa.float64()),
    ("open_interest", pa.float64()),
    ("mark_px", pa.float64()),
    ("mid_px", pa.float64()),
    ("oracle_px", pa.float64()),
    ("premium", pa.float64()),
    ("day_ntl_vlm", pa.float64()),
    ("day_base_vlm", pa.float64()),
    ("prev_day_px", pa.float64()),
    ("impact_bid", pa.float64()),
    ("impact_ask", pa.float64()),
])

SCHEMAS: dict[str, pa.Schema] = {
    "trades": TRADES, "book": BOOK, "bbo": BBO, "ctx": CTX,
}

# Le canal WebSocket d'ou vient chaque flux. Separe du nom de flux parce que
# le nom de fichier ne doit pas changer si Hyperliquid renomme un canal.
CANAUX = {
    "trades": "trades", "l2Book": "book", "bbo": "bbo", "activeAssetCtx": "ctx",
}


def _f(valeur: object) -> float | None:
    """Un nombre, ou `None`. Jamais une exception, jamais un zero invente.

    Un champ absent ou illisible doit rester un trou visible dans les
    donnees : un zero silencieux se melerait aux vraies valeurs et fausserait
    toute moyenne calculee dessus des semaines plus tard.
    """
    if valeur is None:
        return None
    try:
        return float(valeur)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _i(valeur: object) -> int | None:
    if valeur is None:
        return None
    try:
        return int(valeur)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def lignes(canal: str, data: object, recu_ms: int) -> tuple[str, list[dict]]:
    """Convertit un message brut en lignes de son flux.

    Renvoie `("", [])` pour tout ce qui n'est pas reconnu — un canal inconnu
    ou un message malforme ne doit jamais interrompre l'enregistrement des
    autres.
    """
    flux = CANAUX.get(canal, "")
    if not flux:
        return "", []

    if flux == "trades" and isinstance(data, list):
        out = []
        for t in data:
            if not isinstance(t, dict):
                continue
            users = t.get("users") or []
            out.append({
                "ts_ms": _i(t.get("time")) or recu_ms, "recu_ms": recu_ms,
                "coin": t.get("coin"), "px": _f(t.get("px")), "sz": _f(t.get("sz")),
                "side": t.get("side"), "tid": _i(t.get("tid")),
                "hash": t.get("hash"),
                "acheteur": users[0] if len(users) > 0 else None,
                "vendeur": users[1] if len(users) > 1 else None,
            })
        return flux, out

    if flux == "book" and isinstance(data, dict):
        ts = _i(data.get("time")) or recu_ms
        coin = data.get("coin")
        niveaux = data.get("levels") or []
        out = []
        for cote, cote_niveaux in enumerate(niveaux[:2]):
            for rang, niv in enumerate(cote_niveaux or []):
                if not isinstance(niv, dict):
                    continue
                out.append({
                    "ts_ms": ts, "recu_ms": recu_ms, "coin": coin,
                    "cote": cote, "niveau": rang,
                    "px": _f(niv.get("px")), "sz": _f(niv.get("sz")),
                    "n": _i(niv.get("n")),
                })
        return flux, out

    if flux == "bbo" and isinstance(data, dict):
        paire = data.get("bbo") or []
        bid = paire[0] if len(paire) > 0 and isinstance(paire[0], dict) else {}
        ask = paire[1] if len(paire) > 1 and isinstance(paire[1], dict) else {}
        return flux, [{
            "ts_ms": _i(data.get("time")) or recu_ms, "recu_ms": recu_ms,
            "coin": data.get("coin"),
            "bid_px": _f(bid.get("px")), "bid_sz": _f(bid.get("sz")),
            "bid_n": _i(bid.get("n")),
            "ask_px": _f(ask.get("px")), "ask_sz": _f(ask.get("sz")),
            "ask_n": _i(ask.get("n")),
        }]

    if flux == "ctx" and isinstance(data, dict):
        ctx = data.get("ctx")
        if not isinstance(ctx, dict):
            return flux, []
        impact = ctx.get("impactPxs") or []
        return flux, [{
            # `activeAssetCtx` ne porte pas d'horodatage : la reception EST
            # l'horodatage, et le dire ici evite qu'on le cherche plus tard.
            "ts_ms": recu_ms, "recu_ms": recu_ms, "coin": data.get("coin"),
            "funding": _f(ctx.get("funding")),
            "open_interest": _f(ctx.get("openInterest")),
            "mark_px": _f(ctx.get("markPx")), "mid_px": _f(ctx.get("midPx")),
            "oracle_px": _f(ctx.get("oraclePx")), "premium": _f(ctx.get("premium")),
            "day_ntl_vlm": _f(ctx.get("dayNtlVlm")),
            "day_base_vlm": _f(ctx.get("dayBaseVlm")),
            "prev_day_px": _f(ctx.get("prevDayPx")),
            "impact_bid": _f(impact[0]) if len(impact) > 0 else None,
            "impact_ask": _f(impact[1]) if len(impact) > 1 else None,
        }]

    return flux, []
