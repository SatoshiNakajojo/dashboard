import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function dir() {
  return process.env.GSD_DATA_DIR || "/tmp/gsd";
}

function tailJsonl(name: string, n = 40): Record<string, unknown>[] {
  try {
    const raw = readFileSync(join(dir(), name), "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const out: Record<string, unknown>[] = [];
    for (const line of lines.slice(-n)) {
      try {
        out.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        /* */
      }
    }
    return out.reverse();
  } catch {
    return [];
  }
}

function readJson(name: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(join(dir(), name), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function logHelm(text: string) {
  try {
    mkdirSync(dir(), { recursive: true });
    appendFileSync(join(dir(), "helm.jsonl"), JSON.stringify({ t: Date.now(), text }) + "\n");
  } catch {
    /* */
  }
}

export function readChain() {
  const regimeFile = readJson("regime_state.json");
  const last = (regimeFile?.last as Record<string, unknown> | undefined) ?? regimeFile;
  const pilot = readJson("pilot.json");
  const talk = readJson("talk.json");
  const talkLines = Array.isArray((talk as { lines?: unknown[] } | null)?.lines)
    ? ((talk as { lines: Record<string, unknown>[] }).lines as Record<string, unknown>[]).slice(-20).reverse()
    : [];
  const managed = (pilot?.managed as Record<string, { lastReview?: string; coin?: string }> | undefined) ?? {};
  const reviews = Object.values(managed)
    .filter((m) => m?.lastReview)
    .map((m) => ({ t: Date.now(), coin: m.coin, text: m.lastReview }));
  return {
    regime: last,
    j1: tailJsonl("signal_gate.jsonl", 40),
    j2: tailJsonl("committee.jsonl", 24),
    helm: tailJsonl("helm.jsonl", 30),
    lastReason: String(pilot?.lastReason || ""),
    lastStage: String(pilot?.lastStage || ""),
    lastError: (pilot?.lastError as string | null) ?? null,
    board: (pilot?.board as Record<string, unknown>) ?? {},
    reviews,
    talk: talkLines,
    autonome: Boolean(pilot?.autonome),
    cycles: Number(pilot?.cycles || 0),
  };
}
