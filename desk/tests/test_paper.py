"""Tests du moteur papier — chacun défend une propriété d'honnêteté.

Un moteur papier est facile à rendre menteur, et le mensonge ne se voit pas :
il produit une courbe plausible qui ne survit pas au premier ordre réel. Ces
tests existent pour que chaque raccourci tentant soit interdit par du code
qui échoue si on le prend.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.backtest.costs import FRICTIONLESS, CostModel
from trading_desk.contracts.common import EntryStyle, Side, now_ms
from trading_desk.contracts.market import BookLevel, BookSnapshot, MarkPrice, Trade
from trading_desk.contracts.orders import OrderIntent, OrderPurpose, OrderStatus
from trading_desk.execution.exchange import ExchangeRejected
from trading_desk.execution.paper import PaperExchange


def carnet(asset="BTC", *, mid=Decimal("60000"), pas=Decimal("10"),
           taille=Decimal("1"), niveaux=5, tailles=None, ts_ms=None) -> BookSnapshot:
    """Un carnet symétrique. `tailles` permet un carnet à touche mince.

    Le défaut (niveaux égaux) a une conséquence qu'il vaut mieux connaître :
    le plafond de 10 % de la profondeur totale garde l'ordre à l'intérieur du
    premier niveau, qui en pèse 20 %. La traversée ne devient visible que sur
    un carnet réaliste, dont la touche est mince — d'où `tailles`.
    """
    t = tailles or [taille] * niveaux
    return BookSnapshot(
        asset=asset,
        bids=tuple(BookLevel(price=mid - pas * (i + 1), size=x)
                   for i, x in enumerate(t)),
        asks=tuple(BookLevel(price=mid + pas * (i + 1), size=x)
                   for i, x in enumerate(t)),
        ts_ms=ts_ms if ts_ms is not None else now_ms(),
    )


def entree(asset="BTC", side=Side.LONG, size=Decimal("0.1"),
           style=EntryStyle.MARKET_IOC, limite=None, intent_id="e1"):
    return OrderIntent(
        intent_id=intent_id, mandate_id="m1", asset=asset, side=side,
        purpose=OrderPurpose.ENTRY, size=size, style=style,
        limit_price=limite if limite is not None
        else (None if style is EntryStyle.MARKET_IOC else Decimal("60010")),
    )


@pytest.fixture
def px() -> PaperExchange:
    p = PaperExchange(equity_usd=Decimal("10000"), costs=FRICTIONLESS)
    p.on_book(carnet())
    return p


# --------------------------------------------------------------------------
#  On traverse le carnet — le mid est un mensonge
# --------------------------------------------------------------------------

def test_un_ordre_agressif_ne_remplit_pas_au_mid(px):
    """Le prix de fill est la moyenne pondérée de ce qu'on a mangé.

    Remplir au mid est le premier raccourci d'un moteur papier, et il offre
    gratuitement la moitié du spread à chaque aller-retour.
    """
    r = px.place(entree(size=Decimal("0.5")))
    assert r.status is OrderStatus.FILLED
    # Un achat mange les ASKS, qui commencent à 60010. Jamais 60000.
    assert r.avg_price >= Decimal("60010"), "un achat ne peut pas être servi au mid"


def test_une_grosse_taille_paie_les_niveaux_suivants():
    """Traverser plus profond coûte plus cher. C'est tout l'intérêt.

    Carnet réaliste : touche mince (0,1), profondeur en arrière (1, 2, 3, 4).
    Total 10,1, plafond 1,01. Un ordre de 1 doit donc dépasser le premier
    niveau et payer le second.
    """
    p = PaperExchange(equity_usd=Decimal("10000"), costs=FRICTIONLESS)
    p.on_book(carnet(tailles=[Decimal("0.1"), Decimal("1"), Decimal("2"),
                              Decimal("3"), Decimal("4")]))
    petit = p.place(entree(size=Decimal("0.05"), intent_id="c"))
    gros = p.place(entree(size=Decimal("1"), intent_id="d"))
    assert petit.avg_price == Decimal("60010"), "le petit tient dans la touche"
    assert gros.avg_price > petit.avg_price, "manger plus profond doit coûter plus cher"
    assert gros.avg_price < Decimal("60020"), "mais pas au-delà du niveau atteint"


def test_la_vente_mange_les_offres_et_le_sens_nest_pas_inverse(px):
    r = px.place(entree(side=Side.SHORT, size=Decimal("0.5")))
    assert r.avg_price <= Decimal("59990"), "une vente ne peut pas être servie au mid"


# --------------------------------------------------------------------------
#  On refuse ce que la profondeur n'absorbe pas
# --------------------------------------------------------------------------

def test_un_ordre_plus_gros_que_le_carnet_est_tronque(px):
    """Profondeur visible 5, plafond 10 % : au plus 0,5 servi."""
    r = px.place(entree(size=Decimal("3")))
    assert r.status is OrderStatus.PARTIAL
    assert r.filled_size == Decimal("0.5")
    assert px.tronques == 1


def test_un_carnet_vide_refuse_plutot_que_dinventer_un_prix():
    p = PaperExchange(costs=FRICTIONLESS)
    with pytest.raises(ExchangeRejected, match="aucun carnet"):
        p.place(entree())
    assert p.refus and p.refus[0]["motif"] == "aucun carnet pour cet actif"


def test_un_carnet_perime_refuse(px):
    """Remplir sur un carnet de trois minutes, c'est inventer un prix."""
    px.on_book(carnet(ts_ms=now_ms() - 120_000))
    with pytest.raises(ExchangeRejected, match="carnet vieux"):
        px.place(entree())


