"""L'avocat du diable, en un seul objet — la porte que toute candidate franchit.

L'idee vient d'une conversation du 15 septembre 2026 : « je veux affiner le
systeme de notes pour que ce soit le plus dur possible, un peu comme ton truc
de dire il y a l'avocat du diable, toujours quelqu'un qui vient dire et si il
y a ca, et si il y a ca ». L'intuition est juste. Sa mise en œuvre la plus
naturelle — durcir un bareme — ne l'est pas, et ce module existe pour la
raison qui separe les deux.

────────────────────────────────────────────────────────────────────────────
  POURQUOI UNE NOTE PLUS SEVERE NE REPARE RIEN
────────────────────────────────────────────────────────────────────────────

Ce qui fabrique les faux positifs n'est pas la generosite du bareme, c'est le
NOMBRE de candidates. Trente-cinq combinaisons a l'atelier ont donne douze
cellules sous p = 0,05 ; le pur hasard en aurait produit un virgule huit, et
apres correction du taux de fausses decouvertes il en reste zero. Un bareme
deux fois plus dur aurait garde six cellules au lieu de douze, et il en
resterait toujours zero de vraies. On aurait seulement moins de faux positifs
a la fois, pas moins de faux positifs par vrai.

Une note AGREGEE a un second defaut, plus insidieux : une bonne moyenne peut
masquer une epreuve fatale. Une regle dont soixante-dix pour cent des entrees
seraient refusees par le moteur de risque n'est pas « une regle un peu moins
bien notee », c'est une regle qui ne tournera jamais telle qu'elle a ete
mesuree. Aucune ponderation ne rend cette information a une moyenne.

D'ou la forme retenue : **des epreuves independantes, chacune rendant un
verdict propre avec son motif, et un seul echec suffit.**

────────────────────────────────────────────────────────────────────────────
  TROIS ETATS, ET LE TROISIEME EST LE PLUS IMPORTANT
────────────────────────────────────────────────────────────────────────────

    RETENUE      toutes les epreuves applicables sont passees
    REFUSEE      au moins une epreuve a echoue
    INCOMPLETE   aucune n'a echoue, mais une epreuve exigee n'a pas pu etre
                 executee faute de donnee

**Une epreuve qui ne peut pas s'executer n'est pas une epreuve reussie.**
C'est le defaut par lequel ce depot s'est fait avoir : le nul par bloc des
cotations tirait son decalage dans une plage de zero a vingt-cinq jours,
bornee par le plus court historique, si bien que chaque tirage recouvrait
l'observation. Il ne pouvait pas echouer. Il validait tout, et il a fallu le
corriger pour decouvrir que p valait 0,164. Un controle inerte est pire
qu'aucun controle, parce qu'il inspire confiance.

On distingue donc deux facons de ne pas s'appliquer :

    SANS OBJET     l'epreuve ne concerne pas cette classe de candidate
                   (un nul par bloc n'a pas de sens sur un actif unique)
    INDISPONIBLE   l'epreuve concerne cette candidate mais la donnee manque

La premiere ne bloque pas. La seconde rend INCOMPLETE.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Sequence

from .sentinelle.regles_figees import REFUS_MAXIMUM
from .sentinelle.validation import benjamini_hochberg

ALPHA = 0.05

# En dessous de ce nombre d'aller-retours, un p n'est pas interpretable. Ce
# n'est PAS un seuil de puissance suffisante — la mesure par fenetres
# glissantes des regles figees montre que `turtle` a trente et un trades sur
# trois ans rend un p median de 0,329, donc trente trades ne prouvent rien.
# C'est un plancher d'interpretabilite : en dessous, la question ne se pose
# meme pas.
TRADES_MIN = 30

# L'epreuve du retrait d'un mois. Ce sont des conventions, declarees ici pour
# qu'elles soient discutables plutot que noyees dans une condition.
PART_MAX_MOIS = 0.50   # au-dela, un mois n'est plus une contribution
MOIS_MIN = 3           # en dessous, « un mois sur deux » ne veut rien dire

# Les classes de candidates. Elles decident quelles epreuves s'appliquent.
CLASSES = ("prix_mono", "evenement", "coupe")

RETENUE, REFUSEE, INCOMPLETE = "RETENUE", "REFUSEE", "INCOMPLETE"

# Les constantes voyagent en JSON et servent de cles ; ce qui s'AFFICHE est
# separe, parce qu'un jour on traduira l'un sans casser l'autre.
LIBELLES = {RETENUE: "Retenue", REFUSEE: "Refusée", INCOMPLETE: "Incomplète"}
REUSSIE, ECHOUEE, SANS_OBJET, INDISPONIBLE = (
    "reussie", "echouee", "sans_objet", "indisponible")


@dataclass(frozen=True)
class Epreuve:
    cle: str
    titre: str
    etat: str
    motif: str

    @property
    def bloquante(self) -> bool:
        return self.etat in (ECHOUEE, INDISPONIBLE)


@dataclass(frozen=True)
class Verdict:
    etat: str
    epreuves: tuple[Epreuve, ...]

    @property
    def fatale(self) -> Epreuve | None:
        """L'epreuve qui explique l'etat. Un ECHEC prime sur une INDISPONIBLE.

        Sans cette priorite, une epreuve que la donnee empeche d'executer
        masque un echec reel qui la suit : le verdict annonce REFUSEE et le
        motif affiche dit « donnee absente », ce qui envoie chercher la
        donnee manquante au lieu de la vraie cause. C'est le meme defaut que
        celui qu'on traque ailleurs dans ce depot — un affichage qui
        ressemble a un resultat mais decrit autre chose.
        """
        return (next((e for e in self.epreuves if e.etat == ECHOUEE), None)
                or next((e for e in self.epreuves if e.etat == INDISPONIBLE),
                        None))

    def resume(self) -> str:
        libelle = LIBELLES.get(self.etat, self.etat)
        f = self.fatale
        return f"{libelle} — {f.titre} : {f.motif}" if f else libelle

    def en_dict(self) -> dict[str, Any]:
        return {
            "etat": self.etat,
            "epreuves": [{"cle": e.cle, "titre": e.titre, "etat": e.etat,
                          "motif": e.motif} for e in self.epreuves],
            "fatale": self.fatale.cle if self.fatale else None,
        }


# ─────────────────────────────────────────────────────────── les epreuves

def _plancher(ligne: dict[str, Any]) -> Epreuve:
    """Un p egal a 1/(tirages+1) est la borne de l'instrument, pas une mesure.

    Le test de randomisation ne peut pas descendre en dessous : il compte les
    tirages qui battent l'observation, et zero sur D donne (0+1)/(D+1). Une
    cellule collee a ce plancher dit « aucun des D tirages n'a fait mieux »,
    ce qui est compatible avec p = 0,04 comme avec p = 0,000001. La retenir
    revient a lire une precision que la mesure n'a pas.
    """
    titre = "Le plancher de p"
    p, tirages = ligne.get("p"), ligne.get("tirages")
    if p is None:
        return Epreuve("plancher", titre, INDISPONIBLE,
                       "aucun p inscrit : la candidate n'a pas été comparée "
                       "au hasard")
    if not tirages:
        return Epreuve("plancher", titre, INDISPONIBLE,
                       "nombre de tirages non inscrit : le plancher est "
                       "inconnu, donc p n'est pas qualifiable")
    plancher = 1.0 / (int(tirages) + 1)
    if float(p) <= plancher + 1e-12:
        return Epreuve("plancher", titre, ECHOUEE,
                       f"p = {float(p):.5f} est au plancher de l'instrument "
                       f"(1/{int(tirages)+1}). Relancer à plus de tirages ou "
                       f"renoncer à chiffrer p")
    return Epreuve("plancher", titre, REUSSIE,
                   f"p = {float(p):.4f}, au-dessus du plancher "
                   f"{plancher:.5f}")


def _trades(ligne: dict[str, Any], *, minimum: int = TRADES_MIN) -> Epreuve:
    """Assez d'aller-retours pour que la question se pose."""
    titre = "Le nombre d'aller-retours"
    n = ligne.get("trades")
    if n is None:
        return Epreuve("trades", titre, INDISPONIBLE,
                       "nombre de trades non inscrit")
    n = int(n)
    if n < minimum:
        return Epreuve("trades", titre, ECHOUEE,
                       f"{n} aller-retours, plancher d'interpretabilite a "
                       f"{minimum}. Un p bas sur si peu de trades est du bruit")
    return Epreuve("trades", titre, REUSSIE, f"{n} aller-retours")


