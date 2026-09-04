"""L'agent Analyste. Premier agent du desk, en mode fantôme.

Ce qu'il fait : lire un état de marché et en tirer une thèse directionnelle
avec ses conditions d'invalidation.

Ce qu'il ne fait pas, et ne fera jamais : dimensionner une position, décider
d'un trade, toucher à l'exécution. Il n'a aucune référence vers `execution`
ni vers `risk` — la frontière est structurelle, pas une consigne de prompt.

**Tous les chiffres du prompt sont calculés en code.** L'agent interprète des
valeurs, il n'en produit aucune. C'est ce qui distingue une lecture de marché
d'une hallucination bien tournée : on peut rejouer l'entrée exacte et vérifier
que le RSI valait bien 38,2.
"""

from __future__ import annotations

from decimal import Decimal

from ..contracts.common import now_ms
from ..contracts.signals import AnalystView
from ..features.bars import Bar
from ..features.indicators import atr, closes, donchian, ema, realized_vol_bps, rsi
from .isolation import ExternalContent, wrap
from .llm import LLMClient
from .runner import AgentRun, run_agent

SYSTEM = """Tu es l'analyste d'un desk de trading sur perpétuels crypto.

Ton rôle : lire l'état du marché et formuler une thèse directionnelle, avec les
conditions précises qui l'invalideraient.

Cadre de travail, non négociable :

- Tu n'as AUCUN pouvoir d'exécution. Tu ne dimensionnes pas les positions, tu
  ne décides d'aucun trade. Un moteur de risque déterministe, que tu ne peux
  ni appeler ni influencer, tranchera plus tard.
- Les chiffres qu'on te donne sont calculés, pas estimés. Ne les recalcule
  pas, ne les arrondis pas, ne les contredis pas : interprète-les.
- FLAT est une réponse pleinement acceptable, et souvent la bonne. Un marché
  sans structure lisible ne mérite pas de thèse. Rien ne t'oblige à trouver
  un signal.
- Si les données sont insuffisantes, contradictoires ou trop courtes pour
  conclure, abstiens-toi : mets `abstained` à vrai et dis pourquoi. Une
  abstention honnête vaut mieux qu'une thèse fabriquée pour remplir un champ.
- Une thèse sans condition d'invalidation mesurable n'est pas une thèse.
  Nomme le niveau de prix ou le fait qui te ferait changer d'avis.

Tu réponds uniquement dans le schéma fourni."""


def build_market_context(bars: list[Bar], *, lookback: int = 60) -> dict:
    """Calcule l'état de marché. Aucun de ces nombres ne vient d'un modèle.

    C'est aussi ce qui part au journal : rejouer une décision, c'est rejouer
    ce dictionnaire.
    """
    if len(bars) < 30:
        raise ValueError(f"au moins 30 barres nécessaires, {len(bars)} fournies")

    px = closes(bars)
    last = bars[-1]
    rsi_series = rsi(px, 14)
    ema_fast, ema_slow = ema(px, 20), ema(px, 50)
    atr_series = atr(bars, 14)
    vol_series = realized_vol_bps(px, 24)
    hi, lo = donchian(bars, 20)

    window = bars[-lookback:]
    change_pct = (float(last.close) / float(window[0].open) - 1) * 100

    def _round(value: float | None, digits: int = 2) -> float | None:
        return round(value, digits) if value is not None else None

    return {
        "actif": last.asset,
        "horodatage_ms": last.ts_ms,
        "barres_analysees": len(bars),
        "prix": {
            "dernier": float(last.close),
            "ouverture_periode": float(window[0].open),
            "variation_periode_pct": round(change_pct, 2),
            "plus_haut_20": _round(hi[-1]),
            "plus_bas_20": _round(lo[-1]),
        },
        "indicateurs": {
            "rsi_14": _round(rsi_series[-1], 1),
            "ema_20": _round(ema_fast[-1]),
            "ema_50": _round(ema_slow[-1]),
            "ema_20_au_dessus_50": (
                None if ema_fast[-1] is None or ema_slow[-1] is None
                else ema_fast[-1] > ema_slow[-1]
            ),
            "atr_14": _round(atr_series[-1]),
            "atr_pct_du_prix": _round(
                None if atr_series[-1] is None
                else atr_series[-1] / float(last.close) * 100
            ),
            "volatilite_realisee_bps_24": _round(vol_series[-1], 1),
        },
    }


def format_prompt(context: dict, news: list[ExternalContent] | None = None) -> str:
    """Compose le message utilisateur.

    Les données de marché — de source interne et vérifiée — viennent en
    premier. Les contenus externes arrivent après, dans un bloc balisé, et
    jamais en position d'instruction (invariant I11).
    """
    import json

    parts = [
        "État du marché (chiffres calculés par le desk, à interpréter tels quels) :",
        "",
        json.dumps(context, indent=2, ensure_ascii=False),
        "",
        "Formule ta lecture : biais directionnel, niveaux clés, et surtout la "
        "condition qui invaliderait ta thèse. Si le marché n'a pas de structure "
        "lisible, dis-le.",
    ]
    if news:
        parts += ["", wrap(news)]
    return "\n".join(parts)


def run_analyst(
    *,
    llm: LLMClient,
    bars: list[Bar],
    news: list[ExternalContent] | None = None,
    store=None,
) -> AgentRun:
    """Exécute l'analyste. En mode fantôme, sa sortie n'influence rien.

    Elle est journalisée, mesurée, et c'est tout. C'est le but de la phase :
    apprendre le taux de sorties valides, le coût par décision et la latence
    réelle avant de laisser quoi que ce soit dépendre de cet agent.
    """
    context = build_market_context(bars)
    return run_agent(
        name="analyste",
        llm=llm,
        system=SYSTEM,
        user=format_prompt(context, news),
        schema=AnalystView,
        store=store,
        context=context,
    )
