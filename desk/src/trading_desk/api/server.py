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
from . import recherche
from .state import DeskState

UI_FILE = Path(__file__).resolve().parent.parent / "ui" / "index.html"


# Une courbe d'equite compte une valeur par barre : six mois en 4 h font
# ~1100 points, en 15 min ~17000. Les envoyer tous a un navigateur ne rend
# pas le trace plus juste — l'ecran fait 1200 pixels de large — mais rend la
# reponse dix fois plus lourde.
MAX_POINTS = 900


def _echantillonner(courbe, bars) -> list[dict[str, Any]]:
    """Sous-echantillonne une courbe d'equite en gardant ses EXTREMES.

    Un `courbe[::pas]` naif est le piege : il peut sauter par-dessus le plus
    bas d'un drawdown et afficher une courbe plus lisse que la realite. Sur un
    tableau de bord de trading, la vallee est precisement ce qu'on regarde.

    On decoupe donc en tranches et on garde, dans chacune, le premier point,
    le minimum et le maximum — dans leur ordre d'apparition, pour que le trace
    reste chronologique.
    """
    n = min(len(courbe), len(bars))
    if n == 0:
        return []
    if n <= MAX_POINTS:
        return [{"ts_ms": bars[i].ts_ms, "v": float(courbe[i])} for i in range(n)]

    largeur = n / (MAX_POINTS / 3)
    points: list[dict[str, Any]] = []
    debut = 0
    while debut < n:
        fin = min(n, int(debut + largeur) if int(debut + largeur) > debut else debut + 1)
        tranche = range(debut, fin)
        i_min = min(tranche, key=lambda i: courbe[i])
        i_max = max(tranche, key=lambda i: courbe[i])
        for i in sorted({debut, i_min, i_max}):
            points.append({"ts_ms": bars[i].ts_ms, "v": float(courbe[i])})
        debut = fin
    if points[-1]["ts_ms"] != bars[n - 1].ts_ms:
        points.append({"ts_ms": bars[n - 1].ts_ms, "v": float(courbe[n - 1])})
    return points


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

    @app.get("/api/recherche")
    def recherche_tout() -> dict[str, Any]:
        """Tous les panneaux de recherche, en un appel.

        Endpoint SYNCHRONE, deliberement. Il lit des fichiers, et un `def`
        (par opposition a `async def`) fait tourner FastAPI dans son pool de
        threads : une lecture de 400 ko ne bloque alors pas la boucle
        d'evenements, donc ne fige pas le flux SSE ni le kill switch. Le
        kill switch doit rester joignable exactement quand tout va mal, y
        compris quand quelqu'un vient de demander un gros panneau.
        """
        return recherche.tout(
            store=state.store,
            racine_collecte=state.settings.enregistreur_racine,
        )

    @app.get("/api/courbe")
    def courbe(strategie: str, actif: str = "BTC", intervalle: str = "1d",
               equite: float = 1000.0) -> dict[str, Any]:
        """La courbe d'équité d'une stratégie, contre détenir l'actif.

        Le backtest est REJOUE a la demande plutot que lu dans un fichier :
        c'est deterministe — memes barres, memes parametres, meme resultat —
        et cela garantit que la courbe affichee vient du moteur en vigueur, pas
        d'un artefact produit par une version anterieure.

        La reference est `benchmark_buy_and_hold`, qui a son propre chemin de
        code parce qu'un buy and hold n'a pas de stop. Le faire passer par le
        moteur de strategies lui en imposerait un et flatterait tout ce qu'on
        lui compare.
        """
        from decimal import Decimal

        from ..backtest.data import DataUnavailable, load_from_file
        from ..backtest.engine import benchmark_buy_and_hold, run_backtest
        from ..backtest.strategies import (
            BASELINES,
            PLAFOND_STOP_CAMPAGNE_BPS,
            parametres,
        )
        from ..risk import RiskLimits

        cls = BASELINES.get(strategie)
        if cls is None:
            raise HTTPException(404, f"stratégie inconnue : {strategie}")

        fichier = recherche.DONNEES / f"{actif.upper()}_{intervalle}_real.json"
        if not fichier.exists():
            raise HTTPException(
                404,
                f"{fichier.name} absent. Le produire avec "
                f"`python scripts/fetch_candles.py --asset {actif.upper()} "
                f"--interval {intervalle}`.",
            )

        try:
            bars = load_from_file(fichier, actif.upper(), intervalle)
        except DataUnavailable as exc:
            raise HTTPException(422, str(exc)) from exc

        kw = parametres(strategie, intervalle)
        equity = Decimal(str(equite))
        # MEMES limites que la grille de robustesse. Avec le plafond de stop
        # par defaut (500 bps), `tsmom BTC 1d` fait zero trade et 2 158 rejets :
        # la courbe serait plate, et lue comme une defaite face au marche.
        limits = RiskLimits(
            max_stop_distance_bps=Decimal(str(PLAFOND_STOP_CAMPAGNE_BPS)))
        try:
            obs = run_backtest(bars, cls(**kw), interval=intervalle,
                               limits=limits, initial_equity_usd=equity)
            ref = benchmark_buy_and_hold(bars, interval=intervalle,
                                         initial_equity_usd=equity)
        except (ValueError, ArithmeticError) as exc:
            raise HTTPException(422, str(exc)) from exc

        return {
            "strategie": strategie, "actif": actif.upper(), "intervalle": intervalle,
            "parametres": kw,
            "barres": len(bars),
            "debut_ms": bars[0].ts_ms, "fin_ms": bars[-1].ts_ms,
            "equite_initiale": float(equity),
            "strategie_finale": float(obs.final_equity_usd),
            "hodl_final": float(ref.final_equity_usd),
            "trades": len(obs.trades),
            "rejets": obs.rejected_by_risk,
            "plafond_stop_bps": float(PLAFOND_STOP_CAMPAGNE_BPS),
            # Une courbe issue de zero trade n'est pas un resultat de
            # strategie : c'est l'equite de depart, inchangee. L'afficher a
            # cote de « detenir l'actif » sans ce drapeau la ferait lire comme
            # une defaite. L'interface doit refuser de la tracer.
            "sans_trade": not obs.trades,
            "frais_usd": float(obs.total_fees_usd),
            "funding_usd": float(obs.total_funding_usd),
            "courbe": _echantillonner(obs.equity_curve, bars),
            "hodl": _echantillonner(ref.equity_curve, bars),
        }

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        v = state.verdict()
        if state.halted:
            raise HTTPException(status_code=503, detail="desk arrete")
        return {"ok": v.approved, "blocking": [i.value for i in v.blocking]}

    return app
