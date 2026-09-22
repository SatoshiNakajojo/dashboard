import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HlOpenPos } from "./hl";
import type { SetupProposal } from "./types";

export type EquityPt = { t: number; nav: number };
export type ClosedTrade = {
  t: number;
  openedAt: number;
  coin: string;
  side: "LONG" | "SHORT";
  entry: number;
  exit: number;
  size: number;
  pnl: number;
  leverage: number;
  source: string;
  lesson: string;
  verdict: "BON" | "MAUVAIS";
};

type TrackedOpen = HlOpenPos & { openedAt: number; firstEntry: number };

type Book = {
  equity: EquityPt[];
  opens: TrackedOpen[];
  closed: ClosedTrade[];
};

function dir() {
  return process.env.GSD_DATA_DIR || "/tmp/gsd";
}
function path() {
  return join(dir(), "book.json");
}

function load(): Book {
  try {
    const raw = JSON.parse(readFileSync(path(), "utf8")) as Book;
    return {
      equity: Array.isArray(raw.equity) ? raw.equity.slice(-2500) : [],
      opens: Array.isArray(raw.opens) ? (raw.opens as TrackedOpen[]) : [],
      closed: Array.isArray(raw.closed) ? raw.closed.slice(0, 400) : [],
    };
  } catch {
    return { equity: [], opens: [], closed: [] };
  }
}

function save(b: Book) {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(path(), JSON.stringify(b));
}

function lesson(p: HlOpenPos, setup?: SetupProposal): { verdict: "BON" | "MAUVAIS"; text: string } {
  const win = p.pnl >= 0;
  const src = setup?.evaluation?.[0] || "moteur";
  const why = setup?.rationale ? setup.rationale.slice(0, 140) : "";
  if (win) {
    return {
      verdict: "BON",
      text: `+${p.pnl.toFixed(2)}$ sur ${p.side} ${p.coin}. Le setup ${src} a tenu. ${why || "Renforcer ce type de breakout."}`,
    };
  }
  return {
    verdict: "MAUVAIS",
    text: `${p.pnl.toFixed(2)}$ sur ${p.side} ${p.coin}. ${src} invalidé. ${why || "Exiger plus de confluence ou un stop plus serré avant de retenter."}`,
  };
}

export function snapshot(
  nav: number,
  opens: HlOpenPos[],
  setups?: Record<string, SetupProposal> | null,
  fills?: { t: number; coin: string; side: "LONG" | "SHORT"; px: number; size: number; pnl: number }[],
) {
  const b = load();
  const now = Date.now();
  if (Number.isFinite(nav) && nav > 0) {
    const last = b.equity[b.equity.length - 1];
    if (!last || now - last.t > 20_000 || Math.abs(last.nav - nav) >= 0.04) {
      b.equity.push({ t: now, nav });
      if (b.equity.length > 2500) b.equity = b.equity.slice(-2500);
    }
  }
  for (const prev of b.opens) {
    const still = opens.find((o) => o.coin === prev.coin && o.side === prev.side);
    if (still) continue;
    const exit =
      prev.size > 0
        ? prev.side === "LONG"
          ? prev.entry + prev.pnl / prev.size
          : prev.entry - prev.pnl / prev.size
        : prev.entry;
    const L = lesson(prev, setups?.[prev.coin]);
    b.closed.unshift({
      t: now,
      openedAt: Number(prev.openedAt) || now,
      coin: prev.coin,
      side: prev.side,
      entry: Number(prev.firstEntry) || prev.entry,
      exit: Number.isFinite(exit) ? exit : prev.entry,
      size: prev.size,
      pnl: prev.pnl,
      leverage: Number(prev.leverage) || 0,
      source: setups?.[prev.coin]?.evaluation?.[0] || "—",
      lesson: L.text,
      verdict: L.verdict,
    });
    try {
      const eq = Math.abs(prev.entry * prev.size) || 1;
      void import("./regime.server").then((r) => r.recordTradeResult(prev.pnl / eq));
    } catch {
      /* */
    }
  }
  for (const f of fills ?? []) {
    if (!f.coin || !Number.isFinite(f.t)) continue;
    const sig = `${f.coin}|${f.t}|${Number(f.pnl).toFixed(4)}|${Number(f.size).toFixed(6)}`;
    const dup = b.closed.some(
      (c) => `${c.coin}|${c.t}|${Number(c.pnl).toFixed(4)}|${Number(c.size).toFixed(6)}` === sig,
    );
    if (dup) continue;
    const L = f.pnl >= 0 ? "BON" : "MAUVAIS";
    b.closed.unshift({
      t: f.t,
      openedAt: f.t,
      coin: f.coin,
      side: f.side,
      entry: f.px,
      exit: f.px,
      size: f.size,
      pnl: f.pnl,
      leverage: 0,
      source: "HL",
      lesson: `Close HL · ${f.pnl >= 0 ? "+" : ""}${f.pnl.toFixed(2)}$ @ ${f.px}`,
      verdict: L,
    });
  }
  b.closed = b.closed.slice(0, 400);
  b.opens = opens.map((o) => {
    const prev = b.opens.find((p) => p.coin === o.coin && p.side === o.side);
    return {
      ...o,
      openedAt: prev?.openedAt ?? now,
      firstEntry: prev?.firstEntry ?? o.entry,
    };
  });
  save(b);
  return readBook();
}

export function ingestFills(fills: { t: number; coin: string; side: "LONG" | "SHORT"; px: number; size: number; pnl: number }[]) {
  const b = load();
  snapshot(b.equity[b.equity.length - 1]?.nav ?? 0, b.opens, null, fills);
}

export function readBook() {
  const b = load();
  const first = b.equity[0]?.nav ?? 0;
  const last = b.equity[b.equity.length - 1]?.nav ?? first;
  const realized = b.closed.reduce((a, t) => a + t.pnl, 0);
  return {
    equity: b.equity,
    closed: b.closed,
    opens: b.opens,
    baseline: first,
    nav: last,
    pnl: last - first,
    realized,
  };
}
