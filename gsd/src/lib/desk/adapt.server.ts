import { logDecision } from "./decisions.server";
import { reduceDeptPosition, type HlOpenPos, type HlSession } from "./hl";
import { topChoice, type JevQuestion } from "./jev";
import { askJev, jevAllowed } from "./jev.server";
import type { Managed } from "./manage.server";

/**
 * La revue du book par Jev : garder, réduire de moitié ou couper, position
 * par position, en une seule requête.
 *
 * Grok appliquait ses coupes lui-même, sans que personne n'ait jamais mesuré
 * si elles aidaient. La revue de Jev est inscrite et reste en ombre : le
 * contrôle du risque est le stop posé chez l'exchange, et les règles de
 * gestion de `manage.server.ts`. Passer `apply` à true ne se justifiera que
 * lorsque le journal aura montré que ses coupes évitent des pertes.
 */
export const REVIEW_CFG = { apply: false, minP: 0.7 };

const ACTIONS: Record<string, string> = {
  HOLD: "Keep the position unchanged",
  TRIM: "Close half of the position",
  CUT: "Close the whole position",
};

function pushLog(m: Managed, text: string) {
  m.log = [...(m.log || []), { t: Date.now(), text }].slice(-12);
  m.lastReview = text;
}

export async function adaptBook(
  session: HlSession,
  opens: HlOpenPos[],
  managed: Record<string, Managed>,
  nav: number,
  peak: number,
): Promise<{ managed: Record<string, Managed>; notes: string[]; thesis: string }> {
  const notes: string[] = [];
  if (!opens.length) return { managed, notes: ["REVUE book vide"], thesis: "" };
  const dd = peak > 0 ? (peak - nav) / peak : 0;
  const thesis = `NAV ${nav.toFixed(2)} · pic ${peak.toFixed(2)} · DD ${(dd * 100).toFixed(1)} %`;

  const allowed = await jevAllowed();
  if (!allowed.ok) {
    notes.push(`REVUE Jev sautée — ${allowed.why}`);
    return { managed, notes, thesis };
  }

  const state = {
    nav: Number(nav.toFixed(2)),
    peak: Number(peak.toFixed(2)),
    drawdown_pct: Number((dd * 100).toFixed(2)),
    positions: opens.map((p) => ({
      coin: p.coin,
      side: p.side,
      entry: p.entry,
      roe_pct: Number(p.roePct.toFixed(2)),
      pnl_usd: Number(p.pnl.toFixed(2)),
      value_usd: Number(p.value.toFixed(2)),
      journal: (managed[p.coin]?.log || []).slice(-4).map((l) => l.text),
    })),
  };
  const questions: Record<string, JevQuestion> = Object.fromEntries(
    opens.map((p) => [
      p.coin,
      {
        type: "choice",
        instructions: `What should the desk do now with its open ${p.side} position on ${p.coin}?`,
        criteria: ACTIONS,
      } satisfies JevQuestion,
    ]),
  );

  try {
    const r = await askJev(state, questions);
    for (const p of opens) {
      const a = topChoice(r.answers[p.coin]);
      if (!a) continue;
      const act = a.choice;
      const wouldAct = act !== "HOLD" && a.p >= REVIEW_CFG.minP;
      let applied = false;
      let detail = `ROE ${p.roePct.toFixed(1)} %`;
      if (wouldAct && REVIEW_CFG.apply) {
        const res = await reduceDeptPosition(session, p.coin, act === "CUT" ? 1 : 0.5);
        applied = res.ok;
        detail += res.ok ? " · exécuté" : ` · échec ${res.error}`;
      } else if (wouldAct) {
        detail += " · ombre, non exécuté";
      }
      const m = managed[p.coin];
      if (m) pushLog(m, `REVUE Jev ${act} · ${detail}`);
      notes.push(`REVUE Jev ${p.coin} ${act} · ${detail}`);
      logDecision({
        stage: "REVUE",
        decider: "jev",
        asset: p.coin,
        question: "que faire de cette position ?",
        answer: act,
        p: a.p,
        applied,
        ms: r.latencyMs,
        usd: r.usd / opens.length,
        detail,
      });
    }
  } catch (e) {
    notes.push("REVUE Jev en échec " + (e instanceof Error ? e.message : String(e)));
  }
  return { managed, notes, thesis };
}
