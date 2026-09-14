"""Lanceur de campagnes : faire tourner une simulation depuis l'interface.

Une campagne de robustesse tourne des minutes a des heures. Le serveur, lui,
repond en millisecondes et doit rester joignable — c'est par lui que passe le
coupe-circuit. Les deux ne peuvent pas partager un thread.

Quatre regles gouvernent ce module, et chacune vient d'une facon precise de
casser une machine :

**Une seule campagne a la fois.** Deux grilles de robustesse en parallele sur
un VPS a deux cœurs ne vont pas deux fois plus vite : elles se disputent le
CPU avec le collecteur, qui perd alors des messages WebSocket. Le collecteur
est le seul systeme du depot qui ne peut pas rattraper ce qu'il rate.

**Jamais pendant que le desk trade.** En mode PAPER le pupitre cycle toutes
les cinq secondes et doit lire le carnet a l'instant ou il decide. Une
campagne qui sature le CPU decale ce cycle, et le fill simule se calcule
alors sur un carnet perime. On refuse plutot que de fausser silencieusement.

**Le processus enfant est tue, pas attendu.** Une campagne qui part en boucle
doit pouvoir etre arretee ; `terminate` puis `kill` apres un delai.

**La sortie est bornee.** Un script bavard peut ecrire des dizaines de
megaoctets ; on garde les dernieres lignes, pas tout. Une trace complete qui
fait tomber le serveur ne sert personne.
"""

from __future__ import annotations

import os
import shlex
import signal
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any

RACINE = Path(__file__).resolve().parents[3]

# Combien de lignes de sortie on garde. Assez pour voir la progression et la
# fin, pas assez pour saturer la memoire d'un VPS a 2 Go.
LIGNES_MAX = 400

# Delai laisse a un processus pour mourir proprement avant le coup de grace.
DELAI_TERMINATE_S = 5.0


class Campagne:
    """Ce qu'on a le droit de lancer. Liste FERMEE, et c'est la seule barriere.

    Le nom vient du navigateur ; l'argument aussi. Construire une ligne de
    commande a partir de ces deux-la serait offrir un shell a quiconque
    atteint le port — meme sur `127.0.0.1`, meme derriere un tunnel. Ici le
    navigateur ne choisit qu'une CLE dans ce dictionnaire, et les parametres
    sont valides un par un contre une plage.
    """

    def __init__(self, cle: str, titre: str, quoi: str, script: str,
                 args: tuple[str, ...] = (), duree: str = "",
                 parametres: dict[str, tuple[int, int, int]] | None = None) -> None:
        self.cle = cle
        self.titre = titre
        self.quoi = quoi
        self.script = script
        self.args = args
        self.duree = duree
        # nom -> (defaut, minimum, maximum)
        self.parametres = parametres or {}

    def ligne(self, choix: dict[str, Any]) -> list[str]:
        cmd = [sys.executable, str(RACINE / "scripts" / self.script), *self.args]
        for nom, (defaut, bas, haut) in self.parametres.items():
            v = choix.get(nom, defaut)
            try:
                v = int(v)
            except (TypeError, ValueError):
                v = defaut
            cmd += [f"--{nom.replace('_', '-')}", str(max(bas, min(haut, v)))]
        return cmd


CATALOGUE: dict[str, Campagne] = {
    c.cle: c for c in (
        Campagne(
            "grille", "Grille de robustesse",
            "Chaque stratégie sur chaque actif et chaque intervalle, "
            "contre son modèle nul. La question qui vaut : le signal "
            "survit-il quand on change de cellule.",
            "robustness_grid.py", duree="20 min à 3 h",
            parametres={"draws": (2000, 100, 5000)},
        ),
        Campagne(
            "declencheurs", "Déclencheurs de la Sentinelle",
            "Les sept déclencheurs prédisent-ils le sens, et l'amplitude, "
            "sur les horizons courts.",
            "valider_declencheurs.py", duree="10 à 40 min",
            parametres={"tirages": (2000, 100, 5000)},
        ),
        Campagne(
            "deblocages", "Déblocages de jetons",
            "Le seul edge directionnel mesuré du dépôt : criblage par jeton "
            "et test poolé, avec les six contrôles.",
            "valider_unlocks.py",
            args=("--unlocks", "data/unlocks.json",
                  "--out", "baselines/unlocks.json"),
            duree="15 à 45 min",
            parametres={"tirages": (2000, 100, 5000)},
        ),
        Campagne(
            "journal", "Journal hors échantillon",
            "Inscrit les déblocages dont la fenêtre s'ouvre. À lancer une "
            "fois par semaine — c'est la validation qui compte vraiment.",
            "journal_unlocks.py", duree="1 à 3 min",
            parametres={"horizon": (30, 7, 90)},
        ),
    )
}


