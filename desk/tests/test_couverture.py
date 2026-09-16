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

Ce qui suit démontre la collision plutôt que de la décrire.
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


def test_la_sortie_d_une_couverture_fermerait_la_regle_gelee():
    """**Le blocage, en un test.**

    Le pilote des déblocages ferme sa jambe de couverture BTC ; la règle gelée
    `turtle_btc_1d` tient une position BTC qu'elle ne veut pas fermer. L'union
    des sorties du faisceau rend « BTC », et le pupitre ferme la position
    entière — celle de la règle gelée comprise.

    L'union est délibérée et juste dans le cas général : une sortie réduit le
    risque, et la refuser garderait une position que sa propre règle veut
    fermer. Elle devient fausse ici parce que **deux sources possèdent des
    parts distinctes du même actif**, ce que le contrat ne sait pas exprimer.
    """
    deblocages = _Source("deblocages", sorties=["BTC"])   # fin de fenêtre
    figees = _Source("regles_figees", sorties=[])         # veut GARDER BTC
    faisceau = Faisceau(deblocages, figees)

    assert faisceau.sorties(0, ("BTC",)) == ["BTC"], (
        "l'union rend BTC alors qu'une seule des deux sources le demande")

    # Et rien dans le contrat ne permet au pupitre de savoir quelle PART de la
    # position BTC appartient à quelle source : `sorties` rend des chaînes.
    assert all(isinstance(x, str) for x in faisceau.sorties(0, ("BTC",))), (
        "le contrat de sortie ne porte aucune identité de position — c'est "
        "précisément ce qu'il faudrait changer pour adosser en sécurité")


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
