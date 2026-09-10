"""Le score algorithmique qui remplace la conviction du modèle.

Ce que ces tests protègent tient en une phrase : **un critère qui rend
toujours la même valeur ne classe rien.**

C'est la leçon d'une exécution réelle. La première version posait cinq
questions à l'agent Stratégie ; douze cycles sur douze fenêtres de marché
différentes ont rendu quatre valeurs CONSTANTES — alignement toujours +0,25,
invalidation toujours +0,20, confluence toujours +0,10, obstacle toujours
−0,10. Le score se réduisait à une constante plus du bruit, et aucun réglage
de seuil n'y aurait rien changé.

La cause n'était pas le seuil, c'était la question : trois des cinq
demandaient à l'agent de noter **son propre travail**. Il avait choisi le
sens, l'entrée et le stop. Un agent qui s'auto-évalue rend le maximum — le
défaut exact qui avait condamné l'ancien champ `conviction`, revenu sous un
autre costume.

Ces trois-là sont maintenant calculées sur les barres. Les tests les plus
importants de ce fichier sont donc ceux qui vérifient qu'elles **varient
avec le marché** : sans ça, on aurait simplement déplacé la constante.
"""

from __future__ import annotations

from decimal import Decimal

from trading_desk.agents.scoring import (
    DIMENSIONS,
    ETIQUETTES,
    ETIQUETTES_MODELE,
    POIDS_REGIME,
    POIDS_SEVERITE,
    mesurer,
    noter,
)
from trading_desk.contracts import (
    CounterThesis,
    Regime,
    RegimeRead,
    SetupProposal,
    Side,
)
from trading_desk.features.bars import Bar

JOUR = 86_400_000


def _bar(i, bas, haut, cloture=None):
    c = cloture if cloture is not None else (bas + haut) / 2
    return Bar(asset="T", ts_ms=i * JOUR, open=Decimal(str(c)),
               high=Decimal(str(haut)), low=Decimal(str(bas)),
               close=Decimal(str(c)), volume=Decimal("10"))


def _plat(n=250, bas=99.0, haut=101.0):
    return [_bar(i, bas, haut) for i in range(n)]


def _setup(side=Side.LONG, entree="100", stop=None, cible=None, *, eval_=()):
    # Le contrat exige un stop du BON côté de l'entrée, et il a raison : un
    # short dont le stop est sous l'entrée n'est pas un short mal noté,
    # c'est un ordre incohérent. Les défauts suivent donc le sens.
    if stop is None:
        stop = "90" if side is Side.LONG else "110"
    if cible is None:
        cible = "120" if side is Side.LONG else "80"
    return SetupProposal(
        asset="T", side=side, entry_price=Decimal(entree),
        stop_price=Decimal(stop), target_price=Decimal(cible),
        evaluation=tuple(eval_),
    )


PARFAIT_MODELE = ("CONFLUENCE_3P", "OBSTACLE_AUCUN")


# --------------------------------------------------------------------------
#  Les mesures VARIENT avec le marché — le test qui donne son sens au reste
# --------------------------------------------------------------------------

def test_lalignement_suit_le_regime_et_le_sens_pas_lavis_de_lagent():
    """Une comparaison, pas un jugement. L'agent annonçait `REGIME_AVEC` sur
    les douze cycles ; le code, lui, distingue un achat en tendance haussière
    d'un achat à contre-courant."""
    bars = _plat()
    haussier = RegimeRead(regime=Regime.TREND_UP, confidence=Decimal("0.8"))
    baissier = RegimeRead(regime=Regime.TREND_DOWN, confidence=Decimal("0.8"))

    assert "REGIME_AVEC" in mesurer(_setup(Side.LONG), bars, haussier)
    assert "REGIME_CONTRE" in mesurer(_setup(Side.SHORT), bars, haussier)
    assert "REGIME_CONTRE" in mesurer(_setup(Side.LONG), bars, baissier)
    assert "REGIME_AVEC" in mesurer(_setup(Side.SHORT), bars, baissier)


def test_en_range_acheter_le_HAUT_contredit_le_regime():
    """En range, exploiter le régime c'est acheter le bas et vendre le haut.
    Un achat en haut de range le contredit — même si l'agent jurait le
    contraire, ce qu'il faisait systématiquement."""
    bars = [_bar(i, 90.0, 110.0) for i in range(250)]
    range_ = RegimeRead(regime=Regime.RANGE, confidence=Decimal("0.7"))
    assert "REGIME_AVEC" in mesurer(_setup(Side.LONG, "92"), bars, range_)
    assert "REGIME_CONTRE" in mesurer(_setup(Side.LONG, "108"), bars, range_)
    assert "REGIME_NEUTRE" in mesurer(_setup(Side.LONG, "100"), bars, range_)


