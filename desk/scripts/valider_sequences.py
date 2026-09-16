#!/usr/bin/env python3
"""La mesure des sequences d'evenements — ecrite APRES la declaration.

Le vocabulaire, la longueur, la fenetre, l'horizon, le plancher d'occurrences
et le nombre de tirages sont figes dans
`src/trading_desk/sentinelle/vocabulaire_evenements.py`, commite SEUL avant
que ce fichier n'existe. L'historique git en fait foi. Ce script ne choisit
rien : il applique.

────────────────────────────────────────────────────────────────────────────
  CE QUE MESURE CE SCRIPT
────────────────────────────────────────────────────────────────────────────

Pour chaque sequence declaree, sur l'univers des 234 perpetuels sans biais du
survivant : le rendement moyen a HORIZON_J jours apres le dernier evenement de
la sequence, en points de base, compare a un modele nul PAR BLOC.

**Le nul est par bloc, et c'est le point.** Un tirage independant par
evenement casserait la structure calendaire : les evenements se produisent en
grappes — un jour de panique en declenche cent a la fois — et un nul qui
ignore cette dependance sous-estime la variance, donc surestime la
significativite. C'est exactement ce qui avait fait survivre l'etude des
cotations avant correction, ou p passait de significatif a 0,164.

Le decalage est donc COMMUN a tous les evenements d'un tirage, applique
circulairement sur la serie de chaque actif. Circulairement parce qu'un
decalage lineaire ferait sortir de la serie les evenements tardifs, ce qui
selectionnerait silencieusement les evenements precoces.

**Le p est bilateral.** Aucune direction n'a ete declaree : une sequence peut
predire la hausse comme la baisse, et n'en privilegier une qu'apres avoir vu
le signe doublerait sournoisement le nombre d'hypotheses.

────────────────────────────────────────────────────────────────────────────
  CE QUE LE SCRIPT VERIFIE AVANT DE CONCLURE
────────────────────────────────────────────────────────────────────────────

Deux controles, et aucun n'est optionnel :

1. **Le decalage effectif ne doit pas etre nul.** Un decalage circulaire
   congru a zero modulo la longueur d'une serie remet les evenements a leur
   place : ce tirage-la ne controle rien. On mesure la distribution des
   decalages effectifs et on la publie.

2. **Le criblage doit pouvoir voir.** Le plancher de p vaut 1/(tirages+1) ;
   s'il depasse le seuil de Benjamini-Hochberg au rang 1, aucune cellule ne
   peut survivre quelle que soit la donnee.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "src"))

from trading_desk.sentinelle import vocabulaire_evenements as voc  # noqa: E402

JOUR_MS = 86_400_000


# ───────────────────────────────────────────────────── les detecteurs

def mediane(xs: list[float]) -> float:
    if not xs:
        return 0.0
    v = sorted(xs)
    n = len(v)
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2


def detecter(bougies: list[dict]) -> list[set[str]]:
    """Pour chaque jour, l'ensemble des types d'evenements qui s'y produisent.

    **Chaque condition ne regarde que la bougie courante et les precedentes.**
    Une condition qui regarderait une bougie future se validerait toute seule ;
    c'est l'erreur qui ne se voit pas dans les chiffres, seulement dans le
    code.
    """
    n = len(bougies)
    out: list[set[str]] = [set() for _ in range(n)]
    p = {e.cle: e.parametres for e in voc.EVENEMENTS}

    hauts = [b["h"] for b in bougies]
    bas = [b["l"] for b in bougies]
    clot = [b["c"] for b in bougies]
    ouv = [b["o"] for b in bougies]
    vol = [b["v"] for b in bougies]
    ampl = [(h - l) / c if c > 0 else 0.0 for h, l, c in zip(hauts, bas, clot)]

    per_c = int(p["cassure_haute"]["periode"])
    per_v = int(p["volume_extreme"]["periode"])
    fac_v = float(p["volume_extreme"]["facteur"])
    per_a = int(p["amplitude_extreme"]["periode"])
    fac_a = float(p["amplitude_extreme"]["facteur"])
    seuil_h = float(p["ecart_haut"]["seuil"])
    seuil_b = float(p["ecart_bas"]["seuil"])
    long_s = int(p["serie_haussiere"]["longueur"])

    for i in range(n):
        e = out[i]
        if i >= per_c:
            if clot[i] > max(hauts[i - per_c:i]):
                e.add("cassure_haute")
            if clot[i] < min(bas[i - per_c:i]):
                e.add("cassure_basse")
        if i >= per_v:
            med = mediane(vol[i - per_v:i])
            if med > 0 and vol[i] > fac_v * med:
                e.add("volume_extreme")
        if i >= per_a:
            med = mediane(ampl[i - per_a:i])
            if med > 0 and ampl[i] > fac_a * med:
                e.add("amplitude_extreme")
        if i >= 1 and clot[i - 1] > 0:
            if ouv[i] > clot[i - 1] * (1 + seuil_h):
                e.add("ecart_haut")
            if ouv[i] < clot[i - 1] * (1 - seuil_b):
                e.add("ecart_bas")
        if i >= long_s:
            fen = clot[i - long_s:i + 1]
            if all(b > a for a, b in zip(fen, fen[1:])):
                e.add("serie_haussiere")
            if all(b < a for a, b in zip(fen, fen[1:])):
                e.add("serie_baissiere")
    return out


def rendements_avant(bougies: list[dict]) -> list[float | None]:
    """Le rendement a HORIZON_J jours, en bps, ou None si intradable.

    `None` et non zero : un zero entrerait dans la moyenne comme une
    observation neutre, alors que c'est une ABSENCE d'observation. Sur un
    univers ou 32 % des cotations publient des bougies a volume nul, la
    difference deplace la moyenne.
    """
    h = voc.HORIZON_J
    n = len(bougies)
    out: list[float | None] = [None] * n
    for i in range(n - h):
        c0, c1 = bougies[i]["c"], bougies[i + h]["c"]
        if c0 <= 0 or c1 <= 0:
            continue
        if voc.VOLUME_MIN_REQUIS and any(
                bougies[j]["v"] <= 0 for j in range(i, i + h + 1)):
            continue
        out[i] = (c1 / c0 - 1.0) * 10_000.0
    return out


# ──────────────────────────────────────────────── les sequences declenchees

def declenchements(evts: list[set[str]], sequence: tuple[str, ...]) -> list[int]:
    """Les indices ou la sequence se termine.

    Pour une sequence de longueur deux, l'evenement A doit survenir entre 1 et
    FENETRE_SEQUENCE_J jours AVANT B. La borne basse est 1 : deux evenements du
    meme jour ne « se succedent » pas, et les compter comme une sequence
    confondrait la simultaneite avec l'ordre.
    """
    if len(sequence) == 1:
        return [i for i, e in enumerate(evts) if sequence[0] in e]

    a, b = sequence
    fen = voc.FENETRE_SEQUENCE_J
    out = []
    for i, e in enumerate(evts):
        if b not in e:
            continue
        if any(a in evts[j] for j in range(max(0, i - fen), i)):
            out.append(i)
    return out


def moyenne(triggers: dict[str, list[int]], fwd: dict[str, list],
            decalage: int = 0) -> tuple[float, int]:
    """La moyenne des rendements avant, eventuellement decalee circulairement.

    Rend aussi le nombre d'observations retenues : un decalage peut tomber sur
    des jours intradables, et une moyenne sur trois observations n'est pas la
    meme mesure qu'une moyenne sur trois mille.
    """
    total, compte = 0.0, 0
    for actif, idx in triggers.items():
        f = fwd[actif]
        n = len(f)
        if n == 0:
            continue
        if decalage:
            for t in idx:
                v = f[(t + decalage) % n]
                if v is not None:
                    total += v
                    compte += 1
        else:
            for t in idx:
                v = f[t]
                if v is not None:
                    total += v
                    compte += 1
    return (total / compte if compte else 0.0), compte


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cotations", default="data/cotations.json")
    ap.add_argument("--out", default="baselines/sequences.json")
    args = ap.parse_args()

    print(f"\n  Vocabulaire figé le {voc.FIGE_LE}, version {voc.VERSION}, "
          f"empreinte {voc.empreinte()}")
    print(f"  {len(voc.EVENEMENTS)} types · longueur max {voc.LONGUEUR_MAX} · "
          f"{voc.DENOMINATEUR_DECLARE} séquences déclarées")
    print(f"  horizon J+{voc.HORIZON_J} · fenêtre {voc.FENETRE_SEQUENCE_J} j · "
          f"plancher {voc.OCCURRENCES_MIN} occurrences\n")

    brut = json.loads((RACINE / args.cotations).read_text())
    actifs = brut["actifs"]

    print("  Détection des événements…")
    t0 = time.time()
    evts: dict[str, list[set[str]]] = {}
    fwd: dict[str, list] = {}
    for nom, a in actifs.items():
        b = a.get("bougies") or []
        if len(b) < voc.HISTORIQUE_MIN_J:
            continue
        evts[nom] = detecter(b)
        fwd[nom] = rendements_avant(b)
    delistes = sum(1 for n in evts if actifs[n].get("delisté"))
    print(f"    {len(evts)} actifs retenus sur {len(actifs)} "
          f"({time.time()-t0:.1f} s)")
    print(f"    écartés : moins de {voc.HISTORIQUE_MIN_J} bougies — c'est ce "
          f"seuil qui fixe la plage du décalage, donc le plancher de p")
    print(f"    délistés conservés : {delistes} ({100*delistes/len(evts):.1f} %) "
          f"contre 23,9 % dans l'univers complet\n")

    # La plage du decalage. Bornee par la serie la plus courte RETENUE, pour
    # qu'un decalage commun ait un sens sur toutes.
    n_min = min(len(f) for f in fwd.values())
    plage_haute = n_min - voc.MARGE_BLOC
    if plage_haute <= voc.MARGE_BLOC:
        print(f"  REFUS : plage de décalage [{voc.MARGE_BLOC}, {plage_haute}] "
              f"vide ou dégénérée. Le nul ne pourrait pas échouer.")
        return 2
    offsets = list(range(voc.MARGE_BLOC, plage_haute + 1))
    plancher = voc.plancher_de_p(len(offsets))
    print(f"  Nul EXHAUSTIF : {len(offsets)} offsets dans "
          f"[{voc.MARGE_BLOC}, {plage_haute}] (série la plus courte : "
          f"{n_min} bougies)")
    print(f"  Plancher de p : {plancher:.5f} — fixé par la DONNÉE, pas par un "
          f"nombre de tirages")
    print(f"  Hypothèses que cette plage porte : "
          f"{voc.hypotheses_supportees(len(offsets))}\n")

    print("  Comptage des occurrences…")
    triggers: dict[tuple[str, ...], dict[str, list[int]]] = {}
    for seq in voc.sequences_declarees():
        par_actif = {}
        total = 0
        for nom, e in evts.items():
            idx = [i for i in declenchements(e, seq) if fwd[nom][i] is not None]
            if idx:
                par_actif[nom] = idx
                total += len(idx)
        if total >= voc.OCCURRENCES_MIN:
            triggers[seq] = par_actif
    print(f"    {len(triggers)} séquences au-dessus du plancher, sur "
          f"{voc.DENOMINATEUR_DECLARE} déclarées\n")

    if not triggers:
        print("  Aucune séquence testable. Rien à conclure.")
        return 1

    seuil_rang1 = 0.05 / len(triggers)
    print(f"  Dénominateur RÉEL : {len(triggers)} · seuil BH au rang 1 : "
          f"{seuil_rang1:.6f} · plancher de p : {plancher:.5f}")
    if plancher >= seuil_rang1:
        print("  REFUS : criblage aveugle, aucune cellule ne pourrait "
              "survivre quelle que soit la donnée.")
        return 2
    print()

    decalages = offsets
    # Le decalage EFFECTIF (modulo la longueur de chaque serie) ne doit pas
    # etre nul : congru a zero, il remet les evenements a leur place et ce
    # tirage-la ne controle rien. On verifie sur TOUT le produit
    # offsets x actifs, puisque le nul est exhaustif.
    effectifs = [d % len(f) for d in decalages for f in fwd.values()]
    nuls = sum(1 for x in effectifs if x == 0)
    print(f"  Contrôle du nul : {nuls} décalage(s) effectif(s) nul(s) sur "
          f"{len(effectifs)} ({100*nuls/len(effectifs):.3f} %)")
    print(f"  Décalage effectif médian : "
          f"{int(mediane([float(x) for x in effectifs]))} jours\n")

    print(f"  {len(decalages)} offsets par séquence, exhaustivement…")
    t0 = time.time()
    resultats = []
    for k, (seq, par_actif) in enumerate(sorted(triggers.items()), 1):
        obs, n_obs = moyenne(par_actif, fwd)
        battus = 0
        for d in decalages:
            nul, _ = moyenne(par_actif, fwd, d)
            if abs(nul) >= abs(obs):
                battus += 1
        p = (battus + 1) / (len(decalages) + 1)
        resultats.append({
            "sequence": list(seq), "occurrences": n_obs,
            "moyenne_bps": round(obs, 2), "p": p,
            "offsets": len(decalages),
        })
        if k % 5 == 0 or k == len(triggers):
            print(f"    {k}/{len(triggers)} ({time.time()-t0:.0f} s)")

    # Benjamini-Hochberg sur le denominateur REEL.
    from trading_desk.sentinelle.validation import benjamini_hochberg
    ps = [r["p"] for r in resultats]
    garde = benjamini_hochberg(ps, 0.05)
    for r, k in zip(resultats, garde):
        r["survit_bh"] = bool(k)

    survivants = [r for r in resultats if r["survit_bh"]]
    bruts = sum(1 for r in resultats if r["p"] < 0.05)

    print("\n  " + "=" * 74)
    print(f"  {len(resultats)} séquences testées · {bruts} à p < 0,05 · "
          f"{0.05*len(resultats):.1f} attendues par hasard · "
          f"{len(survivants)} survivante(s) après BH")
    print("  " + "=" * 74 + "\n")

    for r in sorted(resultats, key=lambda x: x["p"])[:10]:
        seq = " → ".join(r["sequence"])
        marque = "SURVIT" if r["survit_bh"] else ""
        print(f"    {seq:<44} {r['occurrences']:>6} obs  "
              f"{r['moyenne_bps']:>+9.2f} bps  p={r['p']:.4f}  {marque}")

    sortie = RACINE / args.out
    sortie.parent.mkdir(parents=True, exist_ok=True)
    sortie.write_text(json.dumps({
        "version_vocabulaire": voc.VERSION,
        "empreinte_vocabulaire": voc.empreinte(),
        "fige_le": voc.FIGE_LE,
        "mesure_ms": int(time.time() * 1000),
        "denominateur_declare": voc.DENOMINATEUR_DECLARE,
        "denominateur_reel": len(resultats),
        "actifs": len(evts),
        "plage_decalage": [voc.MARGE_BLOC, plage_haute],
        "decalages_effectifs_nuls_pct": round(100 * nuls / len(effectifs), 3),
        "offsets": len(decalages),
        "nul_exhaustif": True,
        "delistes_conserves": delistes,
        "seuil_bh_rang1": seuil_rang1,
        "plancher_p": plancher,
        "decalages_effectifs_nuls": nuls,
        "bruts": bruts,
        "attendues": 0.05 * len(resultats),
        "survivants": len(survivants),
        "cellules": sorted(resultats, key=lambda x: x["p"]),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n  → {args.out}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
