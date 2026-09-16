"""Le vocabulaire d'evenements, FIGE avant d'avoir regarde le moindre rendement.

L'idee vient d'une conversation du 15 septembre 2026 :

    « La big strategie, c'est qu'il y a une strategie par evenement. Des qu'il
      va detecter trois, quatre evenements qui se succedent dans un ordre, il
      va pouvoir tout de suite se referer a tous les moments dans l'histoire
      ou il s'est passe ces quatre evenements a la suite, ce que ca a fait sur
      tel ou tel actif, et prendre un trade en consequence. »

C'est la meilleure idee de la conversation et la plus dangereuse. Meilleure
parce que ce depot en a deja la preuve d'existence : **sa seule regle validee
est evenementielle** — les deblocages, 852 evenements, p = 0,0010. Elle ne
regarde aucun prix, elle regarde un calendrier.

Plus dangereuse parce que chercher « tous les moments de l'histoire ou ces
quatre-la se sont succede » PUIS regarder le rendement est la machine a faux
positifs dans sa forme la plus pure. Ce depot a deja perdu quatre cents
cellules a ca.

────────────────────────────────────────────────────────────────────────────
  CE MODULE NE MESURE RIEN, ET C'EST TOUT SON INTERET
────────────────────────────────────────────────────────────────────────────

Il declare : le vocabulaire, la longueur des sequences, la fenetre, l'horizon,
le plancher d'occurrences, le nombre de tirages. Rien d'autre. La mesure vit
dans `scripts/valider_sequences.py`, **ecrit apres**, et l'historique git en
fait foi : ce fichier est commite seul, avant que la moindre ligne de mesure
n'existe.

C'est la seule preuve qu'un denominateur honnete puisse avoir. Une declaration
ecrite en meme temps que sa mesure est une declaration qu'on peut ajuster
jusqu'a ce qu'elle plaise, et personne — pas meme son auteur — ne peut
distinguer apres coup les deux cas.

────────────────────────────────────────────────────────────────────────────
  VERSION 2 : LA VERSION 1 S'ETAIT PIEGEE ELLE-MEME
────────────────────────────────────────────────────────────────────────────

La version 1 declarait 72 hypotheses et verifiait que le criblage pouvait
voir : plancher de p a `1/(TIRAGES+1)` = 0,0002, sous le seuil de
Benjamini-Hochberg au rang 1 de 0,05/72 = 0,00069. La verification etait
juste, et elle portait sur le mauvais plancher.

**Le plancher d'un nul PAR BLOC n'est pas fixe par le nombre de tirages, il
est fixe par la DONNEE.** Un nul par bloc decale tous les evenements d'un
meme offset ; le nombre de realisations distinctes du nul est donc le nombre
d'offsets disponibles, pas le nombre de fois qu'on en tire un. Tirer cinq
mille fois dans une plage de cent-dix offsets ne produit pas cinq mille nuls,
il en produit cent-dix, reechantillonnes. Le plancher reel vaut
`1/(plage+1)`.

Mesure sur l'univers, le 16 septembre 2026 :

    seuil d'historique   actifs   delistes   plage   hypotheses max
              300 j        216     21,8 %     110          5
              365 j        202     21,3 %     171          8
              500 j        179     17,9 %     302         15
              730 j        127     11,8 %     532         26

La colonne qui decide n'est pas la derniere, c'est l'avant-derniere.
**Relever le seuil d'historique reintroduit le biais du survivant** : un
perpetuel deliste est court par construction, et l'univers de 234 perps avait
ete collecte precisement pour ne pas avoir ce biais. Acheter de la resolution
en montant le seuil revient a payer avec la seule propriete rare de cet
univers.

A 365 jours, la part de delistes tombe de 23,9 % a 21,3 % — a peu pres rien —
et la donnee porte huit hypotheses. C'est exactement le nombre de types
d'evenements.

**Version 2 declare donc les huit evenements SEULS, sans les paires.** Le
changement est dicte par la resolution du controle et la composition de
l'univers, deux quantites calculees sans avoir regarde un seul rendement.
C'est ce qui le distingue d'un ajustement : on ne sait toujours pas si une
seule de ces huit sequences rapporte quoi que ce soit.

Et le nul devient EXHAUSTIF plutot qu'echantillonne : on enumere tous les
offsets de la plage au lieu d'en tirer au hasard. Strictement meilleur, et ca
supprime la graine — donc la question « et si on avait tire autrement ».

**La reponse a donner sur l'idee des sequences est donc : pas sur cette
donnee.** Les paires demandent une plage de 1 280 offsets pour 64 hypotheses,
soit plus de 1 480 jours d'historique commun. Aucun univers de perpetuels
crypto sans biais du survivant ne l'offre aujourd'hui.

────────────────────────────────────────────────────────────────────────────
  CE QUE DISAIT DEJA LA VERSION 1, ET QUI RESTE VRAI
────────────────────────────────────────────────────────────────────────────

Avec huit types d'evenements :

    longueur 1     8 hypotheses
    longueur 2    64 hypotheses          total declare : 72
    longueur 3   512 hypotheses          total : 584
    longueur 4  4096 hypotheses          total : 4680

Le seuil de Benjamini-Hochberg au rang 1 vaut `alpha / m`. A 72 hypotheses il
vaut 0,00069 ; a 584, 0,000086 ; a 4680, 0,0000107. Or un test de
randomisation a un PLANCHER de p a `1/(tirages+1)` : il faudrait
respectivement 1 450, 11 700 et 93 500 tirages pour qu'une seule cellule
puisse survivre. Le dernier chiffre n'est pas un probleme de patience, c'est
un criblage aveugle deguise.

Et la rarete mord dans l'autre sens : une sequence de quatre evenements sur
un actif donne se produit une poignee de fois en trois ans. Sous le plancher
d'occurrences, elle n'est pas testee — donc les quatre mille hypotheses
supplementaires n'apporteraient presque que du denominateur.

**Deux est la longueur que cette donnee peut porter.** Aller a quatre parce
que la conversation disait quatre serait obeir a une phrase plutot qu'a une
contrainte.

────────────────────────────────────────────────────────────────────────────
  LE PLANCHER D'OCCURRENCES, ET POURQUOI IL NE TRICHE PAS
────────────────────────────────────────────────────────────────────────────

Une sequence vue moins de `OCCURRENCES_MIN` fois n'est pas testee. Le
denominateur reel est donc le nombre de sequences EFFECTIVEMENT testees, qui
n'est connu qu'apres avoir compte les occurrences.

Ce n'est pas une echappatoire, et la distinction est fine : le filtre porte
sur le nombre d'occurrences, pas sur le rendement. On regarde combien de fois
une sequence s'est produite AVANT de regarder ce qu'elle a rapporte, et le
seuil est inscrit ici, maintenant. Un filtre qui ecarterait les sequences
« peu concluantes » serait de la selection ; celui-ci ecarte les sequences
sur lesquelles aucun test n'aurait de puissance, ce qui est une propriete de
l'echantillon et non du resultat.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

# La version de la DECLARATION. L'incrementer repart d'un denominateur neuf.
VERSION = 2
FIGE_LE = "2026-09-16"

# La longueur maximale d'une sequence. Voir l'en-tete : la version 1 disait
# deux, et la resolution du nul par bloc ne le permet pas sur cet univers.
LONGUEUR_MAX = 1

# L'historique minimal d'un actif pour entrer dans l'etude. Ce n'est PAS un
# reglage de confort : c'est lui qui fixe la plage du decalage commun, donc
# le plancher de p. Le monter achete de la resolution et la paie en biais du
# survivant — un perpetuel deliste est court par construction.
#
# 365 jours : 202 actifs sur 234, dont 21,3 % de delistes contre 23,9 % dans
# l'univers complet. La resolution obtenue porte exactement huit hypotheses.
HISTORIQUE_MIN_J = 365

# Deux evenements forment une sequence s'ils surviennent sur le MEME actif a
# au plus tant de jours d'ecart. Au-dela, « a la suite » ne veut plus rien
# dire : deux evenements a trois mois d'ecart sont deux evenements.
FENETRE_SEQUENCE_J = 5

# L'horizon mesure, de la cloture du dernier evenement de la sequence a la
# cloture J+HORIZON. **Un seul**, declare ici : chaque horizon supplementaire
# multiplie le denominateur, et trois horizons feraient 216 hypotheses pour
# une information qui n'est pas trois fois plus riche.
HORIZON_J = 5

# En dessous, la sequence n'est pas testee. Voir l'en-tete pour pourquoi ce
# filtre ne triche pas.
OCCURRENCES_MIN = 100

# Le nul est EXHAUSTIF : on enumere tous les offsets de la plage plutot que
# d'en tirer au hasard. Il n'y a donc pas de nombre de tirages, et pas de
# graine — donc pas de question « et si on avait tire autrement ».
#
# C'est possible parce que la plage est petite, et elle est petite pour la
# raison meme qui rendait la version 1 impossible.
NUL_EXHAUSTIF = True

# La marge du nul PAR BLOC, en jours. Le decalage commun est tire dans
# [MARGE_BLOC, MARGE_BLOC + plage]. Sans cette marge, la plage est bornee par
# le plus court historique et chaque tirage recouvre l'observation : le
# controle devient inerte et valide tout. C'est arrive au depot le
# 14 septembre 2026, sur l'etude des cotations.
MARGE_BLOC = 100

# Une bougie a volume nul est un prix de MARQUE, pas une execution. 32 % des
# cotations de perpetuels en publient. Une sequence declenchee sur de telles
# bougies mesurerait un mouvement que personne n'aurait pu trader.
VOLUME_MIN_REQUIS = True


@dataclass(frozen=True)
class TypeEvenement:
    cle: str
    quoi: str
    # Les parametres du detecteur. Ils entrent dans l'empreinte : les changer
    # change l'evenement, donc l'hypothese, donc le denominateur.
    parametres: dict[str, Any]


# Huit types. Chacun est une condition DETERMINISTE sur une bougie journaliere
# et les precedentes — rien qui demande un jugement, rien qui regarde l'avenir.
EVENEMENTS: tuple[TypeEvenement, ...] = (
    TypeEvenement("cassure_haute",
                  "cloture au-dessus du plus haut des N jours precedents",
                  {"periode": 20}),
    TypeEvenement("cassure_basse",
                  "cloture en dessous du plus bas des N jours precedents",
                  {"periode": 20}),
    TypeEvenement("volume_extreme",
                  "volume au-dessus de K fois la mediane des N jours",
                  {"periode": 20, "facteur": 3.0}),
    TypeEvenement("amplitude_extreme",
                  "amplitude relative au-dessus de K fois la mediane des N jours",
                  {"periode": 20, "facteur": 3.0}),
    TypeEvenement("ecart_haut",
                  "ouverture au-dessus de la cloture precedente de plus de X",
                  {"seuil": 0.05}),
    TypeEvenement("ecart_bas",
                  "ouverture en dessous de la cloture precedente de plus de X",
                  {"seuil": 0.05}),
    TypeEvenement("serie_haussiere", "N clotures consecutives en hausse",
                  {"longueur": 5}),
    TypeEvenement("serie_baissiere", "N clotures consecutives en baisse",
                  {"longueur": 5}),
)


def plancher_de_p(plage: int) -> float:
    """Le plancher de p d'un nul par bloc EXHAUSTIF sur `plage` offsets.

    **Ce n'est pas 1/(tirages+1).** Le nombre de realisations distinctes d'un
    nul par bloc est le nombre d'offsets, pas le nombre de fois qu'on en tire
    un. La version 1 de cette declaration verifiait le mauvais plancher et
    s'etait declaree mesurable alors qu'elle ne l'etait pas.
    """
    return 1.0 / (max(plage, 0) + 1)


def hypotheses_supportees(plage: int, alpha: float = 0.05) -> int:
    """Combien d'hypotheses cette plage peut porter.

    Il faut `plancher < alpha/m`, donc `m < alpha x (plage+1)`. En rendre une
    de plus rendrait le criblage aveugle : aucune cellule ne pourrait
    survivre, et son « zero survivant » ne dirait rien du marche.
    """
    return int(alpha * (max(plage, 0) + 1))


def sequences_declarees() -> list[tuple[str, ...]]:
    """Toutes les sequences que cette declaration autorise a tester.

    L'ordre compte : (cassure_haute, volume_extreme) n'est pas la meme
    sequence que (volume_extreme, cassure_haute). C'est le sens de « qui se
    succedent DANS UN ORDRE ».

    Une sequence peut repeter un type — deux cassures hautes a trois jours
    d'ecart est un motif, pas une erreur.
    """
    cles = [e.cle for e in EVENEMENTS]
    out: list[tuple[str, ...]] = [(c,) for c in cles]
    if LONGUEUR_MAX >= 2:
        out += [(a, b) for a in cles for b in cles]
    return out


# Le denominateur DECLARE. Le denominateur reel sera plus petit — les
# sequences sous le plancher d'occurrences ne sont pas testees — et c'est lui
# qui servira a la correction. Celui-ci est la borne, inscrite avant.
DENOMINATEUR_DECLARE = len(sequences_declarees())


def empreinte() -> str:
    """L'empreinte de TOUTE la declaration. Un test la verrouille.

    Elle couvre le vocabulaire et ses parametres, la longueur, la fenetre,
    l'horizon et le plancher d'occurrences. Changer l'un d'eux exige
    d'incrementer `VERSION`, ce qui repart d'un denominateur neuf.

    Sans ce verrou, « ajuster legerement un seuil » suffirait a transformer
    retroactivement un echec en succes — et il suffirait de le faire une fois
    pour que plus aucune mesure du depot ne veuille rien dire.
    """
    corps = {
        "evenements": [
            {"cle": e.cle,
             "parametres": {k: e.parametres[k] for k in sorted(e.parametres)}}
            for e in EVENEMENTS
        ],
        "longueur_max": LONGUEUR_MAX,
        "fenetre_sequence_j": FENETRE_SEQUENCE_J,
        "horizon_j": HORIZON_J,
        "occurrences_min": OCCURRENCES_MIN,
        "volume_min_requis": VOLUME_MIN_REQUIS,
        "historique_min_j": HISTORIQUE_MIN_J,
        "nul_exhaustif": NUL_EXHAUSTIF,
    }
    return hashlib.sha256(
        json.dumps(corps, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()[:16]


def par_cle(cle: str) -> TypeEvenement | None:
    return next((e for e in EVENEMENTS if e.cle == cle), None)
