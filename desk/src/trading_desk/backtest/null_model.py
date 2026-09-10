"""Le hasard aurait-il fait aussi bien ?

Le t de Student dit si un PnL est distinguable de zero. Il ne dit pas d'ou il
vient — et zero est rarement la bonne reference. Deux forces deplacent le
resultat qu'on obtiendrait sans aucun signal : la derive du marche, qui pousse
vers le haut toute strategie a biais long quand le prix monte, et les couts,
qui poussent vers le bas a proportion du nombre de trades. Selon laquelle
l'emporte, une strategie sans information gagne ou perd systematiquement.

C'est ce niveau-la qu'il faut battre, et il se mesure.

Ce module construit le contrefactuel qui repond a la question : on garde tout
de la strategie **sauf le moment ou elle entre**.

- meme nombre de trades,
- meme melange long/short,
- memes distances de stop et de cible, tirees de ses propres signaux,
- **memes durees de detention**, tirees de ses propres trades,
- meme moteur, memes couts, meme dimensionnement par le risque,
- entrees a des dates **tirees au hasard**.

La duree de detention a longtemps manque a cette liste, et c'etait un defaut
grave. Les quatre strategies sortent sur signal (`exit_now`) ; le bras
aleatoire, lui, ne pouvait sortir qu'au stop ou a la cible. Mesure sur la
grille : ses positions tenaient **1,4 a 6,7 fois plus longtemps**. La
comparaison ne portait donc pas sur le moment d'entree mais sur deux regles
de sortie differentes — et une strategie qui coupe vite paraissait brillante
face a un hasard qui encaissait toutes les reprises.

Si la vraie strategie ne se distingue pas de ce nuage, son signal n'apporte
rien : n'importe quelle strategie de meme profil, entrant au hasard, aurait
fait pareil. C'est un test plus severe que le t, et plus utile — il ne mesure
pas seulement « different de zero » mais « different du hasard, dans CE
marche ».

Il ne prouve pas l'inverse pour autant. Un percentile eleve dit que le signal
a fonctionne sur cet echantillon, pas qu'il fonctionnera. La sur-optimisation
produit exactement cette signature.
"""

from __future__ import annotations

import random
from decimal import Decimal

from ..contracts.common import Frozen, Side
from ..features.bars import Bar
from ..risk.limits import RiskLimits
from .costs import CostModel
from .engine import BacktestResult, run_backtest
from .strategies import FLAT, Signal, Strategy


class EntryShape(Frozen):
    """La forme d'une entree, sans sa date.

    Les distances sont relatives au prix d'entree : c'est ce qui permet de
    les replacer ailleurs dans la serie sans les rendre absurdes. Un stop a
    1 200 $ sous l'entree n'a pas le meme sens a 60 000 qu'a 80 000 ; un stop
    a 2 % en dessous, si.
    """

    side: Side
    stop_frac: Decimal          # distance au stop, en fraction du prix d'entree
    target_frac: Decimal | None  # idem pour la cible, None si la strategie n'en a pas


def entry_shapes(bars: list[Bar], strategy: Strategy,
                 *, warmup: int = 50) -> list[EntryShape]:
    """Recense les entrees que la strategie propose, sous forme relative.

    On l'interroge comme si elle etait toujours a plat : on veut son
    vocabulaire d'entrees complet, pas seulement celles qu'elle a pu jouer.
    Le NOMBRE de trades, lui, vient du vrai backtest — c'est la seule facon
    de ne pas donner au hasard plus d'occasions qu'a la strategie.
    """
    strategy.prepare(bars)
    shapes: list[EntryShape] = []
    for i in range(warmup, len(bars) - 1):
        sig = strategy.on_bar(i, bars, None)
        if sig.side is None or sig.stop_price is None:
            continue
        ref = bars[i].close
        if ref <= 0:
            continue
        shapes.append(EntryShape(
            side=sig.side,
            stop_frac=abs(sig.stop_price - ref) / ref,
            target_frac=(abs(sig.target_price - ref) / ref
                         if sig.target_price is not None else None),
        ))
    return shapes


