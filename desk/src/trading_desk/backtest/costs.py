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
    # 0,125 bps/h = la composante de taux d'interet Hyperliquid, 0,01 % par
    # 8 heures ramenee a l'heure. C'est le regime de reference hors pression
    # directionnelle ; le premium s'y ajoute et peut le dominer largement.
    #
    # Cette valeur a d'abord ete fixee a 1,0 bps/h — huit fois trop haut,
    # par confusion entre le taux 8 h et le taux horaire. L'erreur n'etait pas
    # neutre : elle taxait 0,24 %/jour de notionnel, soit ~50 % sur 208 jours,
    # ce qui condamnait mecaniquement toute strategie exposee et faisait
    # paraitre bonnes les strategies peu exposees. Une baseline artificiellement
    # basse est le pire cas de figure : c'est celle que le desk multi-agents
    # doit battre au P5, et une baseline trop facile valide un desk qui ne
    # vaut rien.
    #
    # Cela reste une simplification forte : le funding reel oscille, change de
    # signe, et remunere parfois les longs. `--funding-bps` existe pour tester
    # si la conclusion tient quand on le fait varier — si elle ne tient pas,
    # c'est le funding qu'on mesure, pas la strategie.
    #
    # Correction prevue : rejouer le funding reellement observe depuis la table
    # `marks` alimentee par le P0, des qu'elle couvre la periode testee.
    funding_bps_per_hour: Decimal = Field(default=Decimal("0.125"))

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
