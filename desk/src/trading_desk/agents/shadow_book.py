"""Le registre fantôme : mesurer ce que le desk décide, refus compris.

Idée peu coûteuse et très instructive. Chaque setup formulé est enregistré
puis suivi comme s'il avait été pris, jusqu'à sa cible, son stop, ou la fin de
son horizon. Au bout de quelques semaines, on sait si la couche décisionnelle
filtre du bruit ou détruit de l'alpha.

**Les mandats émis sont suivis aussi, et c'est ce qui rend la mesure
concluante.** Une espérance négative sur les rejets ne prouve rien seule : si
les mandats émis sont tout aussi mauvais, le desk ne trie pas, il refuse au
hasard. La question n'est pas « les rejets étaient-ils mauvais » mais
« émis et rejetés se distinguent-ils ». C'est le seul critère de qualité de
décision qui ne soit pas une opinion — et notamment, ce n'est pas la
conformité au schéma, qui ne dit rien de la pertinence d'un avis.

Sans cette mesure, la question « le Chef de desk sert-il à quelque chose »
n'a que des réponses d'opinion — et les opinions, sur un desk, coûtent cher.

Le registre suit aussi **où** les cycles s'arrêtent. C'est la statistique la
plus utile du mode fantôme : si 90 % des cycles meurent sur la porte
« conviction », le seuil est peut-être mal calé ; s'ils meurent tous sur
« pas de setup », c'est la stratégie qu'il faut regarder. Une porte qui ne
filtre jamais rien ne sert à rien, et une porte qui filtre tout masque les
autres.
"""

from __future__ import annotations

import random
from decimal import Decimal

from pydantic import Field

from ..contracts.common import Frozen, Side, now_ms
from .graph import GraphResult, Stage


class ShadowEntry(Frozen):
    """Un setup rejeté, suivi comme s'il avait été pris."""

    ts_ms: int
    stage: Stage
    reason: str
    asset: str
    side: Side
    entry_price: Decimal
    stop_price: Decimal
    target_price: Decimal | None = None
    conviction: Decimal = Decimal("0")
    issued: bool = False
    """Le desk a-t-il émis ce setup, ou l'a-t-il rejeté ?

    Les deux sont suivis à l'identique — même convention de résolution, même
    horizon. C'est la seule façon de comparer ce que le desk a pris à ce
    qu'il a laissé.
    """
    resolved: bool = False
    outcome: str = ""            # "cible", "stop", ou "" tant que non résolu
    pnl_r: Decimal | None = None  # résultat en multiples du risque

    @property
    def risk_per_unit(self) -> Decimal:
        return abs(self.entry_price - self.stop_price)


class StageStats(Frozen):
    """Combien de cycles se sont arrêtés à chaque porte."""

    counts: dict[str, int] = Field(default_factory=dict)
    total: int = 0

    def pct(self, stage: Stage) -> float:
        return 100.0 * self.counts.get(stage.value, 0) / self.total if self.total else 0.0

    @property
    def mandate_rate_pct(self) -> float:
        return self.pct(Stage.MANDAT)

    @property
    def dead_gates(self) -> tuple[str, ...]:
        """Portes qui n'ont jamais rien filtré.

        Une porte inerte n'est pas gratuite : elle donne l'illusion d'un
        filtrage qui n'existe pas. À supprimer ou à recalibrer.
        """
        return tuple(s.value for s in Stage
                     if s is not Stage.MANDAT and self.counts.get(s.value, 0) == 0)


