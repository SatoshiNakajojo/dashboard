"""La boucle de collecte : du WebSocket au disque, sans jamais bloquer l'un.

Trois invariants gouvernent ce module.

**Le disque ne doit jamais freiner le socket.** Ecrire directement depuis le
gestionnaire de message ferait de la latence disque une latence reseau : sur
une cascade de liquidations — le moment precis qu'on veut capturer — les
messages arrivent par rafales de plusieurs centaines par seconde, et un `fsync`
au mauvais moment fait deborder la file interne de `websockets`. D'ou une file
BORNEE entre les deux : le gestionnaire y depose et rend la main
immediatement ; un ecrivain la vide a son rythme.

**Une file bornee qui deborde perd des lignes, et les compte.** Le contraire
serait une file non bornee, qui ne perd rien jusqu'a ce que la memoire du VPS
soit pleine et que l'OOM killer prenne tout. Perdre cent lignes en le sachant
vaut mieux que perdre trois semaines sans le savoir.

**Un flux gele doit provoquer une reconnexion, pas une observation.** Le ping
applicatif envoie sans attendre de reponse : une connexion a moitie morte
laisse la lecture bloquee sans exception, donc sans backoff. Le chien de garde
lit `feeds()`, et quand tout est mort depuis assez longtemps, il ferme la
connexion pour forcer le chemin de reconnexion normal.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from pathlib import Path

from ..contracts.common import now_ms
from ..market.hyperliquid_ws import HyperliquidFeed, Subscription
from .ecrivain import EcrivainParquet
from .schemas import lignes as lignes_de

log = logging.getLogger(__name__)

TAILLE_FILE = 200_000
PERIODE_ENTRETIEN_S = 20.0
PERIODE_STATS_S = 300.0
# Un gel doit durer avant d'etre cru : Hyperliquid a des creux reels la nuit
# sur les actifs peu traites, et reconnecter a chaque accalmie martelerait
# l'API sans rien reparer.
TOLERANCE_GEL = 3
# Un flux peut legitimement se taire : `activeAssetCtx` publie par a-coups et
# un actif peu traite n'echange rien pendant des minutes. Le seuil vaut pour
# le silence de TOUT, pas d'un flux.
SILENCE_MAX_S = 120.0


class Collecteur:
    """Assemble le client WebSocket, la file et l'ecrivain."""

    def __init__(self, coins: list[str], racine: Path, *,
                 flux: tuple[str, ...] = ("trades", "l2Book", "bbo", "activeAssetCtx"),
                 testnet: bool = False, taille_file: int = TAILLE_FILE) -> None:
        self.coins = coins
        self.flux = flux
        self.ecrivain = EcrivainParquet(racine)
        self.client = HyperliquidFeed(testnet=testnet)
        self.file: asyncio.Queue = asyncio.Queue(maxsize=taille_file)
        self.messages = 0
        self.lignes_perdues_file = 0
        self.reconnexions_forcees = 0
        # Fraicheur suivie ICI, et pas via `client.feeds`.
        #
        # Le `_dispatch` du client P0 ne connait que les canaux dont il sait
        # faire des contrats : `bbo` n'en fait pas partie, donc ses
        # souscriptions restent eternellement NEVER_CONNECTED et le chien de
        # garde est aveugle dessus. Constate sur le premier essai reel :
        # « flux vivants 9/12 » alors que les douze recevaient des donnees.
        #
        # `on_raw` voit tout, lui. Suivre la fraicheur au niveau de
        # l'enregistreur garantit que la surveillance couvre exactement ce
        # qui est enregistre — ni plus, ni moins.
        self._dernier_vu: dict[str, float] = {}
        self._gel_consecutifs = 0
        self._demarre = time.monotonic()
        self._arret = asyncio.Event()

        for coin in coins:
            if "trades" in flux:
                self.client.subscribe(Subscription.trades(coin, max_age_ms=300_000))
            if "l2Book" in flux:
                self.client.subscribe(Subscription.book(coin, max_age_ms=120_000))
            if "bbo" in flux:
                self.client.subscribe(Subscription(
                    {"type": "bbo", "coin": coin}, f"bbo:{coin}", 120_000))
            if "activeAssetCtx" in flux:
                self.client.subscribe(Subscription.asset_ctx(coin, max_age_ms=600_000))
        self.client.on_raw = self._sur_message

    # ----------------------------------------------------------- ingestion

    async def _sur_message(self, msg: dict) -> None:
        """Depose et rend la main. Aucune E/S ici, jamais."""
        canal = msg.get("channel")
        if canal in (None, "pong", "subscriptionResponse", "error"):
            if canal == "error":
                log.warning("erreur Hyperliquid : %s", str(msg.get("data"))[:200])
            return
        self.messages += 1
        flux, lignes = lignes_de(canal, msg.get("data"), now_ms())
        if not lignes:
            return
        coin_vu = lignes[0].get("coin") or "?"
        self._dernier_vu[f"{flux}:{coin_vu}"] = time.monotonic()
        try:
            self.file.put_nowait((flux, lignes[0].get("coin") or "?", lignes))
        except asyncio.QueueFull:
            self.lignes_perdues_file += len(lignes)

    async def _ecriture(self) -> None:
        while not self._arret.is_set():
            try:
                flux, coin, lignes = await asyncio.wait_for(self.file.get(), timeout=1.0)
            except TimeoutError:
                continue
            self.ecrivain.ajouter(flux, coin, lignes)

    # ------------------------------------------------------------ entretien

    def _tout_gele(self, silence_max_s: float = SILENCE_MAX_S) -> bool:
        """Vrai si AUCUN flux n'a rien recu depuis trop longtemps.

        « Aucun », pas « un » : un actif peut legitimement ne rien echanger
        pendant des minutes, et `activeAssetCtx` ne publie que par a-coups.
        C'est le silence SIMULTANE de tout qui signale une connexion morte
        plutot qu'un marche calme.
        """
        if not self.client.connected:
            # Une deconnexion franche a deja son chemin : le backoff de
            # `run()`. Forcer par-dessus ne compterait que des reconnexions
            # imaginaires.
            return False
        if not self._dernier_vu:
            # Rien n'est jamais arrive : on laisse la connexion s'etablir,
            # sinon un forcage a froid boucle sans jamais rien recevoir.
            return False
        maintenant = time.monotonic()
        return all(maintenant - vu > silence_max_s
                   for vu in self._dernier_vu.values())

    @property
    def flux_vivants(self) -> int:
        maintenant = time.monotonic()
        return sum(1 for vu in self._dernier_vu.values()
                   if maintenant - vu <= SILENCE_MAX_S)

    async def _entretien(self) -> None:
        derniere_stat = time.monotonic()
        while not self._arret.is_set():
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._arret.wait(), timeout=PERIODE_ENTRETIEN_S)
            if self._arret.is_set():
                break

            self.ecrivain.vider_expires()

            if self._tout_gele():
                self._gel_consecutifs += 1
                if self._gel_consecutifs >= TOLERANCE_GEL:
                    self.reconnexions_forcees += 1
                    await self.client.force_reconnect(
                        f"tous les flux muets depuis "
                        f"{TOLERANCE_GEL * PERIODE_ENTRETIEN_S:.0f} s")
                    self._gel_consecutifs = 0
            else:
                self._gel_consecutifs = 0

            if time.monotonic() - derniere_stat >= PERIODE_STATS_S:
                derniere_stat = time.monotonic()
                self.journaliser_etat()

    def journaliser_etat(self) -> None:
        e = self.ecrivain
        vivants = self.flux_vivants
        log.info(
            "up %.1f h · %d msg · %d lignes ecrites · %d segments · "
            "file %d · flux vivants %d/%d · perdues file %d disque %d · "
            "erreurs %d · reconnexions forcees %d · libre %.0f Mo",
            (time.monotonic() - self._demarre) / 3600, self.messages,
            e.lignes_ecrites, e.segments_ecrits, self.file.qsize(),
            vivants, len(self._dernier_vu) or len(self.client.feeds),
            self.lignes_perdues_file,
            e.lignes_perdues_disque, e.erreurs, self.reconnexions_forcees,
            e.espace_libre_mo(),
        )

    # ------------------------------------------------------------------ vie

    async def run(self) -> None:
        log.info("enregistreur : %d actifs (%s), flux %s, racine %s",
                 len(self.coins), ", ".join(self.coins), ", ".join(self.flux),
                 self.ecrivain.racine)
        taches = [asyncio.create_task(self.client.run()),
                  asyncio.create_task(self._ecriture()),
                  asyncio.create_task(self._entretien())]
        try:
            await self._arret.wait()
        finally:
            self.client.stop()
            for t in taches:
                t.cancel()
            await asyncio.gather(*taches, return_exceptions=True)
            # Le drain final compte : sans lui, l'arret propre perdrait
            # exactement ce que la file contenait, soit jusqu'a cinq minutes
            # de collecte a chaque redemarrage du service.
            while not self.file.empty():
                flux, coin, lignes = self.file.get_nowait()
                self.ecrivain.ajouter(flux, coin, lignes)
            self.ecrivain.vider_tout()
            self.journaliser_etat()
            log.info("enregistreur arrete proprement")

    def arreter(self) -> None:
        self._arret.set()
