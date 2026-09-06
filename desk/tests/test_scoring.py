"""Le score algorithmique qui remplace la conviction du modèle.

Ce que ces tests protègent tient en une phrase : **remplacer un nombre
opaque du modèle par un nombre opaque du code n'aurait rien résolu.**

Le gain revendiqué n'est pas la justesse — les poids sont un a priori posé à
la main, et probablement faux dans le détail. Le gain est ailleurs, en trois
propriétés qui se vérifient, et qui sont ce que les tests ci-dessous
mesurent :

- **reproductible** : mêmes entrées, même score, toujours ;
- **inspectable** : chaque terme dit ce qu'il a apporté ;
- **atteignable** : l'échelle va réellement de 0 à 1, donc la porte à 0,60
  peut être franchie — sans ça, l'absence de mandat serait un défaut
  d'arithmétique déguisé en jugement de marché.
"""

from __future__ import annotations

from decimal import Decimal

from trading_desk.agents.scoring import (
    DIMENSIONS,
    ETIQUETTES,
    POIDS_REGIME,
    POIDS_SEVERITE,
    noter,
)
from trading_desk.contracts import CounterThesis, RegimeRead, SetupProposal, Side

PARFAIT = ("REGIME_AVEC", "NIVEAU_NET", "STOP_STRUCTUREL",
           "CONFLUENCE_3P", "OBSTACLE_AUCUN")
NUL = ("REGIME_CONTRE", "NIVEAU_AUCUN", "STOP_ARBITRAIRE",
       "CONFLUENCE_1", "OBSTACLE_AUCUN")


def _setup(*etiquettes) -> SetupProposal:
    return SetupProposal(
        asset="BTC", side=Side.LONG,
        entry_price=Decimal("64000"), stop_price=Decimal("63000"),
        target_price=Decimal("66500"), evaluation=tuple(etiquettes),
    )


# --------------------------------------------------------------------------
#  L'échelle : elle doit être parcourue en entier
# --------------------------------------------------------------------------

def test_un_setup_parfait_atteint_le_haut_de_lechelle():
    """Le test le plus important du module.

    Si la somme des poids maximaux valait 0,85, la porte à 0,60 resterait
    franchissable mais toute la moitié haute du score serait inatteignable —
    et un seuil relevé un jour à 0,90 fermerait le desk définitivement sans
    que personne ne comprenne pourquoi. La somme vaut 1,00 exactement, et ce
    test le vérifie par le haut plutôt qu'en relisant le tableau.
    """
    note = noter(_setup(*PARFAIT), regime=RegimeRead(confidence=Decimal("1")))
    assert note.score == Decimal("1")


def test_un_setup_sans_qualite_tombe_a_zero():
    note = noter(_setup(*NUL))
    assert note.score == Decimal("0")
    assert not note.omises, "les cinq dimensions sont renseignées"


def test_le_score_franchit_la_porte_du_desk_sur_un_bon_setup():
    """La porte héritée est à 0,60. Un setup franc, avec un régime lu
    correctement et une objection modérée, doit passer — sinon le desk
    resterait muet comme il l'était avec le chiffre du modèle, et le
    changement n'aurait servi à rien."""
    from trading_desk.agents.graph import GraphConfig

    note = noter(_setup(*PARFAIT),
                 regime=RegimeRead(confidence=Decimal("0.7")),
                 counter=CounterThesis(severity=Decimal("0.3")))
    assert note.score >= GraphConfig().min_conviction, note.explication


# --------------------------------------------------------------------------
#  Reproductible, et inspectable
# --------------------------------------------------------------------------

def test_le_meme_setup_donne_toujours_le_meme_score():
    """Ce que le modèle ne faisait pas : il donnait 0,55 puis 0,62 sur la
    même situation."""
    s = _setup(*PARFAIT)
    r = RegimeRead(confidence=Decimal("0.7"))
    assert len({noter(s, regime=r).score for _ in range(20)}) == 1


def test_chaque_terme_dit_ce_quil_a_apporte():
    """Sans le détail, on aurait juste déplacé l'opacité du modèle vers le
    code — et un score contesté serait resté incontestable."""
    note = noter(_setup(*PARFAIT), regime=RegimeRead(confidence=Decimal("0.5")))
    noms = dict(note.termes)
    assert noms["alignement"] == Decimal("0.25")
    assert noms["regime"] == POIDS_REGIME * Decimal("0.5")
    assert sum(noms.values()) == note.score
    assert "alignement +0.25" in note.explication


# --------------------------------------------------------------------------
#  Les pénalités ne savent que retrancher
# --------------------------------------------------------------------------