def _refus(ligne: dict[str, Any], *, maximum: float = REFUS_MAXIMUM) -> Epreuve:
    """La part des entrees que le moteur de risque du DEPLOIEMENT refuserait.

    Epreuve de premier rang, et la plus souvent oubliee : au-dela de quelques
    pour cent, la regle qui tourne n'est plus celle qui a ete mesuree. C'est
    elle qui a ecarte `tsmom_btc_1d`, pourtant la plus puissante du depot —
    son stop a trois ATR depasse la bande acceptee et sept entrees sur dix
    seraient rejetees.
    """
    titre = "Le refus du moteur de risque"
    trades, rejets = ligne.get("trades"), ligne.get("rejets")
    if trades is None or rejets is None:
        return Epreuve("refus", titre, INDISPONIBLE,
                       "trades ou rejets non inscrits : la règle n'a pas été "
                       "rejouée contre le moteur de risque")
    total = int(trades) + int(rejets)
    if total == 0:
        return Epreuve("refus", titre, INDISPONIBLE,
                       "aucune entrée proposée : rien à refuser")
    part = int(rejets) / total
    if part > maximum:
        return Epreuve("refus", titre, ECHOUEE,
                       f"{part:.0%} des entrées refusées (plafond "
                       f"{maximum:.0%}). La règle qui tournerait ne serait "
                       f"pas celle qui a été mesurée")
    return Epreuve("refus", titre, REUSSIE,
                   f"{part:.0%} des entrées refusées, sous le plafond de "
                   f"{maximum:.0%}")


