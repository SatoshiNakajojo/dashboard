"""Fusion des segments d'un jour en un fichier journalier par actif et flux.

    <racine>/BTC/partiel/BTC_book_2026-09-06_*.parquet   (des dizaines)
                 -> <racine>/BTC/BTC_book_2026-09-06.parquet

L'ordre des operations est la seule chose qui compte ici, et il est
volontairement pusillanime :

1. lire tous les segments du jour ;
2. ecrire le fichier fusionne sous `.tmp` ;
3. **le relire** et verifier que son compte de lignes egale la somme lue ;
4. renommer, puis seulement alors supprimer les segments.

Une fusion qui ecrirait puis effacerait sans relire detruirait les donnees le
jour ou le disque se remplit en cours d'ecriture — le moment ou l'on a le
plus besoin qu'elle soit prudente. Le cout de la relecture est de quelques
secondes par jour et par flux ; le cout de l'imprudence est irreversible.

Le jour EN COURS n'est jamais compacte : ses segments continuent d'arriver.
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import pyarrow.parquet as pq

log = logging.getLogger(__name__)


def segments_par_jour(racine: Path) -> dict[tuple[str, str, str], list[Path]]:
    """Indexe les segments par (actif, flux, jour)."""
    trouves: dict[tuple[str, str, str], list[Path]] = defaultdict(list)
    for chemin in sorted(racine.glob("*/partiel/*.parquet")):
        morceaux = chemin.stem.split("_")
        if len(morceaux) < 4:
            log.warning("nom de segment inattendu, ignore : %s", chemin.name)
            continue
        coin, flux, jour = morceaux[0], morceaux[1], morceaux[2]
        trouves[(coin, flux, jour)].append(chemin)
    return trouves


def compacter(racine: Path, *, jour_courant: str | None = None,
              supprimer: bool = True) -> list[tuple[str, int]]:
    """Compacte tous les jours revolus. Renvoie (fichier, lignes)."""
    racine = Path(racine)
    aujourdhui = jour_courant or datetime.now(UTC).strftime("%Y-%m-%d")
    faits: list[tuple[str, int]] = []

    for (coin, flux, jour), segments in sorted(segments_par_jour(racine).items()):
        if jour >= aujourdhui:
            continue  # jour en cours : les segments arrivent encore

        cible = racine / coin / f"{coin}_{flux}_{jour}.parquet"
        sources = list(segments)
        if cible.exists():
            # Reprise apres interruption : le fichier du jour existe deja et
            # de nouveaux segments sont apparus. On le REINTEGRE au lieu de
            # l'ecraser, sinon une reprise perd la premiere fusion.
            sources.append(cible)

        try:
            tables = [pq.read_table(s) for s in sources]
        except Exception as exc:
            log.error("%s %s %s : lecture impossible (%s) — jour laisse intact",
                      coin, flux, jour, exc)
            continue

        attendu = sum(t.num_rows for t in tables)
        if attendu == 0:
            continue
        import pyarrow as pa
        fusion = pa.concat_tables(tables)
        # Tri par horodatage : les segments arrivent dans l'ordre, mais un
        # segment a cheval sur minuit peut etre ecrit apres un plus recent.
        fusion = fusion.sort_by([("ts_ms", "ascending")])

        temporaire = cible.with_suffix(".parquet.tmp")
        try:
            pq.write_table(fusion, temporaire, compression="zstd")
            relu = pq.read_metadata(temporaire).num_rows
        except Exception as exc:
            log.error("%s : ecriture/relecture echouee (%s) — segments gardes",
                      cible.name, exc)
            temporaire.unlink(missing_ok=True)
            continue

        if relu != attendu:
            log.error("%s : %d lignes relues pour %d attendues — segments GARDES",
                      cible.name, relu, attendu)
            temporaire.unlink(missing_ok=True)
            continue

        temporaire.replace(cible)
        if supprimer:
            for s in segments:      # jamais `sources` : `cible` y figure
                s.unlink(missing_ok=True)
        faits.append((cible.name, relu))
        log.info("compacte %s : %d lignes depuis %d segments",
                 cible.name, relu, len(segments))

    return faits


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--racine", default="enregistrement")
    p.add_argument("--garder-segments", action="store_true",
                   help="ne pas supprimer les segments apres fusion")
    p.add_argument("--jour-courant", default=None,
                   help="AAAA-MM-JJ traite comme « en cours » (pour les tests)")
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

    faits = compacter(Path(args.racine), jour_courant=args.jour_courant,
                      supprimer=not args.garder_segments)
    if not faits:
        print("  Rien a compacter.")
    for nom, lignes in faits:
        print(f"  {nom:<44} {lignes:>10} lignes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
