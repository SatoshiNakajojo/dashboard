"use client";

import { cn } from "@/lib/utils";
import { ASSETS, INTERVALS, type Stage } from "@/lib/desk/types";
import type { HlOpenPos } from "@/lib/desk/hl";

export type ScanCell = { stage: Stage | string; side: string | null };

export function ScanBoard({
  board,
  asset,
  opens,
  onPick,
}: {
  board: Record<string, ScanCell>;
  asset: string;
  opens: HlOpenPos[];
  onPick: (asset: string) => void;
}) {
  return (
    <section className="gsd-panel min-w-0 rounded-[var(--radius-lg)] p-3 lg:col-span-5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Radar</h2>
        <p className="text-[10px] text-muted-foreground">vert fill · ambre sig</p>
      </div>
      <div className="inline-grid grid-cols-[3.4rem_repeat(4,3.35rem)] gap-0.5">
        <span />
        {INTERVALS.map((tf) => (
          <span key={tf} className="text-center text-[9px] uppercase tracking-wider text-muted-foreground">
            {tf}
          </span>
        ))}
        {ASSETS.map((a) => {
          const on = a === asset;
          const coin = a.replace("USDT", "");
          const live = opens.find((p) => p.coin === coin);
          return (
            <div key={a} className="contents">
              <button
                type="button"
                onClick={() => onPick(a)}
                className={cn(
                  "h-6 rounded px-1.5 text-left text-[11px] font-medium",
                  on ? "bg-accent text-accent-foreground" : "bg-elevated hover:bg-muted",
                  live && !on && "ring-1 ring-ok/40",
                )}
              >
                {coin}
              </button>
              {INTERVALS.map((tf) => {
                const cell = board[`${a}:${tf}`];
                const sig = cell?.stage === "ORDRE";
                return (
                  <div
                    key={tf}
                    className={cn(
                      "flex h-6 items-center justify-center rounded border text-[9px] uppercase",
                      live && "border-ok/35 bg-ok/10 text-ok",
                      !live && sig && "border-warn/40 bg-warn/10 text-warn",
                      !live && !sig && "border-border bg-background text-muted-foreground",
                    )}
                    title={live ? `${live.side} live` : sig ? "signal" : cell?.stage || ""}
                  >
                    {live ? (live.side === "LONG" ? "L" : "S") : sig ? "·" : "—"}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
