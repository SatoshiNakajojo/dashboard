"""Identifiant client d'ordre (cloid) deterministe.

Parade a l'angle mort A-02 : la reponse HTTP se perd, le desk croit avoir
echoue, il renvoie, et la position double.

Un cloid Hyperliquid est un entier 128 bits en hexadecimal ("0x" + 32 chiffres).
On le derive du *contenu* de l'intention, pas d'un compteur ni d'un aleatoire :
deux tentatives d'envoi de la meme intention produisent donc le meme cloid, et
l'exchange dedoublonne pour nous.

Consequence a garder en tete : deux entrees reellement distinctes sur le meme
actif dans le meme mandat doivent differer par `intent_id`. C'est ce champ qui
porte l'intention d'unicite, et c'est au constructeur de l'intention de le
rendre unique (compteur de sequence, pas horodatage).
"""

from __future__ import annotations

import hashlib
import re

from ..contracts.orders import OrderIntent

_CLOID_RE = re.compile(r"^0x[0-9a-f]{32}$")


def make_cloid(intent: OrderIntent) -> str:
    """Derive le cloid des champs qui definissent l'identite de l'ordre.

    `created_at_ms` est volontairement EXCLU : sinon un renvoi apres un timeout
    produirait un cloid different et l'idempotence disparaitrait exactement au
    moment ou on en a besoin.
    """
    parts = (
        "v1",
        intent.mandate_id,
        intent.intent_id,
        intent.asset.upper(),
        intent.side.value,
        intent.purpose.value,
        format(intent.size.normalize(), "f"),
        format(intent.limit_price.normalize(), "f") if intent.limit_price else "-",
        format(intent.trigger_price.normalize(), "f") if intent.trigger_price else "-",
        "ro" if intent.reduce_only else "rw",
    )
    digest = hashlib.blake2b("|".join(parts).encode("utf-8"), digest_size=16).hexdigest()
    return f"0x{digest}"


def is_valid_cloid(value: str) -> bool:
    return bool(_CLOID_RE.match(value or ""))
