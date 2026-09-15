"""L'ecart entre le prix decide et le prix obtenu, mesure a chaque fill.

**Le constat qui a rendu ce fichier necessaire.** Le modele de couts facture
un aller-retour a 15 bps — 9 de frais taker, 6 de glissement — et cette
valeur est une HYPOTHESE. `costs.py` le dit lui-meme : « en backtest sur
bougies, on ne voit pas le carnet : cette constante en tient lieu ». Elle n'a
jamais ete confrontee a une execution.

Or le mode PAPER execute contre le CARNET REEL. Il peut donc trancher, et
c'est la seule brique de ce depot ou une mesure gratuite etait disponible et
n'etait pas prise.

**Ce qu'on mesure exactement.** Pour chaque fill : le prix que la decision
portait (`limit_price` de l'intention) et le prix moyen reellement obtenu.
L'ecart est SIGNE de sorte qu'un chiffre positif soit toujours un COUT —
acheter plus cher que decide, vendre moins cher. Un chiffre negatif est une
amelioration de prix, ce qui arrive et qui doit se voir.

**Passif et agressif ne se melangent jamais.** Un ordre passif servi l'est au
mieux a son prix limite, donc son glissement est nul ou negatif par
construction. Les moyenner avec des ordres agressifs donnerait un cout moyen
flatteur qui ne correspond a aucune execution reelle. Les deux populations
sont donc comptees separement, toujours.

**On enregistre le style DEMANDE, pas le role realise.** Un ordre passif peut
finir taker s'il croise le carnet ; seul le `Fill` rendu par l'exchange porte
`is_maker`, et il n'est pas disponible au moment ou l'ordre revient. Appeler
ce champ « maker » laisserait croire qu'on mesure ce qui s'est passe alors
qu'on enregistre ce qui a ete demande — et les deux se separent precisement
les jours ou ca compte.

**Ce que cette mesure ne dit pas.** Elle ne dit rien de l'impact PERMANENT de
l'ordre sur le prix, ni de la reaction des autres participants — le
simulateur traverse un carnet fige. Le papier reste optimiste, et c'est
ecrit ici pour qu'un chiffre rassurant ne soit pas lu comme une garantie.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from ..contracts.common import EntryStyle, Side
from ..contracts.orders import OrderIntent, OrderRecord


@dataclass(frozen=True)
class Glissement:
    """Un fill, compare a la decision qui l'a produit."""

    cloid: str
    ts_ms: int
    asset: str
    side: str
    purpose: str
    style: str
    size: str
    prix_decide: str
    prix_obtenu: str
    # Signe pour qu'un POSITIF soit toujours un cout.
    bps: float
    # Le style DEMANDE, pas le role realise. L'ordre passif peut finir taker
    # s'il croise ; seul le `Fill` de l'exchange porte `is_maker`, et il
    # n'est pas disponible ici. Nommer ce champ « maker » laisserait croire
    # qu'on mesure ce qui s'est passe alors qu'on enregistre ce qui a ete
    # demande — et les deux se separent precisement les jours ou ca compte.
    passif: bool

    def payload(self) -> dict:
        return {
            "cloid": self.cloid, "ts_ms": self.ts_ms, "asset": self.asset,
            "side": self.side, "purpose": self.purpose, "style": self.style,
            "size": self.size, "prix_decide": self.prix_decide,
            "prix_obtenu": self.prix_obtenu, "bps": self.bps,
            "passif": self.passif,
        }


def ecart_bps(side: Side, decide: Decimal, obtenu: Decimal) -> float:
    """L'ecart en points de base, POSITIF quand il coute.

    Acheter au-dessus du prix decide coute ; vendre en dessous coute. Le signe
    ne se devine pas au lecteur : il est dans le calcul, une fois pour toutes.
    """
    if decide <= 0:
        return 0.0
    ecart = (obtenu - decide) if side is Side.LONG else (decide - obtenu)
    return float(ecart / decide * Decimal("10000"))


def mesurer(intent: OrderIntent, record: OrderRecord) -> Glissement | None:
    """Rend la mesure, ou `None` si elle n'a pas de sens.

    Trois cas rendent `None`, et aucun n'est une panne : pas de prix limite
    (l'intention ne portait pas de decision de prix), pas de fill (rien a
    comparer), pas de prix moyen rapporte par l'exchange.
    """
    decide = intent.limit_price
    obtenu = record.avg_price
    if decide is None or obtenu is None:
        return None
    if record.filled_size <= 0 or decide <= 0 or obtenu <= 0:
        return None

    # Comparaison EXPLICITE a l'enumeration. Un test par sous-chaine —
    # « PASSIVE » dans le nom — se casserait au premier style ajoute dont le
    # nom contient le mot, et il se casserait en silence.
    return Glissement(
        cloid=record.cloid,
        ts_ms=record.updated_at_ms,
        asset=intent.asset,
        side=intent.side.value,
        purpose=intent.purpose.value,
        style=str(getattr(intent.style, "value", intent.style)),
        size=str(record.filled_size),
        prix_decide=str(decide),
        prix_obtenu=str(obtenu),
        bps=ecart_bps(intent.side, decide, obtenu),
        passif=intent.style is EntryStyle.LIMIT_PASSIVE,
    )
