"""Le desk s'arrete quand on lui envoie un signal.

Ce fichier ne corrige rien : au 12 septembre 2026, le desk s'arrete
correctement sur SIGINT et SIGTERM, en moins d'une seconde. Il existe comme
GARDE-FOU, parce que cette propriete ne depend pas que de notre code et
peut se perdre sans que rien ne le signale.

Le risque concret : `uvicorn.Server.serve()` s'execute dans
`with self.capture_signals():`, qui pose ses propres gestionnaires sur
SIGINT et SIGTERM. Aujourd'hui uvicorn les rend proprement et le processus
sort ; une version future qui les rendrait mal laisserait la tache
d'ingestion tourner — et `run_ingestion` ne rend la main que sur
annulation. Le desk continuerait alors a ecrire ses logs exactement comme
avant, ce qui est la pire des pannes : rien a l'ecran ne dirait que Ctrl+C
n'a servi a rien, et on croirait le desk arrete.

D'ou la forme : on lance un VRAI processus et on lui envoie un VRAI signal.
Un test qui appellerait `main_async` dans la boucle de pytest poserait ses
gestionnaires dans le processus de test, ne passerait pas par
`asyncio.run`, et resterait vert le jour ou une dependance confisquerait le
signal — c'est-a-dire le seul jour ou il servirait a quelque chose.
"""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time

import pytest

DELAI_DEMARRAGE = 60.0
DELAI_ARRET = 15.0


def _port_libre() -> int:
    """Un port attribue par le systeme, pour ne pas heurter un desk en cours.

    Ce test tue ce qu'il lance : viser 8787 reviendrait a tuer le desk de
    quelqu'un. Le prix d'une collision de ports est un test rouge ; celui
    d'un desk reel interrompu serait sans commune mesure.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _lancer(port: int) -> subprocess.Popen:
    env = {**os.environ, "DESK_API_PORT": str(port), "PYTHONUNBUFFERED": "1"}
    return subprocess.Popen(
        [sys.executable, "-m", "trading_desk", "--demo"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, env=env,
        # Une session a part : le signal va au desk, jamais a pytest.
        start_new_session=True,
    )


def _attendre_le_serveur(proc: subprocess.Popen, port: int) -> None:
    limite = time.monotonic() + DELAI_DEMARRAGE
    while time.monotonic() < limite:
        if proc.poll() is not None:
            pytest.fail(f"le desk est mort au demarrage :\n{proc.stdout.read()}")
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.25)
    pytest.fail("le desk n'a pas ouvert son port")


def _tuer(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        proc.kill()
        proc.wait(timeout=10)


@pytest.mark.parametrize("sig", [signal.SIGINT, signal.SIGTERM])
def test_le_desk_s_arrete_sur_signal(sig):
    """SIGINT (Ctrl+C) et SIGTERM doivent tous deux arreter le desk.

    SIGTERM compte autant que SIGINT : c'est celui qu'envoie `kill`, et
    celui par lequel un gestionnaire de services arrete un processus. Un
    desk qui ne repond qu'a l'un des deux se fera tuer de force par l'autre,
    sans passer par `store.commit()`.
    """
    port = _port_libre()
    proc = _lancer(port)
    try:
        _attendre_le_serveur(proc, port)

        # Verifier que c'est bien LE SIGNAL qui arrete le desk, et non le
        # desk qui se terminait de lui-meme. Sans ce temoin, le test
        # resterait vert alors qu'il ne prouverait plus rien.
        time.sleep(2.0)
        assert proc.poll() is None, (
            "le desk s'est arrete tout seul avant le signal : "
            "ce test ne prouve plus rien")

        proc.send_signal(sig)
        try:
            proc.wait(timeout=DELAI_ARRET)
        except subprocess.TimeoutExpired:
            pytest.fail(
                f"le desk a survecu a {sig.name} pendant {DELAI_ARRET} s. "
                "Une couche confisque le signal — regarder d'abord "
                "`capture_signals` dans uvicorn.")
    finally:
        _tuer(proc)
