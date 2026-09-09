"""Strategies baseline. Aucune IA.

Leur role n'est pas de gagner de l'argent : c'est de **fixer la reference que
le desk multi-agents devra battre**. Sans ce chiffre, "est-ce que les agents
apportent quelque chose" reste une question d'opinion.

Chaque strategie emet un `Signal` par barre. Elle ne connait ni la taille de
position, ni les frais, ni le capital : le dimensionnement appartient au
moteur de risque, exactement comme en live. C'est ce qui rend la comparaison
honnete — seule la logique d'entree change entre baseline et desk.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Protocol

from pydantic import Field

from ..contracts.common import Frozen, Side
from ..features.bars import Bar
from ..features.indicators import (
    Series,
    adx,
    atr,
    closes,
    donchian,
    ema,
    rsi,
)


class Signal(Frozen):
    """Intention d'une strategie sur une barre. `None` en side = ne rien faire."""

    side: Side | None = None
    stop_price: Decimal | None = Field(default=None, gt=0)
    target_price: Decimal | None = Field(default=None, gt=0)
    exit_now: bool = False
    note: str = ""


FLAT = Signal()


def _stop(close: Decimal, span: Decimal, side: Side) -> Decimal | None:
    """Le stop derive de l'ATR, ou `None` s'il n'a pas de sens.

    Sur un actif dont l'ATR approche le prix — un actif a petit nominal en
    forte volatilite — `close - k*ATR` passe sous zero. `Signal.stop_price`
    exige `> 0` : emettre cette valeur fait remonter une ValidationError et
    arrete le backtest au milieu de la serie.

    Une strategie qui ne sait pas ou poser son stop ne doit pas prendre la
    position. S'abstenir est la reponse correcte, pas ecreter a un prix
    plancher arbitraire qui inventerait une distance de risque.
    """
    prix = close - span if side is Side.LONG else close + span
    return prix if prix > 0 else None




class Strategy(Protocol):
    name: str

    def prepare(self, bars: list[Bar]) -> None:
        """Precalcule les indicateurs sur toute la serie, une seule fois."""

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        """Decide a la barre `i`, en ne lisant QUE les barres <= i."""


class EmaCross:
    """Croisement de moyennes mobiles. La baseline de tendance classique.

    Stop et cible derives de l'ATR : la distance s'adapte a la volatilite
    plutot que d'etre un pourcentage arbitraire qui devient absurde quand le
    regime change.
    """

    name = "ema_cross"

    def __init__(self, fast: int = 20, slow: int = 50, atr_period: int = 14,
                 atr_stop: float = 2.0, atr_target: float = 3.0) -> None:
        self.fast, self.slow = fast, slow
        self.atr_period, self.atr_stop, self.atr_target = atr_period, atr_stop, atr_target
        self._fast: list[float | None] = []
        self._slow: list[float | None] = []
        self._atr: list[float | None] = []

    def prepare(self, bars: list[Bar]) -> None:
        px = closes(bars)
        self._fast = ema(px, self.fast)
        self._slow = ema(px, self.slow)
        self._atr = atr(bars, self.atr_period)

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        if i == 0:
            return FLAT
        f, s = self._fast[i], self._slow[i]
        pf, ps = self._fast[i - 1], self._slow[i - 1]
        a = self._atr[i]
        if None in (f, s, pf, ps, a) or not a:
            return FLAT

        crossed_up = pf <= ps and f > s
        crossed_down = pf >= ps and f < s
        close = bars[i].close
        span = Decimal(str(a))

        if in_position is Side.LONG and crossed_down:
            return Signal(exit_now=True, note="croisement baissier")
        if in_position is Side.SHORT and crossed_up:
            return Signal(exit_now=True, note="croisement haussier")
        if in_position is not None:
            return FLAT

        ecart = span * Decimal(str(self.atr_stop))
        cible = span * Decimal(str(self.atr_target))
        if crossed_up and (st := _stop(close, ecart, Side.LONG)):
            return Signal(side=Side.LONG, stop_price=st,
                          target_price=close + cible, note="croisement haussier")
        if crossed_down and (st := _stop(close, ecart, Side.SHORT)):
            cible_bas = close - cible
            return Signal(side=Side.SHORT, stop_price=st,
                          target_price=cible_bas if cible_bas > 0 else None,
                          note="croisement baissier")
        return FLAT