class ShadowBook:
    """Registre en mémoire, persisté par le journal du desk."""

    def __init__(self, store=None) -> None:
        self.entries: list[ShadowEntry] = []
        self.stages: list[Stage] = []
        self.store = store

    def record(self, result: GraphResult) -> ShadowEntry | None:
        """Enregistre l'issue d'un cycle. Renvoie l'entrée si un setup a été
        rejeté après avoir été formulé — les cycles morts avant proposition
        n'ont rien à suivre."""
        self.stages.append(result.stage)

        if result.setup is None:
            return None

        setup = result.setup
        if setup.side is None or setup.entry_price is None or setup.stop_price is None:
            return None

        entry = ShadowEntry(
            ts_ms=now_ms(), stage=result.stage, reason=result.reason[:300],
            asset=setup.asset, side=setup.side,
            entry_price=setup.entry_price, stop_price=setup.stop_price,
            target_price=setup.target_price, conviction=setup.conviction,
            issued=result.stage is Stage.MANDAT,
        )
        self.entries.append(entry)
        if self.store is not None:
            self.store.journal("shadow_setup", entry.model_dump(mode="json"))
        return entry

    @property
    def rejetes(self) -> list[ShadowEntry]:
        return [e for e in self.entries if not e.issued]

    @property
    def emis(self) -> list[ShadowEntry]:
        return [e for e in self.entries if e.issued]

    def resolve(self, asset: str, high: Decimal, low: Decimal) -> int:
        """Résout les entrées non closes avec un nouvel extrême de prix.

        Convention identique à celle du backtest : **le stop l'emporte sur la
        cible** quand les deux sont atteignables. Un registre fantôme
        optimiste serait pire qu'inutile — il ferait regretter des rejets qui
        étaient bons.
        """
        resolved = 0
        for index, entry in enumerate(self.entries):
            if entry.resolved or entry.asset != asset:
                continue

            touche_stop = (
                low <= entry.stop_price if entry.side is Side.LONG
                else high >= entry.stop_price
            )
            touche_cible = entry.target_price is not None and (
                high >= entry.target_price if entry.side is Side.LONG
                else low <= entry.target_price
            )

            if touche_stop:
                self.entries[index] = entry.model_copy(update={
                    "resolved": True, "outcome": "stop", "pnl_r": Decimal("-1"),
                })
                resolved += 1
            elif touche_cible:
                risk = entry.risk_per_unit
                gain = abs((entry.target_price or entry.entry_price) - entry.entry_price)
                self.entries[index] = entry.model_copy(update={
                    "resolved": True, "outcome": "cible",
                    "pnl_r": (gain / risk) if risk > 0 else None,
                })
                resolved += 1
        return resolved

    def cloturer(self, asset: str, price: Decimal, *,
                 raison: str = "horizon") -> int:
        """Clôt au prix courant les entrées qui n'ont touché aucun niveau.

        Sans ça, la mesure ne compte que les setups qui BOUGENT VITE : un
        trade qui n'atteint ni sa cible ni son stop dans l'horizon reste
        « non résolu » et sort de l'espérance. Ce filtrage n'est pas neutre —
        il retient les setups à forte amplitude et jette les autres, ce qui
        gonfle la dispersion des deux populations qu'on veut comparer.

        Le résultat est compté en multiples du risque, comme une sortie au
        marché à la fin de l'horizon. C'est ce qu'un opérateur ferait d'un
        trade dont la thèse a expiré sans se réaliser.
        """
        clos = 0
        for index, entry in enumerate(self.entries):
            if entry.resolved or entry.asset != asset:
                continue
            risque = entry.risk_per_unit
            if risque <= 0:
                continue
            sens = 1 if entry.side is Side.LONG else -1
            self.entries[index] = entry.model_copy(update={
                "resolved": True, "outcome": raison,
                "pnl_r": sens * (price - entry.entry_price) / risque,
            })
            clos += 1
        return clos

    # ----------------------------------------------------------- statistiques

    def stage_stats(self) -> StageStats:
        counts: dict[str, int] = {}
        for stage in self.stages:
            counts[stage.value] = counts.get(stage.value, 0) + 1
        return StageStats(counts=counts, total=len(self.stages))

    @staticmethod
    def _resolus(entrees: list[ShadowEntry]) -> list[Decimal]:
        return [e.pnl_r for e in entrees if e.resolved and e.pnl_r is not None]

    @classmethod
    def _esperance(cls, entrees: list[ShadowEntry], *,
                   minimum: int) -> Decimal | None:
        resolus = cls._resolus(entrees)
        if len(resolus) < minimum:
            return None
        return sum(resolus, Decimal("0")) / len(resolus)

    @classmethod
    def intervalle(cls, entrees: list[ShadowEntry], *, minimum: int = 30,
                   tirages: int = 20_000, graine: int = 7,
                   ) -> tuple[Decimal, Decimal] | None:
        """Intervalle de confiance a 95 % de l'esperance, par bootstrap.

        Une esperance affichee nue invite a la lire comme un fait. Mesure du
        5 septembre 2026 : +0,35 R sur 47 setups rejetes se lit « le desk
        rejette des trades gagnants », alors que l'intervalle vaut
        [-0,05 ; +0,75] — il contient zero, et la meme mesure avec la perte
        reelle au stop (-1,27 R, mesuree au Monte-Carlo) tombe a +0,22 R avec
        un intervalle encore plus large.

        Le bootstrap plutot qu'un t de Student : la distribution des
        resultats en R est fortement bimodale — un stop vaut -1, une cible
        vaut +2 a +3 — et n'a rien de normal. Sur une quarantaine de points,
        l'approximation normale n'est pas acquise ; le reechantillonnage ne
        suppose rien.

        La graine est fixe pour que deux lectures du meme registre donnent le
        meme intervalle : un intervalle qui bouge d'un affichage a l'autre
        ferait douter du chiffre plutot que de la mesure.
        """
        resolus = cls._resolus(entrees)
        n = len(resolus)
        if n < minimum:
            return None
        alea = random.Random(graine)
        moyennes = sorted(
            sum(alea.choices(resolus, k=n), Decimal("0")) / n
            for _ in range(tirages)
        )
        return moyennes[int(0.025 * tirages)], moyennes[int(0.975 * tirages)]

    def issued_expectancy_r(self, *, minimum: int = 30) -> Decimal | None:
        """Espérance des mandats ÉMIS, en multiples du risque."""
        return self._esperance(self.emis, minimum=minimum)

    def discrimination_r(self, *, minimum: int = 30) -> Decimal | None:
        """Émis moins rejetés. **Le chiffre qui juge la couche décisionnelle.**

        Positif : le desk garde les meilleurs setups et écarte les pires — il
        trie. Nul : il refuse au hasard, et toute la dépense en délibération
        ne produit qu'un filtre aléatoire, qu'un tirage à pile ou face
        obtiendrait gratuitement. Négatif : il garde systématiquement les
        mauvais, ce qui est pire que ne rien filtrer.

        Une espérance négative sur les seuls rejets ne dit rien de tout ça :
        elle est compatible avec un desk qui refuse au hasard dans un univers
        de setups globalement perdants — et le P2 a montré que c'est
        exactement l'univers dans lequel on est.
        """
        emis = self.issued_expectancy_r(minimum=minimum)
        rejetes = self.rejected_expectancy_r(minimum=minimum)
        if emis is None or rejetes is None:
            return None
        return emis - rejetes

    def rejected_expectancy_r(self, *, minimum: int = 30) -> Decimal | None:
        """Espérance des setups rejetés, en multiples du risque.

        **Positive et significative, elle est un signal d'alarme** : le desk
        rejette des trades qui gagnaient. Négative, le filtrage fait son
        travail. Sur moins d'une trentaine de setups résolus, elle ne veut
        rien dire — d'où le `None`.
        """
        return self._esperance(self.rejetes, minimum=minimum)

    def format_report(self) -> str:
        stats = self.stage_stats()
        lignes = [
            "",
            f"  REGISTRE FANTÔME — {stats.total} cycles, "
            f"{len(self.emis)} émis / {len(self.rejetes)} rejetés",
            "  " + "-" * 62,
        ]
        for stage in Stage:
            n = stats.counts.get(stage.value, 0)
            if n or stage is Stage.MANDAT:
                lignes.append(f"  {stage.value:<16}{n:>6}   {stats.pct(stage):>6.1f} %")
        lignes.append("  " + "-" * 62)

        for libelle, population, valeur in (
            ("émis", self.emis, self.issued_expectancy_r()),
            ("rejets", self.rejetes, self.rejected_expectancy_r()),
        ):
            if valeur is None:
                resolus = sum(1 for e in population if e.resolved)
                lignes.append(f"  espérance des {libelle:<7}: échantillon "
                              f"insuffisant ({resolus} résolus, 30 requis)")
            else:
                ic = self.intervalle(population)
                borne = (f"   [IC 95 % : {float(ic[0]):+.2f} ; {float(ic[1]):+.2f}]"
                         if ic else "")
                zero = ic is not None and ic[0] <= 0 <= ic[1]
                note = "   — compatible avec zéro" if zero else ""
                lignes.append(f"  espérance des {libelle:<7}: "
                              f"{float(valeur):+.2f} R{borne}{note}")

        ecart = self.discrimination_r()
        if ecart is None:
            lignes.append("  DISCRIMINATION       : indéterminée — il faut les "
                          "deux populations")
        elif ecart > 0:
            lignes.append(f"  DISCRIMINATION       : {float(ecart):+.2f} R — "
                          "le desk trie")
        else:
            lignes.append(f"  DISCRIMINATION       : {float(ecart):+.2f} R — "
                          "le desk ne trie pas mieux qu'un tirage au sort")

        if stats.dead_gates:
            lignes.append(f"  portes inertes : {', '.join(stats.dead_gates)}")
        lignes.append("")
        return "\n".join(lignes)