def _retrait(ligne: dict[str, Any]) -> Epreuve:
    """Retirer un mois, et voir si l'effet survit.

    Le depot a failli publier deux fois une explication qui tenait a une seule
    periode. Le beta du livre de portage valait −0,54 ; en retirant le seul
    mois d'aout 2026 il passait a +0,08. Le chiffre n'etait pas faux, il
    decrivait un mois et le presentait comme une propriete de la strategie.

    Deux conditions, et il a fallu les deux.

    **La premiere est sans seuil : si retirer un seul mois civil rend le net
    non positif, le resultat est ce mois-la.** Elle est exacte mais elle ne
    mord que sur le cas extreme — un mois portant 95 % du net la franchit
    tranquillement, ce qui est precisement le defaut qu'on traque.

    **La seconde est une convention declaree, et je prefere l'ecrire que
    faire semblant qu'elle n'en est pas une : au-dela de PART_MAX_MOIS du net
    pour un seul mois, avec au moins MOIS_MIN mois d'historique, la candidate
    est refusee.** Le raisonnement : sur trois mois ou plus, un mois qui porte
    la majorite du resultat signifie que le reste est marginal — la strategie
    a eu un episode, pas un edge. Le seuil est fixe a la moitie parce que
    c'est le point ou « un mois » cesse d'etre une contribution pour devenir
    l'explication.
    """
    titre = "Le retrait d'un mois"
    mois = ligne.get("mois")
    net = ligne.get("net_usd")
    if net is None:
        return Epreuve("retrait", titre, INDISPONIBLE, "net non inscrit")
    if float(net) <= 0:
        return Epreuve("retrait", titre, SANS_OBJET,
                       "net non positif : il n'y a pas de gain à expliquer")
    if not isinstance(mois, dict) or not mois:
        return Epreuve("retrait", titre, INDISPONIBLE,
                       "décomposition mensuelle absente : impossible de "
                       "retirer un mois")
    total = float(net)
    pire_cle, pire_reste = None, None
    for cle, valeur in mois.items():
        reste = total - float(valeur)
        if pire_reste is None or reste < pire_reste:
            pire_cle, pire_reste = cle, reste
    part = (total - pire_reste) / total if total else 0.0
    if pire_reste is not None and pire_reste <= 0:
        return Epreuve("retrait", titre, ECHOUEE,
                       f"retirer {pire_cle} fait passer le net de "
                       f"{total:+.2f} à {pire_reste:+.2f} $. Le résultat est "
                       f"ce mois-là, pas la stratégie")
    if len(mois) >= MOIS_MIN and part > PART_MAX_MOIS:
        return Epreuve("retrait", titre, ECHOUEE,
                       f"{pire_cle} porte {part:.0%} du net sur {len(mois)} "
                       f"mois ; sans lui il reste {pire_reste:+.2f} $ au lieu "
                       f"de {total:+.2f}. C'est un épisode, pas un edge")
    return Epreuve("retrait", titre, REUSSIE,
                   f"le mois le plus porteur ({pire_cle}) pese {part:.0%} du "
                   f"net ; sans lui il reste {pire_reste:+.2f} $")


