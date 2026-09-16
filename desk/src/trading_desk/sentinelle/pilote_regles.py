"""Les regles de prix figees, branchees sur le desk.

Le jumeau de `PiloteDeblocages`, et il obeit aux memes deux regles :

**Il ne recalcule rien.** Il lit `data/journal_regles.jsonl`, ecrit par
`scripts/journal_regles.py` a la cloture de chaque barre. Recalculer la
decision ici ouvrirait un desaccord silencieux entre ce qui a ete predit et
ce qui est trade — et c'est exactement ce desaccord qui transforme une
validation hors echantillon en illusion.

**Il ne trade que ce qui est deja inscrit.** Un signal calcule a la volee ne
serait pas hors echantillon. Le pilote refuse ce qu'il ne trouve pas dans le
journal, et il le dit.

**La fenetre d'entree est bornee.** Une decision prise a la cloture de la
barre N vaut pour l'ouverture de N+1, pas pour n'importe quand : reprendre
une entree trois barres plus tard, c'est trader autre chose que ce qui a ete
inscrit. Au-dela d'UNE barre, l'occasion est perdue et le pilote passe.

**Le stop.** Les regles figees declarent leur propre stop d'ATR, mais le
journal inscrit aussi un `stop_pct` de repli : une position sans stop est
refusee par les invariants, et `size_position` a besoin d'une distance. On
prend le stop de la strategie quand il est la et qu'il tient dans la bande,
le repli sinon.
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

# Lu depuis la source unique plutot que recopie : deux tables d'intervalles
# divergeraient, et la divergence se verrait comme une entree datee de la
# mauvaise heure — donc silencieusement.
from ..features.bars import INTERVAL_MS


class PiloteRegles:
    """Traduit le journal des regles figees en intentions datees."""

    nom = "regles_figees"

    def __init__(
        self,
        journal: str | Path = "data/journal_regles.jsonl",
        *,
        prix: dict[str, Decimal] | None = None,
        nom: str | None = None,
    ) -> None:
        # **Le nom doit pouvoir differer d'une instance a l'autre.**
        #
        # Le registre des parts du pupitre indexe sur `(source, actif)` : deux
        # pilotes portant le meme nom partageraient une entree, et la sortie
        # de l'un fermerait la part de l'autre. C'est exactement le defaut que
        # `execution/parts.py` existe pour corriger, et le laisser revenir par
        # un nom de classe partage serait le reintroduire par la porte de
        # derriere.
        if nom is not None:
            self.nom = nom
        self.chemin = Path(journal)
        self.prix: dict[str, Decimal] = prix if prix is not None else {}
        self._faites: set[tuple[str, int]] = set()
        self.absent = not self.chemin.exists()
        self.sans_prix: set[str] = set()

    # ------------------------------------------------------------- lecture

    def signaux(self) -> list[dict[str, Any]]:
        if not self.chemin.exists():
            return []
        out = []
        for ligne in self.chemin.read_text(encoding="utf-8").splitlines():
            ligne = ligne.strip()
            if not ligne:
                continue
            try:
                e = json.loads(ligne)
            except ValueError:
                continue
            if isinstance(e, dict) and e.get("regle") and e.get("entree_ms"):
                out.append(e)
        return out

    def symboles_attendus(self, at_ms: int, horizon_ms: int = 0) -> set[str]:
        """Ce qu'il faudra pouvoir coter. Sert a batir l'abonnement au flux."""
        return {
            str(e["actif"]) for e in self.signaux()
            if at_ms <= int(e["entree_ms"]) <= at_ms + horizon_ms
            or self._fenetre_ouverte(e, at_ms)
        }

    def _fenetre_ouverte(self, e: dict, at_ms: int) -> bool:
        pas = INTERVAL_MS.get(str(e.get("intervalle")), 86_400_000)
        debut = int(e["entree_ms"])
        return debut <= at_ms < debut + pas

    # ------------------------------------------------------------- entrees

    def entrees(self, at_ms: int) -> list[Intention]:
        out: list[Intention] = []
        self.sans_prix = set()
        for e in self.signaux():
            if not self._fenetre_ouverte(e, at_ms):
                continue
            cle = (str(e["regle"]), int(e["entree_ms"]))
            if cle in self._faites:
                continue

            actif = str(e["actif"])
            prix = self.prix.get(actif)
            if prix is None or prix <= 0:
                # On le DIT plutot que de sauter en silence : un desk qui
                # n'agit pas doit toujours pouvoir dire pourquoi.
                self.sans_prix.add(actif)
                continue

            try:
                sens = Side(str(e["sens"]))
            except ValueError:
                log.warning("sens inattendu %s pour %s", e.get("sens"), e.get("regle"))
                continue

            stop = self._stop(e, prix, sens)
            out.append(Intention(
                asset=actif,
                side=sens,
                entry_price=prix,
                stop_price=stop,
                motif=f"{e['regle']} v{e.get('version')} "
                      f"barre {int(e['barre_ms']) // 86_400_000}",
            ))
        return out

    def _stop(self, e: dict, prix: Decimal, sens: Side) -> Decimal:
        """Le stop de la strategie s'il est utilisable, le repli sinon.

        Le stop inscrit au journal a ete calcule sur la CLOTURE de la barre de
        decision ; on entre a l'ouverture suivante. Un ecart de prix peut donc
        le placer du mauvais cote — auquel cas il ne protege plus rien, et le
        repli en pourcentage est la seule reponse sensee.
        """
        brut = e.get("stop_strategie")
        if brut:
            try:
                s = Decimal(str(brut))
            except (ArithmeticError, ValueError):
                s = None
            if s is not None and s > 0:
                bon_cote = s < prix if sens is Side.LONG else s > prix
                if bon_cote:
                    return s
        pct = Decimal(str(e.get("stop_pct", 0.15)))
        return prix * (Decimal("1") - pct) if sens is Side.LONG \
            else prix * (Decimal("1") + pct)

    # ------------------------------------------------------------- sorties

    def sorties(self, at_ms: int, ouvertes: tuple[str, ...]) -> list[str]:
        """Les regles figees sortent par leur STOP ou par un signal inscrit.

        Le journal n'inscrit aujourd'hui que des entrees : la sortie de
        `turtle_breakout` est un canal, que le moteur de backtest evalue barre
        par barre. Tant que le journal ne porte pas de ligne de sortie, le
        pilote n'en propose aucune — et c'est le stop, pose a l'entree, qui
        borne la perte. Mentir ici — proposer une sortie qu'on n'a pas
        inscrite — ferait diverger le live du backteste dans l'autre sens.
        """
        return []

    # ---------------------------------------------------------- confirmation

    def confirmer(self, intention: Intention) -> None:
        """Rayer l'occasion, une fois l'ordre reellement passe.

        Jamais a la lecture : le desk refuse regulierement d'agir — amorcage,
        flux fige, plafond atteint — et rayer trop tot perdrait le signal sans
        que rien ne le signale.
        """
        for e in self.signaux():
            if (str(e["actif"]) == intention.asset
                    and self._fenetre_ouverte(e, int(e["entree_ms"]))):
                self._faites.add((str(e["regle"]), int(e["entree_ms"])))
