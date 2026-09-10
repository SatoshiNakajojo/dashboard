#!/usr/bin/env python3
"""Walk-Forward : les parametres choisis sur le passe tiennent-ils devant ?

`docs/indicateurs-strategies-validation-robustesse.md` en fait un critere de
rejet chiffre : **WFE < 50 % => systeme sur-optimise et instable**.

    WFE = rendement annualise OOS / rendement annualise IS

Le principe reproduit ce que fait un desk : on re-optimise periodiquement sur
une fenetre passee (In-Sample), on applique le parametre retenu sur la fenetre
suivante — inconnue au moment du choix — puis on avance.

    Passe 1 : |---- IS ----|-- OOS --|
    Passe 2 :        |---- IS ----|-- OOS --|

**Ce test est plus severe qu'un balayage de sensibilite.** Un plateau montre
que le signal survit au voisinage du parametre ; le walk-forward montre si le
parametre CHOISI sur le passe est encore le bon ensuite. Une strategie peut
avoir un plateau large et un WFE catastrophique : il suffit que la position du
plateau se deplace dans le temps.

    python scripts/walk_forward.py --strategie tsmom --actif BTC
"""

from __future__ import annotations

import argparse
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sensibilite_parametres import BALAYAGES

from trading_desk.backtest.data import load_from_file
from trading_desk.backtest.engine import run_backtest
from trading_desk.risk import RiskLimits


def rendement_annualise(net: float, capital: float, barres: int,
                        barres_par_an: float) -> float:
    """Rendement annualise simple. Les fenetres courtes rendent le compose
    instable ; on reste lineaire pour que le ratio WFE garde un sens."""
    if barres <= 0:
        return 0.0
    return (net / capital) * (barres_par_an / barres) * 100.0


def main() -> int:
    ap = argparse.ArgumentParser(description="Walk-Forward Efficiency")
    ap.add_argument("--strategie", default="tsmom", choices=sorted(BALAYAGES))
    ap.add_argument("--actif", default="BTC")
    ap.add_argument("--interval", default="1d")
    ap.add_argument("--is-barres", type=int, default=365)
    ap.add_argument("--oos-barres", type=int, default=91)
    ap.add_argument("--capital", type=float, default=1000.0)
    ap.add_argument("--fixe", type=int, default=None,
                    help="ne rien optimiser : appliquer CE parametre partout. "
                         "Separe « la strategie ne marche pas » de "
                         "« optimiser son parametre ne transfere pas ».")
    args = ap.parse_args()

    nom_param, valeurs, cls = BALAYAGES[args.strategie]
    limits = RiskLimits(max_stop_distance_bps=Decimal("5000"))
    bars = load_from_file(
        f"data/{args.actif}_{args.interval}_real.json", args.actif, args.interval)
    par_an = 365.0 if args.interval == "1d" else 365.0 * 6

    print(f"\n  WALK-FORWARD — {args.strategie} · {args.actif} {args.interval}")
    print(f"  IS {args.is_barres} barres, OOS {args.oos_barres} barres "
          f"(ratio {args.is_barres / args.oos_barres:.1f}:1)")
    print("  " + "-" * 62)
    print(f"  {'passe':>5}{'  ' + nom_param + ' retenu':<20}{'IS %/an':>11}{'OOS %/an':>11}")
    print("  " + "-" * 62)

    total_is = total_oos = 0.0
    passes = 0
    debut = 0
    while debut + args.is_barres + args.oos_barres <= len(bars):
        fenetre_is = bars[debut:debut + args.is_barres]
        fenetre_oos = bars[debut + args.is_barres:
                           debut + args.is_barres + args.oos_barres]

        # 1. Optimisation IN-SAMPLE : on retient le meilleur parametre.
        #    Avec `--fixe`, on ne choisit rien : le parametre documente est
        #    applique tel quel, et l'IS ne sert plus qu'a mesurer sa reference.
        if args.fixe is not None:
            meilleur = args.fixe
            meilleur_net = float(run_backtest(
                fenetre_is, cls(**{nom_param: meilleur}), limits=limits,
                interval=args.interval,
                initial_equity_usd=Decimal(str(args.capital))).net_pnl_usd)
        else:
            meilleur, meilleur_net = valeurs[0], None
            for v in valeurs:
                r = run_backtest(fenetre_is, cls(**{nom_param: v}), limits=limits,
                                 interval=args.interval,
                                 initial_equity_usd=Decimal(str(args.capital)))
                net = float(r.net_pnl_usd)
                if meilleur_net is None or net > meilleur_net:
                    meilleur, meilleur_net = v, net

        # 2. Application stricte HORS ECHANTILLON, sans rien rejuger.
        r_oos = run_backtest(fenetre_oos, cls(**{nom_param: meilleur}),
                             limits=limits, interval=args.interval,
                             initial_equity_usd=Decimal(str(args.capital)))

        a_is = rendement_annualise(meilleur_net or 0.0, args.capital,
                                   len(fenetre_is), par_an)
        a_oos = rendement_annualise(float(r_oos.net_pnl_usd), args.capital,
                                    len(fenetre_oos), par_an)
        total_is += a_is
        total_oos += a_oos
        passes += 1
        print(f"  {passes:>5}{'  ' + str(meilleur):<20}{a_is:>+11.1f}{a_oos:>+11.1f}")

        debut += args.oos_barres

    print("  " + "-" * 62)
    if not passes or total_is <= 0:
        print("  Rendement IS nul ou negatif : le WFE n'a pas de sens ici.\n")
        return 1

    moy_is, moy_oos = total_is / passes, total_oos / passes
    wfe = 100.0 * moy_oos / moy_is
    print(f"  {passes} passes · IS moyen {moy_is:+.1f} %/an · "
          f"OOS moyen {moy_oos:+.1f} %/an")
    print(f"  WFE = {wfe:.1f} %")
    print("  " + "-" * 62)
    # Le verdict depend de ce qu'on a fait de l'IS. Avec un parametre fixe,
    # rien n'a ete optimise : un WFE bas ne diagnostique alors PAS un
    # sur-ajustement, seulement que la fenetre suivante a moins bien rendu que
    # la precedente. Confondre les deux ferait accuser de sur-optimisation une
    # strategie qui n'a rien optimise du tout.
    if args.fixe is not None:
        print(f"  Parametre FIXE ({args.fixe}) : rien n'a ete optimise.")
        print("  Le WFE mesure ici la degradation d'une fenetre a l'autre,")
        print("  pas un sur-ajustement — le critere des 50 % ne s'applique pas.")
    elif wfe >= 50:
        print("  ROBUSTE. Le parametre choisi sur le passe tient devant.")
    else:
        print("  SUR-OPTIMISE. Le critere du document rejette a WFE < 50 % :")
        print("  ce qui a marche sur la fenetre d'optimisation ne se transpose pas.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
