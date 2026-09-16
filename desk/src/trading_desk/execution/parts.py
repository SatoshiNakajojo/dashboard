"""Qui detient quelle part d'une position nettee.

Un exchange de perpetuels NETTE : deux sources qui achetent BTC ne donnent pas
deux positions, elles en donnent une. Tant que le desk n'avait qu'une source,
ca n'avait aucune importance. Avec deux — les deblocages et les regles figees
— ca devient le probleme qui empeche d'adosser.

**Le defaut concret.** Le contrat de sortie etait indexe par nom d'actif :
`sorties()` rendait des chaines, et le pupitre appelait
`flatten(asset, size=position.size)`, la position ENTIERE. Une jambe de
couverture longue BTC et la position de `turtle_btc_1d` etant une seule
position, la fin de fenetre d'un deblocage fermait aussi la regle figee — qui
rentrait au signal suivant en payant l'aller-retour. Demontre par
`tests/test_couverture.py` avant ce module.

L'asymetrie etait nette : a l'ENTREE le faisceau route la confirmation vers la
bonne source, par identite d'objet ; a la SORTIE il n'avait aucun moyen
equivalent. Ce module est ce moyen.

────────────────────────────────────────────────────────────────────────────
  CE QUI REND CE REGISTRE DIFFICILE, ET LA REPONSE
────────────────────────────────────────────────────────────────────────────

**Le registre peut mentir, et l'exchange non.** Une position peut diminuer
sans que le desk le demande : un stop touche, une liquidation partielle, une
reduction manuelle. Le registre continuerait alors d'annoncer des parts dont
la somme depasse ce qui existe, et une source fermerait plus que sa part —
donc la part d'une autre. C'est le meme bug, deplace d'un cran.

D'ou `reconcilier()`, appele a chaque cycle sur l'etat du compte. **L'etat du
compte est la verite**, le registre n'est qu'une attribution. Quand ils
divergent, les parts sont mises a l'echelle au prorata.

Le prorata est un choix, et il merite d'etre dit : quand un stop rogne une
position partagee, RIEN ne dit laquelle des deux sources a ete rognee — c'est
une seule position, l'information n'existe pas. Le prorata est la seule
repartition qui ne privilegie personne. L'alternative, faire porter la perte
a une source designee, inventerait une information que l'exchange ne donne
pas.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from decimal import Decimal


@dataclass(frozen=True)
class Sortie:
    """Une demande de sortie, avec la source qui la porte.

    Remplace la chaine que `sorties()` rendait. Le pupitre accepte encore une
    chaine nue — elle vaut « toute la position », ce qui reste le comportement
    juste quand une seule source trade l'actif.
    """

    asset: str
    source: str


@dataclass
class Parts:
    """Le registre des parts, par (source, actif)."""

    _parts: dict[tuple[str, str], Decimal] = field(default_factory=dict)

    # ---------------------------------------------------------- ecriture

    def inscrire(self, source: str, asset: str, taille: Decimal) -> None:
        """Ajoute une part apres une ouverture REUSSIE.

        Apres, jamais avant : inscrire a la demande attribuerait a une source
        une part que le moteur de risque a peut-etre refusee, et le registre
        divergerait des le premier refus.
        """
        if taille <= 0:
            return
        cle = (source, asset)
        self._parts[cle] = self._parts.get(cle, Decimal("0")) + taille

    def retirer(self, source: str, asset: str, taille: Decimal) -> Decimal:
        """Retire au plus la part detenue. Rend ce qui a ete reellement retire."""
        cle = (source, asset)
        detenue = self._parts.get(cle, Decimal("0"))
        pris = min(max(taille, Decimal("0")), detenue)
        reste = detenue - pris
        if reste > 0:
            self._parts[cle] = reste
        else:
            self._parts.pop(cle, None)
        return pris

    def oublier(self, asset: str) -> None:
        """Efface toutes les parts d'un actif. Pour une position disparue."""
        for cle in [c for c in self._parts if c[1] == asset]:
            self._parts.pop(cle, None)

    # ---------------------------------------------------------- lecture

    def part(self, source: str, asset: str) -> Decimal:
        return self._parts.get((source, asset), Decimal("0"))

    def total(self, asset: str) -> Decimal:
        return sum((t for (_, a), t in self._parts.items() if a == asset),
                   Decimal("0"))

    def sources(self, asset: str) -> list[str]:
        return sorted(s for (s, a) in self._parts if a == asset)

    def en_dict(self) -> dict[str, dict[str, str]]:
        """Pour la supervision. Les tailles en chaines : un Decimal passe en
        JSON par un float perdrait des decimales de taille."""
        out: dict[str, dict[str, str]] = {}
        for (source, asset), taille in sorted(self._parts.items()):
            out.setdefault(asset, {})[source] = str(taille)
        return out

    # ----------------------------------------------------- reconciliation

    def reconcilier(self, positions: Iterable) -> list[str]:
        """Aligne le registre sur ce que l'exchange detient VRAIMENT.

        Rend la liste des actifs dont les parts ont ete corrigees, pour que la
        supervision puisse le dire. Une correction silencieuse serait le pire
        des cas : le registre redeviendrait juste sans que personne ne sache
        qu'il avait cesse de l'etre.

        Trois cas, et le troisieme est celui qui mord :

        - **actif inconnu du registre** : on ne l'invente pas. Une position
          ouverte hors du desk n'appartient a aucune source, et lui attribuer
          un proprietaire autoriserait une source a la fermer.
        - **position disparue** : les parts sont effacees.
        - **tailles divergentes** : mise a l'echelle au prorata.
        """
        reelles = {p.asset: p.size for p in positions}
        corriges: list[str] = []

        for asset in {a for (_, a) in self._parts}:
            reelle = reelles.get(asset, Decimal("0"))
            inscrite = self.total(asset)
            if reelle <= 0:
                self.oublier(asset)
                corriges.append(asset)
                continue
            if inscrite == reelle:
                continue
            # Le prorata ne privilegie personne. Voir l'en-tete : quand une
            # position partagee est rognee, l'information de savoir QUI a ete
            # rogne n'existe pas.
            facteur = reelle / inscrite
            for (source, a) in [c for c in self._parts if c[1] == asset]:
                self._parts[(source, a)] *= facteur
            corriges.append(asset)

        return sorted(corriges)
