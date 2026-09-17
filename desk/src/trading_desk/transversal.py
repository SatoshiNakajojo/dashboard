"""Une regle tient-elle sur plusieurs marches — et y a-t-il plusieurs marches ?

Ce module repare une phrase qui mentait a l'ecran et construit celle qui la
remplace.

────────────────────────────────────────────────────────────────────────────
  CE QUI MENTAIT
────────────────────────────────────────────────────────────────────────────

La bibliotheque affichait « tient sur 3 actifs » et donnait un point de
rarete pour ca. Le nombre venait de `len(set(actifs sur lesquels la recette a
ete ESSAYEE))`. Une recette lancee sur BTC, ETH et SOL et refusee sur les
trois affichait donc « tient sur 3 actifs » et montait d'un rang.

Quinze cartes sur quarante-quatre portaient cette phrase, dont des REFUSEES.
C'est la meme faute que le depot a deja payee plusieurs fois : une mesure qui
decrit l'effort et s'affiche comme un resultat. Et son sens etait le pire
possible — elle recompensait le fait d'avoir essaye davantage.

────────────────────────────────────────────────────────────────────────────
  CE QUI LA REMPLACE, ET POURQUOI IL FAUT DEUX NOMBRES
────────────────────────────────────────────────────────────────────────────

**Combien d'actifs la RETIENNENT** — le verdict des sept epreuves, pas le
nombre de lancements. C'est la reponse a « est-ce que ca marche ailleurs ».

**Combien de marches INDEPENDANTS ces actifs font** — et c'est le nombre que
personne n'a envie de regarder. Vingt-huit perps crypto ne sont pas vingt-huit
marches : ils montent et descendent ensemble. Une regle qui tient sur BTC, ETH
et SOL peut n'avoir tenu qu'une fois, sur « la crypto en 2025 », et l'avoir
tenu trois fois de suite ne le prouve pas davantage.

On mesure donc le nombre EFFECTIF de marches, par le rapport de
participation des valeurs propres de la matrice de correlation :

    M_eff = (Σ λ)² / Σ λ²

Et il se calcule sans decomposition spectrale, ce qui evite une dependance :
une matrice de correlation a des 1 sur la diagonale, donc `Σ λ = trace(C) =
M` ; et comme C est symetrique, `Σ λ² = trace(C²) = Σ_ij C_ij²`. D'ou

    M_eff = M² / Σ_ij C_ij²

Le comportement aux bornes est exactement celui qu'on veut : M actifs
parfaitement correles rendent 1, M actifs independants rendent M. Trois perps
a rho = 0,8 rendent 1,3 — ce qui est la lecture honnete de « tient sur trois
actifs » en crypto.

────────────────────────────────────────────────────────────────────────────
  CE QUE LE NOMBRE EFFECTIF NE DIT PAS
────────────────────────────────────────────────────────────────────────────

Il corrige l'INTERPRETATION, pas la porte. Benjamini-Hochberg reste valide
sous dependance positive, donc le dénominateur n'a pas besoin d'etre corrige
de la correlation : « k familles survivent » garde son sens. M_eff sert a ne
pas lire « k marches independants » la ou il y a k cellules correlees.

Et il se calcule sur les RENDEMENTS DES ACTIFS, pas sur ceux de la regle.
C'est delibere : deux cellules d'une meme regle peuvent avoir des rendements
peu correles simplement parce qu'elles sont rarement en position en meme
temps, ce qui ne les rend pas independantes pour autant — le marche sous-jacent
est le meme.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

# En dessous, une correlation n'est pas une mesure. Deux series qui ne se
# recouvrent que sur trente barres peuvent rendre n'importe quel rho, et le
# nombre effectif de marches qui en sortirait serait du bruit presente comme
# une precaution.
RECOUVREMENT_MIN = 60

# Le meme plancher d'interpretabilite que l'epreuve du nombre d'aller-retours.
# Il est importe plutot que recopie : deux valeurs divergeraient, et l'ecart se
# lirait comme une coupe incoherente plutot que comme un bug.
from .epreuves import TRADES_MIN as TRADES_INTERPRETABLES  # noqa: E402

DONNEES = Path(__file__).resolve().parents[2] / "data"


# ────────────────────────────────────────────────── les series et leur lien

def _pas_modal(horodatages: Sequence[int]) -> int | None:
    """L'ecart le plus frequent entre deux barres consecutives.

    Deduit plutot que passe en parametre : un `Bar` ne porte pas toujours son
    intervalle — le depot s'est deja fait avoir a lire `bars[0].interval` sur
    un objet qui n'a pas ce champ, et l'`AttributeError` avale par un `except`
    large avait rendu zero trade, ce qui se lisait comme un resultat.
    """
    ecarts: dict[int, int] = {}
    for avant, apres in zip(horodatages, horodatages[1:]):
        d = int(apres) - int(avant)
        if d > 0:
            ecarts[d] = ecarts.get(d, 0) + 1
    if not ecarts:
        return None
    return max(ecarts, key=lambda d: (ecarts[d], -d))


def rendements(barres: Sequence[Any]) -> dict[int, float]:
    """Les rendements logarithmiques d'UNE barre, indexes par horodatage.

    Indexes et non simplement listes : deux actifs n'ont pas les memes barres
    manquantes, et aligner par position au lieu du temps decalerait
    silencieusement les series l'une par rapport a l'autre — ce qui produit
    des correlations basses et donc un nombre de marches flatteur.

    **Un rendement qui enjambe un trou est ecarte.** Sans ca, une barre
    manquante produit un rendement de deux jours glisse dans une serie
    journaliere : il a une variance plus grande, il ne correspond a rien chez
    l'actif d'en face qui n'a pas le meme trou, et il fait baisser la
    correlation. La faute va donc, la aussi, dans le sens qui gonfle le nombre
    de marches — mesure sur une serie de trois cents barres avec un seul trou,
    la correlation de deux series identiques tombait a 0,9997 au lieu de 1.
    """
    barres = list(barres)
    pas = _pas_modal([int(getattr(b, "ts_ms", 0)) for b in barres])
    out: dict[int, float] = {}
    precedent: tuple[int, float] | None = None
    for b in barres:
        cours = float(getattr(b, "close", 0.0) or 0.0)
        ts = int(getattr(b, "ts_ms", 0))
        if cours <= 0:
            precedent = None
            continue
        if precedent is not None and (pas is None or ts - precedent[0] == pas):
            out[ts] = math.log(cours / precedent[1])
        precedent = (ts, cours)
    return out


def _pearson(x: Sequence[float], y: Sequence[float]) -> float | None:
    n = len(x)
    if n < 2:
        return None
    mx, my = sum(x) / n, sum(y) / n
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    sxx = sum((a - mx) ** 2 for a in x)
    syy = sum((b - my) ** 2 for b in y)
    if sxx <= 0 or syy <= 0:
        return None
    return sxy / math.sqrt(sxx * syy)


@dataclass(frozen=True)
class Lien:
    """La matrice de correlation d'un panier, et ce qu'elle a coute a mesurer."""

    actifs: tuple[str, ...]
    matrice: tuple[tuple[float, ...], ...]
    recouvrement: int
    motif: str = ""

    @property
    def mesurable(self) -> bool:
        return self.recouvrement >= RECOUVREMENT_MIN and len(self.actifs) > 0


def correlations(series: dict[str, dict[int, float]]) -> Lien:
    """La matrice, sur les horodatages COMMUNS a tous les actifs du panier.

    Prendre les horodatages communs plutot que les paires deux a deux est plus
    severe — le recouvrement tombe au plus court — mais c'est la seule facon
    d'obtenir une matrice coherente. Une matrice dont chaque case vient d'un
    echantillon different n'est pas une matrice de correlation, et son
    spectre ne veut rien dire.
    """
    actifs = tuple(sorted(series))
    if not actifs:
        return Lien((), (), 0, "aucun actif")

    communs = set(series[actifs[0]])
    for a in actifs[1:]:
        communs &= set(series[a])
    dates = sorted(communs)
    if len(dates) < RECOUVREMENT_MIN:
        return Lien(actifs, (), len(dates),
                    f"{len(dates)} barres communes, il en faut "
                    f"{RECOUVREMENT_MIN}")

    colonnes = {a: [series[a][t] for t in dates] for a in actifs}
    matrice = []
    for a in actifs:
        ligne = []
        for b in actifs:
            if a == b:
                ligne.append(1.0)
            else:
                r = _pearson(colonnes[a], colonnes[b])
                # Une paire dont l'un des deux ne bouge pas n'a pas de
                # correlation definie. La compter 0 la declarerait
                # independante, ce qui gonfle M_eff : on la compte 1, le sens
                # qui refuse.
                ligne.append(1.0 if r is None else r)
        matrice.append(tuple(ligne))
    return Lien(actifs, tuple(matrice), len(dates))


def marches_effectifs(lien: Lien) -> float | None:
    """M_eff = M² / Σ_ij C_ij². Rend None si la matrice n'est pas mesurable.

    None et non 1 : « je ne sais pas combien de marches » et « il n'y en a
    qu'un » sont deux affirmations differentes, et confondre les deux est la
    facon dont un controle devient inerte.
    """
    if not lien.mesurable or not lien.matrice:
        return None
    m = len(lien.actifs)
    somme_carres = sum(c * c for ligne in lien.matrice for c in ligne)
    if somme_carres <= 0:
        return None
    return (m * m) / somme_carres


def lien_des_actifs(actifs: Sequence[str], intervalle: str,
                    dossier: Path | None = None) -> Lien:
    """Charge les barres locales du panier et rend son lien.

    Les actifs sans donnee sur cette echelle sont ecartes AVEC leur motif :
    les ignorer silencieusement rendrait un M_eff calcule sur un panier plus
    petit que celui qu'on croit lire.
    """
    from .backtest.data import load_from_file

    base = dossier or DONNEES
    series: dict[str, dict[int, float]] = {}
    absents: list[str] = []
    for a in actifs:
        chemin = base / f"{a}_{intervalle}_real.json"
        if not chemin.exists():
            absents.append(a)
            continue
        try:
            series[a] = rendements(load_from_file(str(chemin), a, intervalle))
        except (OSError, ValueError):
            absents.append(a)
    lien = correlations(series)
    if absents:
        motif = f"sans données en {intervalle} : {', '.join(sorted(absents))}"
        lien = Lien(lien.actifs, lien.matrice, lien.recouvrement,
                    "; ".join(x for x in (lien.motif, motif) if x))
    return lien


# ─────────────────────────────────────────────────────── la tenue d'une regle

@dataclass(frozen=True)
class Tenue:
    """Ce qu'une recette fait a travers les marches — en trois nombres."""

    essayes: tuple[str, ...] = ()
    retenus: tuple[str, ...] = ()
    effectifs: float | None = None
    motif_effectifs: str = ""

    @property
    def phrase(self) -> str:
        """La phrase affichable. Elle ne dit JAMAIS « tient » sans retenue."""
        if not self.retenus:
            return (f"essayée sur {len(self.essayes)} actif(s), retenue sur "
                    f"aucun" if self.essayes else "aucun essai")
        base = (f"tient sur {len(self.retenus)} actif(s) sur "
                f"{len(self.essayes)} essayé(s)")
        if self.effectifs is None:
            return f"{base} — marchés indépendants non mesurés" + (
                f" ({self.motif_effectifs})" if self.motif_effectifs else "")
        return f"{base}, soit {self.effectifs:.1f} marché(s) indépendant(s)"


