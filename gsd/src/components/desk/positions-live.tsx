"use client";

import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HlOpenPos } from "@/lib/desk/hl";
import { getBook } from "@/lib/desk/book";

function n(v: number, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d) : "—";
}

export function PositionsLive({
  opens,
  setups,
  managed,
}: {
  opens: HlOpenPos[];
  setups?: Record<string, { rationale?: string; horizon_hours?: number }> | null;
  managed?: Record<string, { lastReview?: string; scaled?: boolean }> | null;
}) {
  const book = useQuery({
    queryKey: ["gsd-book"],
    queryFn: () => getBook({ data: {} }),
    refetchInterval: 15_000,
  });
  const closed = book.data?.closed ?? [];
  return (
    <section className="gsd-panel min-w-0 rounded-[var(--radius-lg)] p-4 lg:col-span-12">
      <div className="mb-3 flex items-center gap-2">
        <Layers className="size-4 text-accent" />
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Hyperliquid</p>
          <h2 className="text-lg font-medium">Positions</h2>
        </div>
        <span className="ml-auto flex items-center gap-2">
          <span className="tabular text-sm text-muted-foreground">{opens.length} ouvertes</span>
          {closed.length > 0 && (
            <button
              type="button"
              className="h-9 rounded-[var(--radius-sm)] border border-border px-3 text-xs"
              onClick={() => {
                const head = "time,coin,side,entry,exit,size,pnl,leverage,verdict,lesson";
                const lines = closed.map((t) =>
                  [new Date(t.t).toISOString(), t.coin, t.side, t.entry, t.exit, t.size, t.pnl, t.leverage, t.verdict, JSON.stringify(t.lesson)].join(","),
                );
                const blob = new Blob([[head, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "gsd-journal.csv";
                a.click();
              }}
            >
              CSV
            </button>
          )}
        </span>
      </div>
      {opens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune position ouverte.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Actif</th>
                <th className="font-medium">Sens</th>
                <th className="font-medium">Taille</th>
                <th className="font-medium">Entrée</th>
                <th className="font-medium">Notionnel</th>
                <th className="font-medium">Marge</th>
                <th className="font-medium">Levier</th>
                <th className="font-medium">Liq.</th>
                <th className="font-medium">uPnL</th>
                <th className="font-medium">ROE</th>
                <th className="font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {opens.map((p) => (
                <tr key={p.coin} className="border-t border-border">
                  <td className="py-2.5 font-medium">{p.coin}</td>
                  <td className={cn(p.side === "LONG" ? "text-ok" : "text-danger")}>{p.side}</td>
                  <td className="tabular">{n(p.size, 4)}</td>
                  <td className="tabular">
                    {n(p.entry, 4)}
                    {(() => {
                      const first = (book.data?.opens as { coin: string; firstEntry?: number }[] | undefined)?.find(
                        (o) => o.coin === p.coin,
                      )?.firstEntry;
                      if (first && Math.abs(first - p.entry) / p.entry > 0.001) {
                        return <span className="block text-[10px] text-muted-foreground">1er {n(first, 4)}</span>;
                      }
                      return null;
                    })()}
                  </td>
                  <td className="tabular">{n(p.value)} $</td>
                  <td className="tabular">{n(p.margin)} $</td>
                  <td className="tabular">
                    {p.leverage}× {p.levType}
                  </td>
                  <td className="tabular">{p.liq == null ? "—" : n(p.liq, 4)}</td>
                  <td className={cn("tabular", p.pnl >= 0 ? "text-ok" : "text-danger")}>{n(p.pnl)} $</td>
                  <td className={cn("tabular", p.roe >= 0 ? "text-ok" : "text-danger")}>{n(p.roe, 1)}%</td>
                  <td>
                    <button
                      type="button"
                      className="text-xs text-accent underline"
                      onClick={() => {
                        const why = setups?.[p.coin]?.rationale || "Pas de brief Grok pour ce ticker.";
                        void navigator.clipboard.writeText(why);
                      }}
                    >
                      Pourquoi
                    </button>
                    {managed?.[p.coin]?.lastReview && (
                      <p className="mt-1 max-w-[14rem] text-[11px] leading-snug text-muted-foreground">{managed[p.coin].lastReview}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt-6 text-[11px] uppercase tracking-wider text-muted-foreground">Trades clôturés · expérience</h3>
      {closed.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Aucun close encore. Dès qu’une position disparaît de HL, elle arrive ici avec la leçon.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {closed.map((t, i) => (
            <li key={`${t.t}-${t.coin}-${i}`} className="rounded-[var(--radius-md)] border border-border bg-elevated p-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className={cn("font-medium", t.side === "LONG" ? "text-ok" : "text-danger")}>
                  {t.side} {t.coin}
                </span>
                <span className="text-muted-foreground">{new Date(t.t).toLocaleString("fr-FR")}</span>
                <span className="tabular">
                  {t.entry.toFixed(4)} → {t.exit.toFixed(4)}
                </span>
                <span className={cn("tabular font-medium", t.pnl >= 0 ? "text-ok" : "text-danger")}>
                  {t.pnl >= 0 ? "+" : ""}
                  {t.pnl.toFixed(2)} $
                </span>
                {"leverage" in t && Number((t as { leverage?: number }).leverage) > 0 && (
                  <span className="tabular text-muted-foreground">{Number((t as { leverage: number }).leverage)}×</span>
                )}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
                    t.verdict === "BON" ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger",
                  )}
                >
                  {t.verdict}
                </span>
              </div>
              <p className="mt-2 text-sm leading-snug">{t.lesson}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
