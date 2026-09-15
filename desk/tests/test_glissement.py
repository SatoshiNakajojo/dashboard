"""L'écart entre le prix décidé et le prix obtenu.

Le modèle de coûts facture 15 bps l'aller-retour — 9 de frais taker, 6 de
glissement — et `costs.py` dit lui-même que c'est une hypothèse : « en
backtest sur bougies, on ne voit pas le carnet : cette constante en tient
lieu ». Elle n'avait jamais été confrontée à une exécution.

Ce fichier verrouille les trois choses qui, en cassant, rendraient la mesure
trompeuse plutôt qu'absente — ce qui est pire :

- le SIGNE, parce qu'un glissement dont le signe s'inverse transformerait un
  coût en amélioration et validerait une stratégie qui perd ;
- la SÉPARATION maker/taker, parce qu'un ordre passif est servi au mieux à sa
  limite et que les moyenner donne un coût flatteur ;
- le fait que la mesure ne puisse JAMAIS faire échouer un ordre.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.contracts.common import EntryStyle, Side
from trading_desk.contracts.orders import (
    OrderIntent,
    OrderPurpose,
    OrderRecord,
    OrderStatus,
)
from trading_desk.execution.glissement import ecart_bps, mesurer
from trading_desk.storage import SqliteStore


def _intent(side=Side.LONG, prix="100", style=EntryStyle.LIMIT_PASSIVE):
    return OrderIntent(
        intent_id="i1", mandate_id="m1", asset="BTC", side=side,
        purpose=OrderPurpose.ENTRY, size=Decimal("1"),
        limit_price=Decimal(prix), style=style,
    )


def _record(prix="100", taille="1", cloid="c1"):
    return OrderRecord(
        cloid=cloid, intent=_intent(), status=OrderStatus.FILLED,
        filled_size=Decimal(taille), avg_price=Decimal(prix),
    )


# ───────────────────────────────────────────────────────────── le signe

def test_un_positif_est_toujours_un_cout():
    """Le signe ne se devine pas au lecteur : il est dans le calcul.

    Acheter au-dessus du prix décidé coûte. Vendre en dessous coûte aussi —
    et c'est là que l'intuition se trompe, parce que le prix a *baissé*.
    """
    assert ecart_bps(Side.LONG, Decimal("100"), Decimal("101")) == pytest.approx(100)
    assert ecart_bps(Side.SHORT, Decimal("100"), Decimal("99")) == pytest.approx(100)


def test_un_negatif_est_une_amelioration_de_prix():
    """Elle arrive, et elle doit se voir : un ordre passif servi mieux que sa
    limite est exactement ce qu'on espère d'un ordre passif."""
    assert ecart_bps(Side.LONG, Decimal("100"), Decimal("99")) == pytest.approx(-100)
    assert ecart_bps(Side.SHORT, Decimal("100"), Decimal("101")) == pytest.approx(-100)


def test_un_prix_decide_nul_ne_rend_pas_l_infini():
    assert ecart_bps(Side.LONG, Decimal("0"), Decimal("100")) == 0.0


# ─────────────────────────────────────────────── ce qui n'est pas mesurable

@pytest.mark.parametrize("pourquoi,intent,record", [
    ("pas de prix limite", OrderIntent(
        intent_id="i", mandate_id="m", asset="BTC", side=Side.LONG,
        purpose=OrderPurpose.ENTRY, size=Decimal("1"), limit_price=None,
        style=EntryStyle.MARKET_IOC), _record()),
    ("aucun fill", _intent(), OrderRecord(
        cloid="c", intent=_intent(), status=OrderStatus.RESTING,
        filled_size=Decimal("0"), avg_price=Decimal("100"))),
    ("pas de prix moyen", _intent(), OrderRecord(
        cloid="c", intent=_intent(), status=OrderStatus.FILLED,
        filled_size=Decimal("1"), avg_price=None)),
])
def test_ce_qui_n_a_pas_de_sens_rend_None_et_pas_zero(pourquoi, intent, record):
    """Zéro se lirait « exécuté au prix décidé », ce qui est une mesure. `None`
    dit « il n'y a rien à mesurer », ce qui est une information différente et
    qui ne doit pas entrer dans une médiane."""
    assert mesurer(intent, record) is None, pourquoi


# ────────────────────────────────────────── maker et taker ne se mélangent pas

def test_le_style_passif_est_marque_comme_tel():
    """Un ordre passif servi l'est au mieux à sa limite : son glissement est
    nul ou négatif par construction. Le confondre avec un ordre agressif
    donnerait un coût moyen qui ne correspond à aucune exécution réelle."""
    g = mesurer(_intent(style=EntryStyle.LIMIT_PASSIVE), _record("99.99"))
    assert g is not None and g.passif is True
    for style in (EntryStyle.MARKET_IOC, EntryStyle.LIMIT_AGGRESSIVE):
        g2 = mesurer(_intent(style=style), _record("100.05"))
        assert g2 is not None and g2.passif is False, style


def test_le_panneau_ne_melange_jamais_les_deux():
    from trading_desk.api import recherche

    s = SqliteStore(":memory:")
    for i, (bps, maker) in enumerate([(8.0, 0), (6.0, 0), (10.0, 0),
                                      (-1.0, 1), (-2.0, 1)]):
        s.write_glissement({
            "cloid": f"c{i}", "ts_ms": i, "asset": "BTC", "side": "LONG",
            "purpose": "ENTRY", "style": "x", "size": "1",
            "prix_decide": "100", "prix_obtenu": "100", "bps": bps,
            "passif": maker})
    g = recherche.glissement(s)
    lots = {x["nom"]: x for x in g["lots"]}
    assert lots["agressif"]["n"] == 3 and lots["passif"]["n"] == 2
    assert lots["agressif"]["mediane"] == 8.0
    assert lots["passif"]["ameliorations"] == 2
    # Le verdict porte sur les AGRESSIFS : c'est eux que `slippage_bps` modelise.
    assert g["verdict"]["mesure_bps"] == 8.0


def test_le_verdict_dit_dans_QUEL_SENS_le_modele_se_trompe():
    """Un modèle optimiste sous-estime le coût : tout ce qui a été validé avec
    lui est flatté d'autant. C'est le sens qui inquiète, et l'écran doit le
    distinguer d'un modèle conservateur."""
    from trading_desk.api import recherche

    for bps, attendu in ((9.0, True), (1.0, False)):
        s = SqliteStore(":memory:")
        s.write_glissement({
            "cloid": "c", "ts_ms": 1, "asset": "BTC", "side": "LONG",
            "purpose": "ENTRY", "style": "x", "size": "1",
            "prix_decide": "100", "prix_obtenu": "100", "bps": bps, "passif": 0})
        assert recherche.glissement(s)["verdict"]["optimiste"] is attendu


