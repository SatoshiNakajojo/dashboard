"""Le desk doit pouvoir repartir. Deux pannes qui l'en empechaient.

Elles se ressemblent : dans les deux cas le desk s'arrete, refuse de
repartir, et affiche un motif que rien ne permet de lever depuis l'ecran.

**L'interblocage du mandat.** Le mandat de demarrage dure quinze minutes.
Passe ce delai :

    le mandat expire -> I06 echoue -> le verdict n'est plus approuve
      -> le pupitre refuse toutes les entrees -> `_ouvrir()` n'est jamais
      atteint -> or `_ouvrir()` est le SEUL endroit qui emet un mandat
      -> le mandat reste expire. Pour toujours.

Tout desk reel s'arretait donc au bout d'un quart d'heure, et le
rearmement manuel n'y changeait rien puisqu'il ne reemettait pas de mandat.

**La coupure instantanee.** Le transport tombe et revient en quelques
centaines de millisecondes ; le desk s'arretait sur la coupure elle-meme,
pour une donnee qui n'avait jamais cesse d'etre fraiche, et demandait un
rearmement a la main.
"""

from __future__ import annotations

from decimal import Decimal

from trading_desk.api.state import MARGE_RENOUVELLEMENT_MS, DeskState
from trading_desk.config import Settings
from trading_desk.contracts.common import DeskMode, HaltReason, now_ms
from trading_desk.contracts.mandate import Bias, Mandate, Regime
from trading_desk.contracts.market import FeedHealth, FeedStatus
from trading_desk.risk.engine import Invariant, RiskContext, evaluate
from trading_desk.risk.limits import RiskLimits
from trading_desk.storage import SqliteStore


def _etat() -> DeskState:
    return DeskState(Settings(), SqliteStore(":memory:"))


# --------------------------------------------------------------------------
#  Le mandat de repos
# --------------------------------------------------------------------------

def test_rearmer_reemet_un_mandat():
    """Sinon l'ecran affiche « mandat expire » juste apres un rearmement.

    `halt()` pose un mandat au moment de l'arret. On ne rearme pas dans la
    seconde — on rearme quand on a compris ce qui s'est passe. Quinze
    minutes plus tard, ce mandat a expire.
    """
    etat = _etat()
    etat.halt(HaltReason.MANUAL, "test")
    # Le desk a ete arrete il y a longtemps : le mandat de `halt()` est mort.
    etat.mandate = Mandate.flat(journal_ref="halt").model_copy(
        update={"issued_at_ms": now_ms() - 60 * 60 * 1000})
    assert etat.mandate.is_expired()

    etat.arm()
    assert not etat.mandate.is_expired(), \
        "rearme avec un mandat expire : le desk se rearretera aussitot"
    assert not etat.halted


