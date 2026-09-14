"""Quelle version du desk tourne, ici, maintenant.

Ce module existe a cause d'une ambiguite qui a coute plusieurs allers-retours :
un defaut etait corrige, fusionne, teste — et il persistait chez l'operateur.
Impossible de trancher entre « la correction est mauvaise » et « le code
corrige ne tourne pas », parce que rien, nulle part, ne disait quelle version
etait en memoire.

Un processus Python charge son code AU DEMARRAGE. Un `git pull` ne change
donc rien a un desk deja lance, meme en installation editable. C'est
exactement le genre d'ecart qu'on ne soupconne pas, parce que le fichier sur
le disque est bien a jour — on l'a verifie.

La reponse est lue une seule fois, au demarrage, et affichee dans la barre :
elle repond a la question avant qu'on ait a la poser.
"""

from __future__ import annotations

import subprocess
from functools import lru_cache
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent


@lru_cache(maxsize=1)
def version() -> str:
    """Le commit court, suivi de `+modifie` si l'arbre est sale.

    Rend « inconnue » plutot que de lever : une supervision qui refuse de
    demarrer parce qu'elle n'a pas su lire un numero de version serait un
    comble.
    """
    def git(*args: str) -> str | None:
        try:
            r = subprocess.run(("git", "-C", str(RACINE)) + args,
                               capture_output=True, text=True, timeout=5)
            return r.stdout.strip() if r.returncode == 0 else None
        except (OSError, subprocess.SubprocessError):
            return None

    commit = git("rev-parse", "--short", "HEAD")
    if not commit:
        return "inconnue"
    sale = git("status", "--porcelain")
    return commit + ("+modifie" if sale else "")