def test_le_niveau_compte_les_touches_PAR_GRAPPE_pas_par_barre():
    """Vingt barres consécutives qui traversent le même prix sont UNE visite
    du marché à ce niveau, pas vingt. Les compter séparément ferait passer
    une dérive lente pour un support respecté — et rendrait `NIVEAU_NET`
    constant, ce qu'on cherche précisément à éviter.
    """
    # Une seule longue traversée : une grappe, donc FLOU et non NET.
    longue = [_bar(i, 99.0, 101.0) for i in range(250)]
    assert "NIVEAU_FLOU" in mesurer(_setup(entree="100"), longue, None)

    # Trois visites distinctes, séparées par des barres qui s'en éloignent.
    trois = []
    for i in range(250):
        if i in (60, 130, 200):
            trois.append(_bar(i, 99.0, 101.0))
        else:
            trois.append(_bar(i, 104.0, 106.0))
    assert "NIVEAU_NET" in mesurer(_setup(entree="100"), trois, None)

    # Jamais touché.
    loin = [_bar(i, 200.0, 210.0) for i in range(250)]
    assert "NIVEAU_AUCUN" in mesurer(_setup(entree="100"), loin, None)


def test_le_stop_est_structurel_seulement_au_DELA_de_lextreme():
    """« Structurel » veut dire : le franchir prouve que la lecture était
    fausse. Un stop posé à l'intérieur du bruit récent est une distance de
    dimensionnement, pas une invalidation — et l'agent le qualifiait de
    structurel dans 100 % des cas."""
    bars = [_bar(i, 95.0, 105.0) for i in range(250)]
    assert "STOP_STRUCTUREL" in mesurer(_setup(stop="94"), bars, None)
    assert "STOP_ARBITRAIRE" in mesurer(_setup(stop="99"), bars, None)

    # Sous le plus bas récent mais pas sous le plus bas long : défendable.
    mixte = [_bar(i, 90.0, 105.0) if i < 150 else _bar(i, 96.0, 105.0)
             for i in range(250)]
    assert "STOP_PLAUSIBLE" in mesurer(_setup(stop="95"), mixte, None)


def test_les_mesures_produisent_des_scores_DIFFERENTS_sur_des_marches_differents():
    """Le test qui résume le module.

    Sur douze fenêtres réelles, l'ancienne version rendait des scores tenant
    entre 0,41 et 0,57 — une constante et du bruit. Deux marchés
    délibérément opposés doivent maintenant produire un écart franc, sinon
    on a simplement déplacé la constante du modèle vers le code.
    """
    haussier = RegimeRead(regime=Regime.TREND_UP, confidence=Decimal("0.8"))
    bon_marche = []
    for i in range(250):
        bon_marche.append(_bar(i, 99.0, 101.0) if i in (60, 130, 200)
                          else _bar(i, 104.0, 106.0))
    bon = noter(_setup(Side.LONG, "100", "95", "120", eval_=PARFAIT_MODELE),
                bars=bon_marche, regime=haussier)

    mauvais_marche = [_bar(i, 200.0, 210.0) for i in range(250)]
    mauvais = noter(_setup(Side.SHORT, "100", "101", "80",
                           eval_=("CONFLUENCE_1", "OBSTACLE_MAJEUR")),
                    bars=mauvais_marche, regime=haussier)

    assert bon.score - mauvais.score > Decimal("0.5"), (
        f"écart trop faible : {bon.score} contre {mauvais.score}\n"
        f"  bon     : {bon.explication}\n  mauvais : {mauvais.explication}")


# --------------------------------------------------------------------------
#  L'échelle reste parcourue en entier
# --------------------------------------------------------------------------

def test_un_setup_parfait_atteint_le_haut_de_lechelle():
    """Si la somme des poids maximaux valait 0,85, toute la moitié haute du
    score serait inatteignable, et un seuil relevé un jour fermerait le desk
    sans que personne ne comprenne pourquoi."""
    bars = []
    for i in range(250):
        bars.append(_bar(i, 99.0, 101.0) if i in (60, 130, 200)
                    else _bar(i, 104.0, 106.0))
    note = noter(_setup(Side.LONG, "100", "94", "120", eval_=PARFAIT_MODELE),
                 bars=bars,
                 regime=RegimeRead(regime=Regime.TREND_UP,
                                   confidence=Decimal("1")))
    assert note.score == Decimal("1"), note.explication


def test_le_pire_setup_tombe_a_zero():
    bars = [_bar(i, 200.0, 210.0) for i in range(250)]
    note = noter(_setup(Side.SHORT, "100", "101", "80",
                        eval_=("CONFLUENCE_1", "OBSTACLE_MAJEUR")),
                 bars=bars,
                 regime=RegimeRead(regime=Regime.TREND_UP,
                                   confidence=Decimal("1")),
                 counter=CounterThesis(severity=Decimal("1")))
    assert note.score == Decimal("0")


# --------------------------------------------------------------------------
#  Reproductible, inspectable
# --------------------------------------------------------------------------

