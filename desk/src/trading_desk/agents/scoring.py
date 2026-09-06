"""La conviction, retirée au modèle et rendue à un calcul.

## Ce qui ne marchait pas

Jusqu'ici l'agent Stratégie renvoyait lui-même un champ `conviction`, et une
porte déterministe le comparait à 0,60. Trois mesures ont montré que ce
nombre ne valait rien :

- **il ne prédit pas.** La corrélation entre la conviction annoncée et
  l'issue réelle des setups, mesurée sur le registre fantôme, est nulle ;
- **il est surconfiant.** Les setups annoncés à 0,7 ne gagnent pas sept fois
  sur dix ;
- **il bloque tout.** Il plafonne en pratique vers 0,55, donc le desk n'a
  jamais franchi la porte, jamais émis un mandat, et n'a donc jamais rien
  appris.

Un nombre qui ne prédit rien et qui bloque tout est pire qu'inutile : il
donne l'apparence d'un filtre quantitatif là où il n'y a qu'un mot du modèle
déguisé en probabilité.

## Ce qui remplace

Le modèle ne rend plus de chiffre. Il rend une **évaluation qualitative** :
quatre jugements ordinaux sur ce qu'il voit, plus un signalement d'obstacle.
Ce sont des questions auxquelles un lecteur de marché peut répondre — « le
stop est-il à un endroit où la thèse meurt vraiment ? » — et non une
probabilité qu'il n'a aucun moyen d'estimer.

Ce module pondère cette évaluation. Il est **pur** : mêmes entrées, même
score, toujours. C'est là tout l'intérêt, et il tient en trois points.

**Reproductible.** Deux cycles sur la même situation donnent le même score.
Le modèle, lui, donnait 0,55 puis 0,62 sur le même graphique.

**Inspectable.** `Note.termes` dit ce que chaque critère a apporté. Un score
de 0,42 se lit ; un 0,42 sorti d'un modèle ne se lit pas.

**Ajustable.** Les poids sont un tableau de nombres dans ce fichier. Quand
le registre fantôme aura assez d'issues, ils se calent sur des données. Des
jetons dans un modèle ne se calent sur rien.

## Ce que ce module n'est PAS

**Ce score n'est pas une probabilité.** 0,75 ne veut pas dire « gagne trois
fois sur quatre ». C'est un score ordonné sur [0, 1] dont seule la
*monotonie* est revendiquée pour l'instant : un setup mieux noté est censé
être meilleur qu'un setup moins bien noté. Rien de plus.

Les poids ci-dessous sont un **a priori**, pas un résultat. Ils sont posés à
la main, ils sont probablement faux dans le détail, et je le dis ici plutôt
que de laisser croire le contraire. Ils valent mieux que le nombre du modèle
sur un seul point, mais ce point est décisif : on peut les corriger.

Le seuil de 0,60 dans `graph.py` est lui aussi **hérité, pas dérivé**. Il
vient de l'ancienne porte. Le calibrer demande des issues réelles, que le
registre fantôme accumule et que nous n'avons pas encore.
"""

from __future__ import annotations

from decimal import Decimal

from ..contracts.common import Frozen
from ..contracts.signals import CounterThesis, RegimeRead, SetupProposal

# --------------------------------------------------------------------------
#  Les poids
# --------------------------------------------------------------------------
#
# Somme des maxima = 1,00 exactement. Ce n'est pas cosmétique : sans ça le
# score ne pourrait jamais atteindre le haut de son échelle, la porte à 0,60
# serait infranchissable par construction, et l'absence de mandat passerait
# pour un jugement du desk alors qu'elle serait un défaut d'arithmétique.
# `test_un_setup_parfait_atteint_le_haut_de_lechelle` verrouille ce point.

# Chaque dimension est une table {etiquette: poids}. Le score est la somme
# des poids retenus, un par dimension.
#
# Somme des maxima = 1,00 exactement. Ce n'est pas cosmetique : sans ca le
# score ne pourrait jamais atteindre le haut de son echelle, la porte a 0,60
# serait infranchissable par construction, et l'absence de mandat passerait
# pour un jugement du desk alors qu'elle serait un defaut d'arithmetique.
# `test_un_setup_parfait_atteint_le_haut_de_lechelle` verrouille ce point.

