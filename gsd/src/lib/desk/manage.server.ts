import { addDeptSize, orderNotional, orderTarget, readHlBalances, reduceDeptPosition, readHlPositions } from "./hl";
import type { HlSession } from "./hl";
import { GSD_BACKSTOP_R, GSD_DUST_NOTIONAL, GSD_RISK_PCT, GSD_TIME_STOP_H } from "./bot";
import { notify } from "./alerts.server";
import { fetchBars } from "./market";
import { readEngines } from "./strats";
import { logDecision } from "./decisions.server";

export type Managed = {
  coin: string;
  side: "LONG" | "SHORT";
  entry: number;
  stop: number;
  openedAt: number;
  horizonHours: number;
  size0: number;
  partial: boolean;
  scaled: boolean;
  rationale: string;
  lastReview: string;
  log?: { t: number; text: string }[];
};

function stOf(bars: Awaited<ReturnType<typeof fetchBars>>) {
  if (bars.length < 30) return "FLAT" as const;
  return readEngines(bars).snaps.find((s) => s.name === "Supertrend")?.trend ?? "FLAT";
}

function pushLog(m: Managed, text: string) {
  m.lastReview = text;
  m.log = [...(m.log || []), { t: Date.now(), text }].slice(-12);
}

async function helmNote(text: string) {
  try {
    const c = await import("./chain.server");
    c.logHelm(text);
  } catch {
    /* */
  }
}

