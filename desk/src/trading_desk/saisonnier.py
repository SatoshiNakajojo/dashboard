"""La MESURE des saisons. La declaration vit dans `saisons.py`, ecrite avant.

Ce fichier applique le decoupage fige ; il n'en choisit aucun morceau. Si un
seuil devait bouger, c'est `saisons.VERSION` qu'il faudrait incrementer, ce
qui repart d'un denominateur neuf — pas une constante qu'on retoucherait ici.

────────────────────────────────────────────────────────────────────────────
  LE HALVING, MESURE : UN ARTEFACT A CONNAITRE AVANT DE LIRE
────────────────────────────────────────────────────────────────────────────

Premiere mesure, 17 septembre 2026, BTC 1 j, 1 988 barres etiquetees :

    bear   319 j   2022-03-01   jour  659 du cycle 3
    bear   266 j   2025-11-27   jour  587 du cycle 4
    bull   155 j   2023-03-16   jour 1039 du cycle 3
    bull   262 j   2023-10-17   jour 1254 du cycle 3
    bull   127 j   2024-11-03   jour  198 du cycle 4
    bull   178 j   2025-04-23   jour  369 du cycle 4

Les deux grands bear commencent au jour 587 et au jour 659 : deux
observations a 72 jours l'une de l'autre. C'est la seule regularite liee au
halving que cette donnee puisse montrer, et **n = 2 n'est pas une
distribution**. On ne peut ni en tirer une fourchette ni la donner a un
moteur de decision.

Les bull, eux, tombent aux jours 198, 369, 1039 et 1254 — 841 jours d'ecart
entre les deux premiers de chaque cycle. **Et c'est en partie un artefact de
couverture**, qu'il faut connaitre avant de conclure : le decoupage a besoin
de 220 barres de chauffe, si bien que la premiere etiquette du cycle 3 tombe
au jour 321. Le bull de 2020-2021 — celui qui aurait commence tot dans le
cycle — n'est pas dans la serie parce que les donnees de cette machine
commencent au jour 100 et que la chauffe mange les 221 suivants.

Autrement dit : l'absence de bull precoce au cycle 3 ne dit rien du marche,
elle dit que la serie ne commence pas assez tot. La confondre avec un
resultat serait exactement la faute que ce depot traque.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Sequence

from . import saisons as S

DONNEES = Path(__file__).resolve().parents[2] / "data"


@dataclass(frozen=True)
class Plage:
    """Une plage de saison : son nom, ses bornes, sa place dans le cycle."""

    saison: str
    debut_ms: int
    fin_ms: int
    barres: int
    jour_du_cycle: int | None
    cycle: int | None

    @property
    def debut(self) -> str:
        return datetime.fromtimestamp(self.debut_ms / 1000, timezone.utc).strftime("%Y-%m-%d")

    @property
    def fin(self) -> str:
        return datetime.fromtimestamp(self.fin_ms / 1000, timezone.utc).strftime("%Y-%m-%d")


@dataclass
class Serie:
    """La serie d'etiquettes, et tout ce qu'il faut pour la lire honnetement."""

    horodatages: list[int] = field(default_factory=list)
    etiquettes: list[str | None] = field(default_factory=list)
    plages: list[Plage] = field(default_factory=list)

    @property
    def etiquetees(self) -> int:
        return sum(1 for e in self.etiquettes if e)

    @property
    def etiquettes_compactes(self) -> list[str]:
        """Les etiquettes non nulles, dans l'ordre. C'est sur CELLES-LA que
        porte le decalage : inclure les barres de chauffe ferait tourner du
        vide dans le nul."""
        return [e for e in self.etiquettes if e]

    @property
    def index_etiquetees(self) -> dict[int, int]:
        """Horodatage -> rang dans `etiquettes_compactes`."""
        return {t: k for k, (t, e) in enumerate(
            (t, e) for t, e in zip(self.horodatages, self.etiquettes) if e)}

    @property
    def bornes_etiquetees(self) -> list[int]:
        """Les horodatages etiquetes, tries. Pour chercher par bisection.

        Une saison est EN VIGUEUR sur un intervalle, elle n'existe pas a un
        instant. Chercher l'egalite exacte marchait tant que la strategie
        tournait sur la meme echelle que les saisons ; en 4 h aucun
        horodatage ne tombe sur une borne journaliere, et la grille aurait
        rendu zero trade attribue — un resultat vide qui se lit comme un
        resultat.
        """
        return [t for t, e in zip(self.horodatages, self.etiquettes) if e]

    def rang_en_vigueur(self, ts_ms: int) -> int | None:
        """Le rang de la derniere etiquette a ou avant `ts_ms`.

        « A ou avant » et jamais apres : l'etiquette du jour J est calculee
        sur les clotures jusqu'a J-1, donc une barre de 4 h du jour J lit une
        saison qui ne connait rien de J. La causalite tient.
        """
        import bisect

        bornes = self.bornes_etiquetees
        k = bisect.bisect_right(bornes, int(ts_ms)) - 1
        return k if k >= 0 else None

    @property
    def repartition(self) -> dict[str, int]:
        out = {s: 0 for s in S.SAISONS}
        for e in self.etiquettes:
            if e:
                out[e] += 1
        return out

    @property
    def plus_longue_plage(self) -> int:
        return max((p.barres for p in self.plages), default=0)

    @property
    def plage_decalages(self) -> int:
        """Les decalages qui ne laissent pas l'etiquette recouvrir l'originale.

        Un decalage plus court que la plus longue plage de saison replace une
        partie des etiquettes en face d'elles-memes : le nul cesse d'etre un
        nul. C'est ce nombre-la, pas `TIRAGES`, qui fixe le plancher de p.
        """
        reste = self.etiquetees - int(self.plus_longue_plage * S.DECALAGE_MIN_EN_PLAGES)
        return max(0, reste)

    @property
    def criblage_possible(self) -> bool:
        return (self.plage_decalages > 0
                and S.criblage_possible(self.plage_decalages))

    @property
    def saisons_assez_peuplees(self) -> dict[str, bool]:
        return {s: n >= S.BARRES_MIN_PAR_SAISON
                for s, n in self.repartition.items()}

    def en_dict(self) -> dict[str, Any]:
        return {
            "version": S.VERSION, "empreinte": S.empreinte(),
            "barres": len(self.etiquettes), "etiquetees": self.etiquetees,
            "repartition": self.repartition,
            "plages": len(self.plages),
            "plus_longue_plage": self.plus_longue_plage,
            "plage_decalages": self.plage_decalages,
            "plage_requise": S.plage_requise(),
            "criblage_possible": self.criblage_possible,
            "plancher_de_p": (S.plancher_de_p(self.plage_decalages)
                              if self.plage_decalages else None),
            "saisons_assez_peuplees": self.saisons_assez_peuplees,
        }


def _moyenne(cours: Sequence[float], fin: int, n: int) -> float:
    return sum(cours[fin - n + 1:fin + 1]) / n


def etiqueter(barres: Sequence[Any]) -> Serie:
    """Applique le decoupage fige, avec son RETARD.

    La saison de la barre `t` est calculee sur les clotures jusqu'a `t - 1`.
    Sans ce retard, la saison est lue sur la barre qu'elle est censee
    expliquer, et « la meilleure strategie par saison » gagnerait simplement
    parce qu'elle connait la cloture.
    """
    ts = [int(b.ts_ms) for b in barres]
    cours = [float(b.close) for b in barres]
    besoin = S.MOYENNE_BARRES + S.PENTE_BARRES

    # L'etat CONFIRME, et le candidat qui essaie de le remplacer. Tout est
    # causal : a la barre i on ne lit que les clotures jusqu'a i - RETARD, et
    # la bascule n'a lieu qu'apres CONFIRMATION_BARRES barres consecutives.
    # Une longueur minimale de plage ne se connaitrait qu'une fois la plage
    # finie ; l'appliquer reviendrait a lire l'avenir.
    etiquettes: list[str | None] = []
    confirmee: str | None = None
    candidate: str | None = None
    compte = 0

    for i in range(len(cours)):
        j = i - S.RETARD_BARRES
        if j < besoin:
            etiquettes.append(None)
            continue
        ma = _moyenne(cours, j, S.MOYENNE_BARRES)
        ma_avant = _moyenne(cours, j - S.PENTE_BARRES, S.MOYENNE_BARRES)
        pente = (ma - ma_avant) / ma_avant * 100.0 if ma_avant else 0.0
        c = cours[j]
        if c > ma and pente > S.PENTE_MIN_PCT:
            brute = S.BULL
        elif c < ma and pente < -S.PENTE_MIN_PCT:
            brute = S.BEAR
        else:
            brute = S.RANGE

        if brute == confirmee:
            candidate, compte = None, 0
        else:
            if brute == candidate:
                compte += 1
            else:
                candidate, compte = brute, 1
            if compte >= S.CONFIRMATION_BARRES:
                confirmee, candidate, compte = brute, None, 0
        # None tant que rien n'est confirme : ne rien savoir n'est pas etre
        # en range, et le confondre ferait entrer les barres de demarrage dans
        # une saison qu'elles n'ont pas.
        etiquettes.append(confirmee)

    serie = Serie(horodatages=ts, etiquettes=etiquettes)
    serie.plages = _plages(ts, etiquettes)
    return serie


def _plages(ts: Sequence[int], etiquettes: Sequence[str | None]) -> list[Plage]:
    paires = [(t, e) for t, e in zip(ts, etiquettes) if e]
    if not paires:
        return []
    out: list[Plage] = []
    debut, courante = 0, paires[0][1]
    for i, (_, e) in enumerate(paires[1:], 1):
        if e != courante:
            out.append(_plage(paires, debut, i - 1, courante))
            debut, courante = i, e
    out.append(_plage(paires, debut, len(paires) - 1, courante))
    return out


def _plage(paires, i0: int, i1: int, saison: str) -> Plage:
    d0 = datetime.fromtimestamp(paires[i0][0] / 1000, timezone.utc).date()
    return Plage(saison=saison, debut_ms=paires[i0][0], fin_ms=paires[i1][0],
                 barres=i1 - i0 + 1, jour_du_cycle=S.jour_du_cycle(d0),
                 cycle=S.cycle_de(d0))


def serie_de_reference(dossier: Path | None = None) -> Serie:
    """La saison du marche, sur l'actif et l'echelle declares."""
    from .backtest.data import load_from_file

    base = dossier or DONNEES
    chemin = base / f"{S.REFERENCE}_{S.ECHELLE_REFERENCE}_real.json"
    barres = load_from_file(str(chemin), S.REFERENCE, S.ECHELLE_REFERENCE)
    return etiqueter(barres)


def bascules(serie: Serie, *, barres_min: int = 60) -> list[Plage]:
    """Les plages assez longues pour etre une saison plutot qu'un aller-retour.

    `barres_min` n'est PAS un seuil du decoupage — il ne change aucune
    etiquette. Il sert uniquement a LIRE la serie : sur 63 plages mesurees,
    beaucoup durent un a trois jours, et les enumerer toutes cache les cinq ou
    six episodes dont on parle quand on dit « saison ». Le filtrer ici plutot
    que dans `etiqueter` garde la mesure intacte.
    """
    return [p for p in serie.plages if p.barres >= barres_min]


# ────────────────────────────────── la grille strategie x saison

@dataclass(frozen=True)
class Cellule:
    """Une strategie dans une saison : ce qu'elle y fait, et si c'est du bruit."""

    strategie: str
    saison: str
    trades: int
    net_usd: float
    net_par_trade: float
    p: float | None = None
    nul_moyen: float | None = None

    @property
    def interpretable(self) -> bool:
        return self.trades >= TRADES_MIN_PAR_CELLULE

    def en_dict(self) -> dict[str, Any]:
        return {
            "strategie": self.strategie, "saison": self.saison,
            "trades": self.trades, "net_usd": round(self.net_usd, 2),
            "net_par_trade": round(self.net_par_trade, 4),
            "p": self.p, "nul_moyen": self.nul_moyen,
            "interpretable": self.interpretable,
        }


# En dessous, une moyenne par trade n'est pas une moyenne. Repris du plancher
# d'interpretabilite de l'epreuve plutot que redefini : deux seuils
# divergeraient, et l'ecart se lirait comme une grille incoherente.
from .epreuves import TRADES_MIN as TRADES_MIN_PAR_CELLULE  # noqa: E402


def saison_a(serie: Serie, ts_ms: int, decalage: int = 0) -> str | None:
    """La saison en vigueur a cet horodatage, eventuellement decalee.

    Le decalage est CIRCULAIRE et COMMUN a toute la serie : les saisons
    gardent leurs longueurs et leur ordre, elles ne tombent plus en face des
    memes barres. Un tirage saison par saison casserait la structure de
    plages, et validerait n'importe quoi — meme faute que le nul par date.

    Commode pour une question isolee ; `grille` ne passe PAS par ici — elle
    hisse l'index et les etiquettes hors de ses boucles, sinon deux mille
    tirages fois quelques centaines de trades reconstruiraient le dictionnaire
    un demi-million de fois.
    """
    rang = serie.rang_en_vigueur(ts_ms)
    if rang is None:
        return None
    etiq = serie.etiquettes_compactes
    return etiq[(rang + decalage) % len(etiq)]


def grille(strategies: Sequence[str] | None = None, *,
           serie: Serie | None = None,
           actif: str | None = None, intervalle: str | None = None,
           equite: float = 1000.0,
           tirages: int | None = None,
           dossier: Path | None = None) -> list[Cellule]:
    """Chaque strategie, dans chaque saison, contre le nul par decalage.

    **Un seul backtest par strategie.** Les trades sont ensuite attribues a la
    saison de leur ENTREE. Le nul rejoue la meme attribution sur des
    etiquettes decalees : la question n'est donc pas « la strategie
    gagne-t-elle », mais « la saison predit-elle OU elle gagne ». Le total
    d'une strategie est fixe, le nul ne fait que le redistribuer.

    C'est ce qui permet a une strategie perdante d'avoir malgre tout une
    saison ou elle gagne — exactement l'hypothese qu'on teste.
    """
    import bisect
    import random

    from .atelier import BASELINES, defauts
    from .backtest.data import load_from_file
    from .backtest.engine import run_backtest
    from .risk.limits import RiskLimits

    a = actif or S.REFERENCE
    i = intervalle or S.ECHELLE_REFERENCE
    d = tirages or S.TIRAGES
    base = dossier or DONNEES
    serie = serie or serie_de_reference(base)
    if not serie.plage_decalages:
        raise ValueError("plage de decalages vide : le nul serait inerte")

    barres = load_from_file(str(base / f"{a}_{i}_real.json"), a, i)
    noms = list(strategies) if strategies else sorted(BASELINES)

    # Les decalages tires une seule fois, partages par toutes les strategies :
    # le nul doit etre le MEME d'une cellule a l'autre, sinon les p ne se
    # comparent plus et Benjamini-Hochberg porte sur des choses differentes.
    rng = random.Random(20260917)
    mini = serie.plus_longue_plage
    maxi = serie.etiquetees - 1
    decalages = [rng.randint(mini, maxi) for _ in range(d)]

    # Hisses une seule fois : ce sont eux qui rendent la grille calculable.
    etiq = serie.etiquettes_compactes
    bornes = serie.bornes_etiquetees

    out: list[Cellule] = []
    for nom in noms:
        res = run_backtest(barres, BASELINES[nom](**defauts(nom, i)),
                           limits=RiskLimits(), interval=i,
                           initial_equity_usd=Decimal(str(equite)))
        # Les rangs plutot que les horodatages : l'attribution se reduit alors
        # a une addition modulo, faite deux mille fois par strategie. La
        # bisection place chaque trade sous la saison EN VIGUEUR, ce qui
        # permet de trader en 4 h sous des saisons journalieres.
        rangs = []
        for t in res.trades:
            k = bisect.bisect_right(bornes, int(t.entry_ts_ms)) - 1
            if k >= 0:
                rangs.append((k, float(t.net_pnl_usd)))
        observe = _par_saison(etiq, rangs, 0)
        nuls = [_par_saison(etiq, rangs, k) for k in decalages]

        for s in S.SAISONS:
            n, net = observe[s]
            moyenne = net / n if n else 0.0
            echantillon = [(x[s][1] / x[s][0] if x[s][0] else 0.0) for x in nuls]
            p = ((sum(1 for v in echantillon if v >= moyenne) + 1) / (d + 1)
                 if n else None)
            out.append(Cellule(
                strategie=nom, saison=s, trades=n, net_usd=net,
                net_par_trade=moyenne, p=p,
                nul_moyen=round(sum(echantillon) / len(echantillon), 4)))
    return out


def _par_saison(etiquettes: Sequence[str], rangs: Sequence[tuple[int, float]],
                decalage: int) -> dict[str, tuple[int, float]]:
    n = len(etiquettes)
    out = {s: [0, 0.0] for s in S.SAISONS}
    for rang, net in rangs:
        s = etiquettes[(rang + decalage) % n]
        out[s][0] += 1
        out[s][1] += net
    return {s: (v[0], v[1]) for s, v in out.items()}