class RsiReversion:
    """Retour a la moyenne sur RSI. La baseline de range.

    Volontairement d'une famille opposee a EmaCross : une seule baseline de
    tendance donnerait une reference qui ne tient que dans un seul regime.
    """

    name = "rsi_reversion"

    def __init__(self, period: int = 14, low: float = 30.0, high: float = 70.0,
                 exit_level: float = 50.0, atr_period: int = 14,
                 atr_stop: float = 2.5) -> None:
        self.period, self.low, self.high = period, low, high
        self.exit_level = exit_level
        self.atr_period, self.atr_stop = atr_period, atr_stop
        self._rsi: list[float | None] = []
        self._atr: list[float | None] = []

    def prepare(self, bars: list[Bar]) -> None:
        self._rsi = rsi(closes(bars), self.period)
        self._atr = atr(bars, self.atr_period)

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        r, a = self._rsi[i], self._atr[i]
        if r is None or a is None or not a:
            return FLAT
        close = bars[i].close
        span = Decimal(str(a)) * Decimal(str(self.atr_stop))

        if in_position is Side.LONG and r >= self.exit_level:
            return Signal(exit_now=True, note=f"RSI revenu a {r:.0f}")
        if in_position is Side.SHORT and r <= self.exit_level:
            return Signal(exit_now=True, note=f"RSI revenu a {r:.0f}")
        if in_position is not None:
            return FLAT

        if r <= self.low and (st := _stop(close, span, Side.LONG)):
            return Signal(side=Side.LONG, stop_price=st,
                          target_price=close + span, note=f"RSI {r:.0f}")
        if r >= self.high and (st := _stop(close, span, Side.SHORT)):
            bas = close - span
            return Signal(side=Side.SHORT, stop_price=st,
                          target_price=bas if bas > 0 else None,
                          note=f"RSI {r:.0f}")
        return FLAT



class TurtleBreakout:
    """Cassure de canal Donchian — le « Systeme 2 » des Turtles.

    Regles d'origine (Dennis & Eckhardt, 1983), transposees telles quelles :
    entree sur cassure du plus haut/bas de `entry_period`, sortie sur cassure
    OPPOSEE de `exit_period`, stop a 2N ou N est l'ATR. Le Systeme 2 est
    retenu plutot que le Systeme 1 parce qu'il ne comporte pas la regle de
    saut (« ne pas prendre l'entree si la precedente etait gagnante ») : cette
    regle suppose de connaitre l'issue du trade precedent, ce qui rend le
    backtest dependant de son propre historique et la comparaison moins nette.

    **Les periodes sont en BARRES, pas en jours.** C'est au parametrage de les
    convertir, et ce n'est pas un detail : la meme regle rend +36 % en daily
    et -55 % en 30 minutes sur BTC. Un canal de 55 barres en 1 h couvre deux
    jours, pas cinquante-cinq — ce n'est plus la strategie documentee, c'est
    une strategie de cassure intraday, dont rien ne dit qu'elle marche.

    Aucune cible : une strategie de suivi de tendance gagne sur les rares
    trades qui courent longtemps. Poser une cible les coupe et transforme le
    profil de gain en son inverse.
    """

    name = "turtle_breakout"

    def __init__(self, entry_period: int = 55, exit_period: int = 20,
                 atr_period: int = 20, atr_stop: float = 2.0) -> None:
        self.entry_period, self.exit_period = entry_period, exit_period
        self.atr_period, self.atr_stop = atr_period, atr_stop
        self._eh: Series = []
        self._el: Series = []
        self._xh: Series = []
        self._xl: Series = []
        self._atr: Series = []

    def prepare(self, bars: list[Bar]) -> None:
        self._eh, self._el = donchian(bars, self.entry_period)
        self._xh, self._xl = donchian(bars, self.exit_period)
        self._atr = atr(bars, self.atr_period)

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        eh, el, xh, xl, a = (self._eh[i], self._el[i], self._xh[i],
                             self._xl[i], self._atr[i])
        if None in (eh, el, xh, xl, a) or not a:
            return FLAT

        close = bars[i].close
        span = Decimal(str(a)) * Decimal(str(self.atr_stop))

        # Sortie d'abord : une cassure opposee annule la these, et la tester
        # avant l'entree evite d'inverser la position dans la meme barre.
        if in_position is Side.LONG and float(close) < xl:
            return Signal(exit_now=True, note=f"cassure basse {self.exit_period}")
        if in_position is Side.SHORT and float(close) > xh:
            return Signal(exit_now=True, note=f"cassure haute {self.exit_period}")
        if in_position is not None:
            return FLAT

        if float(close) > eh and (st := _stop(close, span, Side.LONG)):
            return Signal(side=Side.LONG, stop_price=st,
                          note=f"cassure haute {self.entry_period}")
        if float(close) < el and (st := _stop(close, span, Side.SHORT)):
            return Signal(side=Side.SHORT, stop_price=st,
                          note=f"cassure basse {self.entry_period}")
        return FLAT