# --------------------------------------------------------------------------
#  Un passif n'est pas servi parce que le prix l'a touché
# --------------------------------------------------------------------------

def test_un_ordre_passif_ne_remplit_pas_sur_un_mouvement_de_carnet(px):
    """LE mensonge classique : le prix traverse la limite, donc on est servi.

    Non. Le prix traverse parce que quelqu'un d'autre a été servi avant.
    """
    r = px.place(entree(style=EntryStyle.LIMIT_PASSIVE, limite=Decimal("59900")))
    assert r.status is OrderStatus.RESTING

    # Le carnet s'effondre bien en dessous de la limite.
    px.on_book(carnet(mid=Decimal("59000")))
    assert px._ordres[r.cloid].status is OrderStatus.RESTING
    assert px._ordres[r.cloid].filled_size == 0
    assert not px.account_state().positions


def test_un_passif_remplit_sur_une_impression_de_la_contrepartie(px):
    r = px.place(entree(style=EntryStyle.LIMIT_PASSIVE, limite=Decimal("59900")))
    # Un VENDEUR traverse à 59 890 : notre achat limité à 59 900 est servi.
    px.on_trade(Trade(asset="BTC", price=Decimal("59890"), size=Decimal("0.05"),
                      is_buy=False, ts_ms=now_ms()))
    rec = px._ordres[r.cloid]
    assert rec.status is OrderStatus.PARTIAL
    assert rec.filled_size == Decimal("0.05"), "au plus la taille imprimée"


def test_un_passif_nest_pas_servi_par_une_impression_du_meme_cote(px):
    """Un achat limité n'est pas servi par un autre acheteur."""
    r = px.place(entree(style=EntryStyle.LIMIT_PASSIVE, limite=Decimal("59900")))
    px.on_trade(Trade(asset="BTC", price=Decimal("59890"), size=Decimal("1"),
                      is_buy=True, ts_ms=now_ms()))
    assert px._ordres[r.cloid].filled_size == 0


def test_un_passif_ne_prend_pas_plus_que_le_volume_imprime(px):
    r = px.place(entree(size=Decimal("2"), style=EntryStyle.LIMIT_PASSIVE,
                        limite=Decimal("59900")))
    for _ in range(3):
        px.on_trade(Trade(asset="BTC", price=Decimal("59800"), size=Decimal("0.3"),
                          is_buy=False, ts_ms=now_ms()))
    assert px._ordres[r.cloid].filled_size == Decimal("0.9")
    assert px._ordres[r.cloid].status is OrderStatus.PARTIAL


# --------------------------------------------------------------------------
#  Comptabilité : frais, funding, réalisé
# --------------------------------------------------------------------------

