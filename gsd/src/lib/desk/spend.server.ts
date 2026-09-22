import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TICKS = 10_000_000_000; // 1 USD

type Event = { t: number; usd: number; model: string };

function dir() {
  return process.env.GSD_DATA_DIR || "/tmp/gsd";
}

function path() {
  return join(dir(), "spend.json");
}

function load(): Event[] {
  try {
    const raw = JSON.parse(readFileSync(path(), "utf8")) as { events?: Event[] };
    return Array.isArray(raw.events) ? raw.events.slice(-8000) : [];
  } catch {
    return [];
  }
}

function save(events: Event[]) {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(path(), JSON.stringify({ events: events.slice(-8000) }));
}

export function recordSpend(usd: number, model: string) {
  if (!Number.isFinite(usd) || usd < 0) return;
  const events = load();
  events.push({ t: Date.now(), usd, model });
  save(events);
}

export function ticksToUsd(ticks: unknown) {
  const n = Number(ticks);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n / TICKS;
}

function sumSince(events: Event[], ms: number) {
  const cut = Date.now() - ms;
  let s = 0;
  for (const e of events) if (e.t >= cut) s += e.usd;
  return s;
}

export function spendSnapshot() {
  const events = load();
  const total = events.reduce((a, e) => a + e.usd, 0);
  const min = sumSince(events, 60_000);
  const hour = sumSince(events, 3_600_000);
  const day = sumSince(events, 86_400_000);
  const now = new Date();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const month = events.filter((e) => e.t >= monthStart).reduce((a, e) => a + e.usd, 0);
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const todayUtc = events.filter((e) => e.t >= dayStart).reduce((a, e) => a + e.usd, 0);
  const last = events.length ? events[events.length - 1] : null;
  return {
    total,
    perMin: min,
    perHour: hour,
    perDay: day,
    perMonth: month,
    todayUtc,
    calls: events.length,
    lastAt: last?.t ?? 0,
    lastUsd: last?.usd ?? 0,
    lastModel: last?.model ?? "",
  };
}

export function spendTodayUtc() {
  const events = load();
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return events.filter((e) => e.t >= start).reduce((a, e) => a + e.usd, 0);
}
