"""Le registre fantôme : mesurer ce que le desk refuse.

Idée peu coûteuse et très instructive. Chaque setup **rejeté** est enregistré
puis suivi comme s'il avait été pris, jusqu'à sa cible ou son stop. Au bout de
quelques semaines, on sait si la couche décisionnelle filtre du bruit ou
détruit de l'alpha.

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

from decimal import Decimal

from pydantic import Field

from ..contracts.common import Frozen, Side, now_ms
from ..contracts.signals import SetupProposal
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

        if result.stage is Stage.MANDAT or result.setup is None:
            return None

        setup = result.setup
        if setup.side is None or setup.entry_price is None or setup.stop_price is None:
            return None

        entry = ShadowEntry(
            ts_ms=now_ms(), stage=result.stage, reason=result.reason[:300],
            asset=setup.asset, side=setup.side,
            entry_price=setup.entry_price, stop_price=setup.stop_price,
            target_price=setup.target_price, conviction=setup.conviction,
        )
        self.entries.append(entry)
        if self.store is not None:
            self.store.journal("shadow_setup", entry.model_dump(mode="json"))
        return entry

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

    # ----------------------------------------------------------- statistiques

    def stage_stats(self) -> StageStats:
        counts: dict[str, int] = {}
        for stage in self.stages:
            counts[stage.value] = counts.get(stage.value, 0) + 1
        return StageStats(counts=counts, total=len(self.stages))

    def rejected_expectancy_r(self) -> Decimal | None:
        """Espérance des setups rejetés, en multiples du risque.

        **Positive et significative, elle est un signal d'alarme** : le desk
        rejette des trades qui gagnaient. Négative, le filtrage fait son
        travail. Sur moins d'une trentaine de setups résolus, elle ne veut
        rien dire — d'où le `None`.
        """
        resolus = [e for e in self.entries if e.resolved and e.pnl_r is not None]
        if len(resolus) < 30:
            return None
        return sum((e.pnl_r for e in resolus), Decimal("0")) / len(resolus)

    def format_report(self) -> str:
        stats = self.stage_stats()
        lignes = [
            "",
            f"  REGISTRE FANTÔME — {stats.total} cycles, {len(self.entries)} setups rejetés",
            "  " + "-" * 62,
        ]
        for stage in Stage:
            n = stats.counts.get(stage.value, 0)
            if n or stage is Stage.MANDAT:
                lignes.append(f"  {stage.value:<16}{n:>6}   {stats.pct(stage):>6.1f} %")
        lignes.append("  " + "-" * 62)

        esperance = self.rejected_expectancy_r()
        if esperance is None:
            resolus = sum(1 for e in self.entries if e.resolved)
            lignes.append(f"  espérance des rejets : échantillon insuffisant "
                          f"({resolus} résolus, 30 requis)")
        else:
            verdict = ("ALERTE — le desk rejette des trades gagnants"
                       if esperance > 0 else "le filtrage fait son travail")
            lignes.append(f"  espérance des rejets : {float(esperance):+.2f} R   — {verdict}")

        if stats.dead_gates:
            lignes.append(f"  portes inertes : {', '.join(stats.dead_gates)}")
        lignes.append("")
        return "\n".join(lignes)
