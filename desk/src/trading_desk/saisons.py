"""Les saisons de marche, DECLAREES avant d'avoir regarde le moindre rendement.

L'idee vient d'une conversation du 17 septembre 2026 :

    « Il y a des strategies surement plus efficaces en bear market, d'autres
      en bull market, d'autres en range. Du coup est-ce qu'il ne faudrait pas
      les classer par saison ? Le desk analyse dans quelle saison on se situe,
      puis applique la strategie la plus efficace dans ce scenario. »

L'intuition est juste et elle est partagee par a peu pres tout le monde qui
regarde une courbe. Elle est aussi **la forme la plus dangereuse de ce que ce
depot passe son temps a refuser**, et les deux tiennent ensemble.

────────────────────────────────────────────────────────────────────────────
  POURQUOI C'EST LA PLUS DANGEREUSE
────────────────────────────────────────────────────────────────────────────

« Choisir la meilleure strategie par saison » est une recherche sur la grille
strategie x saison. Onze strategies au catalogue et trois saisons font
trente-trois cellules, et prendre le maximum de trente-trois tirages bruites
produit toujours un gagnant — c'est exactement la machine qui a coute quatre
cents cellules a ce depot.

Pire : si les BORNES des saisons sont choisies en regardant ou les resultats
s'ameliorent, le decoupage devient un parametre de plus, ajuste jusqu'a ce
qu'il plaise, et plus personne — pas meme son auteur — ne peut distinguer
apres coup une saison d'un surajustement.

D'ou ce fichier. **Il ne mesure rien.** Il declare le decoupage, l'actif de
reference, le retard, le nul et le denominateur. La mesure vit ailleurs,
ecrite apres, et l'historique git en fait foi.

────────────────────────────────────────────────────────────────────────────
  LE HALVING : CE QUI A ETE DEMANDE, ET CE QUE LA DONNEE PERMET
────────────────────────────────────────────────────────────────────────────

La demande etait : « trouve la fourchette de jours depuis le halving ou il y a
un changement de saison en moyenne sur les 4 derniers cycles ».

Mesure faite AVANT d'ecrire ce fichier, le 17 septembre 2026 :

    BTC 1 j sur cette machine : 2 209 bougies, du 2020-08-19 au 2026-09-05
    halving 2012-11-28   hors historique
    halving 2016-07-09   hors historique
    halving 2020-05-11   hors historique (les donnees commencent au jour 100)
    halving 2024-04-19   couvert

    cycle 3 : couvert du jour 100 au jour 1439
    cycle 4 : couvert du jour 0 au jour 869, en cours

Soit **1,6 cycle**, pas quatre. Et aucune autre source de prix n'est joignable
depuis cette machine : CoinGecko, Yahoo, Binance, Kraken, Coinbase et
blockchain.info rendent tous 000 (refus de politique reseau), seul
`api.hyperliquid.xyz` repond — et Hyperliquid n'a pas d'historique avant 2020.

Une moyenne sur quatre cycles n'est donc pas calculable ici. Elle ne le serait
d'ailleurs qu'a peine avec les quatre : estimer une borne a partir de quatre
observations donne un ecart-type qu'aucune decision ne devrait franchir.

**Consequence sur ce module.** Le jour depuis le halving n'est PAS ce qui
definit les saisons. Il est declare comme un observable inscrit A COTE de
chaque barre, pour qu'on puisse plus tard demander « les saisons tombent-elles
ou le cycle le voudrait ? » sans l'avoir utilise pour les definir. C'est la
seule facon de garder la question posable.

Si un historique BTC journalier depuis 2010 arrive un jour dans `data/`, la
question redevient mesurable et ce module n'a pas besoin de changer : la
declaration ne depend pas de la profondeur de l'historique.

────────────────────────────────────────────────────────────────────────────
  VERSION 2 : LA VERSION 1 CHANGEAIT D'AVIS TOUS LES TROIS JOURS
────────────────────────────────────────────────────────────────────────────

Mesure du 17 septembre 2026, sous la version 1, sur 1 988 barres etiquetees :
**63 plages**, dont beaucoup d'une a trois jours. La definition battait autour
de la moyenne. « Appliquer la strategie la plus efficace de la saison » aurait
voulu dire changer de strategie tous les trois jours, ce que les frais
mangent avant toute autre consideration.

**Ce defaut a ete vu sans regarder un seul rendement**, et c'est ce qui rend
cette version 2 defendable. Il repond a la structure des etiquettes, pas a la
performance : aucune mesure de rendement n'a jamais ete faite sous la version
1, donc l'incrementer ne jette aucun resultat et n'absout rien.

La correction est une **confirmation**, pas une longueur minimale de plage.
La difference est decisive : une longueur minimale ne se connait qu'une fois
la plage terminee, donc l'appliquer reviendrait a lire l'avenir. Une
confirmation est causale — la saison ne change qu'apres que la nouvelle
condition a tenu `CONFIRMATION_BARRES` barres d'affilee.

Elle a un cout, inscrit ici pour qu'il ne soit pas decouvert plus tard : un
vrai retournement met vingt barres a etre enregistre. On paie du retard pour
ne plus payer de frais de va-et-vient, et c'est un arbitrage, pas un gain.

**Le nombre n'est pas nouveau.** `CONFIRMATION_BARRES` vaut 20, comme
`PENTE_BARRES` qui etait deja declare. Reutiliser une constante du decoupage
plutot qu'en introduire une n'ajoute aucun degre de liberte — et un degre de
liberte de plus est exactement ce qu'on ne peut pas se permettre sur un
decoupage qui decide de trente-trois hypotheses.

────────────────────────────────────────────────────────────────────────────
  VERSION 3 : IL MANQUAIT DE LA PUISSANCE, PAS DU SIGNAL
────────────────────────────────────────────────────────────────────────────

Mesure du 17 septembre 2026, sous la version 2, sur BTC en 4 h : **dix-huit
cellules sur trente-trois sous trente aller-retours**, donc ininterpretables.
Le plus petit p des quinze lisibles valait 0,1274, et zero cellule ne passait
sous alpha quand le hasard en donnerait 1,65.

Ce n'est pas un resultat contraire, c'est un echantillon trop mince : un seul
actif, coupe en trois saisons, ne laisse pas assez de trades par case. La
version 3 ne change donc RIEN au decoupage — les memes 200, 20, 20 et le meme
retard. Elle change l'UNIVERS.

**LE PIEGE DE LA VERSION 3, ET POURQUOI ELLE NE LE PREND PAS.** Le reflexe est
de faire une cellule par (strategie, saison, actif). Onze fois trois fois
vingt-six font 858 hypotheses, et l'arithmetique tue l'idee avant qu'on la
mesure :

    m = 858    seuil au rang 1   0,0000583
               plancher de p     0,0006105   (1 637 decalages disponibles)
               -> criblage AVEUGLE

Il faudrait 17 159 decalages distincts pour qu'une cellule puisse survivre
seule, et la serie en offre 1 637. Aucune cellule ne pourrait passer, quelle
que soit la donnee, et son « zero survivant » ne dirait rien du marche.
Multiplier les actifs par reflexe aurait rendu le criblage inerte tout en
ayant l'air de le renforcer.

**CE QU'ELLE FAIT A LA PLACE : ELLE MET LES ACTIFS EN COMMUN.** Une cellule
reste (strategie, saison) — trente-trois, comme avant — mais ses trades
viennent de TOUT l'univers. Le denominateur ne bouge pas, le nombre de trades
par case est multiplie. C'est exactement ce qui manquait.

La question posee y gagne d'ailleurs en sens : « cette strategie est-elle
meilleure dans cette saison » se demande une fois pour le marche, pas une fois
par actif.

**LE NUL RESTE UN SEUL DECALAGE, PARTAGE PAR TOUS LES ACTIFS.** Les saisons
sont definies sur BTC et valent pour le marche entier ; decaler chaque actif
separement casserait la dependance transversale et validerait n'importe quoi —
c'est la lecon du nul par bloc des cotations, appliquee ici avant de se faire
avoir.

**ET VINGT-SIX ACTIFS NE FONT PAS VINGT-SIX MARCHES.** Le nombre de trades est
multiplie par vingt-six ; l'information independante, non. La mesure des
marches effectifs le dit : dix perps en font 2,44. `MARCHES_EFFECTIFS_MIN`
inscrit la borne en dessous de laquelle la mise en commun ajoute des trades
sans ajouter d'information — deux, parce que sous deux marches effectifs,
« a travers le marche » veut dire un seul marche.

**CE QUE CA COUTE A CALCULER**, mesure avant de declarer : 1,5 s par actif pour
la grille entiere, soit environ quarante secondes pour vingt-six. La version 3
n'est pas bornee par le calcul. Elle est bornee par l'information, et aucune
machine n'en fabrique.

────────────────────────────────────────────────────────────────────────────
  LE DECOUPAGE, ET POURQUOI IL EST BANAL EXPRES
────────────────────────────────────────────────────────────────────────────

    bull   cloture au-dessus de la moyenne 200 j ET moyenne en hausse sur 20 j
    bear   cloture en dessous de la moyenne 200 j ET moyenne en baisse sur 20 j
    range  tout le reste

C'est la definition la plus rebattue qui existe, et c'est precisement pour ca
qu'elle est retenue. Une definition tunee sur nos six annees serait un
parametre de plus ; une definition que tout le monde utilisait avant nous ne
peut pas avoir ete choisie pour nous plaire. Les trois nombres — 200, 20, et
le signe de la pente — ne sont pas des reglages a optimiser. Les bouger
exigera d'incrementer `VERSION`, ce qui repart d'un denominateur neuf.

**L'actif de reference est BTC**, declare ici et pas choisi apres. Le reste du
marche perp crypto le suit : la mesure des marches effectifs le dit, BTC, ETH
et SOL ne font que 1,5 marche independant sur 2 182 barres journalieres. Une
saison par actif reviendrait a compter 28 saisons la ou il y en a une et
demie.

**Le retard est d'une barre.** La saison qui s'applique a la barre `t` est
celle calculee sur les cloture jusqu'a `t-1`. Sans ce retard, la saison est
lue sur la barre qu'elle est censee expliquer, et la meilleure strategie « par
saison » gagne simplement parce qu'elle connait la cloture.

────────────────────────────────────────────────────────────────────────────
  LE NUL, ET LE PIEGE DE LA VERSION 1 DU VOCABULAIRE
────────────────────────────────────────────────────────────────────────────

Les saisons viennent par longues plages : une annee de bull, deux ans de bear.
Un nul qui tirerait une saison au hasard barre par barre casserait cette
structure et validerait n'importe quoi — c'est la meme faute que le nul par
date des cotations.

Le nul est donc un **decalage circulaire commun de la serie d'etiquettes** :
les saisons gardent leurs longueurs et leur ordre, mais ne tombent plus en
face des memes rendements.

Et il faut en tirer la lecon de la version 2 du vocabulaire d'evenements : le
plancher de p d'un nul par decalage n'est pas fixe par le nombre de tirages,
il est fixe par le nombre de DECALAGES DISTINCTS disponibles. Tirer cinq mille
fois dans une plage de deux cents decalages ne produit pas cinq mille nuls.

Un decalage plus court que la plus longue plage de saison laisse d'ailleurs
l'etiquette decalee recouvrir l'originale. `DECALAGE_MIN_EN_PLAGES` l'exclut,
et la mesure DOIT rendre la plage effective : une plage degeneree rend le
criblage aveugle, et son « zero survivant » ne dirait rien du marche.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date

VERSION = 3
FIGE_LE = "2026-09-17"

# ─────────────────────────────────────────────────────── le decoupage

BULL, BEAR, RANGE = "bull", "bear", "range"
SAISONS = (BULL, BEAR, RANGE)

# L'actif dont la saison vaut pour tout le marche. Declare, pas choisi apres.
REFERENCE = "BTC"
ECHELLE_REFERENCE = "1d"

# Les trois nombres du decoupage. Ce ne sont pas des reglages a optimiser :
# les bouger exige d'incrementer VERSION.
MOYENNE_BARRES = 200          # la moyenne longue, en barres journalieres
PENTE_BARRES = 20             # sur combien de barres on lit sa pente
# En dessous, la pente n'est pas un signe, c'est du bruit d'arrondi.
PENTE_MIN_PCT = 0.0

# La saison de la barre t est calculee sur les cloture jusqu'a t-1.
RETARD_BARRES = 1

# La saison ne change qu'apres que la nouvelle condition a tenu ce nombre de
# barres d'affilee. Causale, donc applicable en direct — une longueur minimale
# de plage ne se connaitrait qu'une fois la plage finie.
#
# Vaut PENTE_BARRES a dessein : reutiliser une constante deja declaree
# n'ajoute aucun degre de liberte au decoupage.
CONFIRMATION_BARRES = PENTE_BARRES

# ────────────────────────────────────────────── l'observable « halving »

# Declares pour que le jour du cycle soit calculable a toute date, y compris
# hors de l'historique present. Les trois premiers ne sont pas couverts par
# les donnees de cette machine ; ils sont inscrits quand meme, pour que
# l'ajout d'un historique plus profond n'exige pas de toucher a ce fichier.
HALVINGS = (
    date(2012, 11, 28),
    date(2016, 7, 9),
    date(2020, 5, 11),
    date(2024, 4, 19),
)

# Ce que la donnee de cette machine couvre reellement, inscrit ici pour qu'un
# lecteur n'ait pas a le redecouvrir.
CYCLES_COMPLETS_DISPONIBLES = 1
CYCLES_DEMANDES = 4

# ───────────────────────────────────────────────────────────── le nul

# Un decalage doit depasser la plus longue plage de saison, sinon l'etiquette
# decalee recouvre l'originale et le controle devient inerte.
DECALAGE_MIN_EN_PLAGES = 1.0
TIRAGES = 2000

# En dessous, une saison n'a pas assez de barres pour qu'un rendement moyen
# veuille dire quelque chose.
BARRES_MIN_PAR_SAISON = 120

# ──────────────────────────────────────────────────── le denominateur

# Onze strategies au catalogue x trois saisons. C'est le nombre d'hypotheses
# que « la meilleure strategie par saison » teste, et il est annonce AVANT de
# regarder laquelle gagne.
STRATEGIES_AU_CATALOGUE = 11
DENOMINATEUR = STRATEGIES_AU_CATALOGUE * len(SAISONS)

# ───────────────────────────────────────────────────────── l'univers

# L'echelle a laquelle tournent les STRATEGIES. Les saisons restent
# journalieres (ECHELLE_REFERENCE) : une saison est une chose lente, et la
# lire en 4 h en ferait autre chose. Declaree ici plutot que passee en
# argument, parce qu'elle fait partie de ce qui est mesure.
ECHELLE_STRATEGIES = "4h"

# L'univers est une REGLE, pas une liste : « tous les actifs qui ont des
# barres a ECHELLE_STRATEGIES sur cette machine ». Une liste serait une
# selection, donc une hypothese de plus, et invisible dans le denominateur.
UNIVERS_REGLE = "tous les actifs disposant de barres a l'echelle des strategies"

# Le compte au moment de figer. Il ne sert PAS a selectionner — il sert a
# rendre visible une derive : si l'univers a change entre la declaration et la
# mesure, il faut le savoir plutot que de comparer deux choses differentes.
UNIVERS_AU_GEL = 26

# Les trades de tous les actifs tombent dans la MEME cellule (strategie,
# saison). Le denominateur ne bouge pas ; c'est le nombre de trades par
# cellule qui monte.
MISE_EN_COMMUN = True

# Sous ce nombre de marches effectifs, « a travers le marche » veut dire un
# seul marche : la mise en commun ajoute alors des trades sans ajouter
# d'information, et il faut le dire au lieu de compter les trades.
MARCHES_EFFECTIFS_MIN = 2.0

ORIGINE = "saisons"


def jour_du_cycle(quand: date) -> int | None:
    """Jours ecoules depuis le dernier halving, ou None avant le premier."""
    passes = [h for h in HALVINGS if h <= quand]
    return (quand - passes[-1]).days if passes else None


def cycle_de(quand: date) -> int | None:
    """Le rang du cycle (1 pour le premier halving), ou None avant."""
    passes = [h for h in HALVINGS if h <= quand]
    return len(passes) or None


def declaration() -> dict[str, object]:
    """Tout ce qui est fige, en un objet. C'est ce que l'empreinte scelle."""
    return {
        "version": VERSION,
        "fige_le": FIGE_LE,
        "saisons": list(SAISONS),
        "reference": REFERENCE,
        "echelle_reference": ECHELLE_REFERENCE,
        "moyenne_barres": MOYENNE_BARRES,
        "pente_barres": PENTE_BARRES,
        "pente_min_pct": PENTE_MIN_PCT,
        "retard_barres": RETARD_BARRES,
        "confirmation_barres": CONFIRMATION_BARRES,
        "echelle_strategies": ECHELLE_STRATEGIES,
        "univers_regle": UNIVERS_REGLE,
        "univers_au_gel": UNIVERS_AU_GEL,
        "mise_en_commun": MISE_EN_COMMUN,
        "marches_effectifs_min": MARCHES_EFFECTIFS_MIN,
        "halvings": [h.isoformat() for h in HALVINGS],
        "cycles_complets_disponibles": CYCLES_COMPLETS_DISPONIBLES,
        "cycles_demandes": CYCLES_DEMANDES,
        "decalage_min_en_plages": DECALAGE_MIN_EN_PLAGES,
        "tirages": TIRAGES,
        "barres_min_par_saison": BARRES_MIN_PAR_SAISON,
        "strategies_au_catalogue": STRATEGIES_AU_CATALOGUE,
        "denominateur": DENOMINATEUR,
        "origine": ORIGINE,
    }


def empreinte() -> str:
    """L'empreinte de TOUTE la declaration. Un test la verrouille.

    Changer un seul nombre change l'empreinte et casse le test, ce qui oblige
    a incrementer `VERSION` — donc a repartir d'un denominateur neuf plutot
    que d'ajuster le decoupage jusqu'a ce qu'il plaise.
    """
    charge = json.dumps(declaration(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(charge.encode()).hexdigest()[:16]


def plancher_de_p(plage_decalages: int) -> float:
    """1/(plage+1) — le plancher d'un nul par decalage.

    La resolution vient du nombre de decalages DISTINCTS, pas du nombre de
    tirages. C'est la lecon que la version 1 du vocabulaire d'evenements a
    apprise en se piegeant elle-meme.
    """
    if plage_decalages <= 0:
        raise ValueError("plage de decalages vide : le nul est inerte")
    return 1.0 / (plage_decalages + 1)


def plage_requise(alpha: float = 0.05, denominateur: int | None = None) -> int:
    """Combien de decalages distincts il FAUT pour qu'une cellule puisse
    survivre seule au rang 1.

    Calcule a la declaration, donc avant la mesure : c'est une precondition
    verifiable, pas une excuse trouvee apres coup. A 33 hypotheses et
    alpha = 0,05 il en faut 657. Si la serie n'en offre pas autant, le
    criblage est aveugle et son « zero survivant » ne dit rien du marche —
    il faudra le dire, pas le taire.
    """
    m = denominateur or DENOMINATEUR
    return int(m / alpha) - 1


def criblage_possible(plage_decalages: int, alpha: float = 0.05,
                      denominateur: int | None = None) -> bool:
    """Le criblage peut-il voir quoi que ce soit a cette resolution ?"""
    m = denominateur or DENOMINATEUR
    return plancher_de_p(plage_decalages) <= alpha / m