def test_les_frais_taker_sont_preleves():
    p = PaperExchange(equity_usd=Decimal("10000"), costs=CostModel())
    p.on_book(carnet())
    p.place(entree(size=Decimal("0.1")))
    assert p.frais_payes_usd > 0
    fill = p.fills_since(0)[0]
    assert not fill.is_maker


def test_un_passif_paie_le_tarif_maker(px):
    p = PaperExchange(equity_usd=Decimal("10000"), costs=CostModel())
    p.on_book(carnet())
    p.place(entree(style=EntryStyle.LIMIT_PASSIVE, limite=Decimal("59900")))
    p.on_trade(Trade(asset="BTC", price=Decimal("59890"), size=Decimal("0.05"),
                     is_buy=False, ts_ms=now_ms()))
    fill = p.fills_since(0)[0]
    assert fill.is_maker
    assert fill.price == Decimal("59900"), "servi à SA limite, pas au prix imprimé"


def test_le_funding_est_facture_sur_la_duree(px):
    p = PaperExchange(equity_usd=Decimal("10000"), costs=CostModel())
    p.on_book(carnet())
    p.place(entree(size=Decimal("0.1")))
    t0 = now_ms()
    p.horloge(t0)
    p.horloge(t0 + 6 * 24 * 3600 * 1000)          # six jours, l'horizon déblocage
    assert p.funding_paye_usd > 0, "un long paie le funding"

    court = PaperExchange(equity_usd=Decimal("10000"), costs=CostModel())
    court.on_book(carnet())
    court.place(entree(side=Side.SHORT, size=Decimal("0.1")))
    court.horloge(t0)
    court.horloge(t0 + 6 * 24 * 3600 * 1000)
    assert court.funding_paye_usd < 0, "un short le touche"


def test_le_realise_apparait_a_la_fermeture(px):
    px.place(entree(size=Decimal("0.5"), intent_id="a"))
    assert px.realise_usd == 0, "rien de réalisé tant que c'est ouvert"

    px.on_book(carnet(mid=Decimal("61000")))
    px.place(entree(side=Side.SHORT, size=Decimal("0.5"), intent_id="b"))
    assert px.realise_usd > 0
    assert not px.account_state().positions


def test_le_latent_suit_le_mark(px):
    px.place(entree(size=Decimal("0.5")))
    px.on_mark(MarkPrice(asset="BTC", mark=Decimal("62000"), ts_ms=now_ms()))
    pos = px.account_state().positions[0]
    assert pos.unrealized_pnl_usd > 0
    assert pos.mark_price == Decimal("62000")


# --------------------------------------------------------------------------
#  Idempotence et stops — les propriétés que la couche d'exécution exige
# --------------------------------------------------------------------------

def test_la_meme_intention_ne_double_pas_la_position(px):
    """La parade à la réponse HTTP perdue. Elle doit valoir en papier aussi,
    sinon le papier ne valide pas le chemin de code qui compte."""
    i = entree(size=Decimal("0.2"))
    a = px.place(i)
    b = px.place(i)
    assert a.cloid == b.cloid
    assert len(px.fills_since(0)) == 1
    assert px.account_state().positions[0].size == Decimal("0.2")


def test_un_stop_se_declenche_en_traversant_le_carnet(px):
    px.place(entree(size=Decimal("0.5")))
    stop = OrderIntent(
        intent_id="s1", mandate_id="m1", asset="BTC", side=Side.SHORT,
        purpose=OrderPurpose.STOP_LOSS, size=Decimal("0.5"),
        trigger_price=Decimal("59000"), reduce_only=True)
    r = px.place(stop)
    assert r.status is OrderStatus.RESTING
    assert px.account_state().positions[0].is_protected

    px.on_book(carnet(mid=Decimal("58500")))
    px.on_mark(MarkPrice(asset="BTC", mark=Decimal("58900"), ts_ms=now_ms()))
    assert not px.account_state().positions, "le stop doit avoir fermé"
    assert px.realise_usd < 0


def test_un_stop_non_touche_ne_se_declenche_pas(px):
    px.place(entree(size=Decimal("0.5")))
    px.place(OrderIntent(
        intent_id="s1", mandate_id="m1", asset="BTC", side=Side.SHORT,
        purpose=OrderPurpose.STOP_LOSS, size=Decimal("0.5"),
        trigger_price=Decimal("59000"), reduce_only=True))
    px.on_mark(MarkPrice(asset="BTC", mark=Decimal("59500"), ts_ms=now_ms()))
    assert px.account_state().positions