class RandomEntry:
    """Le meme profil de risque, a des dates tirees au hasard.

    Ce n'est pas « une strategie aleatoire » au sens naif — elle porte les
    memes stops, les memes cibles et le meme biais directionnel que celle
    qu'on teste. La seule chose qu'elle ignore, c'est QUAND entrer. Toute la
    valeur d'un signal d'entree est exactement la difference entre les deux.
    """

    name = "hasard"

    def __init__(self, shapes: list[EntryShape], *, n_trades: int,
                 seed: int, warmup: int = 50,
                 holding_bars: list[int] | None = None) -> None:
        if not shapes:
            raise ValueError("aucune forme d'entree : rien a randomiser")
        self.shapes = shapes
        self.n_trades = n_trades
        self.rng = random.Random(seed)
        self.warmup = warmup
        # Les durees observees de la strategie. Sans elles, le bras aleatoire
        # ne sort qu'au stop et tient bien plus longtemps : on comparerait
        # deux regles de sortie au lieu de deux facons d'entrer.
        self.holding_bars = [d for d in (holding_bars or []) if d > 0]
        self._plan: dict[int, EntryShape] = {}
        self._emises = 0
        self._entree: int | None = None
        self._duree: int = 0

    def prepare(self, bars: list[Bar]) -> None:
        self._plan = {}
        self._emises = 0
        self._entree = None
        self._duree = 0
        candidates = range(self.warmup, len(bars) - 2)
        if not candidates:
            return
        # On tire plus de dates que de trades voulus : certaines tomberont
        # pendant qu'une position est deja ouverte et seront ignorees par le
        # moteur. Le compteur d'emissions borne le total a la fin.
        tirage = self.rng.sample(
            list(candidates), k=min(len(candidates), self.n_trades * 3))
        for i in tirage:
            self._plan[i] = self.rng.choice(self.shapes)

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        if in_position is not None:
            # Sortie par duree, le pendant du `exit_now` de la strategie. Le
            # stop et la cible restent prioritaires : le moteur les evalue
            # avant d'appeler la strategie, exactement comme pour la vraie.
            if (self.holding_bars and self._entree is not None
                    and i - self._entree >= self._duree):
                self._entree = None
                return Signal(exit_now=True, note="duree tiree au hasard")
            return FLAT

        if self._emises >= self.n_trades:
            return FLAT
        shape = self._plan.get(i)
        if shape is None:
            return FLAT

        ref = bars[i].close
        sens = Decimal("1") if shape.side is Side.LONG else Decimal("-1")
        stop = ref - sens * ref * shape.stop_frac
        target = (ref + sens * ref * shape.target_frac
                  if shape.target_frac is not None else None)
        if stop <= 0 or (target is not None and target <= 0):
            return FLAT

        self._emises += 1
        self._entree = i
        self._duree = (self.rng.choice(self.holding_bars)
                       if self.holding_bars else 10**9)
        return Signal(side=shape.side, stop_price=stop, target_price=target,
                      note="entree tiree au hasard")


class NullResult(Frozen):
    """Ou tombe la vraie strategie dans le nuage du hasard."""

    strategy: str
    observed_pnl_usd: Decimal
    draws: int
    percentile: float           # % de tirages que la strategie bat
    null_mean_usd: float
    null_p5_usd: float
    null_p95_usd: float
    p_value: float              # P(hasard >= observe), unilateral
    mean_trades_random: float
    observed_trades: int

    @property
    def verdict(self) -> str:
        """Trois etats, comme pour la significativite — jamais un booleen.

        `NON DISTINGUABLE` est la reponse honnete la plus frequente, et elle
        ne dit pas que la strategie est mauvaise : elle dit que ce marche ne
        permet pas de separer son signal du hasard.
        """
        if self.p_value <= 0.05:
            return "BAT LE HASARD"
        if self.p_value >= 0.95:
            return "PIRE QUE LE HASARD"
        return "NON DISTINGUABLE"


