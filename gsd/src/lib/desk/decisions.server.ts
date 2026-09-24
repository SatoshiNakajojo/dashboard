import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  parseDecisionLines,
  spendByModel,
  summarize,
  summarizeLegacyCommittee,
  summarizeLegacyGate,
  type DecisionRow,
  type SpendEvent,
} from "./decision-log";
import type { BtcSnapshot } from "./btc-rule.server";

const FILE = "decisions.jsonl";
/** L'écran lit la fin du journal : quelques semaines de décisions. */
const TAIL_BYTES = 3 * 1024 * 1024;
/** Au-delà, le journal est ramené à sa seconde moitié. */
const ROTATE_BYTES = 24 * 1024 * 1024;

function dir() {
  return process.env.GSD_DATA_DIR || "/tmp/gsd";
}

function rotate(path: string) {
  try {
    if (statSync(path).size <= ROTATE_BYTES) return;
    const raw = readFileSync(path, "utf8");
    const half = raw.slice(Math.floor(raw.length / 2));
    writeFileSync(path, half.slice(half.indexOf("\n") + 1));
  } catch {
    /* */
  }
}

/**
 * Inscrit une décision. Ne lève jamais : un journal qui échoue ne doit pas
 * arrêter le pilote.
 */
export function logDecision(row: Omit<DecisionRow, "t"> & { t?: number }) {
  try {
    mkdirSync(dir(), { recursive: true });
    const path = join(dir(), FILE);
    const clean: DecisionRow = {
      ...row,
      t: row.t ?? Date.now(),
      detail: row.detail ? String(row.detail).slice(0, 300) : undefined,
    };
    appendFileSync(path, JSON.stringify(clean) + "\n");
    rotate(path);
  } catch {
    /* */
  }
}

function tailText(name: string, maxBytes = TAIL_BYTES): string {
  const path = join(dir(), name);
  let fd: number | null = null;
  try {
    const size = statSync(path).size;
    const start = Math.max(0, size - maxBytes);
    fd = openSync(path, "r");
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const text = buf.toString("utf8");
    // La première ligne d'une lecture par la fin est coupée : on la saute.
    return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
  } catch {
    return "";
  } finally {
    if (fd != null) closeSync(fd);
  }
}

function tailObjects(name: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of tailText(name).split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      /* */
    }
  }
  return out;
}

function readJson(name: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(join(dir(), name), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type AccountResults = {
  since: number;
  equity: number | null;
  realized: number;
  fees: number;
  funding: number;
  net: number;
  fills: number;
  closing: number;
  wins: number;
};

type AccountCache = { at: number; since: number; value: AccountResults | { error: string } };
const g = globalThis as { __gsdDecisionAccount?: AccountCache };

async function info<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Ce que le compte a réellement fait depuis `since` : exécutions, frais et
 * financement lus sur Hyperliquid. Mis en cache une minute.
 */
async function accountResults(since: number): Promise<AccountResults | { error: string } | null> {
  const raw = process.env.HL_MASTER;
  if (!raw) return null;
  const user = raw.startsWith("0x") ? raw : `0x${raw}`;
  const bucket = Math.floor(since / 60_000) * 60_000;
  const c = g.__gsdDecisionAccount;
  if (c && c.since === bucket && Date.now() - c.at < 60_000) return c.value;
  let value: AccountResults | { error: string };
  try {
    const [fills, funding] = await Promise.all([
      info<{ closedPnl?: string; fee?: string }[]>({
        type: "userFillsByTime",
        user,
        startTime: bucket,
      }),
      info<{ delta?: { usdc?: string } }[]>({
        type: "userFunding",
        user,
        startTime: bucket,
        endTime: Date.now(),
      }),
    ]);
    let equity: number | null = null;
    try {
      const { readHlBalances } = await import("./hl");
      equity = Number((await readHlBalances(user as `0x${string}`)).trading);
    } catch {
      equity = null;
    }
    let realized = 0;
    let fees = 0;
    let closing = 0;
    let wins = 0;
    for (const f of Array.isArray(fills) ? fills : []) {
      const pnl = Number(f.closedPnl) || 0;
      realized += pnl;
      fees += Number(f.fee) || 0;
      if (pnl !== 0) closing += 1;
      if (pnl > 0) wins += 1;
    }
    const fund = (Array.isArray(funding) ? funding : []).reduce(
      (a, x) => a + (Number(x.delta?.usdc) || 0),
      0,
    );
    value = {
      since: bucket,
      equity: Number.isFinite(equity) ? equity : null,
      realized,
      fees,
      funding: fund,
      net: realized - fees + fund,
      fills: Array.isArray(fills) ? fills.length : 0,
      closing,
      wins,
    };
  } catch (e) {
    value = { error: e instanceof Error ? e.message : String(e) };
  }
  g.__gsdDecisionAccount = { at: Date.now(), since: bucket, value };
  return value;
}

export async function readDecisionScreen() {
  const rows = parseDecisionLines(tailText(FILE));
  const summary = summarize(rows);
  const spendRaw = readJson("spend.json") as { events?: SpendEvent[] } | null;
  const pilot = readJson("pilot.json") ?? {};
  const since = summary.since ?? Date.now() - 30 * 86_400_000;
  return {
    now: Date.now(),
    rows: rows.slice(-300).reverse(),
    summary,
    /** Les seules décisions de la règle BTC : actif BTC, unité de temps 1d. */
    btcSummary: summarize(rows.filter((r) => r.asset === "BTC" && r.tf === "1d")),
    spend: spendByModel(Array.isArray(spendRaw?.events) ? spendRaw.events : []),
    legacy: {
      gate: summarizeLegacyGate(tailObjects("signal_gate.jsonl")),
      committee: summarizeLegacyCommittee(tailObjects("committee.jsonl")),
    },
    pilot: {
      strategy: pilot.strategy === "legacy" ? ("legacy" as const) : ("btc_25_10" as const),
      btc: (pilot.btc as BtcSnapshot | null | undefined) ?? null,
      autonome: Boolean(pilot.autonome),
      kill: Boolean(pilot.kill),
      cycles: Number(pilot.cycles || 0),
      lastAt: Number(pilot.lastAt || 0),
      lastReason: String(pilot.lastReason || ""),
      lastError: (pilot.lastError as string | null) ?? null,
    },
    keys: {
      jev: Boolean(process.env.TYPESAFE_AI_API_KEY),
      hyperliquid: Boolean(process.env.HL_AGENT_KEY && process.env.HL_MASTER),
    },
    account: await accountResults(since),
  };
}

export type DecisionScreen = Awaited<ReturnType<typeof readDecisionScreen>>;