def test_un_reduce_only_sans_position_est_refuse(px):
    with pytest.raises(ExchangeRejected, match="sans position"):
        px.place(OrderIntent(
            intent_id="x1", mandate_id="m1", asset="BTC", side=Side.SHORT,
            purpose=OrderPurpose.FLATTEN, size=Decimal("1"),
            reduce_only=True, style=EntryStyle.MARKET_IOC))


# --------------------------------------------------------------------------
#  Le moteur se déclare simulateur
# --------------------------------------------------------------------------

def test_le_compte_se_declare_simulateur(px):
    """Le moteur de risque distingue un compte réconcilié d'une simulation.
    Un papier qui se ferait passer pour l'exchange casserait cette garantie."""
    assert px.account_state().source == "simulator"


def test_le_resume_expose_ce_qui_a_ete_refuse(px):
    px.place(entree(size=Decimal("3")))            # tronqué
    r = px.resume()
    assert r["tronques"] == 1
    assert r["fills"] == 1
    assert Decimal(r["equite_usd"]) > 0


# --------------------------------------------------------------------------
#  La chaîne complète : journal -> pilote -> pupitre -> risque -> carnet
# --------------------------------------------------------------------------

def _desk(tmp_path, journal_lignes, *, equity=Decimal("10000")):
    """Un desk papier complet, sans réseau ni exchange."""
    import json

    from trading_desk.api.state import DeskState
    from trading_desk.config import Settings
    from trading_desk.execution.pupitre import Pupitre
    from trading_desk.sentinelle.pilote_deblocages import PiloteDeblocages
    from trading_desk.storage import SqliteStore

    j = tmp_path / "journal.jsonl"
    # Retour a la ligne FINAL : le collecteur hebdomadaire ajoute en mode
    # « a », et sans lui son premier ajout se collerait a la derniere ligne.
    j.write_text("".join(json.dumps(x) + "\n" for x in journal_lignes),
                 encoding="utf-8")

    from trading_desk.contracts.common import DeskMode
    from trading_desk.contracts.market import FeedHealth, FeedStatus

    # Bande de stop desserree : la regle des deblocages pose son stop a 15 %,
    # hors du defaut [30, 500] calibre pour du BTC intraday.
    state = DeskState(
        Settings(mode=DeskMode.PAPER, max_stop_distance_bps=Decimal("1600")),
        SqliteStore(":memory:"))
    # Des flux vivants : sans eux l'invariant I09 bloque, a juste titre. Un
    # desk qui traderait sur des flux morts est exactement ce que le moteur
    # de risque existe pour empecher.
    t = now_ms()
    state.set_feeds((
        FeedHealth(name="trades:PYTH", status=FeedStatus.LIVE,
                   last_message_ms=t, max_age_ms=20_000, messages=10),
        FeedHealth(name="book:PYTH", status=FeedStatus.LIVE,
                   last_message_ms=t, max_age_ms=10_000, messages=10),
    ), True)
    px = PaperExchange(equity_usd=equity, costs=FRICTIONLESS)
    pilote = PiloteDeblocages(j, prix={"PYTH": Decimal("0.40")})
    pupitre = Pupitre(state, px, pilote, univers=("PYTH",))
    return state, px, pilote, pupitre


def _ligne(symbole="PYTH", *, entree_ms, sortie_ms, part=0.05):
    return {"version": 2, "symbole": symbole, "deblocage_ms": sortie_ms + JOUR,
            "part_offre": part, "entree_ms": entree_ms, "sortie_ms": sortie_ms,
            "sens": "COURT", "reference": "BTC", "inscrit_ms": entree_ms - JOUR}


JOUR = 86_400_000


