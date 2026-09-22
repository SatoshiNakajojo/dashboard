"use client";

import { useQuery } from "@tanstack/react-query";
import { getPilot } from "@/lib/desk/pilot";
import { getChain } from "@/lib/desk/chain";
import { cn } from "@/lib/utils";

function Pill({ ok, children }: { ok: boolean; children: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        ok ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger",
      )}
    >
      {children}
    </span>
  );
}

export function ChainPanel() {
  const pilot = useQuery({
    queryKey: ["gsd-pilot"],
    queryFn: () => getPilot({ data: {} }),
    refetchInterval: 5_000,
  });
  const extra = useQuery({
    queryKey: ["gsd-chain"],
    queryFn: () => getChain({ data: {} }).catch(() => null),
    refetchInterval: 8_000,
  });
  const p = pilot.data as {
    lastReason?: string;
    lastError?: string | null;
    autonome?: boolean;
    cycles?: number;
    lastStage?: string;
    board?: Record<string, { stage?: string; side?: string | null }>;
    managed?: Record<string, { lastReview?: string; coin?: string }>;
    regime?: {
      regime?: string;
      bias?: string;
      halted?: boolean;
      can_open_new_trade?: boolean;
      day_pnl_pct?: number;
      kill_reasons?: string[];
      equity?: number;
    } | null;
    opens?: { coin: string; side: string; roePct: number; pnl: number }[];
  } | undefined;
  const r = extra.data?.regime || p?.regime;
  const open = r?.can_open_new_trade !== false && !r?.halted;
  const j1 = extra.data?.j1 ?? [];
  const j2 = extra.data?.j2 ?? [];
  const helm = extra.data?.helm ?? [];
  const board = p?.board ? Object.entries(p.board) : [];
  const reviews = Object.entries(p?.managed || {}).map(([k, v]) => ({ coin: k, text: v.lastReview }));
  return (
    <section className="gsd-panel min-w-0 rounded-[var(--radius-lg)] p-4 lg:col-span-12">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Pipeline live</p>
          <h2 className="text-lg font-medium">Chaîne J0 → J1 → J2 + barre</h2>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {p?.autonome ? "autonome" : "manuel"} · {p?.cycles ?? 0} cycles · {p?.lastStage || "—"}
        </p>
      </div>
      {pilot.isError && <p className="mt-2 text-sm text-danger">Pilot : {(pilot.error as Error).message}</p>}
      <p className="mt-3 rounded-[var(--radius-sm)] border border-border bg-elevated px-3 py-2 text-xs leading-snug">
        {p?.lastReason || "Pas encore de cycle. Clique Lancer dans Bot."}
      </p>
      {p?.lastError && <p className="mt-2 text-sm text-danger">{p.lastError}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <article className="rounded-[var(--radius-md)] border border-border bg-elevated p-3">
          <div className="flex justify-between">
            <p className="text-[11px] uppercase text-muted-foreground">J0 régime</p>
            <Pill ok={!!open}>{open ? "ouvert" : "halt"}</Pill>
          </div>
          <p className="mt-2 text-xl">
            {r?.regime ?? "inconnu"} {r?.bias ? `· ${r.bias}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Jour {r?.day_pnl_pct != null ? `${(Number(r.day_pnl_pct) * 100).toFixed(2)} %` : "—"} · NAV{" "}
            {r?.equity != null ? Number(r.equity).toFixed(2) : "—"}
          </p>
          {(r?.kill_reasons?.length ?? 0) > 0 && (
            <p className="mt-1 text-[11px] text-danger">{r!.kill_reasons!.join(" · ")}</p>
          )}
        </article>
        <article className="rounded-[var(--radius-md)] border border-border bg-elevated p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Barre · positions live</p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
            {(p?.opens ?? []).length === 0 && helm.length === 0 && reviews.length === 0 && (
              <li className="text-muted-foreground">Book plat ou revue pas encore passée.</li>
            )}
            {(p?.opens ?? []).map((o) => (
              <li key={o.coin}>
                {o.side} {o.coin} · ROE {Number(o.roePct).toFixed(1)}% · {Number(o.pnl).toFixed(2)}$
              </li>
            ))}
            {reviews.map((x) => (
              <li key={x.coin} className="text-muted-foreground">
                {x.coin}: {x.text || "—"}
              </li>
            ))}
            {helm.slice(0, 8).map((h, i) => (
              <li key={i}>{String((h as { text?: string }).text)}</li>
            ))}
          </ul>
        </article>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <article className="rounded-[var(--radius-md)] border border-border bg-elevated p-3">
          <p className="text-[11px] uppercase text-muted-foreground">J1 · radar ({board.length} cases) · jsonl {j1.length}</p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
            {board.length === 0 && j1.length === 0 && <li className="text-muted-foreground">Scan pas encore écrit.</li>}
            {j1.map((row, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>
                  {String(row.asset || "").replace("USDT", "")} {String(row.interval || "")} {String(row.side || "")}
                </span>
                <Pill ok={Boolean(row.allow)}>{row.allow ? "PASS" : "BLOCK"}</Pill>
              </li>
            ))}
            {board.slice(0, 24).map(([k, v]) => (
              <li key={k} className="text-muted-foreground">
                {k} · {v.stage}
                {v.side ? ` ${v.side}` : ""}
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-[var(--radius-md)] border border-border bg-elevated p-3">
          <p className="text-[11px] uppercase text-muted-foreground">J2 ombre · {j2.length} votes</p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
            {j2.length === 0 && (
              <li className="text-muted-foreground">Pas de vote (J1 n’a pas laissé passer d’entrée).</li>
            )}
            {j2.map((row, i) => {
              const pm = (row.pm as { score?: number; recommend_allow?: boolean }) || {};
              return (
                <li key={i}>
                  {String(row.asset || "").replace("USDT", "")} rec={String(pm.recommend_allow)} score{" "}
                  {Number(pm.score || 0).toFixed(2)}
                </li>
              );
            })}
          </ul>
        </article>
      </div>
    </section>
  );
}