export async function manageOpens(
  session: HlSession,
  managed: Record<string, Managed>,
  lastSetups?: Record<string, { horizon_hours?: number; stop_price?: number | null; rationale?: string }>,
  skip: string[] = [],
): Promise<{ managed: Record<string, Managed>; notes: string[] }> {
  const opens = (await readHlPositions(session.master)).filter((p) => !skip.includes(p.coin));
  const notes: string[] = [];
  const next: Record<string, Managed> = {};
  const bal = await readHlBalances(session.master);
  const targetN = orderNotional(bal.trading, bal.free);
  /** Perte latente au-delà de laquelle on considère que le stop a échoué. */
  const budget = GSD_RISK_PCT * (Number(bal.trading) || 0) * GSD_BACKSTOP_R;
  let dayDown = false;
  let halted = false;
  try {
    const rg = await import("./regime.server");
    const regime = rg.readRegime();
    dayDown = (regime?.day_pnl_pct ?? 0) <= -0.01;
    halted = Boolean(regime && !regime.can_open_new_trade);
  } catch {
    /* J0 optionnel */
  }
  await helmNote(`revue ${opens.length} pos · NAV ${bal.trading.toFixed(2)} · halt=${halted}`);

  if (!opens.length) {
    notes.push("BARRE · book plat, rien à couper");
    await helmNote("book plat");
    return { managed: {}, notes };
  }

  for (const p of opens) {
    const prev = managed[p.coin];
    const setup = lastSetups?.[p.coin];
    const m: Managed = {
      coin: p.coin,
      side: p.side,
      entry: prev?.entry ?? p.entry,
      stop: prev?.stop || Number(setup?.stop_price) || (p.side === "LONG" ? p.entry * 0.97 : p.entry * 1.03),
      openedAt: prev?.openedAt ?? Date.now(),
      horizonHours: prev?.horizonHours || Number(setup?.horizon_hours) || 24,
      size0: prev?.size0 || p.size,
      partial: prev?.partial ?? false,
      scaled: prev?.scaled ?? false,
      rationale: prev?.rationale || setup?.rationale || "",
      lastReview: prev?.lastReview || "",
      log: prev?.log || [],
    };
    const risk = Math.abs(m.entry - m.stop) || m.entry * 0.03;
    const mark = p.size > 0 ? (p.side === "LONG" ? p.entry + p.pnl / p.size : p.entry - p.pnl / p.size) : p.entry;
    const ageH = (Date.now() - m.openedAt) / 3_600_000;
    let st1h: "LONG" | "SHORT" | "FLAT" = "FLAT";
    let st4h: "LONG" | "SHORT" | "FLAT" = "FLAT";
    try {
      const [b1, b4] = await Promise.all([
        fetchBars(`${p.coin}USDT`, "1h", 80),
        fetchBars(`${p.coin}USDT`, "4h", 80),
      ]);
      st1h = stOf(b1);
      st4h = stOf(b4);
    } catch {
      /* */
    }

    const gestion = (answer: string, applied: boolean, detail: string) =>
      logDecision({
        stage: "GESTION",
        decider: "règle",
        asset: p.coin,
        question: "que faire de cette position ?",
        answer,
        applied,
        detail: detail.replace(/^BARRE · /, ""),
      });

    const cut = async (why: string) => {
      const r = await reduceDeptPosition(session, p.coin, 1);
      const line = r.ok ? why : `BARRE · close FAIL ${p.coin}: ${r.error}`;
      gestion("couper", r.ok, line);
      notes.push(line);
      pushLog(m, line);
      await helmNote(line);
      if (r.ok) await notify("Barre", why);
      return r.ok;
    };

    const slotN = orderTarget(bal.trading);
    if (p.value > slotN * 1.2 && p.value > 12) {
      const drop = Math.min(0.75, Math.max(0.15, 1 - slotN / p.value));
      const r = await reduceDeptPosition(session, p.coin, drop);
      const why = `BARRE · trim ${p.coin} ${p.value.toFixed(0)}$`;
      notes.push(r.ok ? why : `trim fail ${r.error}`);
      gestion("réduire", r.ok, r.ok ? `${why} · au-delà de son slot` : `trim fail ${r.error}`);
      pushLog(m, why);
      await helmNote(why);
    }

    // Le contrôle du risque est le stop posé chez l'exchange. Ce qui suit ne
    // coupe que sur un changement de thèse, un kill-switch, ou l'échec avéré
    // du stop — jamais sur du bruit de marché. L'ancienne règle coupait dès
    // que le ROE passait sous +0,5 % : elle liquidait tout, à chaque cycle,
    // en payant le taker à l'aller comme au retour.
    if (p.value < GSD_DUST_NOTIONAL) {
      await cut(`BARRE · ON COUPE ${p.coin} miettes ${p.value.toFixed(2)}$`);
      continue;
    }
    if (budget > 0 && p.pnl < -budget) {
      await cut(
        `BARRE · FILET ${p.coin} perte ${p.pnl.toFixed(2)}$ > ${budget.toFixed(2)}$ (${GSD_BACKSTOP_R}R) — le stop n'a pas tenu`,
      );
      continue;
    }
    if (halted && p.pnl < 0) {
      await cut(`BARRE · halt · ${p.coin} on libère la marge (${p.pnl.toFixed(2)}$)`);
      continue;
    }
    if (dayDown && budget > 0 && p.pnl < -budget * 0.5) {
      await cut(`BARRE · journée rouge · ${p.coin} ${p.pnl.toFixed(2)}$`);
      continue;
    }
    const against = (t: string) => t !== "FLAT" && t !== p.side;
    const withUs = (t: string) => t === p.side;
    if (against(st4h) || against(st1h)) {
      await cut(`BARRE · ST contre ${p.coin} 1h=${st1h} 4h=${st4h}`);
      continue;
    }
    if (ageH >= GSD_TIME_STOP_H && p.pnl <= 0) {
      await cut(`BARRE · time-stop ${p.coin} ${ageH.toFixed(1)} h sans gain`);
      continue;
    }

    const winner = p.roePct >= 3 && !against(st4h) && (withUs(st4h) || withUs(st1h) || st4h === "FLAT");
    if (winner && !m.scaled && p.value < targetN * 0.65 && bal.free > 12 && !halted) {
      const extra = Math.min(targetN - p.value, bal.free * 0.7 * 2, targetN * 0.5);
      if (extra >= 25) {
        const r = await addDeptSize(session, p.coin, extra, m.stop);
        gestion("renforcer", r.ok, `+${extra.toFixed(0)} $ sur une position gagnante (ROE ${p.roePct.toFixed(1)} %)`);
        if (r.ok) {
          m.scaled = true;
          pushLog(m, `BARRE · +${extra.toFixed(0)}$ ${p.coin}`);
          notes.push(`add ${p.coin}`);
          await helmNote(m.lastReview);
        }
      }
    }
    const oneR = p.side === "LONG" ? mark >= m.entry + risk : mark <= m.entry - risk;
    if (!m.partial && oneR && p.value >= 30) {
      const r = await reduceDeptPosition(session, p.coin, 0.5);
      gestion("prendre 50 %", r.ok, `+1 R atteint`);
      if (r.ok) {
        m.partial = true;
        pushLog(m, `BARRE · TP 50% ${p.coin}`);
        await helmNote(m.lastReview);
      }
    } else if (m.partial && (p.side === "LONG" ? mark <= m.entry : mark >= m.entry)) {
      await cut(`BARRE · trail BE ${p.coin}`);
      continue;
    }

    const hold = `BARRE · ON TIENT ${p.coin} ${p.side} ROE ${p.roePct.toFixed(1)}% ${p.pnl.toFixed(2)}$ ${ageH.toFixed(1)}h ST ${st1h}/${st4h}`;
    pushLog(m, hold);
    notes.push(hold);
    gestion("tenir", true, hold);
    await helmNote(hold);
    next[p.coin] = m;
  }
  return { managed: next, notes };
}
