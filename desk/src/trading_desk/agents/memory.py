"""Mémoire du desk : les leçons des trades clos.

**Une mémoire que personne ne lit est du théâtre.** Ce module est donc branché
sur le prompt de la Stratégie : ce qui est écrit ici revient devant l'agent
qui propose, au moment où il propose.

Choix de conception qui mérite d'être défendu : **pas d'embeddings.**

Le réflexe serait une base vectorielle. Mais la question que le desk pose à sa
mémoire n'est pas sémantique, elle est structurée : « qu'est-ce qui s'est
passé les fois précédentes, sur CET actif, dans CE régime, dans CE sens ? ».
C'est un filtre, pas une recherche de similarité — et un filtre exact bat une
approximation vectorielle sur exactement ce genre de question.

S'ajoute une raison pratique : sur quelques centaines de leçons, un index
vectoriel n'apporte rien qu'un `WHERE` ne donne déjà, tout en ajoutant une
dépendance, un fournisseur d'embeddings et une clé de plus. `pgvector` reste
la porte de sortie si le corpus grossit au point que la recherche libre
devienne utile — le protocole ci-dessous ne changerait pas.

Un recouvrement lexical départage les leçons à égalité de filtre, pour que la
plus proche du contexte remonte en premier.
"""

from __future__ import annotations

import json
import re
import sqlite3
from decimal import Decimal
from pathlib import Path
from typing import Protocol

from pydantic import Field

from ..contracts.common import Frozen, Regime, Side, now_ms

SCHEMA = """
CREATE TABLE IF NOT EXISTS lessons (
    lesson_id   TEXT PRIMARY KEY,
    ts_ms       INTEGER NOT NULL,
    asset       TEXT    NOT NULL,
    regime      TEXT    NOT NULL,
    side        TEXT    NOT NULL,
    outcome     TEXT    NOT NULL,
    pnl_r       TEXT,
    was_taken   INTEGER NOT NULL,
    lesson      TEXT    NOT NULL,
    tags        TEXT    NOT NULL,
    journal_ref TEXT
);
CREATE INDEX IF NOT EXISTS idx_lessons_lookup ON lessons(asset, regime, side);
CREATE INDEX IF NOT EXISTS idx_lessons_ts ON lessons(ts_ms DESC);
"""

_WORD = re.compile(r"[a-zà-ÿ0-9]{4,}", re.IGNORECASE)


class Lesson(Frozen):
    """Ce qu'un trade clos a appris. Une par trade, courte, réutilisable.

    `was_taken` distingue une leçon tirée d'une position réellement prise
    d'une leçon tirée du registre fantôme. Les mélanger ferait croire à une
    expérience qu'on n'a pas eue.
    """

    lesson_id: str
    ts_ms: int = Field(default_factory=now_ms)
    asset: str
    regime: Regime = Regime.UNKNOWN
    side: Side
    outcome: str                      # "cible", "stop", "sortie", "fin de periode"
    pnl_r: Decimal | None = None
    was_taken: bool = True
    lesson: str = Field(max_length=400)
    tags: tuple[str, ...] = ()
    journal_ref: str = ""

    @property
    def was_loss(self) -> bool:
        return self.pnl_r is not None and self.pnl_r < 0


class LessonStore(Protocol):
    def remember(self, lesson: Lesson) -> None: ...
    def recall(self, *, asset: str, regime: Regime, side: Side | None,
               limit: int) -> list[Lesson]: ...


