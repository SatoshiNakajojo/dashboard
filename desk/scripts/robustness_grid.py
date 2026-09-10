#!/usr/bin/env python3
"""Grille de robustesse : chaque strategie, sur chaque actif, chaque intervalle.

Une strategie qui ne gagne que sur BTC en daily n'a pas d'edge : elle a eu de
la chance sur une cellule. Ce script pose la seule question qui vaille — le
signal survit-il quand on change d'actif et d'echelle de temps.

    python scripts/robustness_grid.py --draws 200

**La correction pour tests multiples n'est pas optionnelle ici.** Cinq
strategies sur sept actifs et deux intervalles font 70 tests. A 5 %, on attend
~3,5 cellules significatives par pur hasard : trouver trois ou quatre « edges »
dans cette grille est le resultat NUL, pas une decouverte. Et le compte des
hypotheses doit inclure celles deja testees dans les campagnes precedentes —
chaque strategie ajoutee augmente le nombre de tirages, donc le nombre de
faux positifs attendus. La procedure de
Benjamini-Hochberg controle le taux de fausses decouvertes plutot que de
corriger chaque test isolement — moins brutal que Bonferroni, et c'est le bon
compromis pour un criblage dont on veut ensuite verifier les survivants.

Le plafond de distance de stop est volontairement large et IDENTIQUE partout.
Un plafond serre rejette davantage les actifs volatils que BTC, et cette
inegalite de traitement fabriquerait un classement entre actifs qui ne
mesurerait que leur volatilite. Il est fixe a 5000 bps, le maximum que le
contrat `StopBand` autorise ; la colonne « rejets » dit ce qu'il en reste,
et c'est elle qu'il faut lire avant le PnL.
"""

from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.backtest.data import DataUnavailable, load_from_file
from trading_desk.backtest.engine import run_backtest
from trading_desk.backtest.null_model import randomization_test
from trading_desk.backtest.strategies import (
    BASELINES,
    PLAFOND_STOP_CAMPAGNE_BPS,
    parametres,
)
from trading_desk.risk import RiskLimits
from trading_desk.sentinelle.validation import benjamini_hochberg

ASSETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX"]
INTERVALS = ["1d", "4h"]

def ecrire(chemin: Path, cellules: list[dict]) -> None:
    """Ecrire apres CHAQUE cellule, jamais seulement a la fin.

    Une campagne a 20 000 tirages tient des heures. Avec une unique
    ecriture finale, une machine qui se recycle en cours de route ne laisse
    rien : ni les cellules deja payees, ni la trace de ou ca s'est arrete.
    Le fichier partiel, lui, se relit tel quel via --from-json.
    """
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(json.dumps(cellules, indent=1), encoding="utf-8")