def test_la_chaine_complete_ouvre_une_position(tmp_path):
    """Journal -> intention -> dimensionnement -> ordre -> fill, sans réseau."""
    t = now_ms()
    _, px, _, pupitre = _desk(
        tmp_path, [_ligne(entree_ms=t - JOUR, sortie_ms=t + 5 * JOUR)])
    px.on_book(carnet("PYTH", mid=Decimal("0.40"), pas=Decimal("0.0001"),
                      taille=Decimal("100000")))

    pupitre.cycle(t)
    positions = px.account_state().positions
    assert len(positions) == 1
    assert positions[0].asset == "PYTH"
    assert positions[0].side is Side.SHORT, "la règle validée vend à découvert"
    assert positions[0].is_protected, "aucune position sans stop"
    assert pupitre.ouvertures == 1


def test_la_fenetre_fermee_ferme_la_position(tmp_path):
    t = now_ms()
    _, px, _, pupitre = _desk(
        tmp_path, [_ligne(entree_ms=t - JOUR, sortie_ms=t + JOUR)])
    px.on_book(carnet("PYTH", mid=Decimal("0.40"), pas=Decimal("0.0001"),
                      taille=Decimal("100000")))
    pupitre.cycle(t)
    assert px.account_state().positions

    pupitre.cycle(t + 2 * JOUR)                  # la fenêtre est close
    assert not px.account_state().positions
    assert pupitre.fermetures == 1


def test_une_fenetre_pas_encore_ouverte_ne_trade_pas(tmp_path):
    t = now_ms()
    _, px, _, pupitre = _desk(
        tmp_path, [_ligne(entree_ms=t + 3 * JOUR, sortie_ms=t + 9 * JOUR)])
    px.on_book(carnet("PYTH", mid=Decimal("0.40"), pas=Decimal("0.0001"),
                      taille=Decimal("100000")))
    pupitre.cycle(t)
    assert not px.account_state().positions


def test_une_position_absente_du_journal_est_fermee(tmp_path):
    """Le pupitre ne laisse jamais traîner ce dont rien ne dit quand ça sort."""
    t = now_ms()
    _, _, pilote, _ = _desk(tmp_path, [])
    sorties = pilote.sorties(t, ("ORPHELIN",))
    assert sorties == ["ORPHELIN"]


def test_le_desk_arrete_nouvre_rien(tmp_path):
    """Le kill switch doit valoir aussi pour le pupitre, sinon il ne sert à rien."""
    from trading_desk.contracts.common import HaltReason

    t = now_ms()
    state, px, _, pupitre = _desk(
        tmp_path, [_ligne(entree_ms=t - JOUR, sortie_ms=t + 5 * JOUR)])
    px.on_book(carnet("PYTH", mid=Decimal("0.40"), pas=Decimal("0.0001"),
                      taille=Decimal("100000")))
    state.halt(HaltReason.MANUAL, "test")

    pupitre.cycle(t)
    assert not px.account_state().positions
    assert pupitre.ouvertures == 0


def test_sans_prix_le_pilote_nemet_pas_dintention(tmp_path):
    """Fabriquer un niveau d'entrée sans prix serait inventer le trade."""
    t = now_ms()
    _, _, pilote, _ = _desk(
        tmp_path, [_ligne(entree_ms=t - JOUR, sortie_ms=t + 5 * JOUR)])
    pilote.prix = {}
    assert pilote.entrees(t) == []


def test_une_occasion_reste_offerte_tant_quelle_nest_pas_prise(tmp_path):
    """Lire une intention ne la consomme pas. Seule l'ouverture la consomme.

    La première version rayait l'entrée dès la lecture. Le desk en amorçage
    la demandait, le pilote la rayait, le moteur de risque refusait — et
    l'opportunité était perdue pour de bon, sans que rien ne le signale.
    C'est arrivé sur le premier desk PAPER lancé : la fenêtre ETH était
    ouverte, le pilote la voyait, et aucune position n'a jamais été prise.
    """
    t = now_ms()
    _, _, pilote, _ = _desk(
        tmp_path, [_ligne(entree_ms=t - JOUR, sortie_ms=t + 5 * JOUR)])
    intentions = pilote.entrees(t)
    assert len(intentions) == 1
    assert len(pilote.entrees(t)) == 1, "tant qu'elle n'est pas prise, elle reste"

    pilote.confirmer(intentions[0])
    assert pilote.entrees(t) == [], "une fois ouverte, elle ne revient plus"


