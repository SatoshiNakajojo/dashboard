"""Le scorer : « est-ce que ca vaut le coup de la brancher ».

**Ce module ne dit PAS si une strategie est reelle.** C'est la question de
`epreuves.py`, et elle se pose en premier : une regle indistinguable du hasard
n'a pas de note, elle a un refus. Le scorer suppose l'epreuve franchie et
repond a la question suivante, qui est economique : a quoi ressemble cette
strategie si on la branche.

Les deux ne se remplacent pas et ne se melangent pas. L'epreuve protege contre
le faux positif ; le scorer classe ce qui a survecu.

────────────────────────────────────────────────────────────────────────────
  POURQUOI UNE NOTE SUR DIX, ALORS QUE L'EPREUVE REFUSE D'AGREGER
────────────────────────────────────────────────────────────────────────────

Parce qu'elles ne font pas le meme travail, et que la note ne decide de rien.

`epreuves.py` refuse l'agregation pour une raison precise : une bonne moyenne
peut masquer une epreuve fatale, et « 70 % des entrees refusees par le moteur
de risque » n'est pas une mauvaise note, c'est une regle qui ne tournera
jamais telle qu'elle a ete mesuree.

Ici, deux PORTES restent binaires et bloquantes — le rendement annualise en
dollars, et le fait de battre l'achat-conservation. Elles ne sont pas des
composantes de la note : une strategie qui en rate une n'est pas mal notee,
elle est **non deployable**, quelle que soit sa note.

La note sur dix ne sert qu'a CLASSER ce qui a franchi les portes. C'est un
outil de tri, pas un verdict.

────────────────────────────────────────────────────────────────────────────
  CE QUE MESURE CHAQUE CHIFFRE, ET L'ERREUR QU'IL EVITE
────────────────────────────────────────────────────────────────────────────

**L'annualise est GEOMETRIQUE.** Diviser un rendement de periode par la duree
en annees surestime : a +48 % sur douze mois, la division naive rend 4,00 %
par mois quand le taux qui compose reellement en rend 3,32. L'erreur penche du
cote qui fait deployer.

**L'achat-conservation paie ses frais.** Un aller-retour, comme n'importe
quelle position. Le comparer a une strategie qui paie les siens sur cent
trades, sans lui faire payer les deux siens, serait une comparaison truquee
en faveur de la strategie.

**L'esperance est en R**, et le R est exact : chaque trade porte le risque
qu'il courait a l'ouverture. Le deduire du budget de risque serait faux des
qu'un plafond de notionnel mord — et il mord souvent (risque median mesure
2,64 $ pour un budget de 5 $).

**Le repli maximal se lit sur la courbe d'equite**, pas sur la somme des
pertes. Dix pertes reparties ne font pas un repli de dix pertes.

**Le relief** demande si les parametres VOISINS gagnent encore. Un sommet qui
s'effondre des qu'on bouge d'un cran est un artefact de la grille, pas un
reglage. C'est la mesure anti-surapprentissage la plus directe qui soit, et
elle coute un backtest par voisin.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Sequence

MS_PAR_AN = 365.25 * 86_400 * 1000

# L'abattement entre le papier et le reel. Le briefing du 16 septembre 2026
# vise « ~100 % paper / ~30 % par an live » : la latence, le ping et la
# qualite d'execution mangent le reste. Ce n'est pas une mesure, c'est une
# HYPOTHESE de travail, et elle est declaree ici pour etre discutable.
ABATTEMENT_LIVE = 0.30

# En dessous, une esperance n'est pas interpretable. Meme plancher que
# l'epreuve, et pour la meme raison.
TRADES_MIN = 30


@dataclass(frozen=True)
class Porte:
    """Un critere BINAIRE et bloquant. Ni une note, ni une pondération."""

    cle: str
    titre: str
    passee: bool
    detail: str


@dataclass(frozen=True)
class Note:
    # les deux portes
    portes: tuple[Porte, ...]
    # les chiffres
    annualise_pct: float
    annualise_usd: float
    buy_hold_annualise_pct: float
    esperance_r: float
    esperance_r_mediane: float
    win_rate: float
    profit_factor: float
    repli_max_pct: float
    trades: int
    jours: float
    stop_sur_atr: bool
    relief: float | None
    note_sur_10: float

    @property
    def deployable(self) -> bool:
        """**Les portes decident, pas la note.**

        Une strategie a 9/10 qui ne bat pas l'achat-conservation n'est pas une
        bonne strategie mal classee : c'est une facon compliquee de faire moins
        bien que ne rien faire.
        """
        return all(p.passee for p in self.portes)

    @property
    def live_espere_pct(self) -> float:
        """Ce qu'on peut esperer en reel, sous l'hypothese d'abattement."""
        return self.annualise_pct * ABATTEMENT_LIVE

    def resume(self) -> str:
        if not self.deployable:
            rate = next(p for p in self.portes if not p.passee)
            return f"NON DÉPLOYABLE — {rate.titre} : {rate.detail}"
        return (f"{self.note_sur_10:.1f}/10 · {self.annualise_pct:+.1f} %/an "
                f"(live espéré {self.live_espere_pct:+.1f} %) · "
                f"{self.esperance_r:+.2f} R · repli {self.repli_max_pct:.1f} %")

    def en_dict(self) -> dict[str, Any]:
        return {
            "note_sur_10": round(self.note_sur_10, 2),
            "deployable": self.deployable,
            "annualise_pct": round(self.annualise_pct, 2),
            "annualise_usd": round(self.annualise_usd, 2),
            "buy_hold_annualise_pct": round(self.buy_hold_annualise_pct, 2),
            "live_espere_pct": round(self.live_espere_pct, 2),
            "esperance_r": round(self.esperance_r, 3),
            "esperance_r_mediane": round(self.esperance_r_mediane, 3),
            "win_rate": round(self.win_rate, 3),
            # `None`, PAS `inf`, ET LA NUANCE A MIS TOUT L'ECRAN PAR TERRE.
            #
            # Une strategie sans aucun trade perdant a un facteur de profit
            # infini. `json.dumps` l'ecrit `Infinity`, qui n'est pas du JSON
            # valide ; Starlette sert ses reponses avec `allow_nan=False`,
            # donc l'endpoint LEVE et `/api/recherche` rend un 500. Tout le
            # volet recherche du desk — atelier, saisons, journal, biblio —
            # devient muet d'un coup, et le seul symptome visible est
            # « Panneaux indisponibles : le serveur n'a pas repondu ».
            #
            # Mesure du 19 septembre 2026 : deux cellules de l'atelier
            # portaient un facteur infini, et l'ecran etait effectivement
            # noir. `backtest/report.py` faisait deja le bon choix depuis le
            # debut — `None` des que la perte est nulle — mais le scorer
            # avait sa propre copie, et c'est celle-la qui sortait.
            #
            # `None` est aussi le plus juste : « aucun trade perdant » n'est
            # pas un ratio enorme, c'est un ratio qui n'existe pas encore.
            "profit_factor": (round(self.profit_factor, 3)
                              if math.isfinite(self.profit_factor) else None),
            "repli_max_pct": round(self.repli_max_pct, 2),
            "trades": self.trades,
            "jours": round(self.jours, 1),
            "stop_sur_atr": self.stop_sur_atr,
            "relief": None if self.relief is None else round(self.relief, 3),
            "resume": self.resume(),
            "portes": [{"cle": p.cle, "titre": p.titre, "passee": p.passee,
                        "detail": p.detail} for p in self.portes],
        }


