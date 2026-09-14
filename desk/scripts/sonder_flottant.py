#!/usr/bin/env python3
"""Troisième sonde : le flottant existe-t-il quelque part ?

    python3 scripts/sonder_flottant.py

Le pré-enregistrement stratifie par part du flottant libérée. Les deux
premières sondes ont établi que ni Yahoo ni le calendrier Nasdaq ne donnent
le nombre d'actions en circulation — donc pas la part bloquée.

Il reste une piste : la SEC publie les données XBRL de chaque déclarant,
dont `EntityCommonStockSharesOutstanding`, le nombre d'actions en
circulation déclaré en page de garde. Si elle répond pour des sociétés
introduites récemment, la mesure de taille est reconstituable :

    part bloquée = (actions en circulation − actions offertes) / actions offertes

## Ce que cette sonde vérifie, et pourquoi chaque point compte

**La jointure ticker → CIK.** Le calendrier Nasdaq donne un symbole, la SEC
travaille en CIK. Une jointure qui échoue sur la moitié des titres réduirait
l'échantillon sans qu'on sache lesquels sont perdus — et les perdus ne
seraient pas au hasard.

**La disponibilité pour les sociétés RÉCENTES.** Une société introduite il y
a huit mois n'a déposé qu'un ou deux rapports. Si le XBRL n'arrive qu'avec
le premier 10-K, les IPO les plus récentes seront absentes, et ce sont
justement celles dont le lockup vient d'expirer.

**La date de la valeur.** Un nombre d'actions déclaré deux ans après
l'introduction ne dit pas ce qu'il était à l'expiration du lockup. Il faut
la valeur la plus proche de l'événement, pas la dernière connue.

**Les SPAC.** Leur lockup obéit à une autre mécanique et le
pré-enregistrement les exclut. Elles se reconnaissent à deux marques :
un prix d'introduction de 10,00 $ exactement, et un nom en « Acquisition ».
Cette sonde compte combien il y en a, pour savoir ce que l'exclusion coûte.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

AGENT = "desk-research/1.0"


def _get(url: str):
    req = urllib.request.Request(url, headers={
        "User-Agent": AGENT, "Accept": "application/json, */*"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main() -> int:
    print("\n  SONDE — le flottant est-il reconstituable ?")
    print("  " + "=" * 74)

    print("\n  1. Un mois d'introductions, et la part de SPAC")
    print("  " + "-" * 72)
    lignes = []
    for annee, mois in ((2024, 3), (2024, 9), (2025, 3)):
        try:
            d = _get(f"https://api.nasdaq.com/api/ipo/calendar"
                     f"?date={annee}-{mois:02d}")["data"]
            lignes += (d.get("priced") or {}).get("rows") or []
        except Exception as exc:
            print(f"    {annee}-{mois:02d} ÉCHEC — {exc}")
    spac_prix = [x for x in lignes if x.get("proposedSharePrice") == "10.00"]
    spac_nom = [x for x in lignes if "acquisition" in x["companyName"].lower()]
    ensemble = {x["dealID"] for x in spac_prix} | {x["dealID"] for x in spac_nom}
    print(f"    {len(lignes)} introductions sur trois mois")
    print(f"    prix exactement 10,00 $  : {len(spac_prix)}")
    print(f"    nom en « Acquisition »   : {len(spac_nom)}")
    print(f"    l'un OU l'autre          : {len(ensemble)} "
          f"({len(ensemble)/max(len(lignes),1):.0%} de l'échantillon)")
    ordinaires = [x for x in lignes if x["dealID"] not in ensemble]
    print(f"    restent                  : {len(ordinaires)} introductions "
          f"ordinaires")

    print("\n  2. La jointure symbole → CIK")
    print("  " + "-" * 72)
    try:
        table = _get("https://www.sec.gov/files/company_tickers.json")
        par_ticker = {v["ticker"]: v["cik_str"] for v in table.values()}
        print(f"    {len(par_ticker)} symboles dans la table SEC")
    except Exception as exc:
        print(f"    ÉCHEC — {exc}")
        return 1
    trouves = [x for x in ordinaires
               if x["proposedTickerSymbol"] in par_ticker]
    print(f"    {len(trouves)}/{len(ordinaires)} symboles retrouvés "
          f"({len(trouves)/max(len(ordinaires),1):.0%})")
    manquants = [x["proposedTickerSymbol"] for x in ordinaires
                 if x["proposedTickerSymbol"] not in par_ticker][:8]
    if manquants:
        print(f"    absents (radiés ou renommés ?) : {', '.join(manquants)}")

    print("\n  3. Les actions en circulation, chez la SEC")
    print("  " + "-" * 72)
    ok = 0
    for x in trouves[:6]:
        t, cik = x["proposedTickerSymbol"], par_ticker[x["proposedTickerSymbol"]]
        try:
            d = _get(f"https://data.sec.gov/api/xbrl/companyconcept/"
                     f"CIK{cik:010d}/dei/EntityCommonStockSharesOutstanding.json")
            pts = d["units"]["shares"]
            dates = sorted({(p.get("end") or p.get("frame") or "?", p["val"])
                            for p in pts})
            offert = int(x["sharesOffered"].replace(",", ""))
            recent = dates[-1]
            part = (recent[1] - offert) / offert if offert else 0
            print(f"    {t:<6} IPO {x['pricedDate']:<10} "
                  f"offertes {offert:>12,}  en circulation {recent[1]:>13,} "
                  f"({recent[0]})")
            print(f"           → bloqué / flottant = {part:>6.1f}×  "
                  f"sur {len(dates)} déclarations, la 1re en {dates[0][0]}")
            ok += 1
        except urllib.error.HTTPError as exc:
            print(f"    {t:<6} HTTP {exc.code} — pas de XBRL")
        except Exception as exc:
            print(f"    {t:<6} ÉCHEC — {type(exc).__name__} : {exc}")
    print(f"\n    {ok}/6 exploitables")

    print("\n  " + "=" * 74)
    print("  Ce que je cherche :")
    print("    · le taux de jointure symbole → CIK ;")
    print("    · si le XBRL existe pour des IPO de moins d'un an ;")
    print("    · la DATE de la première déclaration — avant ou après")
    print("      l'expiration du lockup à J+180 ?\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
