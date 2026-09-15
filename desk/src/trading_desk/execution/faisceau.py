"""Plusieurs sources de decision derriere une seule, pour le pupitre.

Le pupitre ne connait qu'un `Signal`. C'etait suffisant tant qu'une seule
regle etait branchee ; il y en a maintenant deux familles — les deblocages,
qui sont un evenement date, et les regles de prix figees.

Ce faisceau ne decide rien et n'arbitre rien. Il concatene, et il ROUTE la
confirmation vers la source qui a emis l'intention. Ce routage est la seule
subtilite du fichier, et il compte : une source qui garde trace de ce qu'elle
a propose doit etre confirmee, et une seule — confirmer toutes les sources
raierait chez l'une une occasion emise par l'autre.

**L'ordre est stable et il a un sens** : les sources sont interrogees dans
l'ordre ou elles ont ete passees. Quand le mandat ne laisse de la place que
pour une position, c'est la premiere qui l'obtient. On met donc en tete la
regle qui a la plus forte pretention — les deblocages, seul edge mesure du
depot — et les regles figees derriere.
"""

from __future__ import annotations

from ..execution.pupitre import Intention


class Faisceau:
    """Expose plusieurs signaux comme un seul."""

    def __init__(self, *sources) -> None:
        if not sources:
            raise ValueError("un faisceau sans source ne sert a rien")
        self.sources = tuple(sources)
        self.nom = "+".join(getattr(s, "nom", "?") for s in self.sources)
        # Qui a emis quoi, pour router la confirmation. La cle est l'identite
        # de l'objet Intention : deux sources peuvent proposer le meme actif
        # au meme instant, et les distinguer par (actif, sens) melangerait
        # leurs comptes.
        self._origine: dict[int, object] = {}

    def entrees(self, at_ms: int) -> list[Intention]:
        out: list[Intention] = []
        self._origine.clear()
        for source in self.sources:
            for intention in source.entrees(at_ms):
                self._origine[id(intention)] = source
                out.append(intention)
        return out

    def sorties(self, at_ms: int, ouvertes: tuple[str, ...]) -> list[str]:
        """L'UNION des sorties. Une seule source suffit a faire sortir.

        C'est deliberement asymetrique avec les entrees : une entree est une
        prise de risque, sur laquelle on veut l'accord de la source qui la
        porte ; une sortie reduit le risque, et la refuser parce qu'une autre
        source ne la demande pas serait garder une position que sa propre
        regle veut fermer.
        """
        vues: list[str] = []
        for source in self.sources:
            for actif in source.sorties(at_ms, ouvertes):
                if actif not in vues:
                    vues.append(actif)
        return vues

    def confirmer(self, intention: Intention) -> None:
        source = self._origine.get(id(intention))
        if source is None:
            return
        fn = getattr(source, "confirmer", None)
        if callable(fn):
            fn(intention)

    # --- ce que la supervision lit -------------------------------------

    @property
    def absent(self) -> bool:
        """Vrai seulement si TOUTES les sources sont absentes."""
        return all(getattr(s, "absent", False) for s in self.sources)

    @property
    def sans_prix(self) -> set[str]:
        out: set[str] = set()
        for s in self.sources:
            out |= set(getattr(s, "sans_prix", ()) or ())
        return out

    def symboles_attendus(self, at_ms: int, horizon_ms: int = 0) -> set[str]:
        out: set[str] = set()
        for s in self.sources:
            fn = getattr(s, "symboles_attendus", None)
            if callable(fn):
                out |= set(fn(at_ms, horizon_ms))
        return out
