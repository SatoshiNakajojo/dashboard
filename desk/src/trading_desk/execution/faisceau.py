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

from ..execution.parts import Sortie
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

    def sorties(self, at_ms: int, ouvertes: tuple[str, ...]) -> list[Sortie]:
        """L'union des sorties, CHACUNE PORTANT LA SOURCE QUI LA DEMANDE.

        L'union reste juste : une entree est une prise de risque, sur laquelle
        on veut l'accord de la source qui la porte ; une sortie reduit le
        risque, et la refuser parce qu'une AUTRE source ne la demande pas
        garderait une position que sa propre regle veut fermer.

        Ce qui etait faux, c'est ce qu'elle rendait. Une chaine nue voulait
        dire « ferme tout BTC », alors que la source n'en detient qu'une part.
        Sur un exchange qui nette, une jambe de couverture et une regle figee
        sont une seule position : la fin de fenetre d'un deblocage fermait
        donc la regle figee, qui rentrait au signal suivant en payant
        l'aller-retour.

        **La meme demande de deux sources n'est pas un doublon.** Deux sorties
        sur BTC emises par deux sources ferment deux parts differentes ; les
        deduplicquer par actif en perdrait une, et une position resterait
        ouverte sans que rien ne le dise. On ne deduplique donc que par
        (source, actif).
        """
        vues: list[Sortie] = []
        deja: set[tuple[str, str]] = set()
        for source in self.sources:
            nom = getattr(source, "nom", "?")
            for actif in source.sorties(at_ms, ouvertes):
                cle = (nom, actif)
                if cle in deja:
                    continue
                deja.add(cle)
                vues.append(Sortie(asset=actif, source=nom))
        return vues

    def source_de(self, intention: Intention) -> str | None:
        """Le nom de la source qui a emis cette intention.

        C'est ce qui permet au pupitre d'inscrire la part au bon proprietaire
        apres une ouverture reussie. Sans lui, le registre des parts serait
        alimente par un proprietaire devine.
        """
        source = self._origine.get(id(intention))
        return getattr(source, "nom", None) if source is not None else None

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