def randomization_test(
    bars: list[Bar],
    strategy: Strategy,
    observed: BacktestResult,
    *,
    draws: int = 200,
    costs: CostModel | None = None,
    limits: RiskLimits | None = None,
    initial_equity_usd: Decimal = Decimal("1000"),
    interval: str = "1h",
    warmup: int = 50,
    seed: int = 20260905,
) -> NullResult:
    """Compare la strategie a `draws` versions d'elle-meme entrant au hasard.

    `strategy` doit etre une instance neuve ou re-preparable : elle est
    re-interrogee pour recenser ses formes d'entree.

    Le tirage est seede : deux executions donnent le meme percentile. Un
    chiffre qui bouge d'un run a l'autre est un chiffre qu'on cesse de lire.
    """
    shapes = entry_shapes(bars, strategy, warmup=warmup)
    n = len(observed.trades)
    if not shapes or n == 0:
        raise ValueError("strategie sans entree exploitable : rien a comparer")

    # Les durees VOULUES par la strategie, en barres : celles des trades
    # qu'elle a fermes sur son propre signal.
    #
    # On exclut les trades sortis au stop a dessein. Leur duree n'est pas une
    # intention, c'est une troncature ; la tirer puis lui appliquer un stop la
    # tronquerait une seconde fois, et le bras aleatoire tiendrait
    # systematiquement moins longtemps que la strategie — ce qui reduirait son
    # exposition a la derive du marche et le handicaperait. Un contrefactuel
    # handicape fabrique des edges.
    index = {b.ts_ms: i for i, b in enumerate(bars)}
    durees = [
        index[t.exit_ts_ms] - index[t.entry_ts_ms]
        for t in observed.trades
        if t.entry_ts_ms in index and t.exit_ts_ms in index
        and t.reason not in ("stop", "cible")
    ]
    # Si tout est parti au stop, il n'y a pas de duree voulue a imiter : on
    # laisse le bras aleatoire sortir au stop, comme elle.
    if not durees:
        durees = [
            index[t.exit_ts_ms] - index[t.entry_ts_ms]
            for t in observed.trades
            if t.entry_ts_ms in index and t.exit_ts_ms in index
        ]

    pnls: list[float] = []
    counts: list[int] = []
    for d in range(draws):
        alea = RandomEntry(shapes, n_trades=n, seed=seed + d, warmup=warmup,
                           holding_bars=durees)
        res = run_backtest(bars, alea, costs=costs, limits=limits,
                           initial_equity_usd=initial_equity_usd,
                           interval=interval, warmup=warmup)
        pnls.append(float(res.net_pnl_usd))
        counts.append(len(res.trades))

    observe = float(observed.net_pnl_usd)
    ordonnes = sorted(pnls)
    battus = sum(1 for x in pnls if x < observe)
    # P(hasard >= observe). Le +1 au numerateur et au denominateur evite
    # d'annoncer p = 0 sur un echantillon fini : avec 200 tirages, le plus
    # qu'on puisse honnetement dire est p < 1/201.
    p = (sum(1 for x in pnls if x >= observe) + 1) / (draws + 1)

    return NullResult(
        strategy=observed.strategy,
        observed_pnl_usd=observed.net_pnl_usd,
        draws=draws,
        percentile=round(100.0 * battus / draws, 1),
        null_mean_usd=round(sum(pnls) / draws, 2),
        null_p5_usd=round(ordonnes[int(0.05 * draws)], 2),
        null_p95_usd=round(ordonnes[min(draws - 1, int(0.95 * draws))], 2),
        p_value=round(p, 4),
        mean_trades_random=round(sum(counts) / draws, 1),
        observed_trades=n,
    )


def format_null_report(results: list[NullResult]) -> str:
    lines = [
        "",
        "  LE HASARD AURAIT-IL FAIT AUSSI BIEN ?",
        "  Meme profil de risque, memes couts, entrees tirees au hasard.",
        "  " + "─" * 92,
        f"  {'strategie':<16}{'observe':>10}{'hasard moy':>12}"
        f"{'p5':>10}{'p95':>10}{'perc.':>8}{'p':>8}{'verdict':>20}",
        "  " + "─" * 92,
    ]
    for r in results:
        lines.append(
            f"  {r.strategy:<16}"
            f"{float(r.observed_pnl_usd):>+10.2f}"
            f"{r.null_mean_usd:>+12.2f}"
            f"{r.null_p5_usd:>+10.2f}"
            f"{r.null_p95_usd:>+10.2f}"
            f"{r.percentile:>7.0f}%"
            f"{r.p_value:>8.3f}"
            f"{r.verdict:>20}"
        )
    lines += [
        "  " + "─" * 92,
        "",
        "  LECTURE",
        "  Le nuage du hasard n'est jamais centre sur zero, et son centre n'est",
        "  pas previsible : la derive du marche le pousse vers le haut, les",
        "  couts vers le bas, et selon lequel l'emporte il tombe au-dessus ou",
        "  en dessous. C'est precisement pour cela qu'on le mesure au lieu de",
        "  comparer a zero — un PnL positif dans un nuage centre sur +40 est",
        "  un mauvais resultat, un PnL nul dans un nuage centre sur -50 est un",
        "  bon resultat.",
        "",
        "  Un percentile eleve dit que le signal a fonctionne sur cet",
        "  echantillon — pas qu'il fonctionnera. La sur-optimisation produit",
        "  exactement cette signature.",
        "",
    ]
    return "\n".join(lines)