def test_le_meme_setup_donne_toujours_le_meme_score():
    """Ce que le modèle ne faisait pas : il donnait 0,55 puis 0,62 sur la
    même situation."""
    bars, s = _plat(), _setup(eval_=PARFAIT_MODELE)
    r = RegimeRead(regime=Regime.RANGE, confidence=Decimal("0.7"))
    assert len({noter(s, bars=bars, regime=r).score for _ in range(20)}) == 1


def test_chaque_terme_dit_ce_quil_a_apporte():
    """Sans le détail, on aurait déplacé l'opacité du modèle vers le code —
    et c'est ce détail qui a permis de diagnostiquer les quatre constantes
    pour 1,33 $ au lieu d'une seconde campagne complète."""
    note = noter(_setup(eval_=PARFAIT_MODELE), bars=_plat(),
                 regime=RegimeRead(regime=Regime.RANGE,
                                   confidence=Decimal("0.5")))
    noms = dict(note.termes)
    assert noms["confluence"] == Decimal("0.20")
    assert noms["regime"] == POIDS_REGIME * Decimal("0.5")
    assert sum(noms.values()) == note.score
    assert "confluence +0.20" in note.explication


def test_une_objection_severe_fait_baisser_le_score():
    bars, s = _plat(), _setup(eval_=PARFAIT_MODELE)
    sans = noter(s, bars=bars).score
    avec = noter(s, bars=bars, counter=CounterThesis(severity=Decimal("0.5")))
    assert avec.score == sans + POIDS_SEVERITE * Decimal("0.5")


# --------------------------------------------------------------------------
#  Les cas tordus
# --------------------------------------------------------------------------

def test_le_modele_ne_peut_pas_sauto_absoudre():
    """Le calcul PRIME sur le modèle.

    Un setup relu depuis le journal peut porter des étiquettes d'une version
    antérieure, dont `REGIME_AVEC`. Si le code juge le setup contre-tendance,
    c'est le code qui gagne : `_dimension` retient la plus basse valeur d'une
    dimension. Sans cette règle, il suffirait de réémettre l'ancienne
    étiquette pour annuler la mesure.
    """
    bars = _plat()
    haussier = RegimeRead(regime=Regime.TREND_UP, confidence=Decimal("0.8"))
    court = _setup(Side.SHORT, "100", "110", "80")       # contre-tendance
    menteur = court.model_copy(update={"evaluation": ("REGIME_AVEC",)})
    assert dict(noter(menteur, bars=bars, regime=haussier).termes)["alignement"] \
        == Decimal("0")


def test_sans_barres_les_dimensions_calculees_sont_OMISES_pas_nulles():
    """Un score bas parce que le setup est mauvais et un score bas parce
    qu'on n'a pas fourni les barres sont deux situations différentes. Les
    confondre ferait chercher la cause du côté du marché."""
    note = noter(_setup(eval_=PARFAIT_MODELE))
    assert set(note.omises) == {"alignement", "niveau", "invalidation"}
    assert "non evalue" in note.explication


def test_un_agent_abstenu_ne_contribue_ni_en_plus_ni_en_moins():
    """Une abstention n'est pas une confiance nulle : c'est une absence. La
    compter comme un zéro ferait payer au setup le silence d'un autre."""
    bars, s = _plat(), _setup(eval_=PARFAIT_MODELE)
    muet = RegimeRead(regime=Regime.RANGE, confidence=Decimal("0.9"),
                      abstained=True, abstain_reason="indicateurs manquants")
    assert noter(s, bars=bars, regime=muet).score == noter(s, bars=bars).score


def test_une_etiquette_inconnue_est_ignoree_et_ne_leve_pas():
    """Ce module est appelé sur des setups relus depuis le journal, où une
    version antérieure a pu écrire une étiquette disparue depuis."""
    s = _setup(eval_=PARFAIT_MODELE)
    vieux = s.model_copy(update={"evaluation": (*PARFAIT_MODELE, "ETIQUETTE_MORTE")})
    assert noter(vieux, bars=_plat()).score == noter(s, bars=_plat()).score


# --------------------------------------------------------------------------
#  Le lien avec le reste du desk
# --------------------------------------------------------------------------

def test_le_schema_naccepte_QUE_les_etiquettes_du_modele():
    """Le contrat ne doit pas laisser l'agent émettre une étiquette
    calculée : ce serait rouvrir la porte de l'auto-évaluation."""
    from typing import get_args
    champ = SetupProposal.model_fields["evaluation"].annotation
    admises = set(get_args(get_args(champ)[0]))
    assert admises == set(ETIQUETTES_MODELE)
    assert admises < set(ETIQUETTES), "le barème doit couvrir plus que le modèle"


def test_aucune_etiquette_ne_sert_deux_dimensions():
    """`AUCUN` valait à la fois « pas de niveau » et « pas d'obstacle »."""
    vues: set[str] = set()
    for _, table in DIMENSIONS:
        assert not (vues & set(table)), "étiquette partagée entre dimensions"
        vues |= set(table)
