"""Point d'entree de l'enregistreur. Concu pour tourner sous systemd, H24.

    python -m trading_desk.enregistreur --coins BTC ETH SOL --racine /var/lib/desk

Deux comportements qui n'ont de sens que pour un service :

- **SIGTERM vide les tampons avant de rendre la main.** `systemctl restart`
  envoie SIGTERM ; sans ce traitement, chaque redemarrage perdrait le contenu
  de la file et des tampons, soit jusqu'a cinq minutes de collecte.
- **Le compactage tourne en tache de fond**, une fois par heure, sur les jours
  revolus uniquement. Le lancer depuis le processus de collecte plutot que
  depuis un cron evite qu'un cron oublie tourne sur un dossier ou l'ecrivain
  n'ecrit plus.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import logging
import signal
import sys
from pathlib import Path

from .collecte import Collecteur
from .compactage import compacter

log = logging.getLogger("enregistreur")

PERIODE_COMPACTAGE_S = 3600.0


async def _compactage_periodique(racine: Path, arret: asyncio.Event) -> None:
    while not arret.is_set():
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(arret.wait(), timeout=PERIODE_COMPACTAGE_S)
        if arret.is_set():
            return
        try:
            # Dans un thread : la fusion lit et reecrit des dizaines de Mo, et
            # la faire dans la boucle asyncio bloquerait la lecture du socket
            # pendant plusieurs secondes — exactement ce que la file bornee
            # cherche a eviter.
            faits = await asyncio.to_thread(compacter, racine)
            for nom, n in faits:
                log.info("compacte %s (%d lignes)", nom, n)
        except Exception as exc:
            log.error("compactage echoue, reessai dans 1 h : %s", exc)


async def _run(args) -> int:
    collecteur = Collecteur(
        args.coins, Path(args.racine), flux=tuple(args.flux),
        testnet=args.testnet, taille_file=args.taille_file,
    )
    arret = asyncio.Event()

    def demander_arret(nom: str) -> None:
        log.info("%s recu — vidage des tampons puis arret", nom)
        arret.set()
        collecteur.arreter()

    boucle = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        with contextlib.suppress(NotImplementedError):
            boucle.add_signal_handler(sig, demander_arret, sig.name)

    tache_compactage = asyncio.create_task(
        _compactage_periodique(Path(args.racine), arret))
    try:
        await collecteur.run()
    finally:
        arret.set()
        tache_compactage.cancel()
        await asyncio.gather(tache_compactage, return_exceptions=True)
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--coins", nargs="+",
                   default=["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX"],
                   help="les memes sept actifs que la grille de robustesse, "
                        "pour que la microstructure soit comparable au reste")
    p.add_argument("--racine", default="enregistrement")
    p.add_argument("--flux", nargs="+",
                   default=["trades", "l2Book", "bbo", "activeAssetCtx"])
    p.add_argument("--testnet", action="store_true")
    p.add_argument("--taille-file", type=int, default=200_000)
    p.add_argument("--verbeux", action="store_true")
    args = p.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbeux else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s %(message)s",
        stream=sys.stdout,   # journald capture stdout
    )
    try:
        return asyncio.run(_run(args))
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
