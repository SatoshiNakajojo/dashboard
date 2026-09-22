"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getBook } from "@/lib/desk/book";
import { cn } from "@/lib/utils";

const NAV_TF: { k: string; ms: number | null }[] = [
  { k: "1 h", ms: 60 * 60 * 1000 },
  { k: "6 h", ms: 6 * 60 * 60 * 1000 },
  { k: "24 h", ms: 24 * 60 * 60 * 1000 },
  { k: "7 j", ms: 7 * 24 * 60 * 60 * 1000 },
  { k: "Tout", ms: null },
];

function navThen(equity: { t: number; nav: number }[], agoMs: number) {
  if (!equity.length) return null;
  const target = Date.now() - agoMs;
  let best = equity[0];
  for (const p of equity) {
    if (p.t <= target) best = p;
  }
  return best.nav;
}

function pct(now: number, then: number | null) {
  if (then == null || then <= 0) return null;
  return ((now - then) / then) * 100;
}

function fmtPct(v: number | null) {
  if (v == null) return "—";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)} %`;
}

function fmtUsd(v: number | null) {
  if (v == null) return "—";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)} $`;
}

function Cell({ k, usd, p }: { k: string; usd: number | null; p: number | null }) {
  const up = (p ?? usd ?? 0) >= 0;
  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-elevated px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className={cn("tabular text-sm font-medium", up ? "text-ok" : "text-danger")}>{fmtPct(p)}</p>
      <p className={cn("tabular text-[11px]", up ? "text-ok" : "text-danger")}>{fmtUsd(usd)}</p>
    </div>
  );
}

export function EquityPanel() {
  const [tf, setTf] = useState(NAV_TF[2]!);
  const q = useQuery({
    queryKey: ["gsd-book"],
    queryFn: () => getBook({ data: {} }),
    refetchInterval: 15_000,
  });
  const b = q.data;
  const eq = b?.equity ?? [];
  const now = b?.nav ?? eq.at(-1)?.nav ?? 0;
  const first = b?.baseline ?? eq[0]?.nav ?? now;
  const h = navThen(eq, 60 * 60 * 1000);
  const d = navThen(eq, 24 * 60 * 60 * 1000);
  const w = navThen(eq, 7 * 24 * 60 * 60 * 1000);
  const windows = [
    { k: "1 h", then: h },
    { k: "Jour", then: d },
    { k: "Semaine", then: w },
    { k: "All time", then: first },
  ];
  const pts = useMemo(() => {
    const cut = tf.ms == null ? 0 : Date.now() - tf.ms;
    return eq.filter((p) => p.t >= cut).map((p) => ({ t: p.t, nav: p.nav }));
  }, [eq, tf]);
  const longTf = !tf.ms || tf.ms >= 24 * 60 * 60 * 1000;
  return (
    <section className="gsd-panel min-w-0 rounded-[var(--radius-lg)] p-4 lg:col-span-12">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Portefeuille</p>
          <h2 className="text-lg font-medium">NAV · P&L %</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="tabular text-sm">{b ? `${now.toFixed(2)} USDC` : "—"}</p>
          <div className="flex gap-1">
            {NAV_TF.map((opt) => (
              <button
                key={opt.k}
                type="button"
                onClick={() => setTf(opt)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
                  tf.k === opt.k ? "border-accent bg-accent/15 text-accent" : "border-border text-muted-foreground",
                )}
              >
                {opt.k}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {windows.map((w) => (
          <Cell
            key={w.k}
            k={w.k}
            usd={w.then == null ? null : now - w.then}
            p={pct(now, w.then)}
          />
        ))}
      </div>
      <div className="mt-3 h-52">
        {pts.length < 2 ? (
          <p className="flex h-full items-center text-sm text-muted-foreground">
            Pas assez de points sur {tf.k}.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={pts} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="navFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                tickFormatter={(v: number) =>
                  longTf
                    ? new Date(v).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit" })
                    : new Date(v).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                }
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
                axisLine={{ stroke: "var(--color-border)" }}
                tickLine={{ stroke: "var(--color-border)" }}
                label={{ value: "Temps", position: "insideBottomRight", offset: -2, fill: "var(--color-muted-foreground)", fontSize: 10 }}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
                axisLine={{ stroke: "var(--color-border)" }}
                tickLine={{ stroke: "var(--color-border)" }}
                width={52}
                tickFormatter={(v: number) => Number(v).toFixed(0)}
                label={{ value: "USDC", angle: -90, position: "insideLeft", fill: "var(--color-muted-foreground)", fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", fontSize: 12 }}
                labelFormatter={(v) => new Date(Number(v)).toLocaleString("fr-FR")}
                formatter={(v: number) => [Number(v).toFixed(2) + " USDC", "NAV"]}
              />
              <Area type="monotone" dataKey="nav" stroke="var(--color-accent)" fill="url(#navFill)" strokeWidth={1.6} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Fenêtre {tf.k}. Points OPEN/CLOSE = graphique prix en haut.</p>
    </section>
  );
}
