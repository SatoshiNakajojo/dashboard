"""Les declencheurs de la Sentinelle : quand reveiller le desk.

Ce module ne decide rien et n'appelle aucun modele. Il repond a une seule
question, en Python pur et gratuitement : **est-ce que cette barre merite
qu'on depense 0,06 $ a la regarder ?**

Chaque declencheur est une fonction pure sur la serie de barres, qui renvoie
les INDICES ou il se declenche. Trois contraintes gouvernent leur ecriture :

**Aucun regard vers le futur.** Un declencheur a la barre `i` ne lit que les
barres `<= i`. C'est verifie par un test qui tronque la serie et compare : si
un declencheur voit l'avenir, la validation qui suit mesurera une prescience
qui n'existe pas en direct, et le desk se reveillera en retard sur du vide.

**Un SENS documente, pas devine.** Un declencheur qui dit seulement « il se
passe quelque chose » ne permet pas de mesurer un edge directionnel. Chacun
porte donc son hypothese : continuation pour les ruptures de volume et de
regime, contrarien pour le funding extreme et la cascade de liquidations —
c'est la prescription des documents, et c'est elle qu'on teste, pas une
hypothese choisie apres avoir vu les resultats.

**Des seuils fixes d'avance.** Les seuils viennent de la litterature (z > 3,
ratio de volatilite > 2,5) et sont poses AVANT la mesure. Les ajuster apres
avoir vu quels reveils rapportent transformerait la validation en
sur-ajustement — la faute exacte que la grille de robustesse a servi a
eviter sur les six strategies.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from ..features.bars import Bar
from ..features.indicators import Series, atr, closes

# Sens de l'hypothese portee par un declencheur.
CONTINUATION = "continuation"   # le mouvement de la barre se poursuit
CONTRARIEN = "contrarien"       # il se retourne
NEUTRE = "neutre"               # aucune direction n'est postulee


@dataclass(frozen=True)
class Declenchement:
    """Un reveil : quand, dans quel sens, et sur quoi il repose."""

    index: int
    sens: int            # +1 hausse attendue, -1 baisse, 0 sans direction
    valeur: float        # l'intensite mesuree, pour trier ou seuiller plus tard
    motif: str


def _volumes(bars: Sequence[Bar]) -> list[float]:
    """Le volume, ou son substitut si la serie n'en porte pas.

    Certaines sources ne fournissent pas le volume. Le substituer par le range
    vrai serait une erreur silencieuse — un pic de range n'est pas un pic de
    volume — donc on renvoie une serie vide et les declencheurs qui en
    dependent ne se declenchent jamais, ce qui se voit dans le compte.
    """
    if not bars or getattr(bars[0], "volume", None) is None:
        return []
    return [float(b.volume or 0) for b in bars]


def _zscore_glissant(valeurs: Sequence[float], periode: int) -> Series:
    """z-score de chaque point contre les `periode` points QUI LE PRECEDENT.

    Strictement precedents : inclure le point courant dans sa propre moyenne
    dilue le pic qu'on cherche a detecter, et rend le seuil dependant de la
    fenetre plutot que de l'anomalie.
    """
    out: Series = [None] * len(valeurs)
    for i in range(periode, len(valeurs)):
        fenetre = valeurs[i - periode:i]
        moy = sum(fenetre) / periode
        var = sum((x - moy) ** 2 for x in fenetre) / periode
        ecart = math.sqrt(var)
        if ecart > 0:
            out[i] = (valeurs[i] - moy) / ecart
    return out


# --------------------------------------------------------------------------
#  1. Pic de volume
# --------------------------------------------------------------------------

def pic_de_volume(bars: list[Bar], *, periode: int = 168,
                  seuil_z: float = 3.0) -> list[Declenchement]:
    """Volume anormal contre sa propre histoire recente.

    Hypothese : CONTINUATION. Un volume qui explose accompagne l'arrivee
    d'information, et le sens de la barre porteuse est l'interpretation que le
    marche vient d'en faire.
    """
    vols = _volumes(bars)
    if not vols:
        return []
    z = _zscore_glissant(vols, periode)
    out = []
    for i, valeur in enumerate(z):
        if valeur is not None and valeur >= seuil_z:
            variation = bars[i].close - bars[i].open
            sens = 1 if variation > 0 else (-1 if variation < 0 else 0)
            out.append(Declenchement(i, sens, valeur, f"volume z={valeur:.1f}"))
    return out


# --------------------------------------------------------------------------
#  2. Funding extreme cumule
# --------------------------------------------------------------------------

def funding_extreme(bars: list[Bar], funding_horaire: Sequence[float], *,
                    fenetre_cumul: int = 24, periode: int = 720,
                    centile: float = 0.95) -> list[Declenchement]:
    """Funding cumule au-dela de son centile glissant.

    Hypothese : CONTRARIEN. Un funding tres positif signifie que les longs
    paient les shorts — le positionnement est deja fait, et c'est la
    surcharge d'un cote qui se paie ensuite.

    `funding_horaire` doit etre aligne barre a barre sur `bars`. Un
    desalignement produirait un declencheur qui lit le funding d'une autre
    heure : la fonction refuse plutot que d'aligner au mieux.
    """
    if len(funding_horaire) != len(bars):
        raise ValueError(
            f"funding desaligne : {len(funding_horaire)} valeurs pour "
            f"{len(bars)} barres — l'alignement est a la charge de l'appelant"
        )
    cumuls: list[float | None] = [None] * len(bars)
    for i in range(fenetre_cumul, len(bars)):
        cumuls[i] = sum(funding_horaire[i - fenetre_cumul:i])

    out = []
    for i in range(periode + fenetre_cumul, len(bars)):
        courant = cumuls[i]
        if courant is None:
            continue
        histoire = sorted(abs(c) for c in cumuls[i - periode:i] if c is not None)
        if len(histoire) < periode // 2:
            continue
        seuil = histoire[int(centile * (len(histoire) - 1))]
        if abs(courant) < seuil or seuil == 0:
            continue
        # Contrarien : funding positif (longs surcharges) => baisse attendue.
        sens = -1 if courant > 0 else 1
        out.append(Declenchement(i, sens, abs(courant) / seuil,
                                 f"funding cumule {courant:+.4f}"))
    return out


# --------------------------------------------------------------------------
#  3. Cascade de liquidations (proxy)
# --------------------------------------------------------------------------

def cascade_liquidations(bars: list[Bar], *, atr_periode: int = 14,
                         ratio_range: float = 4.0, seuil_z: float = 3.0,
                         periode_volume: int = 168) -> list[Declenchement]:
    """Barre a range extreme, volume extreme, et cloture qui rejette la meche.

    C'est un PROXY : Hyperliquid ne publie aucun historique de liquidations,
    et cette signature — amplitude violente, participation massive, cloture
    loin de l'extreme — est ce qu'une cascade laisse sur une bougie OHLCV.
    L'enregistreur permettra un jour de la calibrer contre les vraies ; d'ici
    la, c'est une hypothese explicite, pas une mesure.

    Hypothese : CONTRARIEN. Une cascade est un desequilibre force par des
    liquidations, pas par de l'information — le prix revient generalement.
    """
    vols = _volumes(bars)
    if not vols:
        return []
    a = atr(bars, atr_periode)
    z = _zscore_glissant(vols, periode_volume)

    out = []
    for i, bar in enumerate(bars):
        atr_i, z_i = a[i], z[i]
        if atr_i is None or not atr_i or z_i is None:
            continue
        etendue = float(bar.high - bar.low)
        if etendue < ratio_range * atr_i or z_i < seuil_z:
            continue
        # La cloture doit rejeter l'extreme : dans le tiers HAUT apres une
        # meche basse (les vendeurs forces ont ete absorbes), et l'inverse.
        position = (float(bar.close - bar.low) / etendue) if etendue else 0.5
        if position >= 2 / 3:
            sens = 1      # meche basse rejetee : rebond attendu
        elif position <= 1 / 3:
            sens = -1
        else:
            continue      # cloture au milieu : aucun rejet, aucune hypothese
        out.append(Declenchement(i, sens, etendue / atr_i,
                                 f"range {etendue / atr_i:.1f}xATR, z={z_i:.1f}"))
    return out


# --------------------------------------------------------------------------
#  4. Rupture de regime de volatilite
# --------------------------------------------------------------------------

def rupture_volatilite(bars: list[Bar], *, courte: int = 24, longue: int = 168,
                       ratio: float | None = None,
                       centile: float | None = 0.95) -> list[Declenchement]:
    """Volatilite realisee courte qui decroche de la longue.

    Hypothese : CONTINUATION. Un regime qui change ouvre generalement un
    mouvement directionnel, la ou une cascade cree un a-coup.

    **Le seuil de 2,5 issu de la litterature etait inatteignable.** Mesure du
    6 septembre 2026 : sur BTC, ETH, SOL, DOGE et tous les intervalles, le
    ratio vol_24 / vol_168 a pour mediane 0,86 a 0,90, pour 95e centile 1,53 a
    1,68, et pour MAXIMUM 1,96 a 2,38. Le declencheur ne s'est donc jamais
    declenche, pas une fois : ce n'etait pas un resultat, c'etait une erreur
    de specification.

    Le seuil se lit desormais dans la distribution du ratio lui-meme
    (`centile`), et non dans un nombre absolu. Deux raisons, et la seconde
    compte davantage :

    - **la comparabilite** : un ratio de 1,6 ne veut pas dire la meme chose
      sur DOGE en 15 min et sur BTC en 4 h ;
    - **l'aveuglement aux resultats** : un centile se calcule sur les ratios
      SEULS, sans jamais regarder ce que le prix a fait ensuite. Choisir 1,6
      parce que « ca marche mieux » aurait ete du sur-ajustement ; le choisir
      parce que c'est le haut de la distribution ne l'est pas.

    Passer `ratio` explicitement retablit le seuil absolu, pour pouvoir
    reproduire la campagne d'origine.

    **Ce que ce changement coute, et il faut le dire.** Un seuil au centile se
    declenche PAR CONSTRUCTION sur environ 5 % des barres, marche calme ou
    non : il ne repond plus a « une rupture de regime a-t-elle eu lieu » mais
    a « celle-ci est-elle parmi les 5 % plus fortes du dernier millier de
    barres ». Pour une Sentinelle dont le budget de reveils doit etre
    previsible, c'est un avantage. Comme detecteur d'anomalie absolue, c'est
    plus faible que ce que le seuil de 2,5 promettait — et ce seuil, lui, ne
    promettait rien puisqu'il etait inatteignable.

    Le chauffage coute aussi : il faut `longue` ratios pour former le premier
    seuil, et chaque ratio demande `longue` barres. Les 2 x `longue`
    premieres barres ne peuvent donc rien declencher.
    """
    px = closes(bars)
    rendements = [0.0] + [
        (px[i] - px[i - 1]) / px[i - 1] if px[i - 1] else 0.0
        for i in range(1, len(px))
    ]

    def vol(fin: int, n: int) -> float | None:
        fenetre = rendements[max(0, fin - n):fin]
        if len(fenetre) < n:
            return None
        moy = sum(fenetre) / len(fenetre)
        return math.sqrt(sum((r - moy) ** 2 for r in fenetre) / len(fenetre))

    ratios: list[tuple[int, float]] = []
    for i in range(longue, len(bars)):
        # Fenetres fermees a `i` exclu : la barre courante n'entre pas dans
        # sa propre volatilite de reference.
        vc, vl = vol(i, courte), vol(i, longue)
        if vc is None or vl is None or vl <= 0:
            continue
        ratios.append((i, vc / vl))

    out = []
    if ratio is not None:
        seuils = {i: ratio for i, _ in ratios}
    elif centile is None:
        return []
    else:
        # Centile GLISSANT sur une fenetre strictement anterieure. Le calculer
        # sur toute la serie donnerait a l'indice `i` une information
        # posterieure a `i` — et le test de troncature de ce depot l'attrape,
        # a juste titre : un declencheur qui voit l'avenir fabrique un edge
        # que la validation mesurerait consciencieusement avant que le desk ne
        # se reveille en retard sur du vide en direct.
        #
        # C'est aussi ce que la Sentinelle fera en production, ou l'avenir
        # n'est de toute facon pas disponible.
        seuils = {}
        valeurs = [r for _, r in ratios]
        for rang, (i, _) in enumerate(ratios):
            if rang < longue:
                continue
            fenetre = sorted(valeurs[rang - longue:rang])
            seuils[i] = fenetre[min(len(fenetre) - 1, int(centile * len(fenetre)))]

    for i, r in ratios:
        seuil = seuils.get(i)
        # Strictement superieur : sur une serie parfaitement reguliere, tous
        # les ratios sont egaux et un `>=` declencherait a chaque barre.
        if seuil is None or r <= seuil:
            continue
        variation = bars[i].close - bars[i].open
        sens = 1 if variation > 0 else (-1 if variation < 0 else 0)
        out.append(Declenchement(i, sens, r, f"vol {r:.1f}x"))
    return out


BAISSIER = "baissier"           # une direction posee d'avance, quel que soit
#                                 le mouvement de la barre elle-meme


def deblocage_annonce(
    bars: list[Bar], *, deblocages: Sequence[dict],
    part_min: float = 0.02, part_max: float = 0.25,
    avance_j: int = 7, duree_j: int = 6,
) -> list[Declenchement]:
    """Le seul declencheur dont l'edge directionnel a ete MESURE.

    Les quatre autres reveillent le desk sur une condition de prix. Celui-ci
    reveille sur un CALENDRIER : la date d'un deblocage de jetons, publiee
    des mois a l'avance. Il se declenche `avance_j` jours avant, et
    l'hypothese est baissiere — c'est la fenetre d'anticipation J-7/J-1, la
    seule des quatre testees qui survive.

    ## Six controles, et ce qu'ils autorisent

    +290 bps sur la tranche 2-5 %, apres correction de Benjamini-Hochberg,
    et l'effet survit aux denominateurs aberrants, au jackknife par jeton, a
    la coupe temporelle, a la neutralisation par BTC, au decalage
    calendaire, et au decalage calendaire sur le rendement net.

    Les bornes ci-dessous ne sont pas des reglages, ce sont les LIMITES de
    ce qui a ete valide, et les depasser sortirait du domaine mesure :

    - `part_min = 2 %` : la tranche 0,5-2 % ne survit a aucun controle ;
    - `part_max = 25 %` : borne la plus serree que l'epreuve des
      denominateurs ait validee. Un deblocage de 65 % de l'offre n'est pas
      un gros deblocage, c'est un autre evenement.

    ## Pourquoi lire une date FUTURE n'est pas regarder l'avenir

    Les autres declencheurs n'ont pas le droit de lire au-dela de `i`. Celui
    ci lit un calendrier qui contient des dates posterieures a `i` — et ce
    n'est pas la meme chose : ce calendrier est **public au moment `i`**.
    DefiLlama le publie des mois a l'avance, et un trader du jour `i` le
    connait aussi bien que nous.

    Ce qu'il ne lit jamais, c'est un PRIX posterieur a `i`. C'est la la
    frontiere, et `test_le_declencheur_de_deblocage_ne_lit_aucun_prix_futur`
    la verifie en tronquant la serie.

    Une hypothese demeure, et il faut la nommer : `part_offre` rapporte le
    deblocage a l'offre deja debloquee a sa date, donc au calendrier tel
    qu'il s'executera. Un projet qui reporte ou annule un deblocage rend
    cette part fausse apres coup. C'est rare et c'est public, mais ce n'est
    pas nul.
    """
    par_jour = {b.ts_ms // 86_400_000: i for i, b in enumerate(bars)}
    candidats: list[Declenchement] = []
    for e in sorted(deblocages, key=lambda v: v["ts_ms"]):
        part = float(e.get("part_offre", 0.0))
        if not part_min <= part < part_max:
            continue
        i = par_jour.get(e["ts_ms"] // 86_400_000 - avance_j)
        if i is None:
            continue
        candidats.append(Declenchement(i, -1, part, "deblocage_annonce"))
    # Un seul reveil par fenetre : deux deblocages rapproches produisent des
    # fenetres qui se recouvrent, donc une position tenue une fois. La
    # validation applique la meme regle, et s'en ecarter ici mesurerait une
    # strategie differente de celle qui a ete mesuree.
    gardes: list[Declenchement] = []
    dernier = -10**9
    for d in candidats:
        if d.index - dernier >= duree_j:
            gardes.append(d)
            dernier = d.index
    return gardes


DECLENCHEURS = {
    "pic_volume": (pic_de_volume, CONTINUATION),
    "funding_extreme": (funding_extreme, CONTRARIEN),
    "cascade_liquidations": (cascade_liquidations, CONTRARIEN),
    "rupture_volatilite": (rupture_volatilite, CONTINUATION),
}