def test_le_mandat_de_repos_est_reconduit_avant_d_expirer():
    """On reconduit AVANT l'expiration, pas apres.

    Attendre l'expiration laisserait passer au moins un cycle d'evaluation
    en defaut — donc un arret automatique entre deux battements.
    """
    etat = _etat()
    assert etat.renouveler_le_mandat_de_repos() is False, \
        "un mandat frais n'a aucune raison d'etre reconduit"

    etat.mandate = etat.mandate.model_copy(update={
        "issued_at_ms": now_ms() - (etat.mandate.ttl_ms - MARGE_RENOUVELLEMENT_MS // 2)})
    assert etat.renouveler_le_mandat_de_repos() is True
    assert etat.mandate.remaining_ms() > MARGE_RENOUVELLEMENT_MS
    assert not etat.mandate.is_expired()


def test_un_mandat_directionnel_n_est_JAMAIS_prolonge():
    """La ligne de securite de tout ce fichier.

    Reconduire un mandat FLAT ne dit rien de plus que « le desk est vivant
    et n'a rien a dire ». Prolonger un mandat directionnel etendrait une
    autorisation de TRADER sans que personne ne l'ait redecidee — c'est
    exactement ce contre quoi I06 existe. Le pupitre emet le sien, date, a
    chaque ouverture.
    """
    etat = _etat()
    directionnel = Mandate(
        bias=Bias.LONG, regime=Regime.TREND_UP, universe=("BTC",),
        max_notional_usd=Decimal("300"), max_leverage=Decimal("2"),
        max_concurrent_positions=1,
        journal_ref="essai",
    ).model_copy(update={"issued_at_ms": now_ms() - 14 * 60 * 1000})

    etat.mandate = directionnel
    assert etat.renouveler_le_mandat_de_repos() is False, \
        "un mandat directionnel a ete prolonge : I06 ne protege plus rien"
    assert etat.mandate is directionnel


def test_le_desk_ne_s_enferme_plus_au_bout_d_un_quart_d_heure():
    """La panne d'origine, reconstituee de bout en bout."""
    etat = _etat()
    # Un quart d'heure passe, sans qu'aucune position n'ait ete ouverte.
    etat.mandate = etat.mandate.model_copy(
        update={"issued_at_ms": now_ms() - 16 * 60 * 1000})
    assert etat.mandate.is_expired(), "le mandat de demarrage devrait avoir expire"
    assert Invariant.I06_MANDATE_ALIVE in etat.verdict().blocking

    # Le battement de coeur, celui que faisait defaut.
    assert etat.renouveler_le_mandat_de_repos() is True
    assert Invariant.I06_MANDATE_ALIVE not in etat.verdict().blocking


# --------------------------------------------------------------------------
#  La coupure de transport
# --------------------------------------------------------------------------

def _contexte(flux: FeedHealth) -> RiskContext:
    return RiskContext(mode=Settings().mode, limits=RiskLimits(), feeds=(flux,))


def test_une_reconnexion_breve_ne_fait_pas_echouer_la_fraicheur():
    """Une coupure de deux secondes ne doit pas arreter le desk.

    La donnee tenue n'a pas vieilli pour autant : la garantie de I09 porte
    sur l'AGE, pas sur l'etat du tuyau.
    """
    maintenant = now_ms()
    flux = FeedHealth(
        name="book:BTC", status=FeedStatus.DISCONNECTED,
        last_message_ms=maintenant - 2_000, max_age_ms=10_000,
    )
    ctx = _contexte(flux).model_copy(update={"now_ms": maintenant})
    assert ctx.freshest_failure() is None


def test_une_coupure_qui_traine_finit_par_echouer():
    """La protection n'est pas levee, elle est rendue a sa definition.

    Si la reconnexion n'aboutit pas, l'age depasse le seuil et le flux
    echoue — un cran plus bas, par la regle normale.
    """
    maintenant = now_ms()
    flux = FeedHealth(
        name="book:BTC", status=FeedStatus.DISCONNECTED,
        last_message_ms=maintenant - 30_000, max_age_ms=10_000,
    )
    ctx = _contexte(flux).model_copy(update={"now_ms": maintenant})
    echec = ctx.freshest_failure()
    assert echec is not None and echec.name == "book:BTC"


def test_un_flux_jamais_connecte_echoue_toujours():
    """Aucune tolerance pour une souscription qui n'a jamais rien livre :
    il n'y a pas de donnee fraiche a tenir, seulement une absence."""
    flux = FeedHealth(name="book:BTC", status=FeedStatus.DISCONNECTED,
                      last_message_ms=None, max_age_ms=10_000)
    assert _contexte(flux).freshest_failure() is not None


# --------------------------------------------------------------------------
#  La divergence mark / oracle
# --------------------------------------------------------------------------

def test_le_seuil_de_divergence_est_elargi_sur_le_testnet():
    """Mesure du 12 septembre 2026, sur tout l'univers des perpétuels :

                       médiane   p75    BTC    ETH    SOL   > 50 bps
        mainnet          7,2    17,7    4,9    4,3    4,3    26 / 234
        testnet         16,9   144,1   26,2   96,5   22,1    68 / 212

    50 bps est juste en mainnet — les majeures y tiennent sous 5. Sur le
    testnet, ETH dépasse 50 à lui seul, en permanence : le desk s'arrêtait
    en STALE_FEED sans qu'aucun réarmement puisse rien y faire, la cause
    étant structurelle et non transitoire.
    """
    from trading_desk.config import DIVERGENCE_TESTNET_BPS

    testnet = Settings(testnet=True).risk_limits()
    assert testnet.max_price_divergence_bps == DIVERGENCE_TESTNET_BPS
    assert testnet.max_price_divergence_bps > Decimal("100"), \
        "ETH seul dépasse 96 bps sur le testnet"


def test_le_seuil_elargi_ne_peut_pas_atteindre_l_argent_reel():
    """La garantie tient par construction, pas par vigilance.

    `LIVE` refuse de démarrer avec `testnet=True`. Les deux conditions
    s'excluent donc : le seuil élargi ne peut pas s'appliquer à un mode qui
    envoie de vrais ordres.
    """
    import pytest

    reel = Settings(testnet=False).risk_limits()
    assert reel.max_price_divergence_bps == Decimal("50"), \
        "le seuil du mainnet a bougé : il gouverne l'argent réel"

    with pytest.raises(ValueError, match="LIVE"):
        Settings(mode=DeskMode.LIVE, testnet=True)


def test_la_divergence_nomme_l_actif_fautif():
    """« divergence de prix 94,9 bps » ne dit pas où regarder."""
    ctx = RiskContext(
        mode=DeskMode.SHADOW, limits=RiskLimits(),
        feeds=(FeedHealth(name="mids", last_message_ms=now_ms()),),
        clock_drift_ms=0,
        price_divergence_bps=Decimal("900"),
        price_divergence_asset="ETH",
    )
    detail = next(c for c in evaluate(ctx).checks
                  if c.invariant is Invariant.I09_FRESH_DATA).detail
    assert "ETH" in detail, f"l'actif fautif n'est pas nommé : {detail!r}"


# --------------------------------------------------------------------------
#  Savoir quelle version tourne
# --------------------------------------------------------------------------

def test_l_instantane_porte_la_version_en_memoire():
    """Sans elle, on cherche un défaut dans du code qui ne tourne pas.

    Un processus Python charge son code au démarrage : un `git pull` ne
    change rien à un desk déjà lancé, même en installation éditable. Le
    fichier sur le disque est bien à jour — on l'a vérifié — et pourtant le
    défaut persiste. Cette ambiguïté a coûté plusieurs allers-retours, sans
    aucun moyen de trancher entre « la correction est mauvaise » et « la
    correction ne tourne pas ».
    """
    from trading_desk.version import version

    instantane = _etat().snapshot()
    assert "version" in instantane, "l'instantané ne dit pas quelle version tourne"
    assert instantane["version"] == version()
    assert instantane["version"], "une version vide ne renseigne personne"


def test_la_version_ne_fait_jamais_echouer_le_demarrage():
    """Une supervision qui refuse de démarrer faute de numéro de version
    serait un comble. Hors dépôt git, on rend « inconnue »."""
    from trading_desk import version as mod

    mod.version.cache_clear()
    try:
        assert isinstance(mod.version(), str) and mod.version()
    finally:
        mod.version.cache_clear()


# --------------------------------------------------------------------------
#  Le quota journalier de mandats
# --------------------------------------------------------------------------

def test_le_compteur_de_mandats_repasse_a_zero_au_changement_de_jour():
    """Il s'appelait « aujourd'hui » et comptait « depuis le lancement ».

    Observé en production le 12 septembre 2026, sur un desk actif depuis des
    heures : « ORDER_RATE_EXCEEDED — 9 mandats aujourd'hui > 8 ». Le desk
    s'arrêtait DÉFINITIVEMENT : le réarmement échouait aussitôt sur I07, et
    seul un redémarrage effaçait le compteur — en oubliant du même coup le
    vrai compte du jour.
    """
    etat = _etat()
    for _ in range(9):
        etat.set_mandate(Mandate.flat(journal_ref="essai"))
    assert etat.mandates_today == 9
    assert Invariant.I07_ORDER_RATE in etat.verdict().blocking

    # Le lendemain.
    etat._jour_des_mandats = "1999-01-01"
    assert Invariant.I07_ORDER_RATE not in etat.verdict().blocking, \
        "le quota ne se libère jamais : le desk reste arrêté pour toujours"
    assert etat.mandates_today == 0


def test_la_bascule_joue_aussi_a_la_lecture():
    """Un desk arrêté par le quota n'émet plus de mandat.

    Si seule l'écriture basculait, le compteur resterait au-dessus du
    plafond indéfiniment et le lendemain ne changerait rien — c'est
    exactement la panne qu'on corrige.
    """
    etat = _etat()
    for _ in range(9):
        etat.set_mandate(Mandate.flat(journal_ref="essai"))
    etat._jour_des_mandats = "1999-01-01"

    # `risk_context` est une LECTURE : elle doit suffire à débloquer.
    ctx = etat.risk_context()
    assert ctx.mandates_today == 0
    assert etat.mandates_today == 0


def test_une_intention_non_dimensionnable_ne_consomme_pas_le_quota():
    """Le quota sert à borner les ORDRES, pas les tentatives.

    Le mandat était inscrit avant le dimensionnement : une intention qui ne
    produisait aucun ordre — la plupart, avec une quinzaine de positions au
    journal — consommait quand même un mandat. Les huit du jour partaient en
    refus, puis I07 arrêtait le desk pour la journée.

    La propriété d'audit reste entière : le mandat est toujours inscrit
    AVANT l'ordre auquel il se rattache. Il ne l'est simplement plus quand
    il n'y a pas d'ordre.
    """
    source = (recherche_chemin() / "src/trading_desk/execution/pupitre.py") \
        .read_text(encoding="utf-8")
    i = source.index("def _ouvrir")
    bloc = source[i:i + 2000]
    assert bloc.index("taille = size_position") < bloc.index("set_mandate"), \
        "le mandat est inscrit avant le dimensionnement : le quota part en refus"
    assert bloc.index("set_mandate") < bloc.index("self.orders.open_position"), \
        "le mandat doit rester inscrit AVANT l'ordre (propriété d'audit)"


def recherche_chemin():
    from pathlib import Path
    return Path(__file__).resolve().parent.parent
