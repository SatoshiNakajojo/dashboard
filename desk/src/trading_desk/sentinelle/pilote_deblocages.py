"""Le signal des deblocages, branche sur le journal hors echantillon.

C'est le seul edge DIRECTIONNEL mesure du depot : sur 852 evenements mis en
commun, la fenetre d'anticipation J-7 -> J-1 rend +236 bps quand le hasard
en rend +75, a p = 0,0010 apres Benjamini-Hochberg. Quatre groupes sur seize
survivent a la correction, avec une reponse a la dose monotone : plus le
deblocage est gros en part de l'offre en circulation, plus la baisse
anticipee est forte.

**Ce pilote ne redecide rien.** Il lit le journal produit par
`scripts/journal_unlocks.py`, qui a inscrit ses positions AVANT les faits,
dans un fichier en ajout seul. Recalculer les entrees ici ouvrirait la porte
a un desaccord silencieux entre ce qui a ete predit et ce qui est trade — et
c'est exactement ce desaccord qui transforme une validation hors echantillon
en illusion.

**Il ne trade que ce qui est deja inscrit.** Un deblocage decouvert
aujourd'hui et trade aujourd'hui ne serait pas hors echantillon : il faut
qu'il soit passe par le journal, donc par une inscription datee et
non modifiable. Le pilote refuse ce qu'il ne trouve pas dans le journal, et
le dit.

**Le stop.** La regle validee n'en comporte pas : elle entre a J-7 et sort a
J-1, point. Mais `size_position` a besoin d'une distance au stop pour donner
une taille, et une position sans stop est refusee par les invariants. Le
stop est donc pose a `STOP_PCT` du prix d'entree — assez large pour ne pas
couper la strategie mesuree, assez serre pour borner la perte d'un jeton qui
s'effondre. **Ce n'est pas une composante validee de l'edge** : c'est un
garde-fou operationnel, et il rend le resultat live legerement different du
backtest. Il faut le savoir en comparant les deux.
"""

from __future__ import annotations

import json
import logging
from decimal import Decimal
from pathlib import Path
from typing import Any

from ..contracts.common import Side
from ..execution.pupitre import Intention

log = logging.getLogger("pilote")

JOUR_MS = 86_400_000

# Distance du stop, en part du prix d'entree. Les deblocages portent sur des
# alts dont la volatilite quotidienne depasse souvent 5 % : un stop serre ne
# protegerait pas, il sortirait au bruit avant la fin de la fenetre.
STOP_PCT = Decimal("0.15")


class PiloteDeblocages:
    """Traduit le journal des deblocages en intentions datees."""

    nom = "deblocages"

    def __init__(
        self,
        journal: str | Path = "data/journal_unlocks.jsonl",
        *,
        prix: dict[str, Decimal] | None = None,
        stop_pct: Decimal = STOP_PCT,
    ) -> None:
        self.chemin = Path(journal)
        self.stop_pct = stop_pct
        # Les derniers prix connus, alimentes par le flux. Sans prix, une
        # intention n'a ni niveau d'entree ni stop, donc pas de taille.
        self.prix: dict[str, Decimal] = prix if prix is not None else {}
        self._entrees_faites: set[tuple[str, int]] = set()
        self.absent = not self.chemin.exists()

    # ------------------------------------------------------------- lecture

    def positions(self) -> list[dict[str, Any]]:
        """Le journal, relu a chaque appel.

        Relu plutot que mis en cache : le collecteur hebdomadaire y ajoute des
        lignes pendant que le desk tourne, et un desk qui garderait la version
        du demarrage ignorerait toutes les positions inscrites depuis.
        """
        if not self.chemin.exists():
            self.absent = True
            return []
        self.absent = False
        out = []
        for ligne in self.chemin.read_text(encoding="utf-8").splitlines():
            ligne = ligne.strip()
            if not ligne:
                continue
            try:
                out.append(json.loads(ligne))
            except ValueError:
                log.warning("ligne de journal illisible, ignoree")
        return out

    # ------------------------------------------------------------- signal

    def entrees(self, at_ms: int) -> list[Intention]:
        """Les positions dont la fenetre d'entree est ouverte MAINTENANT.

        La condition est un intervalle, pas une egalite de date : un desk
        redemarre a midi doit pouvoir prendre l'entree du matin. Mais elle est
        bornee par la sortie — reprendre une position dont la fenetre est
        a moitie ecoulee, c'est trader autre chose que ce qui a ete valide.
        """
        out: list[Intention] = []
        for e in self.positions():
            symbole = str(e.get("symbole", ""))
            entree_ms = int(e.get("entree_ms", 0))
            sortie_ms = int(e.get("sortie_ms", 0))
            if not (entree_ms <= at_ms < sortie_ms):
                continue

            clef = (symbole, entree_ms)
            if clef in self._entrees_faites:
                continue                       # deja ouverte, et CONFIRMEE

            prix = self.prix.get(symbole)
            if prix is None or prix <= 0:
                # Pas de prix : on ne fabrique pas de niveau. La position sera
                # reprise au cycle suivant si le flux arrive.
                continue

            # `sens = COURT` : la regle vend a decouvert avant le deblocage.
            if str(e.get("sens", "")).upper() != "COURT":
                log.warning("sens inattendu %s pour %s, ignore", e.get("sens"), symbole)
                continue

            out.append(Intention(
                asset=symbole,
                side=Side.SHORT,
                entry_price=prix,
                stop_price=prix * (Decimal("1") + self.stop_pct),
                motif=f"deblocage {e.get('part_offre')} le "
                      f"{int(e.get('deblocage_ms', 0)) // JOUR_MS}",
            ))
        return out

    def confirmer(self, intention: Intention) -> None:
        """Marque une entree comme prise. Appele APRES l'ouverture reussie.

        C'est le correctif d'un bug qui aurait fait rater des trades en
        silence. La premiere version marquait l'entree consommee des la
        LECTURE : le pupitre demandait les intentions, le pilote les rayait,
        puis le moteur de risque refusait — desk en amorcage, flux pas encore
        frais — et l'opportunite etait perdue pour de bon. Elle ne serait
        jamais revenue, et rien ne l'aurait signale.

        Vu le 9 septembre 2026 sur le premier desk PAPER : la fenetre ETH
        etait ouverte, le pilote la voyait, et le desk n'a jamais pris la
        position parce que l'amorcage avait consomme l'occasion.

        Consommer a la CONFIRMATION rend le pilote reprenable : tant que la
        position n'est pas ouverte, la fenetre reste offerte a chaque cycle.
        """
        for e in self.positions():
            if str(e.get("symbole", "")) == intention.asset:
                self._entrees_faites.add((intention.asset, int(e.get("entree_ms", 0))))

    def sorties(self, at_ms: int, ouvertes: tuple[str, ...]) -> list[str]:
        """Les positions dont la fenetre est close.

        Une position ouverte qu'on ne retrouve PAS dans le journal est
        fermee, elle aussi. Ce n'est pas de la prudence excessive : le pupitre
        ne doit jamais laisser traîner une position dont plus rien ne dit
        quand elle doit sortir.
        """
        connus: dict[str, int] = {}
        for e in self.positions():
            symbole = str(e.get("symbole", ""))
            connus[symbole] = max(connus.get(symbole, 0), int(e.get("sortie_ms", 0)))

        return [
            asset for asset in ouvertes
            if asset not in connus or at_ms >= connus[asset]
        ]