DIMENSIONS: tuple[tuple[str, dict[str, str]], ...] = (
    ("alignement", {"REGIME_CONTRE": "0.00", "REGIME_NEUTRE": "0.12",
                    "REGIME_AVEC": "0.25"}),
    ("niveau", {"NIVEAU_AUCUN": "0.00", "NIVEAU_FLOU": "0.10",
                "NIVEAU_NET": "0.20"}),
    ("invalidation", {"STOP_ARBITRAIRE": "0.00", "STOP_PLAUSIBLE": "0.10",
                      "STOP_STRUCTUREL": "0.20"}),
    ("confluence", {"CONFLUENCE_1": "0.00", "CONFLUENCE_2": "0.10",
                    "CONFLUENCE_3P": "0.20"}),
    # Les penalites ne savent que retrancher, comme le conseil de risque.
    ("obstacle", {"OBSTACLE_AUCUN": "0.00", "OBSTACLE_MINEUR": "-0.10",
                  "OBSTACLE_MAJEUR": "-0.30"}),
)

# La confiance de l'agent Regime est le seul terme positif que le code
# calcule sans passer par un jugement : elle est deja dans `RegimeRead`.
POIDS_REGIME = Decimal("0.15")
POIDS_SEVERITE = Decimal("-0.40")

ETIQUETTES = frozenset(e for _, table in DIMENSIONS for e in table)


class Note(Frozen):
    """Un score, et le detail de sa fabrication.

    `termes` n'est pas du confort de journalisation : sans lui, remplacer un
    nombre opaque du modele par un nombre opaque du code n'aurait rien
    resolu. Un score doit pouvoir etre conteste ligne par ligne.

    `omises` nomme les dimensions sur lesquelles le modele n'a rien dit. Un
    score bas parce que le setup est mauvais et un score bas parce que
    l'agent n'a pas repondu sont deux situations differentes, et les
    confondre ferait passer un defaut de format pour un jugement de marche.
    """

    score: Decimal
    termes: tuple[tuple[str, Decimal], ...] = ()
    omises: tuple[str, ...] = ()

    @property
    def explication(self) -> str:
        detail = ", ".join(f"{nom} {v:+.2f}" for nom, v in self.termes)
        if self.omises:
            detail += f" ; non evalue : {', '.join(self.omises)}"
        return detail


def _dimension(table: dict[str, str], etiquettes: frozenset[str]) -> Decimal | None:
    """Le poids retenu pour une dimension, ou `None` si elle est absente.

    **Deux etiquettes contradictoires sur la meme dimension retiennent la
    plus basse.** Un modele qui annonce a la fois `REGIME_AVEC` et
    `REGIME_CONTRE` n'a pas tranche ; lui accorder le meilleur des deux
    recompenserait l'indecision, et le format n'empeche pas ce cas.
    """
    poids = [Decimal(v) for e, v in table.items() if e in etiquettes]
    return min(poids) if poids else None


def noter(
    setup: SetupProposal,
    *,
    regime: RegimeRead | None = None,
    counter: CounterThesis | None = None,
) -> Note:
    """Le score du setup, sur [0, 1], et son detail.

    `regime` et `counter` sont optionnels parce que la note est calculee a
    deux moments qui ne disposent pas des memes pieces : avant l'avocat du
    diable pour le journal, et apres pour la porte. Absents, leurs termes
    valent zero — un regime inconnu n'ajoute rien, une objection inexistante
    ne retranche rien.

    Une etiquette inconnue est ignoree, jamais levee. Le schema contraint
    deja les valeurs, mais ce module est aussi appele sur des setups relus
    depuis le journal, ou une version anterieure a pu ecrire une etiquette
    disparue depuis. Un cycle de decision ne doit pas tomber pour ca.
    """
    presentes = frozenset(setup.evaluation)
    termes: list[tuple[str, Decimal]] = []
    omises: list[str] = []
    for nom, table in DIMENSIONS:
        poids = _dimension(table, presentes)
        if poids is None:
            omises.append(nom)
        else:
            termes.append((nom, poids))

    if regime is not None and not regime.abstained:
        termes.append(("regime", POIDS_REGIME * regime.confidence))
    if counter is not None and not counter.abstained:
        termes.append(("objection", POIDS_SEVERITE * counter.severity))

    brut = sum((v for _, v in termes), Decimal("0"))
    borne = max(Decimal("0"), min(Decimal("1"), brut))
    return Note(score=borne, termes=tuple(termes), omises=tuple(omises))
