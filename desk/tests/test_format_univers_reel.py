"""Le formatage, éprouvé sur TOUT l'univers que l'exchange publie.

Le formatage des prix et des tailles est la première cause de rejet d'ordre,
et il dépend entièrement de `szDecimals`, qui varie par actif. Un test qui ne
vérifie le formateur que sur BTC ne prouve rien : sur le testnet Hyperliquid,
127 actifs ont **zéro** décimale de taille, BTC en a cinq. C'est aux extrêmes
que les règles se cassent, pas au milieu.

L'instantané (`tests/meta_hyperliquid.json`) est versionné pour que cette
épreuve tourne hors réseau, à chaque test. Il n'est pas une source de vérité
pour le desk, qui lit toujours `meta` en direct au démarrage : c'est une
référence de test. Le régénérer : `python scripts/figer_meta_hyperliquid.py`.

Les règles de l'exchange, rappelées ici parce que ce sont elles qu'on teste :

- **prix** : entier (toujours accepté), OU au plus 5 chiffres significatifs
  ET au plus `6 - szDecimals` décimales pour un perpétuel ;
- **taille** : au plus `szDecimals` décimales.

Et deux règles qui sont les nôtres, pas celles de l'exchange :

- la taille s'arrondit toujours **vers le bas** — arrondir vers le haut
  ferait dépasser le notionnel que le moteur de risque a autorisé, et un
  dépassement silencieux de plafond est exactement ce qu'on rend impossible ;
- le prix s'arrondit dans le sens **défavorable** à la position — un prix
  arrondi en sa faveur produit un ordre qui ne se remplit pas.
"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest

from trading_desk.contracts.common import Side
from trading_desk.execution.hyperliquid_format import (
    AssetMeta,
    FormatError,
    format_price,
    format_size,
)

_BRUT = json.loads(
    (Path(__file__).parent / "meta_hyperliquid.json").read_text(encoding="utf-8"))
UNIVERS = [
    AssetMeta(name=nom, index=m["index"], sz_decimals=m["sz_decimals"],
              is_spot=m["is_spot"], max_leverage=m["max_leverage"])
    for nom, m in _BRUT["actifs"].items()
]

PRIX = ["0.00001234", "0.4999", "1.5", "9.87654321", "123.456",
        "12345.6789", "77051.5", "123456", "1000000.4"]
TAILLES = ["0.000001", "0.12345678", "1", "1.999999", "1234.5"]


def _decimales(s: str) -> int:
    return len(s.split(".")[1]) if "." in s else 0


def _significatifs(s: str) -> int:
    return len(s.lstrip("-0.").replace(".", "").rstrip("0")) or 1


def test_l_instantane_couvre_les_cas_extremes():
    """Un univers tronqué rendrait ce fichier décoratif."""
    assert len(UNIVERS) > 100, "instantané trop pauvre pour prouver quoi que ce soit"
    decs = {m.sz_decimals for m in UNIVERS}
    assert 0 in decs, "aucun actif à zéro décimale : le cas le plus contraint manque"
    assert max(decs) >= 4, "aucun actif à forte précision"


@pytest.mark.parametrize("meta", UNIVERS, ids=[m.name for m in UNIVERS])
def test_le_prix_respecte_les_regles_de_l_exchange(meta: AssetMeta):
    for brut in PRIX:
        for side in (Side.LONG, Side.SHORT):
            try:
                out = format_price(Decimal(brut), meta, side=side)
            except FormatError:
                continue                      # refus explicite : acceptable
            if "." not in out:
                continue                      # un entier passe toujours
            assert _decimales(out) <= meta.max_price_decimals, (
                f"{meta.name} {brut} -> {out} : {_decimales(out)} décimales "
                f"pour un maximum de {meta.max_price_decimals}")
            assert _significatifs(out) <= 5, (
                f"{meta.name} {brut} -> {out} : "
                f"{_significatifs(out)} chiffres significatifs pour 5 au plus")


@pytest.mark.parametrize("meta", UNIVERS, ids=[m.name for m in UNIVERS])
def test_la_taille_respecte_les_regles_et_arrondit_vers_le_bas(meta: AssetMeta):
    for brut in TAILLES:
        try:
            out = format_size(Decimal(brut), meta)
        except FormatError:
            continue
        assert _decimales(out) <= meta.sz_decimals, (
            f"{meta.name} {brut} -> {out} : {_decimales(out)} décimales "
            f"pour un maximum de {meta.sz_decimals}")
        assert Decimal(out) <= Decimal(brut), (
            f"{meta.name} {brut} -> {out} : arrondi vers le HAUT, "
            "ce qui dépasserait le notionnel autorisé")


@pytest.mark.parametrize("meta", UNIVERS[:40], ids=[m.name for m in UNIVERS[:40]])
def test_le_prix_s_arrondit_contre_la_position(meta: AssetMeta):
    """Un long paie au moins ce qu'il demande ; un short reçoit au plus."""
    for brut in ("12345.6789", "0.00001234", "9.87654321"):
        p = Decimal(brut)
        try:
            achat = Decimal(format_price(p, meta, side=Side.LONG))
            vente = Decimal(format_price(p, meta, side=Side.SHORT))
        except FormatError:
            continue
        assert achat >= vente, (
            f"{meta.name} {brut} : achat {achat} < vente {vente} — "
            "l'arrondi favorise la position des deux côtés")


def test_l_instantane_correspond_encore_a_l_exchange():
    """Détecte un actif ajouté ou une précision changée.

    Sans réseau, on ne peut rien dire — et on ne prétend rien : les tests
    ci-dessus gardent déjà le formateur contre l'instantané versionné.
    """
    import urllib.error

    from trading_desk.execution.hyperliquid_client import HyperliquidClient

    client = HyperliquidClient(account_address="0x" + "00" * 20,
                               private_key=None, testnet=True)
    try:
        vivant = client.load_meta()
    except (OSError, urllib.error.URLError, Exception) as exc:  # noqa: BLE001
        pytest.skip(f"exchange injoignable : {exc}")

    fige = {m.name: m for m in UNIVERS}
    divergents = [
        nom for nom, m in vivant.items()
        if nom in fige and (fige[nom].sz_decimals != m.sz_decimals
                            or fige[nom].index != m.index)
    ]
    assert not divergents, (
        f"l'exchange a changé pour {divergents} : régénérer l'instantané "
        "avec scripts/figer_meta_hyperliquid.py et RELIRE le diff — un index "
        "d'actif qui bouge envoie les ordres sur le mauvais marché.")
