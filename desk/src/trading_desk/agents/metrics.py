"""Mesures de la porte P3.

Trois chiffres, et ce sont eux qui autorisent — ou non — le passage au P4 :

- **taux de sorties structurees valides** : au-dela de 98 %, l'agent est
  exploitable ; en dessous, le schema ou le prompt sont a revoir ;
- **cout par decision**, extrapole au mois. Six agents qui deliberent toutes
  les cinq minutes coutent vite plus cher que le capital de depart ;
- **latence p95**, qui dit a quelle cadence le desk peut reellement tourner.

Le taux d'abstention est suivi a part : il n'est pas un echec. Un agent qui
s'abstient souvent sur des donnees pauvres se comporte correctement — c'est
un agent qui ne s'abstient JAMAIS qui doit inquieter.
"""

from __future__ import annotations

from decimal import Decimal
from typing import ClassVar

from ..contracts.common import Frozen
from .runner import AgentRun


class AgentMetrics(Frozen):
    """Deux notions a ne jamais confondre.

    - `valid` : le modele a renvoye une sortie conforme au schema. Une
      abstention QU'IL A CHOISIE en fait partie : il a repondu.
    - `failures` : apres toutes les tentatives, aucune sortie exploitable.
      L'abstention est alors fabriquee par le runner, pas par l'agent.

    Les melanger ferait afficher 100 % de sorties valides a un agent qui
    n'aurait jamais rien produit — exactement ce que la porte doit attraper.
    """

    agent: str
    runs: int
    valid: int
    abstentions: int
    failures: int = 0
    unpriced: int = 0
    total_cost_usd: Decimal = Decimal("0")
    latencies_ms: tuple[int, ...] = ()

    @property
    def cost_is_reliable(self) -> bool:
        """Faux des qu'un appel a tourne sur un modele hors grille tarifaire."""
        return self.unpriced == 0

    @property
    def valid_rate_pct(self) -> float:
        return 100.0 * self.valid / self.runs if self.runs else 0.0

    @property
    def abstention_rate_pct(self) -> float:
        return 100.0 * self.abstentions / self.runs if self.runs else 0.0

    @property
    def cost_per_decision_usd(self) -> Decimal:
        return self.total_cost_usd / self.runs if self.runs else Decimal("0")

    @property
    def latency_p95_ms(self) -> int:
        if not self.latencies_ms:
            return 0
        ordered = sorted(self.latencies_ms)
        # Index p95 borne : sur un petit echantillon, il retombe sur le max,
        # ce qui est le comportement voulu — on ne lisse pas une queue courte.
        index = min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1))))
        return ordered[index]

    def monthly_cost_usd(self, decisions_per_hour: float) -> Decimal:
        """Extrapolation. Le chiffre qui fait reflechir a la cadence."""
        per_month = Decimal(str(decisions_per_hour * 24 * 30))
        return self.cost_per_decision_usd * per_month

    # La porte pose DEUX conditions, et les confondre a induit en erreur :
    # « NON FRANCHIE — avocat_du_diable » se lit comme « cet agent n'est pas
    # fiable », alors que le fait mesure etait « on ne l'a appele que 15 fois ».
    # L'un bloque le P4, l'autre demande seulement de tourner plus longtemps.

    MIN_SAMPLE: ClassVar[int] = 30

    @property
    def sample_is_sufficient(self) -> bool:
        """A-t-on assez d'appels pour que le taux veuille dire quelque chose ?

        Un agent en aval d'une condition — l'Avocat du diable n'est appele que
        s'il existe un setup a attaquer — recoit MOINS d'appels qu'il n'y a de
        cycles. Trente cycles ne font donc pas trente appels pour lui.
        """
        return self.runs >= self.MIN_SAMPLE

    @property
    def quality_passes(self) -> bool:
        """Le critere de fond : le modele respecte-t-il son schema ?"""
        return self.valid_rate_pct > 98.0

    @property
    def passes_p3_gate(self) -> bool:
        """Porte P3 : > 98 % de sorties valides, sur un echantillon credible.

        Le seuil d'echantillon compte autant que le taux : 100 % sur trois
        appels ne prouve rien.
        """
        return self.sample_is_sufficient and self.quality_passes


def summarize(runs: list[AgentRun]) -> AgentMetrics:
    if not runs:
        return AgentMetrics(agent="?", runs=0, valid=0, abstentions=0,
                            total_cost_usd=Decimal("0"), latencies_ms=())
    return AgentMetrics(
        agent=runs[0].agent,
        runs=len(runs),
        # `succeeded` = le modele a renvoye une sortie conforme au schema.
        # Une abstention qu'il a choisie compte donc comme valide ; une
        # abstention fabriquee par le runner apres deux echecs, non.
        valid=sum(1 for r in runs if r.succeeded),
        abstentions=sum(1 for r in runs if r.succeeded and r.abstained),
        failures=sum(1 for r in runs if not r.succeeded),
        unpriced=sum(1 for r in runs if not r.pricing_known),
        total_cost_usd=sum((r.cost_usd for r in runs), Decimal("0")),
        latencies_ms=tuple(r.latency_ms for r in runs),
    )


def _verdict(m: AgentMetrics) -> str:
    """Le verdict, en nommant ce qui manque.

    « NON FRANCHIE » sans motif envoie chercher un probleme de prompt la ou il
    n'y a qu'un echantillon trop court.
    """
    if m.passes_p3_gate:
        return "FRANCHIE"
    if not m.quality_passes:
        return f"NON FRANCHIE — qualite ({m.valid_rate_pct:.1f} % de sorties valides)"
    return (f"INDETERMINEE — {m.runs} appels sur {m.MIN_SAMPLE} requis "
            f"(qualite : {m.valid_rate_pct:.1f} %)")


def format_report(metrics: AgentMetrics, *, decisions_per_hour: float = 12.0) -> str:
    lines = [
        "",
        f"  AGENT {metrics.agent.upper()} — {metrics.runs} executions",
        "  " + "-" * 58,
        f"  sorties valides      {metrics.valid_rate_pct:>8.1f} %   (porte P3 : > 98 %)",
        f"  abstentions          {metrics.abstention_rate_pct:>8.1f} %   (informatif, pas un echec)",
        f"  echecs               {metrics.failures:>8}     (aucune sortie exploitable)",
        f"  cout par decision    {float(metrics.cost_per_decision_usd):>8.4f} $"
        + ("" if metrics.cost_is_reliable else "   [modele hors grille : cout NON fiable]"),
        f"  cout mensuel estime  {float(metrics.monthly_cost_usd(decisions_per_hour)):>8.2f} $"
        f"   (a {decisions_per_hour:.0f}/h)",
        f"  latence p95          {metrics.latency_p95_ms:>8} ms",
        "  " + "-" * 58,
        f"  porte P3 : {_verdict(metrics)}",
        "",
    ]
    return "\n".join(lines)
