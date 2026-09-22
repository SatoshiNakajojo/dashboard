"use client";

import { ImpulseTri } from "@/components/desk/impulse-tri";
import type { HlOpenPos } from "@/lib/desk/hl";
import { ASSETS } from "@/lib/desk/types";
import { cn } from "@/lib/utils";

type Item = { k: string; v: string; tone?: "ok" | "danger" | "muted"; asset?: string; dir?: 1 | -1 | 0; pulse?: string };

export function TickerTape({
  opens,
  lastReason,
  lastOrder,
  cycles,
  lastAt,
  equity,
  navDir = 0,
  asset,
  onPick,
}: {
  opens: HlOpenPos[];
  lastReason: string;
  lastOrder: string | null;
  cycles: number;
  lastAt: number;
  equity: number;
  navDir?: number;
  asset: string;
  onPick: (a: string) => void;
}) {
  const items: Item[] = [];
  if (opens.length) {
    for (const p of opens) {
      items.push({
        k: `${p.side} ${p.coin}`,
        v: `${p.entry.toFixed(2)} · ${p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}$ · ${p.roe.toFixed(1)}%`,
        tone: p.pnl >= 0 ? "ok" : "danger",
        asset: `${p.coin}USDT`,
        dir: p.pnl >= 0 ? 1 : -1,
        pulse: `${p.coin}-${p.pnl.toFixed(2)}`,
      });
    }
  } else {
    items.push({ k: "BOOK", v: "flat", tone: "muted" });
  }
  items.push({
    k: "NAV",
    v: `${equity.toFixed(2)} USD`,
    tone: navDir > 0 ? "ok" : navDir < 0 ? "danger" : "muted",
    dir: navDir > 0 ? 1 : navDir < 0 ? -1 : 0,
    pulse: equity.toFixed(2),
  });
  items.push({ k: "SCAN", v: lastReason || "en cours", tone: "muted" });
  if (lastOrder) items.push({ k: "FILL", v: lastOrder, tone: "ok" });
  items.push({ k: "CYC", v: `${cycles} · ${ago(lastAt)}`, tone: "muted" });
  for (const a of ASSETS) {
    items.push({ k: a.replace("USDT", ""), v: a === asset ? "actif" : "spot", tone: a === asset ? "ok" : "muted", asset: a });
  }

  const row = (
    <div className="flex shrink-0 items-center gap-8 px-6">
      {items.map((it, i) => {
        const body = (
          <>
            {it.dir ? <ImpulseTri dir={it.dir} pulse={it.pulse ?? it.v} /> : null}
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{it.k}</span>
            <span
              className={cn(
                "tabular text-sm",
                it.tone === "ok" && "text-ok",
                it.tone === "danger" && "text-danger",
                it.tone === "muted" && "text-foreground",
              )}
            >
              {it.v}
            </span>
          </>
        );
        if (!it.asset) {
          return (
            <span key={`${it.k}-${i}`} className="flex items-center gap-2 whitespace-nowrap">
              {body}
            </span>
          );
        }
        return (
          <button
            key={`${it.k}-${i}`}
            type="button"
            onClick={() => onPick(it.asset!)}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-sm px-1",
              it.asset === asset && "bg-foreground/10",
            )}
          >
            {body}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="relative z-10 overflow-x-hidden overflow-y-visible border-b border-border bg-elevated">
      <div className="gsd-tape py-2" style={{ animationDuration: "90s" }}>
        {row}
        {row}
      </div>
    </div>
  );
}

function ago(ts: number) {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  return `${Math.floor(s / 3600)} h`;
}
