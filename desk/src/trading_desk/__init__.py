"""Trading desk multi-agents — Hyperliquid.

Architecture a deux vitesses :

    couche cognitive (LLM, minutes)  ->  MANDAT  ->  moteur de risque  ->
    couche deterministe (asyncio, millisecondes)  ->  exchange

Aucun agent n'a de reference vers `execution` ; le seul chemin entre les deux
couches est le mandat, valide par `risk.evaluate`.
"""

__version__ = "0.1.0"
