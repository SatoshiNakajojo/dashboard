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
from trading_desk.contracts.common import HaltReason, now_ms
from trading_desk.contracts.mandate import Bias, Mandate, Regime
from trading_desk.contracts.market import FeedHealth, FeedStatus
from trading_desk.risk.engine import Invariant, RiskContext
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