def rendre_verdict(cellules: list[dict], alpha: float = 0.05) -> str:
    """La grille, lue comme un criblage — pas comme 56 resultats separes.

    Deux lectures, et la seconde compte autant que la premiere : combien de
    cellules battent le hasard, et combien on en attendait sans aucun signal.
    Sans ce second chiffre, trois cellules a p < 0,05 sur 56 se lisent comme
    une decouverte alors que c'est le resultat nul.
    """
    testees = [c for c in cellules if c["p"] is not None]
    if not testees:
        return "\n  Aucune cellule exploitable.\n"

    ps = [c["p"] for c in testees]
    garde = benjamini_hochberg(ps, alpha)
    survivants = [c for c, k in zip(testees, garde, strict=True) if k]
    bruts = [c for c in testees if c["p"] < alpha]
    pires = [c for c in testees if c["p"] > 1 - alpha]

    # Le plancher de p vaut 1/(tirages+1) : aucun test ne peut descendre
    # sous cette valeur, quelle que soit la force du signal. Si le plancher
    # est AU-DESSUS du seuil de Benjamini-Hochberg au rang 1, le criblage
    # ne peut rejeter aucune hypothese et son « zero survivant » ne dit
    # rien sur les strategies. S'il est juste EGAL au seuil, un survivant
    # unique survit par saturation du test, pas par force mesuree. Les deux
    # cas se lisent pareil dans un tableau qui ne les affiche pas.
    plancher = max(1.0 / (c.get("tirages", 0) + 1) for c in testees)
    seuil1 = alpha / len(testees)

    lignes = [
        "",
        "  VERDICT DE LA GRILLE",
        "  " + "─" * 68,
        f"  cellules testees                          {len(testees):>4}",
        f"  p < {alpha} brut                             {len(bruts):>4}",
        f"  attendues par pur hasard a {alpha:.0%}          {alpha * len(testees):>6.1f}",
        f"  survivantes apres Benjamini-Hochberg      {len(survivants):>4}",
        "  " + "─" * 68,
        f"  plancher de p (le moins resolu)        {plancher:>9.6f}",
        f"  seuil Benjamini-Hochberg au rang 1     {seuil1:>9.6f}",
    ]
    if plancher > seuil1:
        lignes += [
            "  Le plancher est AU-DESSUS du seuil : a ce nombre de tirages le",
            "  criblage ne PEUT rejeter aucune hypothese. Un zero survivant ne",
            "  mesure ici que la resolution du test. Augmenter --draws.",
        ]
    lignes.append("  " + "─" * 68)

    if survivants:
        lignes.append("  Ce qui survit au controle du taux de fausses decouvertes :")
        for c in sorted(survivants, key=lambda x: x["p"]):
            sature = c["p"] <= 1.0 / (c.get("tirages", 0) + 1) + 1e-12
            lignes.append(
                f"    {c['strategie']:<17}{c['actif']:<6}{c['intervalle']:<4}"
                f"net {c['net_usd']:>+9.2f}  {c['trades']:>4} trades  "
                f"p {c['p']:.5f}  ({c.get('tirages', 0)} tirages)"
                + ("  <- AU PLANCHER : p non mesure, relancer plus haut"
                   if sature else ""))
    else:
        lignes += [
            f"  AUCUNE. Les {len(bruts)} cellule(s) a p < {alpha} sont compatibles avec",
            f"  le bruit de {len(testees)} tests simultanes : aucune strategie ne montre",
            "  d'edge qui survive au changement d'actif et d'echelle de temps.",
        ]

    if pires:
        lignes += ["", f"  Significativement PIRES que le hasard : {len(pires)} cellules"]
        compte: dict[str, int] = {}
        for c in pires:
            compte[c["strategie"]] = compte.get(c["strategie"], 0) + 1
        for nom, n in sorted(compte.items(), key=lambda x: -x[1]):
            lignes.append(f"    {nom:<17} {n:>2} cellules")
        lignes.append("  Un signal constant dans CE sens est un resultat, pas du bruit.")

    lignes += ["  " + "─" * 68, ""]
    return "\n".join(lignes)