class TimeSeriesMomentum:
    """Momentum temporel : on suit le signe du rendement passe.

    La regle la mieux documentee de la famille — Moskowitz, Ooi & Pedersen
    (2012) sur douze classes d'actifs, Liu & Tsyvinski (2018, 2021) sur BTC,
    ETH et XRP, ou l'effet est mesure sur des horizons d'une a quatre
    semaines et le rendement courant predit jusqu'a huit semaines.

    Le signal est le signe de `close[i] / close[i - lookback] - 1`. Rien
    d'autre : ni seuil, ni filtre, ni optimisation de parametre. C'est
    volontaire — une baseline dont on a choisi les parametres sur les memes
    donnees qu'on lui fait battre ne mesure plus rien.

    On ne retourne la position que lorsque le signe change, ce qui donne un
    turnover tres bas. Sur ce desk ce n'est pas un detail esthetique : a
    0,287 $ de couts par trade pour 1000 USDC de capital, le turnover est le
    premier poste de destruction du rendement brut.
    """

    name = "tsmom"

    def __init__(self, lookback: int = 168, atr_period: int = 20,
                 atr_stop: float = 3.0) -> None:
        self.lookback = lookback
        self.atr_period, self.atr_stop = atr_period, atr_stop
        self._atr: Series = []

    def prepare(self, bars: list[Bar]) -> None:
        self._atr = atr(bars, self.atr_period)

    def _sens(self, i: int, bars: list[Bar]) -> Side | None:
        if i < self.lookback:
            return None
        passe = bars[i - self.lookback].close
        if passe <= 0:
            return None
        variation = bars[i].close / passe - 1
        if variation > 0:
            return Side.LONG
        if variation < 0:
            return Side.SHORT
        return None

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        a = self._atr[i]
        sens = self._sens(i, bars)
        if a is None or not a or sens is None:
            return FLAT

        if in_position is not None:
            if in_position is not sens:
                return Signal(exit_now=True, note="le signe du momentum a change")
            return FLAT

        close = bars[i].close
        span = Decimal(str(a)) * Decimal(str(self.atr_stop))
        st = _stop(close, span, sens)
        if st is None:
            return FLAT
        signe = "+" if sens is Side.LONG else "-"
        return Signal(side=sens, stop_price=st,
                      note=f"momentum {signe} sur {self.lookback} barres")



class FundingExtreme:
    """Contrarien sur le taux de financement — la seule famille que le depot
    ne pouvait pas tester avant que `api.hyperliquid.xyz` redevienne joignable.

    `docs/macro-momentum-crypto-onchain.md` : un funding fortement positif et
    persistant signale un marche sur-effet-de-levier a l'achat, mur pour une
    cascade de liquidations baissiere (long squeeze). Fortement negatif,
    l'inverse. On prend donc le SENS OPPOSE a la foule endettee.

    C'est structurellement different des quatre autres baselines : le signal
    ne vient pas du prix mais du **positionnement**. Un prix qui monte ne dit
    pas si la hausse est portee par des acheteurs comptants ou par du levier ;
    le funding, si.

    `funding_par_barre` doit etre aligne sur `bars`, en bps par barre. La
    strategie ne recalcule rien : elle interprete une serie fournie, comme
    l'agent Quant interprete des indicateurs deja calcules.
    """

    name = "funding_extreme"

    def __init__(self, funding_par_barre: list[float] | None = None,
                 lookback: int = 42, seuil_z: float = 1.5,
                 atr_period: int = 20, atr_stop: float = 2.5) -> None:
        self.funding = funding_par_barre or []
        self.lookback = lookback
        self.seuil_z = seuil_z
        self.atr_period, self.atr_stop = atr_period, atr_stop
        self._atr: Series = []
        self._z: Series = []

    def prepare(self, bars: list[Bar]) -> None:
        self._atr = atr(bars, self.atr_period)
        self._z = [None] * len(bars)
        if len(self.funding) < len(bars):
            return
        for i in range(self.lookback, len(bars)):
            fenetre = self.funding[i - self.lookback:i]
            moyenne = sum(fenetre) / len(fenetre)
            var = sum((x - moyenne) ** 2 for x in fenetre) / len(fenetre)
            ecart = var ** 0.5
            if ecart > 0:
                self._z[i] = (self.funding[i] - moyenne) / ecart

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        z, a = self._z[i], self._atr[i]
        if z is None or a is None or not a:
            return FLAT

        # Sortie des que l'exces se resorbe : la these est que le
        # desequilibre se corrige, pas qu'une tendance s'installe.
        if in_position is not None:
            if abs(z) < 0.5:
                return Signal(exit_now=True, note="funding revenu a la normale")
            return FLAT

        close = bars[i].close
        span = Decimal(str(a)) * Decimal(str(self.atr_stop))
        if z > self.seuil_z and (st := _stop(close, span, Side.SHORT)):
            return Signal(side=Side.SHORT, stop_price=st,
                          note=f"funding +{z:.1f} ecarts — longs surendettes")
        if z < -self.seuil_z and (st := _stop(close, span, Side.LONG)):
            return Signal(side=Side.LONG, stop_price=st,
                          note=f"funding {z:.1f} ecarts — shorts surendettes")
        return FLAT


