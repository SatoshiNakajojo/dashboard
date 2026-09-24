"""La regle du deblocage, et rien d'autre. **Aucune dependance.**

Ces quarante lignes etaient dans `sentinelle/triggers.py`, qui importe `Bar`,
donc pydantic, donc tout le paquet `features`. Quatre lecteurs partagent
cette regle — le declencheur, le journal hors echantillon, le validateur et
le diagnostic de couverture — et **trois d'entre eux n'ont aucun besoin de
pydantic** : ils travaillent sur des dictionnaires de calendrier, pas sur des
bougies.

Le prix de ce melange s'est paye deux fois sur le VPS, qui n'heberge que la
collecte et dont les dependances vivent dans un venv reserve a l'utilisateur
`desk` : un script de diagnostic lance par `trader` mourait sur
`No module named 'pydantic'`, puis sur `Permission denied` en essayant
d'emprunter l'interpreteur du voisin. Aucune des deux traces ne parlait de
la vraie cause, qui est qu'une constante et une fonction pure tiraient un
validateur de schemas derriere elles.

`triggers.py` reexporte ces noms, donc rien de ce qui existait ne bouge. La
regle reste definie UNE SEULE FOIS : une copie derive un jour, et la derive
ne se voit jamais dans les chiffres — elle se voit des mois plus tard, dans
un score hors echantillon qui ne mesure pas la strategie qu'on croyait.
"""

from __future__ import annotations

from collections.abc import Sequence

# Ces bornes ne sont pas des reglages, ce sont les LIMITES du domaine valide,
# et elles vivent ici parce que trois endroits les utilisent : ce
# declencheur, `scripts/journal_unlocks.py` qui inscrit les positions a
# venir, et `scripts/valider_unlocks.py` qui a produit la mesure.
#
# La duplication n'est pas une hypothese : elle a deja mordu deux fois dans
# ce projet. `poolage` et `decalage_calendaire` ordonnaient differemment la
# deduplication et le filtre de debordement ; le journal, a sa premiere
# execution reelle, a inscrit XPL deux fois et un deblocage de 65 %. Chaque
# copie derive un jour, et la derive ne se voit pas dans les chiffres.

DEBLOCAGE_PART_MIN = 0.02   # en dessous, aucun des six controles ne survit
DEBLOCAGE_PART_MAX = 0.25   # borne la plus serree validee par l'epreuve
#                             des denominateurs (n=832, +223,1 bps, p=0,0025)
DEBLOCAGE_AVANCE_J = 7      # fenetre d'anticipation J-7 -> J-1
DEBLOCAGE_DUREE_J = 6       # six jours de detention


def deblocages_retenus(
    deblocages: Sequence[dict], *,
    part_min: float = DEBLOCAGE_PART_MIN,
    part_max: float = DEBLOCAGE_PART_MAX,
    duree_j: int = DEBLOCAGE_DUREE_J,
) -> list[dict]:
    """Le filtre de taille et la deduplication, appliques sur des DATES.

    Travailler sur des dates plutot que sur des indices de barres est ce qui
    permet aux deux appelants de partager cette fonction : le declencheur a
    des barres, le journal n'en a pas — ses evenements sont dans le futur et
    aucune bougie n'existe encore.

    **Un seul evenement par fenetre.** Deux deblocages a trois jours d'ecart
    produisent des fenetres qui se recouvrent, donc une position tenue une
    fois et comptee deux. La validation applique la meme regle ; s'en ecarter
    mesurerait une strategie differente de celle qui a ete mesuree.

    Un evenement malforme est ecarte, jamais leve : le calendrier vient d'une
    source externe et le desk doit l'ignorer, pas tomber au milieu d'un cycle.
    """
    gardes: list[dict] = []
    dernier = -10**9
    for e in sorted(deblocages, key=lambda v: v.get("ts_ms") or 0):
        try:
            part = float(e["part_offre"])
            jour = int(e["ts_ms"]) // 86_400_000
        except (KeyError, TypeError, ValueError):
            continue
        if not part_min <= part < part_max:
            continue
        if jour - dernier < duree_j:
            continue
        dernier = jour
        gardes.append(e)
    return gardes