def annualiser(rendement: float, jours: float) -> float:
    """Le rendement de periode, ramene a l'annee, GEOMETRIQUEMENT.

    Rend −100 % au plancher : une equite qui tombe a zero ne se compose pas,
    et `(1 + r)` negatif eleve a une puissance fractionnaire n'a pas de sens
    reel.
    """
    if jours <= 0:
        return 0.0
    if rendement <= -1.0:
        return -100.0
    return ((1.0 + rendement) ** (365.25 / jours) - 1.0) * 100.0


def buy_and_hold_pct(bars: Sequence, cout_aller_retour_bps: float = 9.0) -> float:
    """L'achat-conservation sur la meme periode, FRAIS COMPRIS.

    Un aller-retour, comme n'importe quelle position. Le comparer a une
    strategie qui paie ses frais sur cent trades sans lui faire payer ses deux
    siens serait une comparaison truquee en faveur de la strategie.
    """
    if len(bars) < 2:
        return 0.0
    c0, c1 = float(bars[0].close), float(bars[-1].close)
    if c0 <= 0:
        return 0.0
    return (c1 / c0 - 1.0) - cout_aller_retour_bps / 10_000.0


def repli_max_pct(courbe: Sequence) -> float:
    """Le repli maximal, lu sur la COURBE d'equite.

    Sommer les pertes donnerait un chiffre plus gros et faux : dix pertes
    separees par des gains ne font pas un repli de dix pertes.
    """
    pic, pire = None, 0.0
    for v in courbe:
        x = float(v)
        pic = x if pic is None else max(pic, x)
        if pic > 0:
            pire = min(pire, (x - pic) / pic)
    return abs(pire) * 100.0