class TrendFollowerATR:
    """La strategie de reference de `docs/strategies-pinescript-v5.md`.

    Un HYBRIDE, et c'est pour ca qu'elle est ici : elle empile quatre briques
    qui appartiennent a des familles differentes, la ou chaque baseline
    existante n'en porte qu'une.

        filtre de regime   Close > EMA 200        (tendance)
        declencheur        EMA 21 croise EMA 50   (tendance)
        confirmation       RSI 14 > 50            (momentum)
        risque             stop 2 ATR, cible 3,5 ATR, seuil a 1,5 ATR
                                                  (volatilite)

    J'avais ecarte ce document en une ligne — « elle appartient a la famille
    `ema_cross`, qui ne se distingue du hasard sur aucune cellule de la
    grille ». C'etait un raisonnement, pas une mesure, et il etait faux sur
    deux points precis :

    - le **seuil a l'equilibre** (le stop remonte au prix d'entree des que le
      gain atteint 1,5 ATR) n'existe dans aucune baseline. Il modifie la
      distribution des sorties, pas le signal d'entree — et la mesure
      Monte-Carlo a montre que la perte mediane vaut **-1,27 R et non -1 R**.
      C'est exactement ce que ce mecanisme attaque.
    - le filtre EMA 200 et la confirmation RSI n'appartiennent pas a la meme
      famille que le croisement. Les tester ensemble n'est pas tester
      `ema_cross`.

    **Cette classe est long seulement**, comme le Pine Script du document
    (`strategy.entry(strategy.long)`, aucune branche short). Le lui ajouter
    serait tester ma strategie, pas la sienne.
    """

    name = "trend_follower_atr"

    def __init__(self, fast: int = 21, medium: int = 50, slow: int = 200,
                 rsi_period: int = 14, rsi_seuil: float = 50.0,
                 atr_period: int = 14, atr_stop: float = 2.0,
                 atr_target: float = 3.5, atr_equilibre: float = 1.5) -> None:
        self.fast, self.medium, self.slow = fast, medium, slow
        self.rsi_period, self.rsi_seuil = rsi_period, rsi_seuil
        self.atr_period, self.atr_stop = atr_period, atr_stop
        self.atr_target, self.atr_equilibre = atr_target, atr_equilibre
        self._f: Series = []
        self._m: Series = []
        self._s: Series = []
        self._rsi: Series = []
        self._atr: Series = []
        # Etat de la position en cours. Le moteur ne le communique pas : il ne
        # dit que le SENS. Une strategie a stop suiveur doit donc se souvenir
        # de son prix d'entree elle-meme.
        self._entree: Decimal | None = None
        self._a_lequilibre = False

    def prepare(self, bars: list[Bar]) -> None:
        px = closes(bars)
        self._f, self._m, self._s = ema(px, self.fast), ema(px, self.medium), ema(px, self.slow)
        self._rsi = rsi(px, self.rsi_period)
        self._atr = atr(bars, self.atr_period)
        self._entree, self._a_lequilibre = None, False

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        if i == 0:
            return FLAT
        f, m, s = self._f[i], self._m[i], self._s[i]
        pf, pm = self._f[i - 1], self._m[i - 1]
        r, a = self._rsi[i], self._atr[i]
        if None in (f, m, s, pf, pm, r, a) or not a:
            return FLAT

        bar = bars[i]
        span = Decimal(str(a))

        if in_position is Side.LONG:
            # Seuil a l'equilibre : « des que le prix atteint un gain egal a
            # 1,5 x ATR, le stop remonte au prix d'entree ». Teste sur le HAUT
            # de la barre, comme le `high >= breakEvenTrigger` du document.
            if self._entree is None or self._a_lequilibre:
                return FLAT
            seuil = self._entree + span * Decimal(str(self.atr_equilibre))
            if bar.high >= seuil:
                self._a_lequilibre = True
                return Signal(stop_price=self._entree, note="stop a l'equilibre")
            return FLAT
        if in_position is not None:
            return FLAT

        self._entree, self._a_lequilibre = None, False
        if not (bar.close > Decimal(str(s))          # filtre de regime
                and pf <= pm and f > m               # declencheur
                and r > self.rsi_seuil):             # confirmation
            return FLAT

        ecart = span * Decimal(str(self.atr_stop))
        st = _stop(bar.close, ecart, Side.LONG)
        if st is None:
            return FLAT
        self._entree = bar.close
        return Signal(side=Side.LONG, stop_price=st,
                      target_price=bar.close + span * Decimal(str(self.atr_target)),
                      note="tendance confirmee")