def tenue(essais: Sequence[dict[str, Any]], *, strategie: str,
          parametres: dict[str, Any], intervalle: str,
          verdicts: dict[str, str],
          dossier: Path | None = None) -> Tenue:
    """La tenue d'UNE recette a travers les actifs, a echelle fixee.

    `verdicts` associe une signature a l'etat rendu par l'epreuve. Il est
    passe plutot que recalcule pour que l'appelant ne paie pas un jugement par
    actif — mais surtout pour qu'il n'y ait qu'un seul jugement dans le
    processus : deux verdicts calcules a deux endroits divergeraient, et la
    divergence se lirait comme une carte incoherente plutot que comme un bug.
    """
    cellules = [e for e in essais
                if e.get("strategie") == strategie
                and e.get("intervalle") == intervalle
                and e.get("parametres") == parametres]
    essayes = tuple(sorted({str(e.get("actif")) for e in cellules
                            if e.get("actif")}))
    retenus = tuple(sorted({str(e.get("actif")) for e in cellules
                            if verdicts.get(str(e.get("signature"))) == "RETENUE"
                            and e.get("actif")}))
    if len(retenus) < 2:
        # Un seul actif retenu : il n'y a pas de panier dont mesurer le lien.
        # Rendre 1.0 serait defendable, mais rendre None dit la verite — on
        # n'a pas mesure, on n'avait rien a mesurer.
        return Tenue(essayes, retenus, None,
                     "moins de deux actifs retenus" if retenus else "")
    lien = lien_des_actifs(retenus, intervalle, dossier)
    return Tenue(essayes, retenus, marches_effectifs(lien), lien.motif)