def _mediane(xs: list[float]) -> float:
    if not xs:
        return 0.0
    v = sorted(xs)
    n = len(v)
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2


def noter(resultat, bars: Sequence, *, equite: float = 1000.0,
          relief: float | None = None,
          stop_sur_atr: bool | None = None) -> Note:
    """La note complete d'un backtest.

    `relief` est passe plutot que calcule : il coute un backtest par voisin, et
    tout appelant ne veut pas le payer. `None` signifie « pas mesure », ce qui
    n'est pas « mauvais » — la note le traite comme une composante absente,
    pas nulle.
    """
    trades = list(resultat.trades)
    net = float(resultat.net_pnl_usd)
    jours = (resultat.end_ts_ms - resultat.start_ts_ms) / 86_400_000.0
    rendement = net / equite if equite > 0 else 0.0

    annualise = annualiser(rendement, jours)
    bh = annualiser(buy_and_hold_pct(bars), jours)

    rs = [float(t.r_multiple) for t in trades if t.r_multiple is not None]
    gains = [float(t.net_pnl_usd) for t in trades if t.net_pnl_usd > 0]
    pertes = [-float(t.net_pnl_usd) for t in trades if t.net_pnl_usd <= 0]
    pf = (sum(gains) / sum(pertes)) if pertes and sum(pertes) > 0 else (
        math.inf if gains else 0.0)

    if stop_sur_atr is None:
        params = getattr(resultat, "parametres", None) or {}
        stop_sur_atr = any("atr" in str(k).lower() for k in params)

    # ─── LES DEUX PORTES ───
    portes = (
        Porte("annualise", "Rendement annualisé en dollars",
              annualise > 0 and len(trades) >= TRADES_MIN,
              f"{annualise:+.1f} %/an soit {net:+.2f} $ sur {jours:.0f} jours"
              + (f" — mais {len(trades)} trades, plancher à {TRADES_MIN}"
                 if len(trades) < TRADES_MIN else "")),
        Porte("buy_hold", "Bat l'achat-conservation",
              annualise > bh,
              f"{annualise:+.1f} %/an contre {bh:+.1f} %/an pour "
              f"l'achat-conservation, frais compris"),
    )

    # ─── LA NOTE, qui ne sert qu'a classer ───
    esperance = sum(rs) / len(rs) if rs else 0.0
    composantes = [
        # Chacune vaut de 0 a 1, puis la moyenne x 10. Les bornes sont des
        # conventions declarees, pas des mesures.
        min(max(annualise / 100.0, 0.0), 1.0),          # 100 %/an = plein pot
        min(max((annualise - bh) / 50.0, 0.0), 1.0),    # 50 points d'avance
        min(max(esperance / 0.3, 0.0), 1.0),            # +0,30 R = plein pot
        min(max((pf - 1.0) / 0.5, 0.0), 1.0) if math.isfinite(pf) else 1.0,
        min(max(1.0 - repli_max_pct(resultat.equity_curve) / 20.0, 0.0), 1.0),
        1.0 if stop_sur_atr else 0.0,
    ]
    if relief is not None:
        composantes.append(min(max(relief, 0.0), 1.0))

    return Note(
        portes=portes,
        annualise_pct=annualise,
        annualise_usd=net,
        buy_hold_annualise_pct=bh,
        esperance_r=esperance,
        esperance_r_mediane=_mediane(rs),
        win_rate=len(gains) / len(trades) if trades else 0.0,
        profit_factor=pf,
        repli_max_pct=repli_max_pct(resultat.equity_curve),
        trades=len(trades),
        jours=jours,
        stop_sur_atr=bool(stop_sur_atr),
        relief=relief,
        note_sur_10=10.0 * sum(composantes) / len(composantes),
    )


# ───────────────────────────────────────────────────────── le relief

