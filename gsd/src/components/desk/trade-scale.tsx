"use client";

import type { HlOpenPos } from "@/lib/desk/hl";

export function TradeScale({ live, px }: { live: HlOpenPos | null; px?: number | null }) {
  if (!live) return null;
  const entry = Number(live.entry);
  const stop = live.side === "LONG" ? entry * 0.97 : entry * 1.03;
  const risk = Math.abs(entry - stop) || entry * 0.03;
  const target = live.side === "LONG" ? entry + risk * 1.5 : entry - risk * 1.5;
  const mark = px ?? entry;
  const ys = [entry, stop, target, mark];
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pad = (hi - lo) * 0.12 || 0.01;
  const min = lo - pad;
  const max = hi + pad;
  const bottom = (y: number) => `${((y - min) / (max - min)) * 100}%`;
  const rows = [
    { y: target, label: "Cible", v: target, cls: "bg-ok text-background" },
    { y: mark, label: "Prix", v: mark, cls: "bg-accent text-accent-foreground" },
    { y: entry, label: "Entrée", v: entry, cls: "bg-muted-foreground text-background" },
    { y: stop, label: "Stop", v: stop, cls: "bg-danger text-background" },
  ];
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-elevated p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Trade {live.side} {live.coin}
      </p>
      <div className="relative mt-3 h-40">
        {rows.map((r) => (
          <div key={r.label} className="absolute right-0 left-0 flex items-center gap-2" style={{ bottom: bottom(r.y) }}>
            <div className="h-px flex-1 bg-current opacity-40" />
            <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${r.cls}`}>
              {r.label} {r.v.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
