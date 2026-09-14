"""Ecriture Parquet : segments courts, fichiers journaliers par compactage.

**Pourquoi pas un `ParquetWriter` ouvert toute la journee.** Un fichier
Parquet n'est lisible qu'une fois son pied de page ecrit, a la fermeture. Un
writer garde ouvert 24 h et un processus tue — OOM, `kill -9`, coupure
electrique du VPS — laisse un fichier sans pied de page : **illisible en
entier**, pas tronque. On perdrait une journee complete de collecte pour un
incident de trois secondes.

D'ou des SEGMENTS : un fichier clos toutes les N lignes ou T secondes, dans
`partiel/`. Un incident coute au pire un segment. Le compactage quotidien
fusionne ensuite les segments de la veille en le fichier journalier voulu, et
ne supprime les segments qu'apres avoir **relu** le fichier fusionne et
verifie son compte de lignes. Un compactage qui se contenterait d'ecrire puis
d'effacer serait exactement le genre d'operation qui detruit des donnees le
jour ou le disque est plein.

Deux gardes qui n'ont l'air de rien :

- **le disque.** En dessous du seuil libre, on cesse d'ecrire et on le hurle
  dans le journal. Ecrire jusqu'a saturation ferait tomber le VPS entier, pas
  seulement l'enregistreur.
- **les lignes perdues sont comptees.** Une perte silencieuse laisserait
  croire a un marche calme la ou il y a eu une rafale.
"""

from __future__ import annotations

import logging
import shutil
import time
from datetime import UTC, datetime
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from .schemas import SCHEMAS

log = logging.getLogger(__name__)

MAX_LIGNES = 20_000
MAX_SECONDES = 300.0
MIN_LIBRE_MO = 2_000.0


def jour_utc(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, UTC).strftime("%Y-%m-%d")


class EcrivainParquet:
    """Un tampon par (actif, flux), vide en segments Parquet.

    Ne leve jamais vers l'appelant : une erreur d'ecriture est comptee et
    journalisee, jamais propagee. L'enregistreur doit survivre a son disque.
    """

    def __init__(self, racine: Path, *, max_lignes: int = MAX_LIGNES,
                 max_secondes: float = MAX_SECONDES,
                 min_libre_mo: float = MIN_LIBRE_MO) -> None:
        self.racine = Path(racine)
        self.max_lignes = max_lignes
        self.max_secondes = max_secondes
        self.min_libre_mo = min_libre_mo
        self._tampons: dict[tuple[str, str], list[dict]] = {}
        self._depuis: dict[tuple[str, str], float] = {}
        self.lignes_ecrites = 0
        self.segments_ecrits = 0
        self.erreurs = 0
        self.lignes_perdues_disque = 0
        self._disque_plein = False
        self._sequence = 0

    # ------------------------------------------------------------------ etat

    def espace_libre_mo(self) -> float:
        try:
            self.racine.mkdir(parents=True, exist_ok=True)
            return shutil.disk_usage(self.racine).free / (1024 * 1024)
        except OSError:
            return 0.0

    @property
    def en_attente(self) -> int:
        return sum(len(v) for v in self._tampons.values())

    # --------------------------------------------------------------- ecriture

    def ajouter(self, flux: str, coin: str, lignes: list[dict]) -> None:
        if not lignes or flux not in SCHEMAS:
            return
        if self._disque_plein:
            self.lignes_perdues_disque += len(lignes)
            return
        cle = (coin, flux)
        tampon = self._tampons.setdefault(cle, [])
        if not tampon:
            self._depuis[cle] = time.monotonic()
        tampon.extend(lignes)
        if len(tampon) >= self.max_lignes:
            self.vider_un(cle)

    def vider_expires(self) -> None:
        """Vide les tampons trop vieux. A appeler periodiquement.

        Sans ca, un flux peu bavard — `ctx` en publie une poignee par minute —
        garderait ses lignes en memoire des heures, et un incident les
        perdrait toutes.
        """
        maintenant = time.monotonic()
        for cle in list(self._tampons):
            if (self._tampons[cle]
                    and maintenant - self._depuis.get(cle, maintenant) >= self.max_secondes):
                self.vider_un(cle)

    def vider_tout(self) -> None:
        for cle in list(self._tampons):
            self.vider_un(cle)

    def vider_un(self, cle: tuple[str, str]) -> None:
        lignes = self._tampons.get(cle) or []
        if not lignes:
            return
        coin, flux = cle

        libre = self.espace_libre_mo()
        if libre < self.min_libre_mo:
            if not self._disque_plein:
                log.error("DISQUE PLEIN : %.0f Mo libres < %.0f requis — "
                          "ARRET DES ECRITURES", libre, self.min_libre_mo)
            self._disque_plein = True
            self.lignes_perdues_disque += len(lignes)
            self._tampons[cle] = []
            return

        # Un tampon peut chevaucher minuit : on decoupe par jour UTC pour que
        # chaque segment appartienne a un seul fichier journalier.
        par_jour: dict[str, list[dict]] = {}
        for ligne in lignes:
            par_jour.setdefault(jour_utc(int(ligne["ts_ms"])), []).append(ligne)

        self._tampons[cle] = []
        for jour, groupe in par_jour.items():
            self._ecrire_segment(coin, flux, jour, groupe)

    def _ecrire_segment(self, coin: str, flux: str, jour: str,
                        lignes: list[dict]) -> None:
        dossier = self.racine / coin / "partiel"
        horodatage = datetime.now(UTC).strftime("%H%M%S%f")[:-3]
        # LE NUMERO D'ORDRE N'EST PAS DECORATIF.
        #
        # L'horodatage s'arrete a la milliseconde. Deux segments du meme
        # flux vides dans la meme milliseconde portaient donc le MEME nom,
        # et le `rename` ci-dessous ecrasait le premier sans rien dire :
        # des lignes de marche disparaissaient, et le seul symptome etait un
        # fichier journalier plus court que prevu.
        #
        # Ce n'est pas theorique : c'est ce qui rendait
        # `test_le_compactage_fusionne_et_supprime_les_segments` intermittent
        # — trois segments ecrits d'affilee, douze lignes attendues, huit
        # obtenues quand la machine allait assez vite.
        #
        # Le compteur suffit dans un processus. La boucle qui suit couvre le
        # cas ou deux processus ecriraient dans le meme dossier : on ne
        # reutilise jamais un nom qui existe deja.
        self._sequence += 1
        base = f"{coin}_{flux}_{jour}_{horodatage}_{self._sequence:04d}"
        chemin = dossier / f"{base}.parquet"
        try:
            dossier.mkdir(parents=True, exist_ok=True)
            secours = 0
            while chemin.exists():
                secours += 1
                chemin = dossier / f"{base}-{secours}.parquet"
            table = pa.Table.from_pylist(lignes, schema=SCHEMAS[flux])
            # `.tmp` puis `rename` : le renommage est atomique sur un meme
            # systeme de fichiers, donc un lecteur ne voit jamais un segment
            # a moitie ecrit — y compris le compactage qui tourne en parallele.
            temporaire = chemin.with_suffix(".parquet.tmp")
            pq.write_table(table, temporaire, compression="zstd")
            temporaire.rename(chemin)
            self.lignes_ecrites += len(lignes)
            self.segments_ecrits += 1
        except Exception as exc:  # une panne d'ecriture ne doit pas tuer la collecte
            self.erreurs += 1
            log.error("ecriture %s echouee : %s", chemin.name, exc)