# ────────────────────────────────────────────── la coupe : une regle, un panier

@dataclass(frozen=True)
class Coupe:
    """Une regle a travers un panier d'actifs : ce qui survit ENSEMBLE.

    C'est la forme de recherche que le regroupement en familles rend payante.
    Passer SEUL est le cas le plus dur qui existe : au rang 1 le seuil vaut
    `alpha / m`. Une regle correcte qui tient sur cinq actifs produit cinq p
    bas qui se portent l'un l'autre, et le cinquieme a droit a cinq fois le
    seuil du premier.
    """

    strategie: str
    intervalle: str
    familles: int = 0
    survivantes: tuple[str, ...] = ()
    # Les survivantes que l'EPREUVE retient. Mesure sur le balayage tsmom du
    # 17 septembre 2026 : quinze actifs survivaient ensemble a
    # Benjamini-Hochberg, et l'epreuve les refusait TOUS — onze pour moins de
    # trente aller-retours, deux au plancher de p. « Quinze survivent
    # ensemble » se lisait comme une trouvaille.
    #
    # La pathologie est propre a la recherche transversale et il faut la
    # nommer : des cellules a trois trades ont un nul degenere, donc des p
    # artificiellement bas, et BH les fait se sauver MUTUELLEMENT par le
    # relachement du seuil au rang. Le criblage lit un amas de bruit comme un
    # signal. La correction n'est pas de retirer ces cellules du
    # denominateur — elles ont bien ete testees — mais de ne jamais annoncer
    # les survivantes sans dire combien passent la porte.
    retenues: tuple[str, ...] = ()
    p_par_actif: dict[str, float] = field(default_factory=dict)
    # Les familles sous alpha dont la representante a trop peu d'aller-retours.
    # Elles comptent dans m — elles ONT ete testees — mais leur p n'est pas
    # interpretable, et les laisser gonfler « sous alpha » sans le dire ferait
    # lire comme une trouvaille ce qui est du bruit. Mesure sur le balayage
    # turtle du 17 septembre 2026 : quatre des cellules sous alpha tenaient a
    # 1, 2, 3 et 7 aller-retours.
    maigres: tuple[str, ...] = ()
    marches: float | None = None
    motif_marches: str = ""
    alpha: float = 0.05

    @property
    def attendu_au_hasard(self) -> float:
        """Combien de cellules sous alpha le pur hasard produirait.

        Le chiffre a lire A COTE du nombre de survivantes, et jamais apres :
        « six cellules sous 0,05 » sur cent quarante n'est pas une trouvaille,
        c'est moins que les sept attendues.
        """
        return self.alpha * self.familles

    @property
    def sous_alpha(self) -> int:
        return sum(1 for p in self.p_par_actif.values() if p <= self.alpha)

    @property
    def phrase(self) -> str:
        if not self.familles:
            return "aucune cellule mesurée"
        base = (f"{len(self.retenues)} actif(s) retenu(s) par l'épreuve sur "
                f"{len(self.survivantes)} qui survivent ensemble, sur "
                f"{self.familles} testé(s) ; {self.sous_alpha} sous alpha "
                f"quand le hasard en donnerait {self.attendu_au_hasard:.1f}")
        if self.maigres:
            base += (f" (dont {len(self.maigres)} sur moins de "
                     f"{TRADES_INTERPRETABLES} aller-retours : "
                     f"{', '.join(self.maigres)})")
        if self.marches is None:
            return base + " — marchés indépendants non mesurés"
        return base + f" ; {self.marches:.1f} marché(s) indépendant(s)"

    def en_dict(self) -> dict[str, Any]:
        return {
            "strategie": self.strategie, "intervalle": self.intervalle,
            "familles": self.familles,
            "survivantes": list(self.survivantes),
            "retenues": list(self.retenues),
            "sous_alpha": self.sous_alpha,
            "maigres": list(self.maigres),
            "attendu_au_hasard": round(self.attendu_au_hasard, 2),
            "marches": self.marches,
            "motif_marches": self.motif_marches,
            "phrase": self.phrase,
        }