def main() -> int:
    p = argparse.ArgumentParser(description="Grille de robustesse multi-actifs")
    p.add_argument("--draws", type=int, default=200,
                   help="tirages du modele nul par cellule")
    p.add_argument("--equity", type=float, default=1000.0)
    p.add_argument("--max-stop-bps", type=float,
                   default=float(PLAFOND_STOP_CAMPAGNE_BPS),
                   help="identique partout. 5000 est le maximum autorise par "
                        "le contrat StopBand ; au-dela d'un stop a 50 %% le "
                        "dimensionnement par le risque n'a plus de sens.")
    p.add_argument("--out", default="baselines/grille.json")
    p.add_argument("--from-json", nargs="+", default=None,
                   help="relire une ou plusieurs grilles deja calculees et "
                        "n'en refaire que la lecture, sans repasser des "
                        "heures de tirages. Plusieurs fichiers sont FUSIONNES "
                        "avant la correction de Benjamini-Hochberg : c'est "
                        "l'usage important. Ajouter une strategie et corriger "
                        "sa grille toute seule sous-estimerait le nombre "
                        "d'hypotheses testees, donc le nombre de faux "
                        "positifs attendus. En cas de doublon, c'est la "
                        "PREMIERE occurrence qui est gardee : passer la "
                        "grille la plus finement tiree EN PREMIER.")
    p.add_argument("--strategies", nargs="+", default=None,
                   help="ne calculer que ces strategies. Sert a mesurer une "
                        "strategie ajoutee sans relancer des heures de "
                        "tirages pour les autres — le resultat doit ensuite "
                        "etre relu FUSIONNE, via --from-json.")
    p.add_argument("--assets", nargs="+", default=None,
                   help="ne calculer que ces actifs. Meme usage que "
                        "--strategies : raffiner UNE cellule a fort nombre "
                        "de tirages sans repayer les 83 autres, puis relire "
                        "le tout FUSIONNE via --from-json.")
    p.add_argument("--intervals", nargs="+", default=None,
                   help="ne calculer que ces intervalles. Voir --assets.")
    args = p.parse_args()

    if args.from_json:
        cellules = []
        vues = set()
        for chemin in args.from_json:
            for c in json.loads(Path(chemin).read_text()):
                cle = (c["actif"], c["intervalle"], c["strategie"])
                if cle in vues:
                    print(f"  cellule en double, ignoree : {cle}", file=sys.stderr)
                    continue
                vues.add(cle)
                cellules.append(c)
        print(f"\n  {len(cellules)} cellules relues depuis "
              f"{len(args.from_json)} fichier(s).")
        print(rendre_verdict(cellules))
        return 0

    limits = RiskLimits(max_stop_distance_bps=Decimal(str(args.max_stop_bps)))
    cellules = []

    for interval in INTERVALS:
        if args.intervals and interval not in args.intervals:
            continue
        for asset in ASSETS:
            if args.assets and asset not in args.assets:
                continue
            chemin = f"data/{asset}_{interval}_real.json"
            try:
                bars = load_from_file(chemin, asset, interval)
            except (DataUnavailable, FileNotFoundError) as exc:
                print(f"  {asset} {interval} : {exc}", file=sys.stderr)
                continue

            for nom, cls in BASELINES.items():
                if args.strategies and nom not in args.strategies:
                    continue
                kw = parametres(nom, interval)
                obs = run_backtest(
                    bars, cls(**kw), limits=limits, interval=interval,
                    initial_equity_usd=Decimal(str(args.equity)))
                cell = {
                    "actif": asset, "intervalle": interval, "strategie": nom,
                    "net_usd": float(obs.net_pnl_usd),
                    "trades": len(obs.trades),
                    "rejets": obs.rejected_by_risk,
                    "p": None, "percentile": None, "hasard_moyen": None,
                    # Le nombre de tirages fixe le PLANCHER de p a 1/(D+1).
                    # Sans lui dans le fichier, un lecteur ne peut pas savoir
                    # si un « zero survivant » vient de la donnee ou de la
                    # resolution du test : avec 200 tirages, le plancher vaut
                    # 0,005 quand Benjamini-Hochberg exige 0,0009 au rang 1
                    # sur 56 cellules. Le criblage etait alors aveugle, et
                    # rien dans le fichier ne le disait.
                    "tirages": args.draws,
                }
                if obs.trades and args.draws > 0:
                    nul = randomization_test(
                        bars, cls(**kw), obs, draws=args.draws, limits=limits,
                        interval=interval,
                        initial_equity_usd=Decimal(str(args.equity)))
                    cell["p"] = float(nul.p_value)
                    cell["percentile"] = float(nul.percentile)
                    cell["hasard_moyen"] = float(nul.null_mean_usd)
                cellules.append(cell)
                ecrire(Path(args.out), cellules)
                pp = "  n/a" if cell["p"] is None else f"{cell['p']:.3f}"
                print(f"  {asset:<5} {interval:<3} {nom:<16} "
                      f"net {cell['net_usd']:>+9.2f}  "
                      f"trades {cell['trades']:>4}  rejets {cell['rejets']:>5}  "
                      f"p {pp}", flush=True)

    ecrire(Path(args.out), cellules)
    print(rendre_verdict(cellules))
    print(f"  {len(cellules)} cellules -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
