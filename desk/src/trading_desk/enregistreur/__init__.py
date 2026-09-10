"""Enregistreur de microstructure Hyperliquid.

L'API ne sert AUCUN historique de carnet, de liquidations ni d'open interest :
`l2Book` renvoie l'instantane courant, et il n'existe pas d'endpoint de
liquidations. On ne peut donc pas backtester la microstructure — il faut
l'enregistrer en avant, et ce delai n'a aucun raccourci. D'ou ce paquet, dont
la seule mission est de tourner longtemps sans rien perdre.
"""

from .collecte import Collecteur
from .compactage import compacter
from .ecrivain import EcrivainParquet

__all__ = ["Collecteur", "EcrivainParquet", "compacter"]
