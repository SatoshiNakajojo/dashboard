"""Nonces Hyperliquid : monotonie stricte et fenetre temporelle.

Rappel des regles de l'exchange (angle mort A-04) :

- Les 100 nonces les plus eleves sont conserves par signer. Un nouveau nonce
  doit etre strictement superieur au plus petit de cet ensemble et n'avoir
  jamais servi.
- Il doit tomber dans (T - 2 jours, T + 1 jour), T etant l'horodatage du bloc.
- Le signer est l'adresse de l'agent wallet quand on signe avec une cle d'API.

Ce que cela implique en code, et que `int(time.time() * 1000)` ne donne pas :

1. Deux appels dans la meme milliseconde doivent produire deux nonces
   differents. D'ou le `max(now, last + 1)`.
2. Un seul processus doit emettre les nonces d'un signer donne. Sur plusieurs
   workers, il faut un compteur atomique partage : `RedisNonceSource`.
3. Une horloge qui recule (NTP brutal, VM suspendue) ne doit jamais faire
   reculer le compteur. La monotonie est garantie par le compteur, pas par
   l'horloge.
"""

from __future__ import annotations

import threading
from typing import Protocol

from ..contracts.common import now_ms

# Marge de securite : on refuse de signer bien avant les bornes reelles de
# l'exchange, pour que le rejet vienne de nous (diagnostiquable) et non d'un
# INVALID_NONCE opaque.
MAX_PAST_MS = 36 * 60 * 60 * 1000   # 36 h, contre 48 h cote exchange
MAX_FUTURE_MS = 12 * 60 * 60 * 1000  # 12 h, contre 24 h cote exchange


class ClockDriftError(RuntimeError):
    """L'horloge locale s'est ecartee au point de rendre les nonces invalides."""


class NonceSource(Protocol):
    def next_nonce(self) -> int: ...


class MonotonicNonceSource:
    """Source en memoire, sure entre threads. Un seul processus signer.

    Suffisante pour un desk mono-processus, c'est-a-dire la configuration
    recommandee jusqu'a ce qu'il y ait une raison mesuree d'en changer.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._last = 0

    def next_nonce(self) -> int:
        with self._lock:
            candidate = now_ms()
            # L'horloge peut reculer ; le compteur, jamais.
            self._last = max(candidate, self._last + 1)
            return self._last

    @property
    def last(self) -> int:
        return self._last


class RedisNonceSource:
    """Compteur atomique partage, pour plusieurs processus signeurs.

    Le script Lua realise `max(horloge, compteur + 1)` en une seule operation
    atomique : sans cela, deux workers peuvent lire la meme valeur avant que
    l'un des deux n'ecrive.
    """

    _LUA = """
    local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
    local now = tonumber(ARGV[1])
    local nxt = math.max(now, cur + 1)
    redis.call('SET', KEYS[1], nxt)
    return nxt
    """

    def __init__(self, redis_client, key: str = "desk:nonce") -> None:
        self._redis = redis_client
        self._key = key
        self._script = redis_client.register_script(self._LUA)

    def next_nonce(self) -> int:
        return int(self._script(keys=[self._key], args=[now_ms()]))


def assert_nonce_window(nonce_ms: int, reference_ms: int | None = None) -> None:
    """Verifie qu'un nonce tombe dans la fenetre acceptable.

    Appelee juste avant la signature. Un echec ici est un probleme d'horloge ou
    de compteur, jamais une condition de marche : on leve plutot que de tenter
    l'envoi et d'obtenir un rejet illisible.
    """
    ref = reference_ms if reference_ms is not None else now_ms()
    delta = nonce_ms - ref
    if delta < -MAX_PAST_MS:
        raise ClockDriftError(
            f"nonce en retard de {-delta // 1000} s sur l'horloge : "
            "verifier chrony et l'etat du compteur"
        )
    if delta > MAX_FUTURE_MS:
        raise ClockDriftError(
            f"nonce en avance de {delta // 1000} s sur l'horloge : "
            "compteur desynchronise ou horloge revenue en arriere"
        )