def test_l_aller_retour_suppose_vaut_bien_quinze_bps():
    """Le chiffre publié dans tout le dépôt. S'il change ici sans changer là,
    deux parties de la documentation se contrediront en silence."""
    from trading_desk.api import recherche

    assert recherche.glissement(None)["aller_retour_suppose_bps"] == pytest.approx(15.0)


# ──────────────────────────────────── la métrologie ne casse jamais le desk

def test_un_store_qui_echoue_ne_fait_pas_echouer_l_ordre():
    """Un desk qui refuse d'envoyer parce que sa métrologie a hoqueté serait
    un desk cassé par son propre tableau de bord."""
    from trading_desk.execution.order_manager import OrderManager

    class _StoreCasse:
        def journal(self, *a, **k):
            return "x"

        def write_glissement(self, g):
            raise RuntimeError("disque plein")

    class _Ex:
        pass

    om = OrderManager(_Ex(), store=_StoreCasse())
    om._mesurer_le_glissement(_intent(), _record("100.05"))   # ne doit pas lever


def test_un_meme_fill_n_est_mesure_qu_une_fois():
    """Une réconciliation qui repasse sur un ordre déjà vu ne doit pas
    dupliquer la mesure : la médiane compterait deux fois le même fill."""
    s = SqliteStore(":memory:")
    ligne = {"cloid": "meme", "ts_ms": 1, "asset": "BTC", "side": "LONG",
             "purpose": "ENTRY", "style": "x", "size": "1",
             "prix_decide": "100", "prix_obtenu": "100.05", "bps": 5.0,
             "passif": 0}
    s.write_glissement(ligne)
    s.write_glissement(ligne)
    assert len(s.recent_glissements(10)) == 1


def test_le_panneau_dit_quoi_faire_quand_rien_n_a_ete_execute():
    """Un artefact absent est une information, pas une panne — et ici il faut
    dire ce que le modèle suppose, pour que le vide soit comparable."""
    from trading_desk.api import recherche

    g = recherche.glissement(SqliteStore(":memory:"))
    assert g["disponible"] is False
    assert "PAPER" in g["raison"]
    assert g["suppose_bps"] == 3.0
