import { reduceDeptPosition, type HlOpenPos, type HlSession } from "./hl";
import { completeJson, parseJsonObject, str } from "./llm.server";
import { REVIEW_SYSTEM } from "./prompts";
import type { Managed } from "./manage.server";

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
  const losers = opens.filter((p) => p.roePct < 0);
  const briefing = JSON.stringify({
    nav: Number(nav.toFixed(2)),
    pic: Number(peak.toFixed(2)),
    drawdown_pct: Number((dd * 100).toFixed(2)),
    positions: opens.map((p) => ({
      coin: p.coin,
      side: p.side,
      entry: p.entry,
      roe_pct: Number(p.roePct.toFixed(2)),
      pnl: Number(p.pnl.toFixed(2)),
      value: Number(p.value.toFixed(2)),
      journal: (managed[p.coin]?.log || []).slice(-4).map((l) => l.text),
      last: managed[p.coin]?.lastReview || "",
    })),
    consigne:
      dd >= 0.02
        ? "NAV sous le pic : coupe ce qui n'a plus d'edge, garde uniquement ce que Supertrend HTF valide."
        : "Arbitre chaque ligne. Pas de HOLD mou si ROE négatif et ST contre.",
  });

  let thesis = `NAV ${nav.toFixed(2)} · pic ${peak.toFixed(2)} · DD ${(dd * 100).toFixed(1)} %`;
  if (!process.env.XAI_API_KEY) {
    notes.push("REVUE Grok skip (pas de clé)");
    return { managed, notes, thesis };
  }
  try {
    const { text } = await completeJson(REVIEW_SYSTEM, briefing);
    const obj = parseJsonObject(text) as {
      thesis?: string;
      actions?: { coin?: string; action?: string; reason?: string }[];
    };
    thesis = str(obj.thesis, thesis) || thesis;
    notes.push("REVUE " + thesis);
    for (const a of obj.actions || []) {
      const coin = String(a.coin || "").replace("USDT", "").toUpperCase();
      const p = opens.find((o) => o.coin === coin);
      if (!p) continue;
      const m = managed[coin] || {
        coin,
        side: p.side,
        entry: p.entry,
        stop: p.side === "LONG" ? p.entry * 0.97 : p.entry * 1.03,
        openedAt: Date.now(),
        horizonHours: 24,
        size0: p.size,
        partial: false,
        scaled: false,
        rationale: "",
        lastReview: "",
        log: [],
      };
      const act = String(a.action || "HOLD").toUpperCase();
      const reason = str(a.reason, act) || act;
      if (act === "CUT") {
        const r = await reduceDeptPosition(session, coin, 1);
        pushLog(m, r.ok ? `CUT ${reason}` : `CUT fail ${r.error}`);
        notes.push(m.lastReview);
      } else if (act === "TRIM") {
        const r = await reduceDeptPosition(session, coin, 0.5);
        pushLog(m, r.ok ? `TRIM 50% ${reason}` : `TRIM fail ${r.error}`);
        notes.push(m.lastReview);
        managed[coin] = m;
      } else {
        pushLog(m, `HOLD ${reason}`);
        notes.push(m.lastReview);
        managed[coin] = m;
      }
    }
  } catch (e) {
    notes.push("REVUE Grok fail " + (e instanceof Error ? e.message : String(e)));
  }
  return { managed, notes, thesis };
}
