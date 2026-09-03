"""Modele de couts. Frais, funding, slippage.

Il existe des le premier backtest, et pas apres, parce qu'une strategie qui
semble rentable brute est tres souvent perdante nette (angle mort A-08). Sur
des perpetuels, le funding se paie toutes les heures et peut depasser le PnL
directionnel d'un swing de plusieurs jours.

Les valeurs par defaut correspondent au palier de base Hyperliquid et sont
volontairement pessimistes d'un cran. **Elles doivent etre revalidees avant
tout passage en live** : les grilles tarifaires evoluent, et un backtest cale
sur des frais perimes est un backtest faux.
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from ..contracts.common import Frozen


class CostModel(Frozen):
    taker_fee_bps: Decimal = Field(default=Decimal("4.5"), ge=0)
    maker_fee_bps: Decimal = Field(default=Decimal("1.5"), ge=0)

    # Slippage force au-dela du prix affiche. En backtest sur bougies, on ne
    # voit pas le carnet : cette constante en tient lieu. Elle est recalibree
    # au P6 sur le slippage reellement observe en live.
    slippage_bps: Decimal = Field(default=Decimal("3"), ge=0)

    # Funding horaire moyen paye par le cote long. Positif = les longs paient.
    #
    # C'est la simplification la plus forte de ce modele, et il faut la garder
    # en tete en lisant les resultats : le funding reel oscille, change de
    # signe, et remunere parfois les longs. Le supposer constant est
    # deliberement pessimiste pour une position longue durablement tenue —
    # exactement le cas du benchmark buy and hold, dont le cout affiche est
    # donc un majorant, pas une prevision.
    #
    # Correction prevue : rejouer le funding reellement observe depuis la table
    # `marks` alimentee par le P0, des qu'elle couvre la periode testee. En
    # attendant, `--funding-bps` permet de tester la sensibilite du resultat.
    funding_bps_per_hour: Decimal = Field(default=Decimal("1.0"))

    def fee_usd(self, notional_usd: Decimal, *, maker: bool = False) -> Decimal:
        rate = self.maker_fee_bps if maker else self.taker_fee_bps
        return notional_usd * rate / Decimal("10000")

    def fill_price(self, price: Decimal, *, is_buy: bool, maker: bool = False) -> Decimal:
        """Prix d'execution effectif.

        Un ordre passif est cense etre servi au prix affiche ; on ne lui
        applique donc pas de slippage. C'est optimiste, et c'est assume : la
        contrepartie est qu'on ne modelise pas non plus le fait qu'un ordre
        passif n'est parfois jamais servi.
        """
        if maker:
            return price
        slip = price * self.slippage_bps / Decimal("10000")
        return price + slip if is_buy else price - slip

    def funding_usd(self, notional_usd: Decimal, hours: Decimal, *, is_long: bool) -> Decimal:
        """Cout de portage. Positif = cout pour la position, negatif = gain."""
        rate = self.funding_bps_per_hour * hours / Decimal("10000")
        return notional_usd * rate * (Decimal("1") if is_long else Decimal("-1"))


# Grille sans aucun cout. N'existe que pour mesurer, par difference, ce que
# les couts retirent a une strategie — un chiffre qu'il vaut mieux regarder en
# face avant de passer en live.
FRICTIONLESS = CostModel(
    taker_fee_bps=Decimal("0"),
    maker_fee_bps=Decimal("0"),
    slippage_bps=Decimal("0"),
    funding_bps_per_hour=Decimal("0"),
)