def test_un_obstacle_majeur_fait_baisser_le_score():
    haut = noter(_setup(*PARFAIT)).score
    bas = noter(_setup(*PARFAIT[:4], "OBSTACLE_MAJEUR")).score
    assert bas < haut
    assert haut - bas == Decimal("0.30")


def test_une_objection_severe_fait_baisser_le_score():
    s = _setup(*PARFAIT)
    sans = noter(s).score
    avec = noter(s, counter=CounterThesis(severity=Decimal("0.5"))).score
    assert avec == sans + POIDS_SEVERITE * Decimal("0.5")


def test_aucune_entree_ne_peut_pousser_le_score_hors_de_zero_un():
    """La borne est structurelle, pas décorative : un score négatif ou
    supérieur à 1 se propagerait dans le mandat, où `conviction` est
    contraint à [0, 1] et lèverait une exception au pire moment."""
    pire = noter(_setup("REGIME_CONTRE", "NIVEAU_AUCUN", "STOP_ARBITRAIRE",
                        "CONFLUENCE_1", "OBSTACLE_MAJEUR"),
                 counter=CounterThesis(severity=Decimal("1")))
    assert pire.score == Decimal("0")
    meilleur = noter(_setup(*PARFAIT), regime=RegimeRead(confidence=Decimal("1")),
                     counter=CounterThesis(severity=Decimal("0")))
    assert meilleur.score == Decimal("1")


# --------------------------------------------------------------------------
#  Les cas tordus, qui arrivent pour de vrai
# --------------------------------------------------------------------------

def test_une_dimension_omise_est_nommee_et_ne_rapporte_rien():
    """Un score bas parce que le setup est mauvais et un score bas parce que
    l'agent n'a pas répondu sont deux situations différentes. Les confondre
    ferait passer un défaut de format pour un jugement de marché — et on
    chercherait la cause du côté du marché pendant des semaines."""
    note = noter(_setup("REGIME_AVEC", "NIVEAU_NET"))
    assert note.omises == ("invalidation", "confluence", "obstacle")
    assert "non evalue" in note.explication
    assert note.score == Decimal("0.45")


def test_deux_etiquettes_contradictoires_retiennent_la_PIRE():
    """Le format n'empêche pas le modèle d'annoncer une chose et son
    contraire. Lui accorder le meilleur des deux récompenserait l'indécision
    — et un agent qui coche tout obtiendrait le score maximal."""
    note = noter(_setup("REGIME_AVEC", "REGIME_CONTRE"))
    assert dict(note.termes)["alignement"] == Decimal("0")


def test_une_etiquette_inconnue_est_ignoree_et_ne_leve_pas():
    """Ce module est aussi appelé sur des setups relus depuis le journal, où
    une version antérieure du schéma a pu écrire une étiquette disparue
    depuis. Un cycle de décision ne doit pas tomber pour ça."""
    s = _setup(*PARFAIT).model_copy(
        update={"evaluation": (*PARFAIT, "ETIQUETTE_DUNE_VERSION_MORTE")})
    assert noter(s).score == noter(_setup(*PARFAIT)).score


def test_un_agent_abstenu_ne_contribue_ni_en_plus_ni_en_moins():
    """Une abstention n'est pas une confiance nulle ni une objection nulle :
    c'est une absence. La compter comme un zéro ferait payer au setup le
    silence d'un autre agent."""
    s = _setup(*PARFAIT)
    regime_muet = RegimeRead(confidence=Decimal("0.9"), abstained=True,
                             abstain_reason="indicateurs manquants")
    assert noter(s, regime=regime_muet).score == noter(s).score
    assert "regime" not in dict(noter(s, regime=regime_muet).termes)


# --------------------------------------------------------------------------
#  Le lien avec le reste du desk
# --------------------------------------------------------------------------

def test_toutes_les_etiquettes_du_bareme_sont_dans_le_schema():
    """Le barème et le contrat doivent nommer exactement le même ensemble.
    Une étiquette pondérée que le schéma refuse ne serait jamais émise ; une
    étiquette émise que le barème ignore vaudrait zéro en silence."""
    champ = SetupProposal.model_fields["evaluation"].annotation
    from typing import get_args
    admises = set(get_args(get_args(champ)[0]))
    assert admises == set(ETIQUETTES)


def test_aucune_etiquette_ne_sert_deux_dimensions():
    """`AUCUN` valait à la fois « pas de niveau » et « pas d'obstacle ». Les
    étiquettes se décrivent maintenant elles-mêmes, et ce test empêche la
    collision de revenir."""
    vues: set[str] = set()
    for _, table in DIMENSIONS:
        assert not (vues & set(table)), "étiquette partagée entre dimensions"
        vues |= set(table)