class SqliteLessonStore:
    """Mémoire sur SQLite. Rappel structuré, départage lexical."""

    def __init__(self, path: str | Path = "desk.db") -> None:
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(SCHEMA)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    def remember(self, lesson: Lesson) -> None:
        self._conn.execute(
            "INSERT OR REPLACE INTO lessons "
            "(lesson_id, ts_ms, asset, regime, side, outcome, pnl_r, was_taken, "
            " lesson, tags, journal_ref) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (lesson.lesson_id, lesson.ts_ms, lesson.asset.upper(),
             lesson.regime.value, lesson.side.value, lesson.outcome,
             str(lesson.pnl_r) if lesson.pnl_r is not None else None,
             int(lesson.was_taken), lesson.lesson,
             json.dumps(list(lesson.tags), ensure_ascii=False), lesson.journal_ref),
        )
        self._conn.commit()

    def recall(
        self,
        *,
        asset: str,
        regime: Regime = Regime.UNKNOWN,
        side: Side | None = None,
        limit: int = 5,
        context_text: str = "",
    ) -> list[Lesson]:
        """Rappelle les leçons pertinentes, du filtre le plus strict au plus large.

        L'élargissement est progressif et s'arrête dès qu'il y a de quoi
        répondre : même actif + même régime + même sens, puis actif + régime,
        puis actif seul, puis régime seul. Sauter directement au filtre large
        noierait la leçon la plus proche sous des cas sans rapport.
        """
        strates: list[tuple[str, tuple]] = [
            ("asset = ? AND regime = ? AND side = ?",
             (asset.upper(), regime.value, side.value if side else "")),
            ("asset = ? AND regime = ?", (asset.upper(), regime.value)),
            ("asset = ?", (asset.upper(),)),
            ("regime = ?", (regime.value,)),
        ]
        if side is None:
            strates = strates[1:]

        vues: dict[str, Lesson] = {}
        for where, params in strates:
            rows = self._conn.execute(
                f"SELECT * FROM lessons WHERE {where} ORDER BY ts_ms DESC LIMIT ?",  # noqa: S608
                (*params, limit * 3),
            ).fetchall()
            for row in rows:
                lesson = self._row_to_lesson(row)
                vues.setdefault(lesson.lesson_id, lesson)
            if len(vues) >= limit:
                break

        classees = sorted(
            vues.values(),
            key=lambda x: (_overlap(context_text, x), x.ts_ms),
            reverse=True,
        )
        return classees[:limit]

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) AS n FROM lessons").fetchone()["n"]

    def _row_to_lesson(self, row: sqlite3.Row) -> Lesson:
        return Lesson(
            lesson_id=row["lesson_id"], ts_ms=row["ts_ms"], asset=row["asset"],
            regime=Regime(row["regime"]), side=Side(row["side"]),
            outcome=row["outcome"],
            pnl_r=Decimal(row["pnl_r"]) if row["pnl_r"] is not None else None,
            was_taken=bool(row["was_taken"]), lesson=row["lesson"],
            tags=tuple(json.loads(row["tags"])), journal_ref=row["journal_ref"] or "",
        )


def _overlap(context_text: str, lesson: Lesson) -> int:
    """Recouvrement de vocabulaire, pour départager à filtre égal.

    Grossier et assumé : ce n'est pas de la recherche sémantique, c'est un
    départage. Le vrai travail de pertinence est fait par le filtre structuré
    au-dessus.
    """
    if not context_text:
        return 0
    mots = set(m.lower() for m in _WORD.findall(context_text))
    corpus = set(m.lower() for m in _WORD.findall(lesson.lesson + " " + " ".join(lesson.tags)))
    return len(mots & corpus)


def format_for_prompt(lessons: list[Lesson]) -> str:
    """Rend les leçons lisibles par un agent.

    Les pertes sont marquées : c'est ce qu'on veut que l'agent regarde en
    premier. Une mémoire qui présente ses succès et ses échecs sur le même
    ton n'apprend rien à personne.
    """
    if not lessons:
        return ""
    lignes = ["Leçons de trades passés dans un contexte comparable :", ""]
    for x in lessons:
        marque = "PERTE" if x.was_loss else "gain" if x.pnl_r else "clos"
        source = "" if x.was_taken else " [registre fantôme, non pris]"
        resultat = f" ({x.pnl_r:+.2f} R)" if x.pnl_r is not None else ""
        lignes.append(
            f"- [{marque}{resultat}] {x.asset} {x.side.value} en {x.regime.value}"
            f"{source} : {x.lesson}"
        )
    lignes.append("")
    lignes.append(
        "Ces leçons sont des précédents, pas des règles. Un contexte "
        "superficiellement semblable peut appeler une décision opposée."
    )
    return "\n".join(lignes)
