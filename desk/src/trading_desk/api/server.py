"""Serveur de supervision : API JSON, flux SSE, et l'interface elle-meme.

Il ecoute sur 127.0.0.1 par defaut. Pour y acceder depuis un telephone, on
passe par un tunnel SSH — jamais en exposant le port. Ce serveur peut arreter
le desk : il ne doit pas etre joignable depuis l'exterieur.

Le kill switch est un simple POST, sans dependance a l'etat du reste du
systeme, pour rester utilisable exactement quand tout va mal.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel

from ..contracts.common import HaltReason
from .state import DeskState

UI_FILE = Path(__file__).resolve().parent.parent / "ui" / "index.html"


class HaltRequest(BaseModel):
    reason: str = HaltReason.MANUAL.value
    detail: str = ""


def create_app(state: DeskState) -> FastAPI:
    app = FastAPI(title="Trading Desk — supervision", docs_url="/api/docs")

    @app.get("/", response_class=HTMLResponse)
    async def index() -> str:
        if not UI_FILE.exists():
            return "<h1>Interface absente</h1><p>ui/index.html introuvable.</p>"
        return UI_FILE.read_text(encoding="utf-8")

    @app.get("/api/snapshot")
    async def snapshot() -> dict[str, Any]:
        return state.snapshot()

    @app.get("/api/journal")
    async def journal(limit: int = 40) -> list[dict[str, Any]]:
        return state.store.recent_journal(min(max(limit, 1), 200))

    @app.post("/api/halt")
    async def halt(req: HaltRequest) -> dict[str, Any]:
        """Kill switch. Toujours disponible, meme desk deja arrete."""
        try:
            reason = HaltReason(req.reason)
        except ValueError:
            reason = HaltReason.MANUAL
        state.halt(reason, req.detail or "arret demande depuis l'interface")
        return {"halted": True, "reason": reason.value}

    @app.post("/api/arm")
    async def arm() -> dict[str, Any]:
        """Rearmement. Ne verifie pas les invariants : c'est l'evaluation
        suivante qui rearretera le desk si la cause est toujours la."""
        state.arm()
        v = state.verdict()
        return {
            "halted": False,
            "healthy": v.approved,
            "blocking": [i.value for i in v.blocking],
        }

    @app.get("/api/stream")
    async def stream() -> StreamingResponse:
        """Flux SSE : un instantane par seconde.

        Le polling cote navigateur ferait le meme travail, mais SSE evite de
        redemander un etat inchange et se reconnecte tout seul.
        """
        async def gen():
            try:
                while True:
                    payload = json.dumps(state.snapshot(), default=str)
                    yield f"data: {payload}\n\n"
                    await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                return

        return StreamingResponse(
            gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        v = state.verdict()
        if state.halted:
            raise HTTPException(status_code=503, detail="desk arrete")
        return {"ok": v.approved, "blocking": [i.value for i in v.blocking]}

    return app
