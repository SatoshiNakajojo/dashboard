"""Formatage des prix et des tailles pour Hyperliquid.

Ce module minuscule est la premiere cause de rejets d'ordres, et le genre de
detail qu'on decouvre en production avec un message d'erreur laconique
("Price must be divisible by tick size"). Autant l'ecrire et le tester ici.

Les regles de l'exchange :

- **Prix** : au plus 5 chiffres significatifs, ET au plus
  `MAX_DECIMALS - szDecimals` decimales, ou `MAX_DECIMALS` vaut 6 pour les
  perpetuels et 8 pour le spot. Un prix entier est toujours accepte, quel que
  soit son nombre de chiffres significatifs — `123456` passe alors que
  `12345.6` est refuse.
- **Taille** : arrondie a `szDecimals` decimales pour l'actif concerne. Avec
  `szDecimals = 3`, `1.001` est valide, `1.0001` ne l'est pas.
- `szDecimals` varie par actif et se lit dans la reponse `meta` de l'API Info.

Deux choix de prudence dans l'arrondi :

1. **La taille s'arrondit toujours vers le bas.** Arrondir vers le haut
   ferait depasser le notionnel que le moteur de risque a autorise — un
   depassement silencieux de plafond est exactement ce qu'on cherche a rendre
   impossible.
2. **Le prix s'arrondit dans le sens defavorable** a la position. Un prix
   arrondi en sa faveur produit un ordre qui ne se remplit pas, ou un backtest
   plus flatteur que la realite.
"""

from __future__ import annotations

from decimal import ROUND_DOWN, ROUND_FLOOR, ROUND_CEILING, Decimal

from pydantic import Field

from ..contracts.common import Frozen, Side

MAX_DECIMALS_PERP = 6
MAX_DECIMALS_SPOT = 8
MAX_SIGNIFICANT_FIGURES = 5


class AssetMeta(Frozen):
    """Metadonnees d'un actif, lues dans la reponse `meta` de l'API Info.

    `index` est la position de l'actif dans le tableau `universe` : c'est ce
    que le format filaire attend dans le champ `a`, pas le nom de l'actif.
    """

    name: str
    index: int = Field(ge=0)
    sz_decimals: int = Field(ge=0, le=8)
    is_spot: bool = False
    max_leverage: int = Field(default=1, ge=1)

    @property
    def max_price_decimals(self) -> int:
        base = MAX_DECIMALS_SPOT if self.is_spot else MAX_DECIMALS_PERP
        return max(0, base - self.sz_decimals)


class FormatError(ValueError):
    """Valeur inrepresentable pour cet actif. Levee plutot que corrigee en
    silence : un ordre qu'on ne sait pas formater ne doit pas partir."""


def format_size(size: Decimal, meta: AssetMeta) -> str:
    """Arrondit une taille a `szDecimals`, toujours vers le bas.

    Vers le bas parce qu'arrondir vers le haut ferait depasser le notionnel
    autorise par le moteur de risque.
    """
    if size <= 0:
        raise FormatError(f"taille non positive : {size}")
    quantum = Decimal(1).scaleb(-meta.sz_decimals)
    rounded = size.quantize(quantum, rounding=ROUND_DOWN)
    if rounded <= 0:
        raise FormatError(
            f"taille {size} trop petite pour {meta.name} "
            f"(szDecimals={meta.sz_decimals}) : arrondie a zero"
        )
    return _trim(rounded)


def format_price(price: Decimal, meta: AssetMeta, *, side: Side | None = None) -> str:
    """Ramene un prix aux contraintes de l'exchange.

    `side` choisit le sens d'arrondi : defavorable a la position. Un achat
    arrondit vers le haut, une vente vers le bas. Sans `side`, arrondi au plus
    proche — a reserver aux prix informatifs, jamais a un ordre.
    """
    if price <= 0:
        raise FormatError(f"prix non positif : {price}")

    rounding = None
    if side is Side.LONG:
        rounding = ROUND_CEILING
    elif side is Side.SHORT:
        rounding = ROUND_FLOOR

    # 1. Plafond de decimales, propre a l'actif.
    quantum = Decimal(1).scaleb(-meta.max_price_decimals)
    out = price.quantize(quantum, rounding=rounding) if rounding else price.quantize(quantum)

    # 2. Plafond de chiffres significatifs — sauf pour un entier, toujours
    #    accepte quel que soit le nombre de chiffres.
    if out == out.to_integral_value():
        return _trim(out.to_integral_value())

    digits_before = len(out.to_integral_value().as_tuple().digits) if out >= 1 else 0
    allowed_decimals = max(0, MAX_SIGNIFICANT_FIGURES - digits_before)

    if out < 1:
        # Sous 1, les zeros de tete ne comptent pas comme significatifs :
        # 0.0012345 a cinq chiffres significatifs, pas sept.
        exponent = out.adjusted()                       # -3 pour 0.0012345
        allowed_decimals = MAX_SIGNIFICANT_FIGURES - 1 - exponent

    allowed_decimals = min(allowed_decimals, meta.max_price_decimals)
    quantum = Decimal(1).scaleb(-allowed_decimals)
    out = out.quantize(quantum, rounding=rounding) if rounding else out.quantize(quantum)

    if out <= 0:
        raise FormatError(f"prix {price} arrondi a zero pour {meta.name}")
    return _trim(out)


def _trim(value: Decimal) -> str:
    """Chaine sans zeros de queue.

    L'API refuse `p` et `s` avec des zeros terminaux : "0.500" est rejete la
    ou "0.5" passe. Detail invisible qui fait echouer un ordre par ailleurs
    parfaitement valide.
    """
    text = format(value.normalize(), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def is_valid_price(price: str, meta: AssetMeta) -> bool:
    """Verifie qu'une chaine respecte les contraintes. Utilise par les tests
    et par une derniere verification avant signature."""
    try:
        value = Decimal(price)
    except (ArithmeticError, ValueError):
        return False
    if value <= 0:
        return False
    if value == value.to_integral_value():
        return True

    exponent = -value.as_tuple().exponent
    if exponent > meta.max_price_decimals:
        return False

    significant = len(value.normalize().as_tuple().digits)
    return significant <= MAX_SIGNIFICANT_FIGURES
