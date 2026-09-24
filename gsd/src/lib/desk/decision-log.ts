/**
 * Le journal des décisions du GSD : une ligne par décision, quel que soit
 * celui qui la prend — une règle, Jev, l'exchange. L'écran « Décisions » ne
 * lit que ça, plus les journaux d'avant et le compte : rien n'y est projeté.
 *
 * Module pur, testé sans disque ni réseau.
 */

export const STAGES = [
  "CANAL",
  "STOP",
  "J0",
  "SIGNAL",
  "FILTRE",
  "J1",
  "J2",
  "ORDRE",
  "GESTION",
  "REVUE",
  "COUPE",
] as const;
export type Stage = (typeof STAGES)[number];

export type Decider = "règle" | "jev" | "local" | "exchange";

export type DecisionRow = {
  t: number;
  stage: Stage;
  decider: Decider;
  question: string;
  answer: string;
  /** Appliquée au compte, ou seulement inscrite (ombre). */
  applied: boolean;
  asset?: string;
  tf?: string;
  p?: number | null;
  ms?: number;
  usd?: number;
  detail?: string;
};

export function parseDecisionLines(text: string): DecisionRow[] {
  const out: DecisionRow[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as DecisionRow;
      if (typeof r.t === "number" && (STAGES as readonly string[]).includes(r.stage)) out.push(r);
    } catch {
      /* ligne tronquée par une écriture interrompue : ignorée */
    }
  }
  return out;
}

export type StageSummary = {
  stage: Stage;
  total: number;
  answers: Record<string, number>;
  deciders: Record<string, number>;
  applied: number;
  last: DecisionRow | null;
};

export type DecisionSummary = {
  since: number | null;
  total: number;
  stages: Record<Stage, StageSummary>;
  jev: { calls: number; usd: number; msMedian: number | null };
};

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function summarize(rows: DecisionRow[]): DecisionSummary {
  const stages = Object.fromEntries(
    STAGES.map((s) => [
      s,
      { stage: s, total: 0, answers: {}, deciders: {}, applied: 0, last: null } as StageSummary,
    ]),
  ) as Record<Stage, StageSummary>;
  let since: number | null = null;
  const jevMs: number[] = [];
  let jevUsd = 0;
  let jevCalls = 0;
  for (const r of rows) {
    const s = stages[r.stage];
    s.total += 1;
    s.answers[r.answer] = (s.answers[r.answer] ?? 0) + 1;
    s.deciders[r.decider] = (s.deciders[r.decider] ?? 0) + 1;
    if (r.applied) s.applied += 1;
    if (!s.last || r.t >= s.last.t) s.last = r;
    if (since == null || r.t < since) since = r.t;
    if (r.decider === "jev") {
      jevCalls += 1;
      jevUsd += Number(r.usd) || 0;
      if (Number.isFinite(r.ms)) jevMs.push(Number(r.ms));
    }
  }
  return {
    since,
    total: rows.length,
    stages,
    jev: { calls: jevCalls, usd: jevUsd, msMedian: median(jevMs) },
  };
}

export type SpendEvent = { t: number; usd: number; model: string };

export type ModelSpend = {
  model: string;
  calls: number;
  usd: number;
  usdPerCall: number;
  first: number;
  last: number;
};

/** Ce que chaque modèle a réellement coûté, appel par appel, lu dans spend.json. */
export function spendByModel(events: SpendEvent[]): ModelSpend[] {
  const m = new Map<string, ModelSpend>();
  for (const e of events) {
    if (!Number.isFinite(e.usd) || e.usd < 0) continue;
    const key = e.model || "?";
    const cur = m.get(key) ?? {
      model: key,
      calls: 0,
      usd: 0,
      usdPerCall: 0,
      first: e.t,
      last: e.t,
    };
    cur.calls += 1;
    cur.usd += e.usd;
    cur.first = Math.min(cur.first, e.t);
    cur.last = Math.max(cur.last, e.t);
    m.set(key, cur);
  }
  return [...m.values()]
    .map((x) => ({ ...x, usdPerCall: x.calls ? x.usd / x.calls : 0 }))
    .sort((a, b) => b.usd - a.usd);
}

export type LegacyGate = {
  total: number;
  pass: number;
  block: number;
  reasons: Record<string, number>;
  since: number | null;
};
export type LegacyCommittee = {
  total: number;
  bySource: Record<string, number>;
  recommendAllow: number;
};

/** `signal_gate.jsonl` — le J1 d'avant le journal unifié. */
export function summarizeLegacyGate(rows: Record<string, unknown>[]): LegacyGate {
  const out: LegacyGate = { total: 0, pass: 0, block: 0, reasons: {}, since: null };
  for (const r of rows) {
    out.total += 1;
    if (r.allow) out.pass += 1;
    else out.block += 1;
    for (const x of Array.isArray(r.reasons) ? r.reasons : [])
      out.reasons[String(x)] = (out.reasons[String(x)] ?? 0) + 1;
    const t = Number(r.t);
    if (Number.isFinite(t) && (out.since == null || t < out.since)) out.since = t;
  }
  return out;
}

/** `committee.jsonl` — le vote d'ombre J2 d'avant, Grok ou repli local. */
export function summarizeLegacyCommittee(rows: Record<string, unknown>[]): LegacyCommittee {
  const out: LegacyCommittee = { total: 0, bySource: {}, recommendAllow: 0 };
  for (const r of rows) {
    out.total += 1;
    const src = String(r.source || "?");
    out.bySource[src] = (out.bySource[src] ?? 0) + 1;
    if ((r.pm as { recommend_allow?: boolean } | undefined)?.recommend_allow)
      out.recommendAllow += 1;
  }
  return out;
}

/** Les réponses qui se répètent à chaque cycle sans rien changer. */
const ROUTINE = new Set(["oui", "non", "tenir", "en position", "à plat", "en place", "surveillé"]);

export type CompactRow = DecisionRow & { count: number; tFirst: number };

/**
 * Regroupe les décisions identiques qui se suivent — le régime fermé inscrit
 * à chaque cycle, la position tenue à chaque cycle — en une seule ligne, avec
 * leur nombre et leur plage horaire. Les lignes arrivent de la plus récente à
 * la plus ancienne. Une décision de Jev n'est jamais fusionnée : chacune porte
 * sa propre probabilité.
 */
export function compact(rows: DecisionRow[]): CompactRow[] {
  const out: CompactRow[] = [];
  for (const r of rows) {
    const prev = out[out.length - 1];
    const same =
      prev &&
      prev.stage === r.stage &&
      prev.decider === r.decider &&
      prev.answer === r.answer &&
      prev.asset === r.asset &&
      prev.tf === r.tf &&
      prev.applied === r.applied &&
      prev.p == null &&
      r.p == null &&
      (prev.detail === r.detail || ROUTINE.has(r.answer));
    if (same) {
      prev.count += 1;
      prev.tFirst = r.t;
      continue;
    }
    out.push({ ...r, count: 1, tFirst: r.t });
  }
  return out;
}