class RegimeSwitch:
    """Deux familles opposees, choisies par le regime — pas filtrees par lui.

    C'est la difference qui justifie cette classe. Un FILTRE ne fait que
    retirer des trades : mesure sur cette grille, `rsi_reversion + ADX < 20`
    reduit la perte de 91 % mais le nombre de trades de 87 %, et
    l'amelioration par trade n'est que de 28 %. L'essentiel du gain venait de
    ne pas trader, pas d'un meilleur signal. Un COMMUTATEUR, lui, remplace un
    signal par un autre : quand le suivi de tendance se tait, le retour a la
    moyenne parle.

    La these testee est celle que repetent forums et manuels : la tendance
    paie quand le marche tend, le retour a la moyenne quand il range, et
    chacune saigne dans le regime de l'autre. Si elle est vraie, la
    combinaison doit battre ses deux composantes prises seules.

    Le classificateur est l'ADX, comme le prescrit
    `docs/indicateurs-techniques-maths.md` : au-dessus de `adx_tendance` on
    suit la tendance, en dessous de `adx_range` on joue le retour a la
    moyenne, et **entre les deux on ne fait rien**. Cette bande morte n'est
    pas une precaution cosmetique : sans elle, un ADX qui oscille autour d'un
    seuil unique ferait alterner les deux logiques d'une barre a l'autre.

    Une reserve a poser d'avance, parce qu'elle limite ce que le resultat
    pourra dire : j'ai deja mesure que l'ADX a besoin d'environ `2 x period`
    barres pour se former et que son retard lui fait manquer les debuts de
    tendance — il coutait 440 a 600 $ en filtre sur `turtle_breakout` et
    `tsmom`. Un echec de ce commutateur pourra donc venir du classificateur
    autant que de la these.

    **Qui a ouvert gere.** Une fois la position prise, c'est la sous-strategie
    qui l'a ouverte qui decide de la sortie, meme si le regime a change
    entre-temps. Laisser l'autre reprendre la main en cours de position lui
    ferait gerer un trade dont elle ignore la logique d'entree — et le
    resultat ne mesurerait plus aucune des deux.
    """

    name = "regime_switch"

    def __init__(self, adx_period: int = 14, adx_tendance: float = 25.0,
                 adx_range: float = 20.0, tendance: Strategy | None = None,
                 retour: Strategy | None = None) -> None:
        if adx_range > adx_tendance:
            raise ValueError("la bande morte est inversee : adx_range > adx_tendance")
        self.adx_period = adx_period
        self.adx_tendance, self.adx_range = adx_tendance, adx_range
        self.tendance = tendance or EmaCross()
        self.retour = retour or RsiReversion()
        self._adx: Series = []
        self._proprietaire: Strategy | None = None

    def prepare(self, bars: list[Bar]) -> None:
        self._adx = adx(bars, self.adx_period)
        self.tendance.prepare(bars)
        self.retour.prepare(bars)
        self._proprietaire = None

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        if in_position is not None:
            if self._proprietaire is None:
                # Position ouverte sans proprietaire connu : ne peut arriver
                # que si le moteur a ouvert autrement qu'a notre demande. On
                # ne la gere pas plutot que de la gerer au hasard.
                return FLAT
            return self._proprietaire.on_bar(i, bars, in_position)

        self._proprietaire = None
        a = self._adx[i]
        if a is None:
            return FLAT
        if a >= self.adx_tendance:
            choisie = self.tendance
        elif a <= self.adx_range:
            choisie = self.retour
        else:
            return FLAT  # bande morte

        sig = choisie.on_bar(i, bars, None)
        if sig.side is not None:
            self._proprietaire = choisie
        return sig


