"""Un declencheur bat-il le hasard, et a quel horizon ?

C'est la barre a laquelle six strategies ont echoue, appliquee cette fois a
la Sentinelle. Elle repond a deux questions DISTINCTES, qu'il ne faut jamais
confondre :

**Le declencheur predit-il un MOUVEMENT ?** (amplitude) Si oui, il fait son
travail d'architecture : reveiller le desk quand il se passe quelque chose.
Ca ne rapporte rien en soi, mais ca justifie de depenser l'appel.

**Le declencheur predit-il une DIRECTION ?** (rendement signe) Si oui, c'est
un edge — et ce serait la premiere chose mesuree comme non aleatoire de tout
le projet.

Un declencheur peut franchir la premiere sans la seconde. C'est meme le
resultat le plus probable, et ce n'est pas un echec : l'architecture
Sentinelle vaut alors son cout sans que le signal vaille de l'argent.

## Quatre precautions, dont trois corrigent des biais qui gonflent la
## significativite

**Le meme melange de sens.** Le bras aleatoire reutilise le MULTI-ENSEMBLE
exact des sens observes, melange. Sans ca, un declencheur majoritairement
long dans un marche haussier battrait un contrefactuel a sens tires a pile ou
face — et l'on mesurerait la derive du marche, pas le declencheur.

**Pas de fenetres qui se chevauchent.** Des barres declenchees consecutives
produisent des rendements presque identiques a horizon H. Les compter comme
des observations independantes divise artificiellement l'ecart-type. Un delai
de refroidissement de H barres ne garde qu'un evenement par fenetre.

**Le meme horizon des deux cotes**, et les evenements trop proches de la fin
de serie sont ecartes — pas tronques, ce qui les ferait paraitre neutres.

**La correction porte sur TOUTES les hypotheses ensemble.** Balayer trois
horizons triple leur nombre : 4 declencheurs x 7 actifs x 2 intervalles x 3
horizons font 168 tests. Chercher « l'horizon ou l'edge est maximal » revient
a prendre le maximum de 168 tirages bruites, ce qui produit toujours un
gagnant. Benjamini-Hochberg sur l'ensemble est ce qui distingue une
cartographie d'une illusion.
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from dataclasses import dataclass

from ..features.bars import Bar
from .triggers import Declenchement


@dataclass(frozen=True)
class Resultat:
    """Une cellule : un declencheur, un actif, un intervalle, un horizon."""

    declencheur: str
    actif: str
    intervalle: str
    horizon_barres: int
    horizon_libelle: str
    evenements: int
    rendement_moyen_bps: float
    p_direction: float | None
    amplitude_moyenne_bps: float
    p_amplitude: float | None
    nul_direction_bps: float
    nul_amplitude_bps: float


def sans_chevauchement(declenchements: Sequence[Declenchement],
                       horizon: int) -> list[Declenchement]:
    """Ne garde qu'un evenement par fenetre de `horizon` barres.

    Le premier de chaque grappe, pas le plus fort : choisir le plus fort
    reviendrait a selectionner sur une intensite dont on n'a pas montre
    qu'elle predit quoi que ce soit, et a introduire un tri retrospectif.
    """
    gardes: list[Declenchement] = []
    dernier = -10**9
    for d in sorted(declenchements, key=lambda x: x.index):
        if d.index - dernier >= horizon:
            gardes.append(d)
            dernier = d.index
    return gardes


def _rendement(bars: Sequence[Bar], i: int, horizon: int, sens: int) -> float | None:
    """Rendement signe en points de base, ou `None` si l'horizon deborde."""
    if i + horizon >= len(bars):
        return None
    depart = float(bars[i].close)
    if depart <= 0:
        return None
    brut = (float(bars[i + horizon].close) - depart) / depart
    return sens * brut * 10_000


def evaluer(bars: list[Bar], declenchements: Sequence[Declenchement], *,
            horizon: int, horizon_libelle: str, declencheur: str, actif: str,
            intervalle: str, tirages: int = 2000,
            graine: int = 20260906) -> Resultat | None:
    """Compare les rendements apres declenchement a des dates au hasard."""
    evenements = sans_chevauchement(declenchements, horizon)
    signes = [d.sens for d in evenements if _rendement(bars, d.index, horizon, 1) is not None]
    observes = [_rendement(bars, d.index, horizon, d.sens) for d in evenements]
    observes = [r for r in observes if r is not None]
    n = len(observes)
    if n < 10:
        return None

    moyenne = sum(observes) / n
    amplitude = sum(abs(r) for r in observes) / n

    # Le bras aleatoire : memes sens, memes effectifs, dates tirees.
    alea = random.Random(graine)
    dernier_depart = len(bars) - horizon - 1
    nuls_dir: list[float] = []
    nuls_amp: list[float] = []
    for _ in range(tirages):
        melange = list(signes)
        alea.shuffle(melange)
        tir: list[float] = []
        for sens in melange:
            i = alea.randrange(0, dernier_depart)
            r = _rendement(bars, i, horizon, sens)
            if r is not None:
                tir.append(r)
        if not tir:
            continue
        nuls_dir.append(sum(tir) / len(tir))
        nuls_amp.append(sum(abs(x) for x in tir) / len(tir))

    if not nuls_dir:
        return None

    # p unilateral : le declencheur pretend faire MIEUX, pas differemment.
    # Le +1 au numerateur et au denominateur evite un p nul, qui affirmerait
    # une certitude que 2000 tirages ne peuvent pas fournir.
    p_dir = (sum(1 for x in nuls_dir if x >= moyenne) + 1) / (len(nuls_dir) + 1)
    p_amp = (sum(1 for x in nuls_amp if x >= amplitude) + 1) / (len(nuls_amp) + 1)

    return Resultat(
        declencheur=declencheur, actif=actif, intervalle=intervalle,
        horizon_barres=horizon, horizon_libelle=horizon_libelle,
        evenements=n, rendement_moyen_bps=moyenne, p_direction=p_dir,
        amplitude_moyenne_bps=amplitude, p_amplitude=p_amp,
        nul_direction_bps=sum(nuls_dir) / len(nuls_dir),
        nul_amplitude_bps=sum(nuls_amp) / len(nuls_amp),
    )


def benjamini_hochberg(pvalues: Sequence[float], alpha: float = 0.05) -> list[bool]:
    """Quelles hypotheses survivent au controle du taux de fausses decouvertes.

    Identique a celle de `scripts/robustness_grid.py`, reproduite ici pour que
    le paquet `sentinelle` ne depende pas d'un script.
    """
    m = len(pvalues)
    if m == 0:
        return []
    ordre = sorted(range(m), key=lambda i: pvalues[i])
    rang_max = -1
    for rang, i in enumerate(ordre, start=1):
        if pvalues[i] <= alpha * rang / m:
            rang_max = rang
    garde = [False] * m
    for rang, i in enumerate(ordre, start=1):
        if rang <= rang_max:
            garde[i] = True
    return garde
