"""Plafond de depense, applique au seul endroit qui depense.

Un bug dans le graphe — une boucle, un retry mal borne, une fenetre de plus
que prevu — se paie en dollars reels. Le garde-fou ne peut donc pas etre une
verification faite par l'appelant : il doit etre porte par l'objet qui appelle
le modele, pour qu'aucun chemin de code ne puisse le contourner.

Deux proprietes, et la seconde compte autant que la premiere :

**Le refus est net.** Au-dela du plafond, plus aucun appel ne part. On ne
degrade pas, on n'essaie pas un modele moins cher : on s'arrete, parce qu'un
depassement est un symptome et qu'on veut le voir.

**Le cout est compte APRES l'appel, jamais avant.** On ne sait pas combien un
appel coutera avant de l'avoir fait — le nombre de tokens de sortie n'est pas
predictible. Le plafond est donc franchi d'au plus un appel, et c'est la
garantie honnete : pretendre l'appliquer a l'avance demanderait une estimation
qui serait fausse.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, TypeVar

from pydantic import BaseModel

from .llm import LLMClient, LLMError, LLMResponse

T = TypeVar("T", bound=BaseModel)


class BudgetExceeded(LLMError):
    """Plafond atteint. Herite de `LLMError` a dessein.

    Le runner traite donc un depassement comme n'importe quel echec d'appel :
    l'agent s'abstient, le journal le dit, et le cycle se termine proprement
    au lieu de remonter une exception jusqu'a l'arret du processus.
    """


class BudgetedLLM:
    """Enveloppe un client et refuse d'appeler au-dela d'un plafond.

    S'interpose sur le protocole `LLMClient`, donc le graphe ne sait pas
    qu'elle existe — et ne peut pas la desactiver.
    """

    def __init__(self, inner: LLMClient, *, max_usd: Decimal) -> None:
        if max_usd <= 0:
            raise ValueError("un plafond nul ou negatif n'autorise aucun appel")
        self.inner = inner
        self.max_usd = Decimal(max_usd)
        self.spent_usd = Decimal("0")
        self.calls = 0
        self.unpriced_calls = 0

    @property
    def remaining_usd(self) -> Decimal:
        return max(Decimal("0"), self.max_usd - self.spent_usd)

    @property
    def exhausted(self) -> bool:
        return self.spent_usd >= self.max_usd

    def structured(
        self, *, system: str, user: str, schema: type[T], max_tokens: int = 4000,
    ) -> tuple[T, LLMResponse]:
        if self.exhausted:
            raise BudgetExceeded(
                f"plafond de {self.max_usd} $ atteint ({self.spent_usd:.4f} $ "
                f"depenses sur {self.calls} appels) — aucun appel supplementaire"
            )

        output, meta = self.inner.structured(
            system=system, user=user, schema=schema, max_tokens=max_tokens
        )
        self.calls += 1
        self.spent_usd += meta.cost_usd
        if not meta.pricing_known:
            # Un modele hors grille compte pour zero : le plafond deviendrait
            # inoperant sans qu'on le sache. On le signale plutot que de le
            # laisser filer.
            self.unpriced_calls += 1
        return output, meta
