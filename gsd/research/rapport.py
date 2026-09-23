#!/usr/bin/env python3
"""
Rend le verdict de la campagne, avec les chiffres que le tableau brut ne donne
pas : l'impact sur l'équité au dimensionnement réellement en vigueur, et le
taux de réussite d'équilibre imposé par le rapport cible/stop.

    python3 research/rapport.py --resultats research/resultats.json
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys

RR = 1.5
RISK_PCT = 0.01  # GSD_RISK_PCT


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--resultats", required=True)
    args = ap.parse_args()
    with open(args.resultats, encoding="utf-8") as f:
        r = json.load(f)

    cells = r["cellules"]
    eq = 1 / (1 + RR)  # taux de réussite d'équilibre avant frais

    print("=" * 78)
    print("CAMPAGNE GSD — Donchian 20 · Supertrend 10×3")
    print(f"générée {r['genere']} · graine {r['graine']} · {r['tirages']} tirages")
    print("=" * 78)
    print()
    print(f"Taux de réussite d'équilibre imposé par le rapport 1,5 R : {eq*100:.1f} %")
    print("Sous ce taux, la stratégie perd — quelle que soit la qualité du signal.")
    print()

    par_groupe = {}
    for c in cells:
        par_groupe.setdefault(c["groupe"], []).append(c)

    for groupe in ("in", "hors"):
        cs = par_groupe.get(groupe, [])
        if not cs:
            continue
        titre = "IN-SAMPLE (les 10 actifs du bot)" if groupe == "in" else "HORS ÉCHANTILLON (10 perps jamais réglés)"
        print("-" * 78)
        print(titre)
        print("-" * 78)
        print(f"{'cellule':<12} {'trades':>6} {'R moyen':>9} {'R total':>8} "
              f"{'équité':>8} {'réussite':>9} {'p':>8} {'seuil BH':>9}")
        for c in sorted(cs, key=lambda x: x["p_nul"]):
            eqpct = c["R_total"] * RISK_PCT * 100
            marque = " ***" if c.get("survivante") else (" *" if c["p_nul"] <= 0.05 else "")
            print(f"{c['cellule']:<12} {c['trades']:>6} {c['R_moyen']:>+9.4f} {c['R_total']:>+8.1f} "
                  f"{eqpct:>+7.1f}% {c['taux_reussite']*100:>8.1f}% {c['p_nul']:>8.5f} "
                  f"{c.get('seuil_bh', float('nan')):>9.5f}{marque}")
        rs = [c["R_moyen"] for c in cs]
        pos = sum(1 for x in rs if x > 0)
        tr = [c["taux_reussite"] for c in cs]
        print()
        print(f"  {len(cs)} cellules · {pos} à R moyen positif · "
              f"R moyen médian {statistics.median(rs):+.4f} · "
              f"réussite médiane {statistics.median(tr)*100:.1f} % (équilibre {eq*100:.1f} %)")
        print(f"  R total cumulé {sum(c['R_total'] for c in cs):+.1f} "
              f"→ {sum(c['R_total'] for c in cs) * RISK_PCT * 100:+.1f} % d'équité à 1 % de risque par trade")
        print()

    # ---- coûts ----
    print("-" * 78)
    print("DÉCOMPOSITION DES COÛTS")
    print("-" * 78)
    tot_tr = sum(c["trades"] for c in cells)
    frais = sum(c["frais_pct"] for c in cells)
    fin = sum(c["financement_pct"] for c in cells)
    print(f"  {tot_tr} trades sur {len(cells)} cellules")
    print(f"  frais payés        {frais:>8.2f} % de notionnel cumulé  "
          f"({r['frais_bps_aller']:.1f} bps à l'aller et au retour)")
    print(f"  financement        {fin:>+8.2f} % de notionnel cumulé")
    print(f"  nul, R moyen       {statistics.fmean(c['nul_R_moyen'] for c in cells):>+8.4f}  "
          "← le nul paie les mêmes frais")
    print()

    # ---- verdict ----
    v = r.get("verdict", {})
    print("=" * 78)
    print("VERDICT")
    print("=" * 78)
    if v:
        print(f"  cellules testées              {v['cellules_testees']}")
        print(f"  p brut ≤ 0,05                 {v['p_brut_sous_0.05']}")
        print(f"  attendu par pur hasard        {v['attendu_par_hasard']:.1f}")
        print(f"  survivantes après BH          {len(v['survivantes_bh'])}"
              f"{'  → ' + ', '.join(v['survivantes_bh']) if v['survivantes_bh'] else ''}")
        print()
        print(f"  plancher de p                 {v['plancher_p']:.6f}")
        print(f"  seuil BH au rang 1            {v['seuil_bh_rang_1']:.6f}")
        print(f"  le criblage POUVAIT rejeter   {'oui' if v['plancher_sous_le_seuil'] else 'NON — il ne mesure que sa résolution'}")
    print()

    corr = r.get("correlation", {})
    if corr:
        print("-" * 78)
        print("CE QUE LE NOMBRE DE CELLULES NE DIT PAS")
        print("-" * 78)
        for nom in ("in", "hors"):
            if nom in corr:
                d = corr[nom]
                print(f"  {nom:<5} n={d['n']:>2} · ρ moyen {d['rho_moyen']:+.3f} · n effectif {d['n_effectif']:.2f}")
        if "cellules" in corr:
            d = corr["cellules"]
            print(f"  {d['comptees']} cellules comptées → n effectif {d['n_effectif_si_meme_rho']:.2f}")
            print("  C'est ce dernier chiffre qui décide. Le nombre de cellules flatte l'œil ;")
            print("  la corrélation décide.")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
