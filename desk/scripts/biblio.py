#!/usr/bin/env python3
"""Peuple, liste et échange la bibliothèque de tickets.

Trois usages :

    python scripts/biblio.py --peupler          depuis le registre de l'atelier
    python scripts/biblio.py --lister           les cartes, colonnes du briefing
    python scripts/biblio.py --exporter x.jsonl pour un autre desk
    python scripts/biblio.py --importer x.jsonl depuis un autre desk

L'import FORCE `origine="externe"`. C'est la ligne qui empêche l'échange de
casser la statistique des deux côtés : un ticket importé ne doit jamais
rejoindre le dénominateur des idées du desk.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "src"))

from trading_desk import atelier, biblio, transversal  # noqa: E402


def peupler(auteur: str) -> int:
    essais = atelier.lire()
    lignes = atelier.dernier_par_signature(essais)
    connus = {t.empreinte() for t in biblio.lire()}
    n = 0
    for e in lignes:
        t = biblio.ticket_depuis_essai(e, auteur=auteur)
        if t.empreinte() in connus:
            continue
        biblio.inscrire(t)
        connus.add(t.empreinte())
        n += 1
    print(f"\n  {n} ticket(s) ajouté(s) · {len(biblio.lire())} au total\n")
    return 0


def lister() -> int:
    essais = atelier.lire()
    par_sig = {e["signature"]: e for e in atelier.dernier_par_signature(essais)}
    tickets = biblio.lire()
    if not tickets:
        print("\n  Bibliothèque vide. `--peupler` d'abord.\n")
        return 1

    # Un seul jugement par ligne : la tenue d'une recette a besoin des verdicts
    # de TOUTES ses cellules, pas seulement de celle qu'on regarde.
    lignes = list(par_sig.values())
    verdicts = {str(x.get("signature")): atelier.juger(x, essais=essais).etat
                for x in lignes}
    tenues: dict[str, object] = {}

    cartes = []
    for t in tickets:
        e = next((x for x in lignes
                  if x.get("strategie") == t.strategie
                  and x.get("actif") == t.actif
                  and x.get("intervalle") == t.intervalle
                  and x.get("parametres") == t.parametres), None)
        if e is None:
            continue
        cle = (f"{t.strategie}:{t.intervalle}:"
               f"{json.dumps(t.parametres, sort_keys=True)}")
        if cle not in tenues:
            tenues[cle] = transversal.tenue(
                lignes, strategie=t.strategie, parametres=t.parametres,
                intervalle=t.intervalle, verdicts=verdicts)
        cartes.append(biblio.carte(
            t, e, verdicts.get(str(e.get("signature")), "INCOMPLETE"),
            tenue=tenues[cle]))

    ordre = {r: i for i, r in enumerate(reversed(biblio.RARETES))}
    cartes.sort(key=lambda c: (ordre.get(c["rarete"], 9),
                               -(c.get("note") or 0)))

    print(f"\n  {len(cartes)} carte(s)\n")
    print(f"  {'stratégie':<20}{'act':<5}{'TF':<5}{'note':>6}{'rareté':>13}"
          f"{'%/an':>8}{'vs B&H':>9}{'trades':>8}{'relief':>8}  provenance")
    print("  " + "-" * 100)
    for c in cartes:
        note = f"{c['note']:.1f}" if c.get("note") is not None else "—"
        an = f"{c['annualise_pct']:+.1f}" if c.get("annualise_pct") is not None else "—"
        vs = f"{c['vs_buy_hold']:+.1f}" if c.get("vs_buy_hold") is not None else "—"
        rel = f"{c['relief']:.0%}" if c.get("relief") is not None else "—"
        print(f"  {c['strategie'][:19]:<20}{c['actif']:<5}{c['intervalle']:<5}"
              f"{note:>6}{c['rarete']:>13}{an:>8}{vs:>9}{c['trades'] or 0:>8}"
              f"{rel:>8}  {c['origine']}")
    print()
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--peupler", action="store_true")
    p.add_argument("--lister", action="store_true")
    p.add_argument("--auteur", default="jojo")
    p.add_argument("--exporter", type=Path)
    p.add_argument("--importer", type=Path)
    a = p.parse_args()

    if a.peupler:
        return peupler(a.auteur)
    if a.exporter:
        tickets = biblio.lire()
        a.exporter.write_text(
            "".join(json.dumps(t.en_dict(), ensure_ascii=False) + "\n"
                    for t in tickets), encoding="utf-8")
        print(f"\n  {len(tickets)} ticket(s) → {a.exporter}\n")
        return 0
    if a.importer:
        entrants = [biblio.Ticket.de_dict(json.loads(l))
                    for l in a.importer.read_text(encoding="utf-8").splitlines()
                    if l.strip()]
        n, d = biblio.importer(entrants)
        print(f"\n  {n} importé(s), {d} doublon(s) ignoré(s).")
        print(f"  Origine forcée à « externe » : ils ont leur propre "
              f"dénominateur.\n")
        return 0
    return lister()


if __name__ == "__main__":
    raise SystemExit(main())
