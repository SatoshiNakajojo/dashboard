"""Le protocole du pari : comment on notera une prediction ecrite d'avance.

`scripts/journal_unlocks.py` inscrit des positions avant que la fenetre ne
s'ouvre. Ce fichier dit **comment on les notera**, et il le dit avant que la
premiere fenetre ne se ferme. C'est la meme discipline que `saisons.py` : la
declaration est figee, l'empreinte est verrouillee par un test, et changer un
seul nombre oblige a incrementer la VERSION.

────────────────────────────────────────────────────────────────────────────
  LE DEFAUT QUE CE FICHIER CORRIGE
────────────────────────────────────────────────────────────────────────────

La premiere version du releve imprimait trois chiffres : la moyenne brute, la
part gagnante, et « attendu (historique) +290,4 bps ». Aucun des trois ne
mesure la regle.

**Le zero n'est pas le bon repere.** La position est une vente a decouvert
d'altcoin tenue six jours. Sur la periode historique, la MEME position prise
a des dates TIREES AU HASARD rapporte :

    +81,4 bps en brut,  +123,5 bps une fois adossee a BTC

Un altcoin moyen baisse contre BTC ; vendre n'importe lequel n'importe quand
et couvrir en BTC gagnait donc de l'argent sans qu'aucun deblocage n'y soit
pour quelque chose. Un releve qui compare la moyenne du journal a zero
mesurerait cette derive-la. En marche baissier il confirmerait la regle, en
marche haussier il la refuterait, et dans les deux cas il parlerait d'autre
chose que des deblocages.

D'ou le bras de hasard, **calcule sur la periode du journal elle-meme** : les
memes jetons, le meme nombre de positions, la meme duree, mais des dates
tirees dans la fenetre que le journal a reellement traversee. Ce que la regle
doit battre, ce n'est pas zero, c'est ca.

────────────────────────────────────────────────────────────────────────────
  LA MESURE PRIMAIRE EST CHOISIE ICI, PAS APRES
────────────────────────────────────────────────────────────────────────────

Trois mesures etaient defendables. Elles ont ete comparees en echantillon le
18 septembre 2026, AVANT qu'aucune position ne soit inscrite, et le choix est
fige :

    mesure              exces sur le hasard   n pour 80 % de chance de conclure
    brut                    +227,2 bps                267
    NET DE BTC              +218,9 bps                210      <- primaire
    normalise par le risque   +0,112 R                449

**La normalisation par le risque a ete essayee et rejetee sur mesure**, pas
par principe. Diviser chaque rendement par la volatilite du jeton semblait
l'estimateur naturel d'un livre dimensionne a risque constant. Elle degrade :
l'effet est concentre sur les jetons les plus volatils — un gros deblocage sur
un jeton nerveux bouge plus qu'un gros deblocage sur un jeton calme — et
diviser par la volatilite jette precisement ce qui porte le signal.

Le brut est conserve et affiche, mais en SECOND. Le declarer ici evite d'avoir
a choisir dans six mois celle des deux qui aura l'air la plus flatteuse.

────────────────────────────────────────────────────────────────────────────
  COMBIEN DE POSITIONS, ET CE QUE CA VEUT DIRE
────────────────────────────────────────────────────────────────────────────

L'ancien releve annoncait « cinquante a cent evenements ». Le chiffre venait
d'un calcul qui ne demande qu'une chose : que l'intervalle de confiance evite
zero SI l'effet futur vaut exactement l'effet passe. C'est une piece a pile ou
face — 50 % de chance de conclure quand l'effet est reel.

Avec l'ecart-type mesure (1 131 bps par position, net) et l'exces a battre
(+218,9 bps) :

      103 positions  ->  une chance sur deux de conclure
      210 positions  ->  quatre chances sur cinq

Et voici le fait qui compte le plus dans ce fichier : **le calendrier du
18 septembre 2026 ne contient que 176 evenements futurs eligibles**, tous
jetons confondus, jusqu'en 2030. Le test ne peut donc PAS atteindre quatre
chances sur cinq avec ce calendrier-la. Il atteint une chance sur deux vers
le milieu de 2027.

Ce n'est pas une raison de ne pas le lancer — c'est une raison de savoir ce
qu'on lance. Et le levier est connu et unique : le calendrier ne couvre que
68 jetons quand Hyperliquid en cote 234. Le rituel hebdomadaire rafraichit ce
calendrier ; chaque jeton que DefiLlama ajoute rapproche la conclusion.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
from collections.abc import Sequence

from .sentinelle.triggers import (
    DEBLOCAGE_AVANCE_J,
    DEBLOCAGE_DUREE_J,
    DEBLOCAGE_PART_MAX,
    DEBLOCAGE_PART_MIN,
)

VERSION = 1
FIGE_LE = "2026-09-18"

JOUR_MS = 86_400_000

# ---------------------------------------------------------------- le protocole

BRUT, NET = "brut", "net"
MESURE_PRIMAIRE = NET
REFERENCE = "BTC"

# Le bras de hasard. La graine est figee pour que deux releves du meme jour
# donnent le meme chiffre : un bras qui bouge a chaque lancer inviterait a
# relancer jusqu'a ce qu'il arrange.
TIRAGES = 2000
GRAINE = 20260918
ALPHA = 0.05

# Sous ce nombre de jours cotes sur la periode du journal, le bras de hasard
# d'un jeton tire ses dates dans une fenetre trop etroite pour dire quoi que
# ce soit, et ses tirages se recouvrent presque tous. Le jeton est alors
# exclu du bras ET de l'observe — jamais de l'un seulement.
JOURS_MIN_POUR_LE_HASARD = 40

# --------------------------------------------------- ce qui a ete mesure avant
#
# Mesure du 18 septembre 2026 sur `data/unlocks.json` (68 jetons, 2 074
# evenements), bande de la regle, fenetre J-7 -> J-1, avec le bras de hasard
# defini ci-dessous. Fige : c'est le repere auquel le hors echantillon sera
# compare, et il ne doit pas pouvoir bouger apres coup.
EN_ECHANTILLON = {
    BRUT: {"n": 525, "observe_bps": 308.6, "hasard_bps": 81.4,
           "exces_bps": 227.2, "ecart_type_bps": 1324.4, "p": 0.0005},
    NET: {"n": 520, "observe_bps": 342.4, "hasard_bps": 123.5,
          "exces_bps": 218.9, "ecart_type_bps": 1131.5, "p": 0.0005},
}

# L'inventaire du calendrier au gel. Il dit ce que le test peut atteindre.
EVENEMENTS_FUTURS_AU_GEL = 176
JETONS_AU_CALENDRIER = 68
PERPS_HYPERLIQUID_AU_GEL = 234


def declaration() -> dict[str, object]:
    """Tout ce qui est fige, en un objet. C'est ce que l'empreinte scelle."""
    return {
        "version": VERSION,
        "fige_le": FIGE_LE,
        "part_min": DEBLOCAGE_PART_MIN,
        "part_max": DEBLOCAGE_PART_MAX,
        "avance_j": DEBLOCAGE_AVANCE_J,
        "duree_j": DEBLOCAGE_DUREE_J,
        "mesure_primaire": MESURE_PRIMAIRE,
        "reference": REFERENCE,
        "tirages": TIRAGES,
        "graine": GRAINE,
        "alpha": ALPHA,
        "jours_min_pour_le_hasard": JOURS_MIN_POUR_LE_HASARD,
        "en_echantillon": EN_ECHANTILLON,
        "evenements_futurs_au_gel": EVENEMENTS_FUTURS_AU_GEL,
        "jetons_au_calendrier": JETONS_AU_CALENDRIER,
        "perps_hyperliquid_au_gel": PERPS_HYPERLIQUID_AU_GEL,
    }


def empreinte() -> str:
    """L'empreinte de TOUTE la declaration. Un test la verrouille.

    Changer un seul nombre change l'empreinte et casse le test, ce qui oblige
    a incrementer `VERSION` — donc a noter les positions deja inscrites sur le
    protocole sous lequel elles ont ete ecrites, pas sur celui qui arrange.
    """
    charge = json.dumps(declaration(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(charge.encode()).hexdigest()[:16]


# ------------------------------------------------------------------ la notation

def rendement(prix: dict[int, float], jour: int, duree: int = DEBLOCAGE_DUREE_J,
              reference: dict[int, float] | None = None) -> float | None:
    """Le rendement d'une vente a decouvert de `duree` jours, en points de base.

    `reference` fournie : le rendement est celui de la position adossee — on
    vend le jeton et on achete la reference pour le meme notionnel, donc on
    ajoute le rendement de la reference sur les memes bornes.

    Renvoie `None` des qu'une des quatre cotations manque. Prendre la
    cotation la plus proche a la place decalerait la fenetre d'un jour sur un
    evenement date, ce qui detruit exactement ce qu'on mesure.
    """
    a, b = prix.get(jour), prix.get(jour + duree)
    if a is None or b is None or a <= 0:
        return None
    r = -(b - a) / a * 10_000
    if reference is None:
        return r
    ra, rb = reference.get(jour), reference.get(jour + duree)
    if ra is None or rb is None or ra <= 0:
        return None
    return r + (rb - ra) / ra * 10_000


def jours_eligibles(prix: dict[int, float], duree: int = DEBLOCAGE_DUREE_J,
                    reference: dict[int, float] | None = None,
                    bornes: tuple[int, int] | None = None) -> list[int]:
    """Les jours ou une position complete aurait pu etre prise.

    `bornes` restreint a la periode du journal. Sans elle, le bras de hasard
    tirerait dans toute l'histoire du jeton — y compris des annees que le
    journal n'a pas traversees — et comparerait la regle a un autre marche.
    """
    debut, fin = bornes if bornes else (-10**9, 10**9)
    return [j for j in sorted(prix)
            if debut <= j <= fin and rendement(prix, j, duree, reference) is not None]


def bras_de_hasard(candidats: Sequence[tuple[dict[int, float], list[int]]],
                   *, duree: int = DEBLOCAGE_DUREE_J,
                   reference: dict[int, float] | None = None,
                   tirages: int = TIRAGES,
                   graine: int = GRAINE) -> list[float]:
    """La distribution des moyennes obtenues a dates tirees.

    `candidats` est une position par element : le carnet de prix du jeton et
    les jours ou une position complete etait possible. Une position du journal
    = un tirage, donc le bras a exactement le meme effectif que l'observe. Un
    bras de taille differente aurait une dispersion differente et le p ne
    voudrait plus rien dire.
    """
    if not candidats:
        return []
    alea = random.Random(graine)
    out: list[float] = []
    for _ in range(tirages):
        ech = []
        for prix, jours in candidats:
            r = rendement(prix, alea.choice(jours), duree, reference)
            if r is not None:
                ech.append(r)
        if ech:
            out.append(sum(ech) / len(ech))
    return out


def p_unilateral(observe: float, nuls: Sequence[float]) -> float:
    """(nuls >= observe, +1) / (tirages +1). Le +1 interdit un p nul.

    La regle pretend faire MIEUX que le hasard, pas differemment : le test est
    unilateral, et le declarer ici evite de choisir le cote apres coup.
    """
    if not nuls:
        return 1.0
    return (sum(1 for x in nuls if x >= observe) + 1) / (len(nuls) + 1)


def n_requis(exces_bps: float, ecart_type_bps: float, puissance: float) -> int:
    """Combien de positions pour avoir `puissance` chance de conclure.

    Le chiffre que l'ancien releve donnait — « cinquante » — repondait a une
    autre question : celle ou l'on se contente que l'intervalle evite zero SI
    l'effet futur vaut exactement l'effet passe. C'est 50 % de chance, pas une
    conclusion. Ici la puissance est un argument, donc elle se lit.
    """
    if exces_bps <= 0 or ecart_type_bps <= 0:
        return 0
    z = {0.5: 1.96, 0.8: 1.96 + 0.8416, 0.9: 1.96 + 1.2816}.get(puissance)
    if z is None:
        raise ValueError(f"puissance non declaree : {puissance}")
    return math.ceil((z * ecart_type_bps / exces_bps) ** 2)


def attendu(mesure: str = MESURE_PRIMAIRE) -> dict[str, float]:
    """Le repere en echantillon d'une mesure, avec ses tailles requises."""
    ref = EN_ECHANTILLON[mesure]
    return {**ref,
            "n_pour_50": n_requis(ref["exces_bps"], ref["ecart_type_bps"], 0.5),
            "n_pour_80": n_requis(ref["exces_bps"], ref["ecart_type_bps"], 0.8)}
