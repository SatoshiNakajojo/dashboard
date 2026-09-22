"use client";

import type { HlOpenPos } from "@/lib/desk/hl";

export function ChartLevels({
  live,
  closed,
  lo,
  hi,
  xPct,
}: {
  live: HlOpenPos | null;
  closed?: { coin: string; entry: number; exit: number; t?: number }[];
  lo: number;
  hi: number;
  xPct?: number;
}) {
  if (!(hi > lo)) return null;
  const span = hi - lo;
  const top = (y: number) => `${((hi - y) / span) * 100}%`;
  const left = `${Math.min(92, Math.max(8, xPct ?? 50))}%`;
  const lastClose = closed?.[0] ?? null;
  if (!live && !lastClose) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {live ? (
        <div className="absolute z-40" style={{ top: top(live.entry), left, transform: "translate(-50%, -50%)" }}>
          <span className="block size-4 rounded-full border-2 border-background bg-ok shadow-[0_0_0_3px_rgba(111,186,141,0.55)]" />
          <span className="absolute top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ok px-1.5 py-0.5 text-[10px] font-bold text-background">
            OPEN {live.entry.toFixed(2)}
          </span>
        </div>
      ) : null}
      {lastClose ? (
        <div
          className="absolute z-40"
          style={{ top: top(lastClose.exit), left: "88%", transform: "translate(-50%, -50%)" }}
        >
          <span className="block size-3.5 rounded-full border-2 border-background bg-danger" />
        </div>
      ) : null}
    </div>
  );
}