def test_un_refus_du_risque_ne_consomme_pas_l_occasion(tmp_path):
    """Le desk arrêté doit pouvoir reprendre la position au réarmement."""
    from trading_desk.contracts.common import HaltReason

    t = now_ms()
    state, px, pilote, pupitre = _desk(
        tmp_path, [_ligne(entree_ms=t - JOUR, sortie_ms=t + 5 * JOUR)])
    px.on_book(carnet("PYTH", mid=Decimal("0.40"), pas=Decimal("0.0001"),
                      taille=Decimal("100000")))
    state.halt(HaltReason.MANUAL, "test")
    pupitre.cycle(t)
    assert not px.account_state().positions

    state.arm()
    pupitre.cycle(t)
    assert px.account_state().positions, "l'occasion doit survivre au refus"


def test_le_journal_est_relu_a_chaque_cycle(tmp_path):
    """Le collecteur hebdomadaire écrit pendant que le desk tourne."""
    import json

    t = now_ms()
    _, _, pilote, _ = _desk(
        tmp_path, [_ligne(entree_ms=t - JOUR, sortie_ms=t + 5 * JOUR)])
    assert len(pilote.positions()) == 1

    with pilote.chemin.open("a") as f:
        f.write(json.dumps(_ligne("JTO", entree_ms=t, sortie_ms=t + 6 * JOUR)) + "\n")
    assert len(pilote.positions()) == 2, "le journal doit être relu, pas mis en cache"


def test_le_mode_paper_est_le_seul_cable():
    """TESTNET et LIVE attendent la validation de signature (porte P1)."""
    from trading_desk.api.state import DeskState
    from trading_desk.config import Settings
    from trading_desk.contracts.common import DeskMode
    from trading_desk.execution.pupitre import exchange_pour
    from trading_desk.storage import SqliteStore

    paper = DeskState(Settings(mode=DeskMode.PAPER), SqliteStore(":memory:"))
    assert exchange_pour(paper).account_state().source == "simulator"

    shadow = DeskState(Settings(mode=DeskMode.SHADOW), SqliteStore(":memory:"))
    with pytest.raises(NotImplementedError, match="porte P1"):
        exchange_pour(shadow)


def test_les_actifs_se_lisent_depuis_une_liste_separee_par_des_virgules(monkeypatch):
    """`DESK_ASSETS=BTC,ETH` doit marcher : c'est ce que `.env.example` écrit.

    Sans `NoDecode`, pydantic-settings essaie de décoder la valeur en JSON
    avant que le validateur ne la voie, et le desk refuse de démarrer sur un
    `SettingsError` qui ne nomme pas la cause. Le bug était là depuis
    l'origine et frappait quiconque copiait `.env.example` en `.env`.
    """
    from trading_desk.config import Settings

    monkeypatch.setenv("DESK_ASSETS", "BTC,ETH,SOL")
    assert Settings(_env_file=None).assets == ("BTC", "ETH", "SOL")

    monkeypatch.setenv("DESK_ASSETS", " btc , eth ")
    assert Settings(_env_file=None).assets == ("BTC", "ETH")


def test_les_fills_arrivent_dans_le_stockage(tmp_path):
    """L'exchange détient l'état, le stockage détient l'historique.

    Sans ce transfert, le desk traderait et le panneau VOLS resterait vide —
    l'écart exact entre l'état réel et l'écran qui rend une supervision
    inutile. Constaté en lançant le premier desk PAPER : `fills: 0` en base
    alors qu'une position ETH était ouverte.
    """
    t = now_ms()
    state, px, _, pupitre = _desk(
        tmp_path, [_ligne(entree_ms=t - JOUR, sortie_ms=t + 5 * JOUR)])
    px.on_book(carnet("PYTH", mid=Decimal("0.40"), pas=Decimal("0.0001"),
                      taille=Decimal("100000")))

    assert state.store.counts()["fills"] == 0
    pupitre.cycle(t)
    assert state.store.counts()["fills"] == 1

    ligne = state.store.recent_fills(10)[0]
    assert ligne["asset"] == "PYTH" and ligne["side"] == "SHORT"

    # Un second cycle ne doit pas dupliquer : `write_fill` déduplique par id.
    pupitre.cycle(t)
    assert state.store.counts()["fills"] == 1
