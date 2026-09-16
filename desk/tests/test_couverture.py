"""La jambe de couverture : pourquoi elle ne peut pas être branchée telle quelle.

La validation de la règle des déblocages mesure **deux** versions : la vente à
découvert nue, et la même position **adossée** à un achat de BTC pour le même
notionnel. C'est l'adossée qui a été retenue comme le résultat attribuable aux
déblocages — la nue est courte sur des alts pratiquement chaque semaine, donc
son résultat contient une exposition courte permanente au marché.

    version       Sharpe    repli
    nue             1,80    15,3 %
    adossée         2,46     7,9 %

Le desk déployé ne passe que la jambe courte. Brancher la seconde paraît être
un ajout local au pilote. **Ça ne l'est pas**, et ce module de test existe
pour figer la raison, parce qu'elle n'est pas visible en lisant le pilote.

Le contrat de sortie est indexé par NOM D'ACTIF : `sorties()` rend des chaînes,
et le pupitre appelle `flatten(asset, size=position.size)` — la position
entière. Sur un exchange qui nette, une jambe longue BTC de couverture et la
position de `turtle_btc_1d` sont **une seule position**. Quand la fenêtre d'un
déblocage se referme, le pilote demande la sortie de BTC, le faisceau en fait
l'union, et le pupitre ferme aussi la position de la règle gelée.

Ce qui suit a d'abord démontré la collision, puis figé sa correction : le
contrat de sortie porte désormais la source qui la demande, et le pupitre
tient un registre des parts (`execution/parts.py`). Les docstrings gardent
l'état d'avant, parce qu'un test qui ne dit que l'état d'après ne protège
plus de la régression qu'il a servi à trouver.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.contracts.common import Side
from trading_desk.execution.faisceau import Faisceau
from trading_desk.execution.pupitre import Intention
from trading_desk.risk import size_position


class _Source:
    """Une source minimale : ce qu'elle veut entrer, ce qu'elle veut sortir."""

    def __init__(self, nom, entrees=(), sorties=()):
        self.nom = nom
        self._entrees = list(entrees)
        self._sorties = list(sorties)
        self.confirmees = []
        self.absent = False

    def entrees(self, at_ms):
        return list(self._entrees)

    def sorties(self, at_ms, ouvertes):
        return [a for a in self._sorties if a in ouvertes]

    def confirmer(self, intention):
        self.confirmees.append(intention)


def _cadre():
    """Un compte, un mandat et des limites qui laissent la place de mesurer.

    Le mandat autorise la bande de stop large que la règle des déblocages
    utilise (15 % du prix, soit 1 500 bps) : avec la bande par défaut à
    500 bps, toute intention sortirait sur la distance de stop et le test
    mesurerait ce refus au lieu du dimensionnement.
    """
    from trading_desk.contracts.mandate import Mandate, StopBand
    from trading_desk.contracts.orders import AccountState
    from trading_desk.contracts.common import Bias
    from trading_desk.risk.limits import RiskLimits

    return (
        RiskLimits(),
        AccountState(equity_usd=Decimal("1000"),
                     available_margin_usd=Decimal("1000"),
                     used_margin_usd=Decimal("0"), positions=()),
        Mandate(bias=Bias.LONG, max_notional_usd=Decimal("500"),
                universe=("BTC",), max_concurrent_positions=2,
                stop_band=StopBand(min_bps=Decimal("30"), max_bps=Decimal("1600")),
                max_leverage=Decimal("3")),
    )


def _intention(actif, side=Side.LONG):
    return Intention(asset=actif, side=side, entry_price=Decimal("100"),
                     stop_price=Decimal("90"), motif="t")


def test_une_sortie_porte_la_source_qui_la_demande():
    """**Le blocage, et sa correction.**

    Avant : le pilote des déblocages fermait sa jambe de couverture BTC,
    l'union du faisceau rendait la chaîne « BTC », et le pupitre fermait la
    position entière — celle de `turtle_btc_1d` comprise, qui rentrait au
    signal suivant en payant l'aller-retour.

    L'union elle-même était juste et le reste : une sortie réduit le risque,
    et la refuser parce qu'une AUTRE source ne la demande pas garderait une
    position que sa propre règle veut fermer. Ce qui était faux, c'est ce
    qu'elle rendait.
    """
    deblocages = _Source("deblocages", sorties=["BTC"])   # fin de fenêtre
    figees = _Source("regles_figees", sorties=[])         # veut GARDER BTC
    faisceau = Faisceau(deblocages, figees)

    sorties = faisceau.sorties(0, ("BTC",))
    assert [(x.asset, x.source) for x in sorties] == [("BTC", "deblocages")], (
        "une seule des deux sources demande la sortie, et elle est nommée")


def test_la_meme_demande_de_deux_sources_n_est_pas_un_doublon():
    """Deux sorties sur BTC ferment deux parts différentes.

    Les dédupliquer par actif en perdrait une, et une part resterait ouverte
    sans que rien ne le dise — le défaut d'origine, retourné.
    """
    faisceau = Faisceau(_Source("deblocages", sorties=["BTC"]),
                        _Source("regles_figees", sorties=["BTC"]))
    sorties = faisceau.sorties(0, ("BTC",))
    assert len(sorties) == 2
    assert {x.source for x in sorties} == {"deblocages", "regles_figees"}


def test_le_meme_actif_propose_par_deux_sources_reste_deux_intentions():
    """À l'entrée, le contrat sait les distinguer — par identité d'objet.

    L'asymétrie est là : le faisceau route la confirmation d'une ENTRÉE vers
    la bonne source, mais il n'a aucun moyen équivalent pour une SORTIE. Ce
    test fige l'asymétrie, pour qu'on voie ce qui manque plutôt que de croire
    que rien ne manque.
    """
    couverture = _Source("deblocages", entrees=[_intention("BTC")])
    turtle = _Source("regles_figees", entrees=[_intention("BTC")])
    faisceau = Faisceau(couverture, turtle)

    toutes = faisceau.entrees(0)
    assert len(toutes) == 2, "deux sources, deux intentions sur le même actif"
    faisceau.confirmer(toutes[0])
    assert len(couverture.confirmees) == 1 and turtle.confirmees == [], (
        "la confirmation est routée correctement, elle")


# ─────────────────────────────── le dimensionnement d'une jambe adossée

def test_une_jambe_adossee_se_dimensionne_au_notionnel_de_sa_paire():
    """La capacité, elle, est branchable et testée dès maintenant.

    Une jambe de couverture n'est pas une prise de risque indépendante : elle
    RÉDUIT l'exposition directionnelle du livre. La dimensionner par le budget
    de risque donnerait une taille sans rapport avec la jambe qu'elle couvre,
    et le livre ne serait neutre que par accident.

    Elle part donc du notionnel de sa paire. **Tous les autres plafonds
    continuent de s'appliquer** — notionnel brut, levier, marge : la
    couverture consomme du bilan comme n'importe quelle position, et lui
    laisser franchir ces plafonds ferait d'un outil de réduction du risque un
    moyen de l'augmenter.
    """
    limites, compte, mandat = _cadre()

    nu = size_position(account=compte, mandate=mandat, limits=limites,
                       asset="BTC", side=Side.LONG,
                       entry_price=Decimal("100"), stop_price=Decimal("85"))
    adosse = size_position(account=compte, mandate=mandat, limits=limites,
                           asset="BTC", side=Side.LONG,
                           entry_price=Decimal("100"), stop_price=Decimal("85"),
                           notionnel_cible=Decimal("200"))

    assert adosse.notional_usd == pytest.approx(Decimal("200"), abs=Decimal("0.5"))
    assert adosse.binding_constraint == "notionnel adossé"
    assert nu.notional_usd != adosse.notional_usd, (
        "le budget de risque et le notionnel d'une paire n'ont aucune raison "
        "de coïncider")


def test_une_jambe_adossee_reste_soumise_aux_plafonds():
    """Le plafond mord, et le résultat le DIT.

    Si un plafond rabote la couverture sous sa cible, le livre n'est
    adossé qu'en partie. Ce n'est pas un détail comptable : c'est une
    exposition résiduelle au marché que personne n'a décidée. Elle doit
    remonter, pas être avalée.
    """
    limites, compte, mandat = _cadre()   # notionnel max par position : 500 $

    r = size_position(account=compte, mandate=mandat, limits=limites,
                      asset="BTC", side=Side.LONG,
                      entry_price=Decimal("100"), stop_price=Decimal("85"),
                      notionnel_cible=Decimal("900"))
    assert r.notional_usd <= Decimal("500")
    assert r.binding_constraint == "notionnel max par position"
    assert r.couverture_partielle is True, (
        "une couverture rabotée doit être signalée comme partielle")


# ────────────────────────────────── le registre des parts, bout en bout

def test_le_registre_attribue_une_part_a_chaque_source():
    """Deux sources ouvrent sur le MÊME actif ; chacune détient sa part.

    L'exchange nette : il n'y a qu'une position BTC. Le registre est la seule
    chose qui sache qu'elle appartient à deux propriétaires.
    """
    from trading_desk.execution.parts import Parts

    parts = Parts()
    parts.inscrire("deblocages", "BTC", Decimal("0.5"))
    parts.inscrire("regles_figees", "BTC", Decimal("1.5"))

    assert parts.total("BTC") == Decimal("2.0")
    assert parts.part("deblocages", "BTC") == Decimal("0.5")
    assert parts.sources("BTC") == ["deblocages", "regles_figees"]


def test_une_source_ne_retire_jamais_plus_que_sa_part():
    """La garantie qui remplace le défaut d'origine.

    Sans elle, le registre ne ferait que déplacer le bug d'un cran : une
    source demanderait une taille supérieure à ce qu'elle détient, et
    mangerait la part d'une autre.
    """
    from trading_desk.execution.parts import Parts

    parts = Parts()
    parts.inscrire("deblocages", "BTC", Decimal("0.5"))
    pris = parts.retirer("deblocages", "BTC", Decimal("9"))
    assert pris == Decimal("0.5")
    assert parts.total("BTC") == 0


def test_un_stop_touche_recale_les_parts_au_prorata():
    """**Le cas qui déplace le bug si on l'oublie.**

    Une position peut diminuer sans que le desk le demande — stop touché,
    liquidation partielle. Un registre qui annoncerait encore l'ancienne
    taille laisserait une source fermer plus que sa part.

    Le prorata est un choix assumé : quand une position partagée est rognée,
    l'information de savoir QUI a été rogné n'existe pas — c'est une seule
    position chez l'exchange. Le prorata ne privilégie personne ; faire porter
    la perte à une source désignée inventerait une information.
    """
    from trading_desk.execution.parts import Parts

    class _Pos:
        def __init__(self, asset, size):
            self.asset, self.size = asset, size

    parts = Parts()
    parts.inscrire("deblocages", "BTC", Decimal("0.5"))
    parts.inscrire("regles_figees", "BTC", Decimal("1.5"))

    corriges = parts.reconcilier([_Pos("BTC", Decimal("1.0"))])   # moitié partie
    assert corriges == ["BTC"], "une correction silencieuse serait le pire cas"
    assert parts.part("deblocages", "BTC") == Decimal("0.25")
    assert parts.part("regles_figees", "BTC") == Decimal("0.75")
    assert parts.total("BTC") == Decimal("1.0")


def test_une_position_disparue_efface_ses_parts():
    from trading_desk.execution.parts import Parts

    parts = Parts()
    parts.inscrire("deblocages", "BTC", Decimal("0.5"))
    assert parts.reconcilier([]) == ["BTC"]
    assert parts.total("BTC") == 0


def test_une_position_inconnue_du_registre_n_est_PAS_adoptee():
    """On n'invente pas un propriétaire.

    Une position ouverte hors du desk — reprise après redémarrage, geste
    manuel — n'appartient à aucune source. Lui en attribuer une autoriserait
    cette source à la fermer, ce qui est précisément le genre de fermeture non
    demandée que tout ce travail existe pour empêcher.
    """
    from trading_desk.execution.parts import Parts

    class _Pos:
        def __init__(self, asset, size):
            self.asset, self.size = asset, size

    parts = Parts()
    assert parts.reconcilier([_Pos("SOL", Decimal("3"))]) == []
    assert parts.total("SOL") == 0
    assert parts.sources("SOL") == []


# ─────────────────────────── la chaîne complète, deux sources, un actif

def test_une_source_qui_sort_ne_ferme_QUE_sa_part(tmp_path):
    """**La preuve que tout le reste existe pour obtenir.**

    Deux sources ouvrent sur le même actif ; l'exchange nette, il n'y a qu'une
    position. L'une sort, l'autre veut rester. Avant ce travail la position
    entière se fermait ; ici, seule la part de celle qui sort disparaît.

    Le test passe par un vrai pupitre et un vrai exchange papier, pas par des
    doublures : c'est le trajet complet — faisceau, registre des parts,
    dimensionnement, ordre, fill — qui est en cause, et chacune de ses pièces
    prise seule passait déjà avant la correction.
    """
    from trading_desk.api.state import DeskState
    from trading_desk.config import Settings
    from trading_desk.contracts.common import DeskMode
    from trading_desk.contracts.market import FeedHealth, FeedStatus
    from trading_desk.execution.pupitre import Pupitre
    from trading_desk.storage import SqliteStore
    from tests.test_paper import FRICTIONLESS, PaperExchange, carnet, now_ms

    t = now_ms()
    state = DeskState(
        Settings(mode=DeskMode.PAPER, max_stop_distance_bps=Decimal("1600")),
        SqliteStore(":memory:"))
    state.set_feeds((
        FeedHealth(name="trades:BTC", status=FeedStatus.LIVE,
                   last_message_ms=t, max_age_ms=20_000, messages=10),
        FeedHealth(name="book:BTC", status=FeedStatus.LIVE,
                   last_message_ms=t, max_age_ms=10_000, messages=10),
    ), True)

    px = PaperExchange(equity_usd=Decimal("10000"), costs=FRICTIONLESS)
    px.on_book(carnet("BTC", mid=Decimal("100"), pas=Decimal("0.01"),
                      taille=Decimal("100000")))

    couverture = _Source("deblocages", entrees=[_intention("BTC")])
    turtle = _Source("regles_figees", entrees=[_intention("BTC")])
    pupitre = Pupitre(state, px, Faisceau(couverture, turtle), univers=("BTC",))

    pupitre.cycle(t)
    apres_ouverture = px.account_state().positions
    assert len(apres_ouverture) == 1, "l'exchange nette : une seule position"
    taille_totale = apres_ouverture[0].size
    assert pupitre.parts.sources("BTC") == ["deblocages", "regles_figees"]
    assert pupitre.parts.total("BTC") == taille_totale

    # La couverture sort, la règle gelée veut rester.
    couverture._entrees = []
    couverture._sorties = ["BTC"]
    turtle._entrees = []
    part_turtle = pupitre.parts.part("regles_figees", "BTC")

    pupitre.cycle(t + 1000)
    restantes = px.account_state().positions
    assert len(restantes) == 1, (
        "la position de la règle gelée doit survivre à la sortie de l'autre")
    assert restantes[0].size == pytest.approx(part_turtle, rel=Decimal("1e-9"))
    assert pupitre.parts.part("deblocages", "BTC") == 0
    assert pupitre.parts.part("regles_figees", "BTC") == part_turtle


def test_une_source_unique_ferme_toujours_TOUTE_la_position(tmp_path):
    """Le comportement d'avant n'est pas supprimé, il est restreint.

    Une source seule qui rend une chaîne nue ferme la position entière — et
    c'est juste, puisqu'elle la détient toute. Retirer ce chemin obligerait
    chaque pilote à tenir un registre pour un desk mono-source, où le problème
    n'existe pas.

    Ce test est le pendant du précédent : il prouve que les deux chemins
    diffèrent vraiment. Sans lui, celui d'au-dessus pourrait passer parce que
    la fermeture partielle est le SEUL comportement, ce qui casserait tous
    les desks à une source sans que rien ne le dise.
    """
    from trading_desk.api.state import DeskState
    from trading_desk.config import Settings
    from trading_desk.contracts.common import DeskMode
    from trading_desk.contracts.market import FeedHealth, FeedStatus
    from trading_desk.execution.pupitre import Pupitre
    from trading_desk.storage import SqliteStore
    from tests.test_paper import FRICTIONLESS, PaperExchange, carnet, now_ms

    t = now_ms()
    state = DeskState(
        Settings(mode=DeskMode.PAPER, max_stop_distance_bps=Decimal("1600")),
        SqliteStore(":memory:"))
    state.set_feeds((
        FeedHealth(name="trades:BTC", status=FeedStatus.LIVE,
                   last_message_ms=t, max_age_ms=20_000, messages=10),
        FeedHealth(name="book:BTC", status=FeedStatus.LIVE,
                   last_message_ms=t, max_age_ms=10_000, messages=10),
    ), True)
    px = PaperExchange(equity_usd=Decimal("10000"), costs=FRICTIONLESS)
    px.on_book(carnet("BTC", mid=Decimal("100"), pas=Decimal("0.01"),
                      taille=Decimal("100000")))

    # Pas de faisceau : la source est branchée directement, et `sorties` rend
    # des chaînes, comme avant.
    seule = _Source("solo", entrees=[_intention("BTC")])
    pupitre = Pupitre(state, px, seule, univers=("BTC",))
    pupitre.cycle(t)
    assert len(px.account_state().positions) == 1

    seule._entrees = []
    seule._sorties = ["BTC"]
    pupitre.cycle(t + 1000)
    assert px.account_state().positions == (), (
        "une chaîne nue ferme tout — le comportement historique est intact")