def _denominateur(ligne: dict[str, Any], voisines: Sequence[dict[str, Any]],
                  *, alpha: float = ALPHA) -> Epreuve:
    """Survivre a la correction portant sur TOUT le registre de meme origine.

    Corriger une cellule sur elle-meme sous-estime le nombre d'hypotheses
    testees. La correction porte donc sur l'ensemble des signatures distinctes
    essayees SOUS LA MEME ORIGINE — cinq cents cellules generees par un modele
    et trois idees tapees a la main ne sont pas le meme espace d'hypotheses,
    et les melanger est faux dans les deux sens : ca punit les trois et ca
    absout les cinq cents.
    """
    titre = "Le dénominateur"
    p = ligne.get("p")
    if p is None:
        return Epreuve("denominateur", titre, INDISPONIBLE, "aucun p inscrit")

    # La candidate compte une fois, par sa signature, meme si `voisines` la
    # contient deja : relancer une combinaison deterministe ne la teste pas
    # deux fois.
    par_signature: dict[str, dict[str, Any]] = {}
    for v in voisines:
        if isinstance(v.get("p"), (int, float)):
            par_signature[str(v.get("signature"))] = v
    par_signature[str(ligne.get("signature"))] = ligne

    lignes = list(par_signature.values())
    ps = [float(v["p"]) for v in lignes]
    m = len(ps)
    garde = benjamini_hochberg(ps, alpha)
    survivante = next(
        (k for v, k in zip(lignes, garde, strict=True)
         if str(v.get("signature")) == str(ligne.get("signature"))), False)

    # Le criblage peut-il voir ? Avec un plancher f = 1/(D+1), il faut
    # ceil(f*m/alpha) cellules AU PLANCHER pour qu'une seule survive.
    tirages = ligne.get("tirages")
    if tirages:
        f = 1.0 / (int(tirages) + 1)
        exigees = math.ceil(f * m / alpha)
        if f > alpha:
            return Epreuve("denominateur", titre, INDISPONIBLE,
                           f"criblage aveugle : le plancher {f:.5f} dépasse "
                           f"alpha = {alpha}. Aucune cellule ne peut survivre, "
                           f"quelle que soit la donnée")
        if exigees > 1 and not survivante:
            return Epreuve("denominateur", titre, ECHOUEE,
                           f"ne survit pas à la correction sur {m} signatures "
                           f"(seuil au rang 1 : {alpha/m:.5f}), et à "
                           f"{int(tirages)} tirages il faudrait {exigees} "
                           f"cellules au plancher pour qu'une seule passe")
    if not survivante:
        return Epreuve("denominateur", titre, ECHOUEE,
                       f"ne survit pas à Benjamini-Hochberg sur les {m} "
                       f"signatures de même origine (seuil au rang 1 : "
                       f"{alpha/m:.5f})")
    return Epreuve("denominateur", titre, REUSSIE,
                   f"survit à la correction sur {m} signatures de même origine")


def _nul_par_bloc(ligne: dict[str, Any], classe: str) -> Epreuve:
    """Un nul qui RESPECTE la dependance, pour toute regle en coupe.

    Le piege recurrent du depot : une exposition de classe deguisee en edge
    evenementiel. Le portage vendait des alts volatils contre des majeures ;
    les cotations violentes sont des memecoins. Dans les deux cas le tirage
    date par date casse la structure calendaire et valide l'artefact ; seul un
    decalage COMMUN, applique en bloc, la preserve.

    Et la plage du decalage doit etre verifiee : si elle est bornee par le
    plus court historique, chaque tirage recouvre l'observation et le controle
    devient inerte.
    """
    titre = "Le nul qui respecte la dépendance"
    if classe == "prix_mono":
        return Epreuve("bloc", titre, SANS_OBJET,
                       "actif unique : il n'y a pas de coupe transversale à "
                       "préserver, le nul standard suffit")
    controle = ligne.get("nul_bloc")
    if not isinstance(controle, dict):
        return Epreuve("bloc", titre, INDISPONIBLE,
                       "règle en coupe ou événementielle sans nul par bloc : "
                       "le résultat n'est pas qualifiable")
    plage = controle.get("plage")
    marge = controle.get("marge")
    if not plage or (marge is not None and float(marge) <= 0):
        return Epreuve("bloc", titre, ECHOUEE,
                       "plage de décalage nulle ou recouvrant l'observation : "
                       "le contrôle ne peut pas échouer, donc il ne contrôle "
                       "rien")
    p = controle.get("p")
    if p is None:
        return Epreuve("bloc", titre, INDISPONIBLE, "nul par bloc sans p")
    if float(p) >= ALPHA:
        return Epreuve("bloc", titre, ECHOUEE,
                       f"p = {float(p):.4f} au nul par bloc (plage {plage}). "
                       f"L'effet ne survit pas au respect de la dépendance")
    return Epreuve("bloc", titre, REUSSIE,
                   f"p = {float(p):.4f} au nul par bloc, plage {plage}")