# De combien on bouge chaque parametre pour interroger le voisinage. En PART
# du parametre, pas en valeur absolue : deplacer une periode de 20 a 22 et un
# multiplicateur d'ATR de 3,0 a 3,2 sont le meme geste, alors que « +2 » sur
# les deux n'aurait aucun sens commun.
PAS_RELIEF = 0.10

# En dessous, un parametre entier ne bouge pas du tout : 10 % de 5 arrondi a
# zero laisserait le voisin identique a l'original, et le relief compterait
# une strategie comme son propre voisin — donc toujours un relief parfait.
PAS_ENTIER_MIN = 1


def voisins(params: dict[str, Any]) -> list[dict[str, Any]]:
    """Les paramétrages a un cran de celui-ci, dans les deux sens.

    Un seul parametre bouge a la fois. Les faire bouger ensemble explorerait
    un voisinage plus large mais ne repondrait plus a la question posee : « ce
    reglage est-il un sommet isole ? » se teste en descendant d'un cran dans
    chaque direction, pas en sautant dans le coin opposé.
    """
    out: list[dict[str, Any]] = []
    for cle, valeur in sorted(params.items()):
        if not isinstance(valeur, (int, float)) or isinstance(valeur, bool):
            continue
        entier = isinstance(valeur, int)
        pas = abs(valeur) * PAS_RELIEF
        if entier:
            pas = max(int(round(pas)), PAS_ENTIER_MIN)
        for sens in (-1, 1):
            v = valeur + sens * pas
            if entier:
                v = int(round(v))
            bas, haut = _bornes().get(cle, (None, None))
            if bas is not None and not (bas <= v <= haut):
                continue
            if v == valeur or (entier and v < 1):
                continue
            out.append({**params, cle: v})
    return out


_BORNES_CACHE: dict[str, tuple[float, float]] | None = None


def _bornes() -> dict[str, tuple[float, float]]:
    """Les bornes de l'atelier, resolues PARESSEUSEMENT.

    L'atelier importe le scorer pour inscrire la note avec chaque essai ; le
    scorer a besoin des bornes de l'atelier pour ne pas proposer un voisin
    hors domaine. Les resoudre a l'import creerait un cycle. Les resoudre au
    premier appel le casse, et le cache evite d'en payer le prix a chaque
    voisin.
    """
    global _BORNES_CACHE
    if _BORNES_CACHE is None:
        from .atelier import BORNES
        _BORNES_CACHE = BORNES
    return _BORNES_CACHE


def relief(nom: str, actif: str, intervalle: str, params: dict[str, Any], *,
           equite: float = 1000.0, max_stop_bps: float | None = 1600.0
           ) -> tuple[float, int, int]:
    """La part des voisins qui gagnent encore. Rend (part, gagnants, testes).

    **C'est la mesure anti-surapprentissage la plus directe qui soit.** Un
    sommet qui s'effondre des qu'on bouge d'un cran est un artefact de la
    grille : on a trouve la cellule ou le bruit etait favorable, pas un
    reglage. Un plateau, lui, survit au deplacement.

    Le critere retenu pour « gagne encore » est le NET POSITIF, pas la note :
    exiger des voisins qu'ils franchissent les portes ferait du relief une
    mesure de la severite des portes plutot que de la forme du paysage.

    Coute un backtest par voisin, donc deux par parametre numerique. Il est
    appele explicitement, jamais automatiquement.
    """
    from decimal import Decimal as D

    from .backtest.data import load_from_file
    from .backtest.engine import run_backtest
    from .backtest.strategies import BASELINES
    from .risk.limits import RiskLimits

    liste = voisins(params)
    if not liste:
        return 0.0, 0, 0

    bars = load_from_file(f"data/{actif}_{intervalle}_real.json", actif, intervalle)
    limites = (RiskLimits() if max_stop_bps is None
               else RiskLimits(max_stop_distance_bps=D(str(max_stop_bps))))
    gagnants = 0
    testes = 0
    for p in liste:
        try:
            r = run_backtest(bars, BASELINES[nom](**p), limits=limites,
                             interval=intervalle, initial_equity_usd=D(str(equite)))
        except Exception:
            # Un voisin qui ne tourne pas n'est pas un voisin perdant : c'est
            # un parametrage invalide. Le compter comme perdant punirait la
            # strategie pour une borne qu'elle ne controle pas.
            continue
        testes += 1
        if float(r.net_pnl_usd) > 0:
            gagnants += 1
    return (gagnants / testes if testes else 0.0), gagnants, testes
