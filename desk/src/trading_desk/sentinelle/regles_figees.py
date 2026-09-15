"""Les regles de prix FIGEES, et la seule chose qui puisse les valider.

Le depot a mesure, le 14 septembre 2026, ce qu'un univers restreint change au
verdict : `tsmom BTC 1d` a p = 0,00105 survit a Benjamini-Hochberg si l'on a
declare douze hypotheses, et meurt si l'on en a declare quatre-vingt-quatre.
Reduire la portee achete donc de la puissance — mais UNIQUEMENT si la portee
a ete declaree AVANT de regarder. Ce depot a regarde. Ces trente combinaisons
et ces quatre-vingt-quatre cellules sont depensees.

**Il reste une voie, et une seule : figer entierement une regle et la juger
sur des donnees qui n'existent pas encore.** Le denominateur redevient
honnete parce qu'il est inscrit avant que la donnee existe. C'est exactement
ce que `journal_unlocks.py` fait pour les deblocages, et c'est la seule preuve
que ce depot reconnaisse comme concluante.

Ce module EST cette declaration. Trois regles, leurs parametres, leur actif,
leur echelle. Le denominateur du test hors echantillon vaut trois, pour
toujours, et il est inscrit ci-dessous.

────────────────────────────────────────────────────────────────────────────
  CE QUE CHAQUE REGLE PEUT ESPERER PROUVER, ET EN COMBIEN DE TEMPS
────────────────────────────────────────────────────────────────────────────

Mesure par fenetres glissantes sur tout l'historique : si l'on avait fige la
regle a une date quelconque, quel p un test de duree donnee aurait-il rendu ?

    regle                duree    trades   p median   part a p < 0,05
    turtle BTC 1d         1 an         9      0,431          5 %
    turtle BTC 1d         3 ans       31      0,329          8 %
    tsmom  BTC 1d         1 an        14      0,238         20 %
    tsmom  BTC 1d         3 ans       52      0,040         54 %

**Il faut lire ce tableau avant d'esperer quoi que ce soit.** Le suivi de
tendance a un taux de reussite de 40 % et des queues epaisses : son rapport
signal sur bruit par trade est minuscule, et il faut des centaines de trades.
A dix trades par an, `turtle` ne se prouvera JAMAIS de cette facon — 8 % des
fenetres de trois ans passent, ce qui est a peine plus que les 5 % du hasard.
`tsmom` est le seul a avoir une chance reelle, et il lui faut trois ans.

────────────────────────────────────────────────────────────────────────────
  POURQUOI `tsmom` N'EST PAS DANS LA LISTE, ALORS QU'IL EST LE PLUS PUISSANT
────────────────────────────────────────────────────────────────────────────

Parce que le desk le refuserait. Mesure du 15 septembre 2026, en rejouant
chaque regle contre le moteur de risque du deploiement :

    regle              trades   refus du risque   part refusee
    turtle_btc_1d          58                 2        3 %
    turtle_eth_1d          50                11       18 %
    tsmom_btc_1d           84               197       70 %

`tsmom` propose un stop a trois ATR : mediane 1 175 bps, neuvieme decile
1 781, au-dessus de la bande de 1 600. **Sept entrees sur dix seraient
refusees.** La regle qui tournerait ne serait donc pas la regle qui a ete
mesuree, et le journal accumulerait des predictions sur une troisieme chose
que personne n'a validee.

Deux facons de « reparer » ca, toutes deux malhonnetes : elargir la bande de
stop pour que la strategie passe — c'est ajuster le garde-fou a la
strategie — ou baisser `atr_stop` jusqu'a ce que ca rentre, c'est-a-dire
choisir un parametre sur une contrainte d'execution puis le presenter comme
valide. On ecarte donc `tsmom`, et on l'ecrit.

**Le cout de cette decision est reel et il faut le dire** : `tsmom` etait la
seule des trois a avoir une chance statistique. En l'ecartant, le
denominateur tombe a deux et il ne reste que des regles dont la puissance
est faible. **Aucune regle de prix figee de ce depot n'a aujourd'hui de
chemin realiste vers une validation statistique.** C'est la verite, et elle
ne change pas si on ne l'ecrit pas.

**Alors pourquoi les faire tourner ?** Parce que la validation statistique
n'est pas le seul produit d'un journal. Tournent des aujourd'hui :

- la verification que la regle s'execute comme elle a ete simulee — un ecart
  entre le backtest et le live est un bogue, et il se voit au premier trade ;
- la mesure du GLISSEMENT reel contre les 15 bps du modele de couts, qui est
  une hypothese jamais confrontee et que le mode PAPER peut trancher ;
- la preuve que la plomberie tient avant qu'un centime reel ne passe.

Ce sont des resultats disponibles en semaines, pas en annees, et ils sont la
vraie raison de brancher ces regles maintenant.

────────────────────────────────────────────────────────────────────────────
  CE QUI NE DOIT JAMAIS CHANGER
────────────────────────────────────────────────────────────────────────────

Les parametres ci-dessous sont GELES. Les modifier invaliderait tout ce que
le journal a accumule, parce que les anciennes predictions auraient ete
prises sous une autre regle. Un test verrouille leur empreinte : la changer
exige d'incrementer `VERSION`, ce qui repart d'un denominateur neuf et d'un
journal qui distingue les deux regimes.

« Ajuster legerement un seuil » suffirait sinon a transformer
retroactivement un echec en succes.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

# La version de la DECLARATION. L'incrementer repart d'un denominateur neuf.
VERSION = 1

# La date a laquelle ces regles ont ete figees. Toute barre anterieure est
# DANS l'echantillon et ne compte pas.
FIGE_LE = "2026-09-14"


@dataclass(frozen=True)
class RegleFigee:
    cle: str
    strategie: str
    actif: str
    intervalle: str
    parametres: dict[str, Any]
    mecanisme: str
    # Ce que la mesure par fenetres glissantes dit de sa puissance. Inscrit
    # ici pour que personne ne soit surpris dans deux ans.
    puissance: str
    stop_pct: float = 0.15
    # La part des entrees que le moteur de RISQUE du deploiement refuserait,
    # mesuree en rejouant la regle contre lui. C'est une propriete de premier
    # rang : au-dela de quelques pour cent, la regle qui tourne n'est plus
    # celle qui a ete mesuree, et le journal accumule des predictions sur
    # autre chose.
    refus_mesure: float = 0.0
    version: int = field(default=VERSION)

    def empreinte(self) -> str:
        return hashlib.sha256(json.dumps({
            "s": self.strategie, "a": self.actif, "i": self.intervalle,
            "p": {k: self.parametres[k] for k in sorted(self.parametres)},
        }, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:12]


REGLES: tuple[RegleFigee, ...] = (
    RegleFigee(
        cle="turtle_btc_1d",
        strategie="turtle_breakout",
        actif="BTC",
        intervalle="1d",
        parametres={"entry_period": 20, "exit_period": 10},
        mecanisme="Cassure de canal Donchian — le « Systeme 1 » des Turtles de "
                  "Dennis et Eckhardt, 1983. Quarante ans de documentation "
                  "publique, et quatre cellules sur six sous p = 0,05 dans le "
                  "balayage BTC du 14 septembre 2026.",
        puissance="FAIBLE, et il faut le savoir : p median 0,329 sur trois "
                  "ans, 8 % des fenetres sous 0,05 contre 5 % pour le pur "
                  "hasard. A dix trades par an, cette regle ne se prouvera "
                  "pas par ce chemin. Elle tourne pour la plomberie et le "
                  "glissement, pas pour le p.",
        refus_mesure=0.03,
    ),
    RegleFigee(
        cle="turtle_eth_1d",
        strategie="turtle_breakout",
        actif="ETH",
        intervalle="1d",
        parametres={"entry_period": 20, "exit_period": 10},
        mecanisme="La MEME regle que ci-dessus, sur un second actif. Elle ne "
                  "cherche pas un edge de plus : elle demande si le resultat "
                  "de BTC etait propre a BTC. Deux actifs ne font pas une "
                  "coupe transversale — chacun est juge separement.",
        puissance="FAIBLE, comme sa jumelle. Son interet est comparatif.",
        refus_mesure=0.18,
    ),
)

# Le denominateur du test hors echantillon, declare AVANT que la donnee
# existe. Deux regles, donc deux hypotheses — le seuil de Benjamini-Hochberg
# au rang 1 vaut 0,05/2 = 0,025.
#
# Il valait trois avant que la mesure des refus n'ecarte `tsmom`. Le
# reduire est legitime ici, et seulement ici : la regle est retiree pour une
# raison d'EXECUTABILITE, constatee avant que la moindre donnee hors
# echantillon n'existe, et non parce que son resultat deplaisait.
DENOMINATEUR = len(REGLES)


# Au-dela de ce taux de refus, la regle qui tourne n'est plus celle qui a ete
# mesuree. Un test le verrouille : aucune regle figee ne peut le depasser.
REFUS_MAXIMUM = 0.25


def par_cle(cle: str) -> RegleFigee | None:
    return next((r for r in REGLES if r.cle == cle), None)


def empreinte_du_registre() -> str:
    """L'empreinte de TOUTE la declaration. Un test la verrouille."""
    return hashlib.sha256(
        "|".join(f"{r.cle}:{r.empreinte()}" for r in REGLES).encode()
    ).hexdigest()[:16]
