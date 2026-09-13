#!/usr/bin/env python3
"""Le rituel hebdomadaire des déblocages, en une commande.

    python3 scripts/rituel_hebdomadaire.py

Trois étapes qui allaient jusqu'ici à la main, et dont l'oubli ne se voyait
nulle part :

1. `fetch_unlocks.py`  — le calendrier des déblocages, depuis le miroir
   statique de DefiLlama ;
2. `journal_unlocks.py` — inscrire les positions dont la fenêtre s'ouvre
   dans les trente jours, dans le fichier en AJOUT SEUL ;
3. `journal_unlocks.py --resoudre` — relever le résultat des fenêtres déjà
   closes.

**Pourquoi l'ordre compte, et pourquoi on s'arrête à la première panne.**
Si le calendrier ne se télécharge pas, `data/unlocks.json` garde sa version
de la semaine dernière — et inscrire depuis un calendrier périmé produirait
des positions calculées sur des dates qui ont pu bouger. Une inscription est
définitive : le journal ne se réécrit pas. On préfère donc ne rien inscrire
et sortir en erreur, ce que le timer systemd rapporte, plutôt qu'inscrire
quelque chose d'invérifiable.

Le relevé, lui, vient en dernier : il ne dépend de rien et c'est le chiffre
qu'on veut lire en bas du journal.

**Relancer ne duplique rien.** L'inscription a pour clé d'unicité
(version, jeton, date de déblocage) : deux exécutions le même jour
n'ajoutent qu'une fois. Le script peut donc tourner aussi souvent qu'on
veut, et un rattrapage après une semaine d'arrêt est sans danger.

**Ce que ce script ne fait pas : décider.** Il n'ouvre aucune position, ne
touche pas au desk et n'écrit que dans `data/`. C'est un collecteur.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]

# Le calendrier se télécharge depuis un miroir gratuit : quelques minutes
# suffisent d'ordinaire, mais un miroir lent ne doit pas faire échouer la
# semaine. Le relevé, lui, interroge Hyperliquid une fois par position close.
DELAIS_S = {"fetch_unlocks.py": 1800, "journal_unlocks.py": 900}


class Etape:
    def __init__(self, titre: str, script: str, args: tuple[str, ...] = (),
                 *, fatale: bool = True) -> None:
        self.titre = titre
        self.script = script
        self.args = args
        # Une étape non fatale n'interrompt pas les suivantes. Le relevé est
        # dans ce cas : un jeton délisté rend une ligne incalculable, pas la
        # semaine entière ratée.
        self.fatale = fatale

    def lancer(self) -> int:
        cmd = [sys.executable, str(RACINE / "scripts" / self.script), *self.args]
        print(f"\n{'=' * 74}\n  {self.titre}\n  $ {' '.join(cmd[1:])}\n{'=' * 74}",
              flush=True)
        debut = time.time()
        try:
            code = subprocess.call(cmd, cwd=str(RACINE),
                                   timeout=DELAIS_S.get(self.script, 900))
        except subprocess.TimeoutExpired:
            print(f"  {self.titre} : délai dépassé", file=sys.stderr)
            return 124
        print(f"  — {self.titre} : code {code}, {time.time() - debut:.0f} s",
              flush=True)
        return code


def etapes(horizon: int) -> list[Etape]:
    return [
        Etape("1/3  Calendrier des déblocages", "fetch_unlocks.py"),
        Etape("2/3  Inscription des positions à venir", "journal_unlocks.py",
              ("--horizon", str(horizon))),
        Etape("3/3  Relevé des fenêtres closes", "journal_unlocks.py",
              ("--resoudre",), fatale=False),
    ]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--horizon", type=int, default=30,
                   help="jours à l'avance pour inscrire les positions")
    p.add_argument("--sans-calendrier", action="store_true",
                   help="sauter le téléchargement et travailler sur le "
                        "data/unlocks.json déjà présent. À n'utiliser que "
                        "pour rejouer une étape, jamais en routine : "
                        "inscrire depuis un calendrier périmé produit des "
                        "positions qu'on ne peut plus vérifier.")
    args = p.parse_args()

    todo = etapes(args.horizon)
    if args.sans_calendrier:
        todo = todo[1:]
        print("  ATTENTION : calendrier non rafraîchi (--sans-calendrier).")

    for etape in todo:
        code = etape.lancer()
        if code != 0 and etape.fatale:
            print(f"\n  ARRÊT : « {etape.titre} » a échoué (code {code}).\n"
                  "  Rien n'a été inscrit. Le journal est en ajout seul :\n"
                  "  mieux vaut une semaine manquante qu'une position "
                  "calculée\n  sur un calendrier périmé.\n", file=sys.stderr)
            return code

    print(f"\n{'=' * 74}\n  Rituel terminé.\n{'=' * 74}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