class Lanceur:
    """Une campagne a la fois, arretable, dont la sortie est bornee."""

    def __init__(self, state: Any) -> None:
        self.state = state
        self._verrou = threading.Lock()
        self._proc: subprocess.Popen | None = None
        self._fil: threading.Thread | None = None
        self.cle: str | None = None
        self.demarre_ms: int | None = None
        self.fini_ms: int | None = None
        self.code: int | None = None
        self.lignes: deque[str] = deque(maxlen=LIGNES_MAX)
        self.commande = ""

    # ------------------------------------------------------------- etat

    @property
    def en_cours(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def refus(self) -> str | None:
        """Pourquoi on ne peut pas lancer maintenant. `None` si on peut.

        Le mode PAPER est le cas qui compte : le pupitre y decide toutes les
        cinq secondes sur le carnet de l'instant. Une campagne qui sature le
        processeur decale ce cycle, et le fill se calcule alors sur un carnet
        perime — un resultat de simulation faux, obtenu silencieusement.
        """
        if self.en_cours:
            return f"campagne « {self.cle} » déjà en cours"
        mode = getattr(self.state.settings, "mode", None)
        if mode is not None and getattr(mode, "produces_orders", False):
            return (f"mode {mode.value} : le desk décide sur le carnet de "
                    f"l'instant. Une campagne décalerait son cycle et ses "
                    f"fills se calculeraient sur un carnet périmé. "
                    f"Repasser en SHADOW pour simuler.")
        return None

    def snapshot(self) -> dict[str, Any]:
        maintenant = int(time.time() * 1000)
        return {
            "catalogue": [
                {"cle": c.cle, "titre": c.titre, "quoi": c.quoi,
                 "duree": c.duree,
                 "parametres": {n: {"defaut": d, "min": b, "max": h}
                                for n, (d, b, h) in c.parametres.items()}}
                for c in CATALOGUE.values()
            ],
            "en_cours": self.en_cours,
            "cle": self.cle,
            "titre": CATALOGUE[self.cle].titre if self.cle in CATALOGUE else None,
            "commande": self.commande,
            "depuis_s": ((maintenant - self.demarre_ms) // 1000
                         if self.demarre_ms and self.en_cours else None),
            "duree_s": ((self.fini_ms - self.demarre_ms) // 1000
                        if self.fini_ms and self.demarre_ms else None),
            "code": self.code,
            "lignes": list(self.lignes)[-60:],
            "refus": self.refus(),
        }

    # ---------------------------------------------------------- execution

    def lancer(self, cle: str, choix: dict[str, Any]) -> dict[str, Any]:
        with self._verrou:
            motif = self.refus()
            if motif:
                return {"lance": False, "raison": motif}
            campagne = CATALOGUE.get(cle)
            if campagne is None:
                return {"lance": False, "raison": f"campagne inconnue : {cle}"}

            cmd = campagne.ligne(choix)
            self.cle = cle
            self.commande = " ".join(shlex.quote(x) for x in cmd)
            self.demarre_ms = int(time.time() * 1000)
            self.fini_ms = None
            self.code = None
            self.lignes.clear()
            self.lignes.append(f"$ {self.commande}")

            env = dict(os.environ)
            env["PYTHONUNBUFFERED"] = "1"
            # `src` sur le chemin : les scripts s'en chargent seuls, mais un
            # environnement ou le paquet n'est pas installe echouerait sinon.
            env["PYTHONPATH"] = str(RACINE / "src") + os.pathsep + env.get("PYTHONPATH", "")
            try:
                self._proc = subprocess.Popen(
                    cmd, cwd=str(RACINE), env=env,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, bufsize=1,
                    # Groupe de processus dedie : un script qui lance des
                    # enfants doit pouvoir etre arrete AVEC eux.
                    start_new_session=True,
                )
            except OSError as exc:
                self.lignes.append(f"échec du lancement : {exc}")
                self._proc = None
                return {"lance": False, "raison": str(exc)}

            self._fil = threading.Thread(target=self._lire, daemon=True)
            self._fil.start()
            self.state.store.journal("campagne_lancee",
                                     {"cle": cle, "commande": self.commande}, None)
            return {"lance": True, "cle": cle, "commande": self.commande}

    def _lire(self) -> None:
        proc = self._proc
        if proc is None or proc.stdout is None:
            return
        for ligne in proc.stdout:
            self.lignes.append(ligne.rstrip("\n"))
        self.code = proc.wait()
        self.fini_ms = int(time.time() * 1000)
        self.lignes.append(
            f"— terminé, code {self.code}, "
            f"{(self.fini_ms - (self.demarre_ms or self.fini_ms)) // 1000} s")
        self.state.store.journal("campagne_finie",
                                 {"cle": self.cle, "code": self.code}, None)

    def arreter(self) -> dict[str, Any]:
        proc = self._proc
        if proc is None or proc.poll() is not None:
            return {"arrete": False, "raison": "aucune campagne en cours"}
        try:
            # Tout le groupe : un script qui a lance des enfants les emporte.
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            proc.terminate()
        self.lignes.append("— arrêt demandé")

        def coup_de_grace() -> None:
            time.sleep(DELAI_TERMINATE_S)
            if proc.poll() is None:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except (ProcessLookupError, PermissionError, OSError):
                    proc.kill()
                self.lignes.append("— tué après refus de s'arrêter")

        threading.Thread(target=coup_de_grace, daemon=True).start()
        return {"arrete": True}
