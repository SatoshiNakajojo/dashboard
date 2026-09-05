"""Suivi du budget de requetes Hyperliquid.

Angle mort A-07, celui que presque personne ne voit venir. Hyperliquid empile
trois limites :

- **Par IP** : un budget de poids par minute sur l'API Info (de l'ordre de
  1 200 unites/min ; une requete simple coute 1, certaines coutent davantage).
- **Par wallet, sur l'API Exchange** : de l'ordre de 100 requetes / 10 s, d'ou
  l'interet du batch (jusqu'a 20 ordres par requete).
- **Par adresse, indexee sur le volume tradé** : environ une requete par USDC
  cumule echange, avec une reserve initiale d'environ 10 000 requetes. Un
  compte neuf qui interroge l'API en boucle epuise sa reserve *avant* d'avoir
  tradé, puis tombe a une requete toutes les dix secondes.

D'ou la regle du projet : WebSocket d'abord, polling jamais. Ce module rend la
consommation visible et refuse les requetes qui entameraient la reserve.

Les constantes ci-dessous sont des valeurs par defaut prudentes, pas une
verite : elles evoluent cote exchange et doivent etre revalidees avant tout
passage en live.
"""

from __future__ import annotations

import threading
from collections import deque

from ..contracts.common import Frozen, now_ms

DEFAULT_IP_WEIGHT_PER_MIN = 1_000        # sous le plafond annonce, volontairement
DEFAULT_EXCHANGE_PER_10S = 80            # idem
DEFAULT_ADDRESS_RESERVE = 10_000


class BudgetSnapshot(Frozen):
    ip_weight_used: int
    ip_weight_limit: int
    exchange_used: int
    exchange_limit: int
    address_reserve_left: int
    address_reserve_initial: int

    @property
    def ip_pct(self) -> float:
        return 100.0 * self.ip_weight_used / max(1, self.ip_weight_limit)

    @property
    def reserve_pct(self) -> float:
        return 100.0 * self.address_reserve_left / max(1, self.address_reserve_initial)

    @property
    def is_critical(self) -> bool:
        return self.ip_pct > 85 or self.reserve_pct < 10


class RequestBudget:
    """Compteur a fenetre glissante, sur pour les threads.

    Ne remplace pas le backoff sur les 429 de l'exchange : il l'anticipe. Le
    but est que le desk sache qu'il consomme trop *avant* d'etre bride, parce
    qu'une fois bride il ne peut plus fermer ses positions rapidement.
    """

    def __init__(
        self,
        *,
        ip_weight_per_min: int = DEFAULT_IP_WEIGHT_PER_MIN,
        exchange_per_10s: int = DEFAULT_EXCHANGE_PER_10S,
        address_reserve: int = DEFAULT_ADDRESS_RESERVE,
    ) -> None:
        self._lock = threading.Lock()
        self._ip_limit = ip_weight_per_min
        self._ex_limit = exchange_per_10s
        self._reserve_initial = address_reserve
        self._reserve_left = address_reserve
        self._ip: deque[tuple[int, int]] = deque()   # (ts_ms, poids)
        self._ex: deque[int] = deque()               # ts_ms

    def _prune(self, at_ms: int) -> None:
        while self._ip and at_ms - self._ip[0][0] > 60_000:
            self._ip.popleft()
        while self._ex and at_ms - self._ex[0] > 10_000:
            self._ex.popleft()

    def can_spend(self, weight: int = 1, *, exchange: bool = False) -> bool:
        with self._lock:
            at = now_ms()
            self._prune(at)
            if sum(w for _, w in self._ip) + weight > self._ip_limit:
                return False
            if exchange and len(self._ex) + 1 > self._ex_limit:
                return False
            return self._reserve_left - weight >= 0

    def spend(self, weight: int = 1, *, exchange: bool = False) -> None:
        with self._lock:
            at = now_ms()
            self._prune(at)
            self._ip.append((at, weight))
            if exchange:
                self._ex.append(at)
            self._reserve_left = max(0, self._reserve_left - weight)

    def credit_volume(self, usd_traded: float) -> None:
        """Le volume tradé recharge la reserve, environ 1 requete par USDC."""
        with self._lock:
            self._reserve_left = min(
                self._reserve_initial * 100, self._reserve_left + int(usd_traded)
            )

    def snapshot(self) -> BudgetSnapshot:
        with self._lock:
            self._prune(now_ms())
            return BudgetSnapshot(
                ip_weight_used=sum(w for _, w in self._ip),
                ip_weight_limit=self._ip_limit,
                exchange_used=len(self._ex),
                exchange_limit=self._ex_limit,
                address_reserve_left=self._reserve_left,
                address_reserve_initial=self._reserve_initial,
            )