# Le plafond de distance de stop des CAMPAGNES, en points de base.
#
# Volontairement large et identique partout. Le defaut de `RiskLimits`
# (500 bps) est un garde-fou de production : il refuse une position dont le
# stop est loin, ce qui est sain quand on engage de l'argent. Applique a un
# backtest de comparaison, il ne compare plus les strategies — il compare les
# volatilites, en rejetant plus souvent les actifs agites que BTC.
#
# Le piege est pire que ca, et il a ete vu le 9 septembre 2026 en branchant
# l'interface : avec 500 bps, `tsmom BTC 1d` produit **zero trade et 2 158
# rejets**, donc une courbe d'equite parfaitement plate. Affichee a cote de
# celle de « detenir BTC », elle se lit « la strategie a perdu contre le
# marche » alors qu'elle n'a jamais pris une position. Toute lecture qui
# affiche cette courbe doit donc utiliser ce plafond-ci, et montrer le compte
# de rejets a cote.
PLAFOND_STOP_CAMPAGNE_BPS = 5000

# Combien de barres font un jour, par intervalle. Sert a convertir en barres
# des regles ecrites en jours.
BARRES_PAR_JOUR = {"1d": 1, "4h": 6, "1h": 24, "15m": 96}


def parametres(nom: str, interval: str) -> dict:
    """Les parametres qui donnent a chaque strategie SON horizon documente.

    Les strategies comptent en barres ; leurs regles d'origine comptent en
    jours ou en semaines. Instancier `TurtleBreakout()` tel quel sur du 4 h
    donne un canal de 55 barres, soit neuf jours — ce n'est plus la regle des
    Turtles, c'est une strategie de cassure a court terme dont rien ne dit
    qu'elle marche. Le meme piege dans l'autre sens vaut pour `tsmom`, dont
    le defaut de 168 barres fait 168 JOURS en daily quand la litterature
    mesure l'effet sur une a quatre semaines.

    Sans cette conversion, la grille compare des horizons differents d'une
    cellule a l'autre et son verdict ne veut rien dire.
    """
    n = BARRES_PAR_JOUR[interval]
    if nom == "turtle_breakout":
        # Systeme 2 : cassure 55 jours, sortie 20 jours, ATR sur 20 jours.
        return {"entry_period": 55 * n, "exit_period": 20 * n,
                "atr_period": 20 * n}
    if nom == "tsmom":
        # Quatre semaines, le haut de la fourchette ou l'effet est mesure.
        return {"lookback": 28 * n, "atr_period": 20 * n}
    # EmaCross, RsiReversion et TrendFollowerATR utilisent des periodes
    # conventionnelles en BARRES (20/50, 14, 21/50/200), appliquees telles
    # quelles a toute echelle : c'est ainsi qu'elles sont employees et
    # documentees. Le « EMA 200 » du Pine Script en particulier est un filtre
    # de regime que ses utilisateurs posent sur l'unite de temps affichee,
    # quelle qu'elle soit — le convertir en 200 jours serait ma regle, pas la
    # sienne.
    return {}


# Les strategies actives. `buy_and_hold` n'y figure pas : ce n'est pas une
# strategie mais une reference, calculee par `engine.benchmark_buy_and_hold`
# qui ne lui impose ni stop ni dimensionnement par le risque.
BASELINES: dict[str, type] = {
    "ema_cross": EmaCross,
    "rsi_reversion": RsiReversion,
    "turtle_breakout": TurtleBreakout,
    "tsmom": TimeSeriesMomentum,
    "trend_follower_atr": TrendFollowerATR,
    "regime_switch": RegimeSwitch,
}