def coupe(lignes: Sequence[dict[str, Any]], *, strategie: str,
          intervalle: str, alpha: float = 0.05,
          verdicts: dict[str, str] | None = None,
          dossier: Path | None = None) -> Coupe:
    """Ce qu'une regle fait a travers un panier, corrige et lisible.

    La correction porte sur les familles du panier — une par actif, puisque la
    cle de famille contient l'actif. Elle n'est PAS corrigee de la correlation
    entre actifs : Benjamini-Hochberg reste valide sous dependance positive,
    donc « k survivent » garde son sens. Le nombre de marches sert a ne pas
    lire « k marches independants » la ou il y a k cellules correlees.

    `verdicts` associe une signature a l'etat des sept epreuves. Sans lui, la
    coupe ne peut annoncer que des survivantes — et une survivante n'est pas
    une candidate : sur le balayage tsmom, les quinze l'etaient et aucune ne
    passait la porte.
    """
    from . import familles as fam
    from .sentinelle.validation import benjamini_hochberg

    cellules = [x for x in lignes
                if x.get("strategie") == strategie
                and x.get("intervalle") == intervalle
                and isinstance(x.get("p"), (int, float))]
    if not cellules:
        return Coupe(strategie, intervalle, alpha=alpha)

    tribus = fam.construire(cellules)
    garde = benjamini_hochberg([f.p for f in tribus], alpha)
    survivantes = tuple(sorted(
        str(f.representante.get("actif")) for f, k in zip(tribus, garde)
        if k and f.representante.get("actif")))
    p_par_actif = {str(f.representante.get("actif")): f.p for f in tribus
                   if f.representante.get("actif")}
    maigres = tuple(sorted(
        str(f.representante.get("actif")) for f in tribus
        if f.p <= alpha and f.representante.get("actif")
        and (f.representante.get("trades") or 0) < TRADES_INTERPRETABLES))

    retenues = tuple(a for a in survivantes if any(
        verdicts.get(str(f.representante.get("signature"))) == "RETENUE"
        for f in tribus if str(f.representante.get("actif")) == a
    )) if verdicts else ()

    # Le lien se mesure sur le panier qu'on ANNONCE. Le mesurer sur des actifs
    # que la porte refuse decrirait un panier qui n'existe pas.
    panier = retenues if verdicts else survivantes
    marches, motif = None, "moins de deux actifs dans le panier retenu"
    if len(panier) >= 2:
        lien = lien_des_actifs(panier, intervalle, dossier)
        marches, motif = marches_effectifs(lien), lien.motif
    return Coupe(strategie, intervalle, len(tribus), survivantes, retenues,
                 p_par_actif, maigres, marches, motif, alpha)