def _rang(ligne: dict[str, Any]) -> Epreuve:
    """Toute correlation annoncee est doublee d'une correlation de rang.

    Sur les memes cinquante-trois points, Pearson donnait −0,64 et Spearman
    +0,10 : trois valeurs extremes faisaient toute la pente. Une correlation
    de moyennes dont le rang ne confirme ni le signe ni l'ordre de grandeur
    decrit ses outliers, pas sa population.
    """
    titre = "Le rang contre la moyenne"
    paire = ligne.get("correlation")
    if not isinstance(paire, dict):
        return Epreuve("rang", titre, SANS_OBJET,
                       "aucune corrélation annoncée")
    pearson, spearman = paire.get("pearson"), paire.get("spearman")
    if pearson is None or spearman is None:
        return Epreuve("rang", titre, INDISPONIBLE,
                       "corrélation annoncée sans son équivalent de rang")
    p, s = float(pearson), float(spearman)
    if p * s < 0:
        return Epreuve("rang", titre, ECHOUEE,
                       f"Pearson {p:+.3f} et Spearman {s:+.3f} sont de signes "
                       f"opposés : la pente est portée par des valeurs "
                       f"extrêmes")
    if abs(p) > 0 and abs(s) < abs(p) / 3:
        return Epreuve("rang", titre, ECHOUEE,
                       f"Spearman {s:+.3f} vaut moins du tiers de Pearson "
                       f"{p:+.3f} : l'essentiel de la corrélation tient à "
                       f"quelques points")
    return Epreuve("rang", titre, REUSSIE,
                   f"Pearson {p:+.3f} et Spearman {s:+.3f} concordent")


# ─────────────────────────────────────────────────────────────── la porte

def soumettre(ligne: dict[str, Any], *,
              voisines: Sequence[dict[str, Any]] = (),
              classe: str = "prix_mono",
              alpha: float = ALPHA) -> Verdict:
    """Les sept epreuves, dans l'ordre, et le verdict d'ensemble.

    L'ordre n'est pas cosmetique : les epreuves les moins cheres et les plus
    decisives d'abord, pour que le motif affiche soit le plus fondamental des
    motifs bloquants et non le premier calcule.
    """
    if classe not in CLASSES:
        raise ValueError(f"classe inconnue : {classe!r} (attendu {CLASSES})")

    epreuves = (
        _plancher(ligne),
        _trades(ligne),
        _refus(ligne),
        _retrait(ligne),
        _denominateur(ligne, voisines, alpha=alpha),
        _nul_par_bloc(ligne, classe),
        _rang(ligne),
    )

    if any(e.etat == ECHOUEE for e in epreuves):
        etat = REFUSEE
    elif any(e.etat == INDISPONIBLE for e in epreuves):
        etat = INCOMPLETE
    else:
        etat = RETENUE
    return Verdict(etat, epreuves)


def nets_par_mois(trades: Sequence[Any]) -> dict[str, float]:
    """La decomposition mensuelle du net, pour l'epreuve du retrait.

    On date un aller-retour par son ENTREE. Le dater par sa sortie deplacerait
    les trades a cheval sur deux mois et, sur une strategie a detention
    longue, changerait le mois qui porte le resultat — donc le verdict.
    """
    import datetime as dt

    par_mois: dict[str, float] = {}
    for t in trades:
        jour = dt.datetime.fromtimestamp(t.entry_ts_ms / 1000, tz=dt.timezone.utc)
        cle = f"{jour.year:04d}-{jour.month:02d}"
        par_mois[cle] = par_mois.get(cle, 0.0) + float(t.net_pnl_usd)
    return par_mois
