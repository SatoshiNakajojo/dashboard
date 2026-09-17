"""Une idee essayee sur un marche, et toutes les variantes de ses reglages.

Le registre compte des SIGNATURES : une strategie, un actif, un intervalle,
un jeu de parametres. C'est la bonne unite pour la tracabilite — deux essais
de meme signature ne sont pas deux tests — mais c'est la mauvaise unite pour
le denominateur, et l'atelier s'est fait avoir dessus.

────────────────────────────────────────────────────────────────────────────
  CE QUI NE VA PAS QUAND ON COMPTE LES VARIANTES
────────────────────────────────────────────────────────────────────────────

Benjamini-Hochberg accorde au rang 1 le seuil `alpha / m`. Avec m = 35
signatures et alpha = 0,05, une cellule qui passe SEULE doit descendre sous
0,00143. Le generateur, lui, produit des derivees a plus ou moins 25 % et
50 % du meme parent : sur les memes barres, avec des reglages voisins, elles
prennent a peu de chose pres les memes trades. Elles ne sont pas 10
hypotheses independantes, ce sont 10 facons de poser LA MEME question.

Les compter une par une est faux dans les deux sens, et c'est ce qui rend
l'erreur difficile a voir :

  - ca gonfle m, donc ca durcit le seuil pour tout le monde, y compris pour
    les idees qui n'ont rien a voir avec la famille en question ;
  - et ca n'a jamais protege de ce que la correction est censee empecher,
    puisque chercher le meilleur reglage parmi dix EST une recherche, qu'il
    faut payer une fois, au niveau de la famille.

────────────────────────────────────────────────────────────────────────────
  LA FAMILLE EST L'UNITE, ET SA CLE CONTIENT LE MARCHE
────────────────────────────────────────────────────────────────────────────

Une famille = une origine, une strategie, un actif, un intervalle. Toutes les
variantes de parametres essayees sur cette cellule lui appartiennent.

**L'actif et l'intervalle restent dans la cle**, et ce n'est pas un detail de
confort : le modele nul est construit sur CES barres-la. « ema_cross marche
sur SOL en 4 h » et « ema_cross marche sur BTC en 1 j » sont deux affirmations
sur deux marches, verifiables separement, et les fondre dans une seule
famille rendrait la correction laxiste — on paierait une recherche a la place
de deux. Seule la recherche de reglages A L'INTERIEUR d'une cellule porte sur
une hypothese unique.

La famille entre dans Benjamini-Hochberg une fois, representee par sa
meilleure variante, avec un p qui a deja paye la recherche interne.

────────────────────────────────────────────────────────────────────────────
  DEUX FACONS DE CHIFFRER LE p D'UNE FAMILLE, ET ON DIT TOUJOURS LAQUELLE
────────────────────────────────────────────────────────────────────────────

`MAXIMUM` — exact. On rejoue les V variantes contre le MEME jeu de tirages,
on prend par tirage le meilleur net des V, et on regarde ou tombe le meilleur
net observe dans ce nuage de maxima. C'est la distribution nulle exacte de
« la meilleure de V », donc la recherche est payee a son prix reel. Il faut
pour cela avoir lance la famille d'un bloc : `atelier.essayer_famille`.

`BORNE` — Šidák, quand seuls les p sont au registre. `1 - (1 - p_min)^V` est
exact si les variantes etaient independantes ; elles sont positivement
correlees, donc la borne SURESTIME le p. Elle se trompe dans le sens qui
refuse, jamais dans celui qui fabrique un edge — c'est la seule direction
acceptable pour une valeur par defaut.

L'ecart entre les deux, MESURE plutot que suppose. Dix reglages
d'`ema_cross` sur SOL en 4 h, 1 000 tirages, le 17 septembre 2026 :

    p des variantes   0,003 0,003 0,004 0,006 0,009 0,009 0,053 0,097
                      0,107 0,316
    p_min             0,00300
    famille, EXACT    0,01698
    famille, BORNE    0,02957      soit 1,74 fois le p exact

A trois variantes sur la meme cellule, en revanche, les deux se rejoignent a
l'arrondi (0,0075 contre 0,0075) : la borne ne coute cher que quand la
famille est large. Une famille peut donc passer la porte parce qu'on a pris
la peine de la lancer d'un bloc, et la rater parce qu'on a recolle ses
variantes apres coup. C'est voulu : le prix d'une recherche depend de la
facon dont on a cherche, et recoller apres coup ne permet pas de savoir a
quel point les variantes se ressemblaient.

────────────────────────────────────────────────────────────────────────────
  LE PLANCHER MONTE AVEC LE NOMBRE DE VARIANTES
────────────────────────────────────────────────────────────────────────────

Un test de randomisation a D tirages a un plancher de p a `1/(D+1)`. Sous la
borne de Šidák, le plancher de la FAMILLE vaut `1 - (1 - 1/(D+1))^V` — environ
`V/(D+1)`. Autrement dit : prendre la meilleure de dix variantes ne peut pas
etre dix fois plus surprenant que la meilleure d'une seule, et pretendre le
contraire serait lire une precision que la mesure n'a pas.

Sous le maximum exact le plancher reste `1/(D+1)`, parce que le maximum est
UN test, pas V. C'est la seconde raison de lancer les familles d'un bloc.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Sequence

MAXIMUM = "maximum"
BORNE = "borne"
METHODES = (MAXIMUM, BORNE)

# Les champs qui font la cle d'une famille, dans l'ordre ou ils s'affichent.
CLE_CHAMPS = ("origine", "strategie", "actif", "intervalle")
ORIGINE_SI_ABSENTE = "main"


def cle(ligne: dict[str, Any]) -> str:
    """La cle de famille d'une ligne de registre.

    Une ligne sans `origine` est une ligne ecrite avant que le champ existe :
    elle est rattachee a `main`, comme le fait `atelier.voisines`, et pour la
    meme raison — l'ignorer retirerait des hypotheses reellement testees du
    denominateur.

    **Une ligne dont la cellule n'est pas identifiable est SA PROPRE famille.**
    C'est la correction qui compte le plus dans ce module, et le premier jet
    la ratait : en repliant les champs absents sur `"?"`, trois cents cellules
    generees sans strategie ni actif se retrouvaient dans UNE famille, m
    tombait a 1, et le seuil au rang 1 remontait a alpha — la correction ne
    rejetait plus rien. Le test du denominateur par origine l'a attrape.

    Le sens de l'erreur est ce qui la rend grave : fondre des inconnues
    ABSOUT, la ou les separer ne fait que refuser. Sans savoir de quelle
    cellule une ligne parle, on ne peut pas affirmer qu'elle est la variante
    de quoi que ce soit ; la seule lecture defendable est « une hypothese de
    plus ».
    """
    origine = ligne.get("origine") or ORIGINE_SI_ABSENTE
    champs = [ligne.get("strategie"), ligne.get("actif"),
              ligne.get("intervalle")]
    if not all(champs):
        return f"{origine}/~{_identite(ligne)}"
    return "/".join([str(origine)] + [str(c) for c in champs])


def _identite(ligne: dict[str, Any]) -> str:
    """De quoi isoler une ligne non identifiable, sans jamais rendre None.

    Les objets qui passent ici ne portent pas tous le meme champ d'identite :
    une ligne de registre a une `signature`, un ticket de bibliotheque une
    `cle`. Se reposer sur un seul des deux rendait `None` pour l'autre — et
    toutes les lignes sans ce champ retombaient sur la MEME cle, ce qui est
    exactement la fusion que `cle` existe pour empecher. A defaut des deux, on
    hache le contenu : deux lignes identiques sont alors une seule hypothese,
    ce qui est la bonne lecture, et deux lignes differentes restent deux.
    """
    for champ in ("signature", "cle", "empreinte"):
        valeur = ligne.get(champ)
        if isinstance(valeur, str) and valeur:
            return valeur
    charge = json.dumps(ligne, sort_keys=True, default=str,
                        separators=(",", ":"))
    return hashlib.sha256(charge.encode()).hexdigest()[:12]


def p_sidak(p_min: float, variantes: int) -> float:
    """La borne : probabilite qu'au moins une de V variantes fasse ce score.

    Bornee a 1 parce qu'une probabilite ne depasse pas 1, et `variantes` est
    ramene a 1 au minimum : une famille d'une seule variante n'a pas cherche,
    elle ne doit donc rien payer.
    """
    v = max(1, int(variantes))
    p = min(1.0, max(0.0, float(p_min)))
    return min(1.0, 1.0 - (1.0 - p) ** v)


def p_maximum(nuls_par_variante: Sequence[Sequence[float]],
              observes: Sequence[float]) -> float:
    """Le p exact de « la meilleure des V », sur tirages alignes.

    `nuls_par_variante[v][d]` est le net du tirage `d` pour la variante `v`.
    Les V listes doivent venir du MEME jeu de graines, sinon les maxima par
    tirage melangent des univers differents et le nuage n'est plus celui de
    la meilleure de V — il est plus disperse, donc plus laxiste.

    Le `+1` au numerateur et au denominateur est celui du test de
    randomisation : avec D tirages, le plus qu'on puisse honnetement dire est
    `p < 1/(D+1)`.
    """
    if not nuls_par_variante or not observes:
        raise ValueError("famille vide : rien a maximiser")
    longueurs = {len(n) for n in nuls_par_variante}
    if len(longueurs) != 1:
        raise ValueError(
            f"tirages non alignes : {sorted(longueurs)} — un p de famille "
            f"exige le meme jeu de graines pour toutes les variantes")
    tirages = longueurs.pop()
    if tirages == 0:
        raise ValueError("aucun tirage : rien a comparer")
    maxima = [max(nuls[d] for nuls in nuls_par_variante)
              for d in range(tirages)]
    observe = max(float(x) for x in observes)
    return (sum(1 for x in maxima if x >= observe) + 1) / (tirages + 1)


def plancher(tirages: int, variantes: int, methode: str = BORNE) -> float:
    """Le plus petit p que la famille puisse rendre, methode comprise."""
    if not tirages or int(tirages) <= 0:
        raise ValueError("plancher indefini sans tirages")
    base = 1.0 / (int(tirages) + 1)
    if methode == MAXIMUM:
        return base
    return p_sidak(base, variantes)


@dataclass(frozen=True)
class Famille:
    """Une cellule, ses variantes, et le p qui a paye leur recherche."""

    cle: str
    representante: dict[str, Any]
    variantes: list[dict[str, Any]] = field(default_factory=list)
    p: float = 1.0
    methode: str = BORNE
    plancher: float | None = None

    @property
    def taille(self) -> int:
        return len(self.variantes)

    @property
    def aveugle(self) -> bool:
        """Le plancher a-t-il mange la mesure ?"""
        return self.plancher is not None and self.p <= self.plancher + 1e-12

    def contient(self, ligne: dict[str, Any]) -> bool:
        sig = str(ligne.get("signature"))
        return any(str(v.get("signature")) == sig for v in self.variantes)

    def est_representante(self, ligne: dict[str, Any]) -> bool:
        return (str(self.representante.get("signature"))
                == str(ligne.get("signature")))

    def en_dict(self) -> dict[str, Any]:
        return {
            "cle": self.cle,
            "variantes": self.taille,
            "p": self.p,
            "methode": self.methode,
            "plancher": self.plancher,
            "aveugle": self.aveugle,
            "representante": self.representante.get("signature"),
            "strategie": self.representante.get("strategie"),
            "actif": self.representante.get("actif"),
            "intervalle": self.representante.get("intervalle"),
        }


def _p_valide(ligne: dict[str, Any]) -> float | None:
    p = ligne.get("p")
    return float(p) if isinstance(p, (int, float)) else None


def construire(lignes: Sequence[dict[str, Any]]) -> list[Famille]:
    """Regroupe des lignes de registre en familles, p compris.

    Les lignes sans p sont ecartees AVANT le regroupement : une cellule sans
    trade n'est pas une hypothese testee, et la laisser entrer gonflerait le
    denominateur avec du vide — meme raison que dans `atelier.essayer`.

    Une ligne portant deja `famille_p` a ete lancee d'un bloc : on lui fait
    confiance plutot que de recalculer une borne, MAIS seulement si toutes
    les variantes presentes s'accordent sur la meme valeur et le meme nombre.
    Un desaccord veut dire qu'on a melange un lot lance d'un bloc avec des
    essais ajoutes apres coup ; la famille retombe alors sur la borne, qui est
    le choix conservateur.
    """
    groupes: dict[str, list[dict[str, Any]]] = {}
    for ligne in lignes:
        if _p_valide(ligne) is None:
            continue
        groupes.setdefault(cle(ligne), []).append(ligne)

    familles: list[Famille] = []
    for k, membres in groupes.items():
        membres = sorted(membres, key=lambda x: _p_valide(x) or 1.0)
        meilleure = membres[0]
        p_min = _p_valide(meilleure) or 1.0
        tirages = meilleure.get("tirages")

        annonces = {(round(float(m["famille_p"]), 12),
                     int(m.get("famille_variantes") or 0))
                    for m in membres
                    if isinstance(m.get("famille_p"), (int, float))}
        d_un_bloc = (len(annonces) == 1
                     and len(membres) == next(iter(annonces))[1])
        if d_un_bloc:
            p, methode = next(iter(annonces))[0], MAXIMUM
        else:
            p, methode = p_sidak(p_min, len(membres)), BORNE

        familles.append(Famille(
            cle=k, representante=meilleure, variantes=membres,
            p=p, methode=methode,
            plancher=(plancher(int(tirages), len(membres), methode)
                      if tirages else None),
        ))
    return sorted(familles, key=lambda f: f.p)


def de(lignes: Sequence[dict[str, Any]],
       ligne: dict[str, Any]) -> Famille | None:
    """La famille a laquelle appartient `ligne`, parmi `lignes`."""
    voulue = cle(ligne)
    return next((f for f in construire(lignes) if f.cle == voulue), None)
