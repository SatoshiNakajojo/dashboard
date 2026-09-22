"use client";

import type { HlOpenPos } from "@/lib/desk/hl";
import type { SetupProposal } from "@/lib/desk/types";
import { Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";

function band(p: HlOpenPos) {
  const entry = Number(p.entry);
  const stop = p.side === "LONG" ? entry * 0.97 : entry * 1.03;
  const risk = Math.abs(entry - stop) || entry * 0.03;
  const target = p.side === "LONG" ? entry + risk * 1.5 : entry - risk * 1.5;
  return { entry, stop, target };
}

export function StrategyPanel({
  opens,
  asset,
  setups,
  managed,
  onPick,
}: {
  opens: HlOpenPos[];
  asset: string;
  setups?: Record<string, SetupProposal> | null;
  managed?: Record<string, { lastReview?: string; log?: { t: number; text: string }[]; rationale?: string }> | null;
  onPick: (a: string) => void;
}) {
  const coin = asset.replace("USDT", "");
  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4 lg:col-span-7">
      <div className="flex items-center gap-2">
        <Crosshair className="size-4 text-accent" />
        <h2 className="text-lg font-medium">Bot Stratégie</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Une fiche par position — clic pour le graphe.</p>
      {opens.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Pas de position ouverte.</p>}
      <div className="mt-3 grid gap-3">
        {opens.map((p) => {
          const lv = band(p);
          const on = p.coin === coin;
          const st = setups?.[p.coin];
          const md = managed?.[p.coin];
          const log = md?.log ?? [];
          return (
            <button
              key={p.coin}
              type="button"
              onClick={() => onPick(`${p.coin}USDT`)}
              className={cn(
                "w-full rounded-[var(--radius-md)] border p-3 text-left",
                on ? "border-foreground/40 bg-elevated" : "border-border",
              )}
            >
              <p className={cn("text-sm font-medium", p.side === "LONG" ? "text-ok" : "text-danger")}>
                {p.side} {p.coin}
                {st?.evaluation?.[0] ? (
                  <span className="ml-2 text-[11px] font-normal uppercase tracking-wider text-muted-foreground">
                    {st.evaluation[0]}
                  </span>
                ) : null}
              </p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
                <div>
                  <dt className="text-muted-foreground">Entrée</dt>
                  <dd className="tabular">{lv.entry.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Stop</dt>
                  <dd className="tabular text-danger">{lv.stop.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cible</dt>
                  <dd className="tabular text-ok">{lv.target.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">uPnL</dt>
                  <dd className="tabular">{p.pnl.toFixed(2)}$</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ROE</dt>
                  <dd className="tabular">{p.roePct.toFixed(1)}%</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Taille</dt>
                  <dd className="tabular">
                    {p.size} · {p.leverage}×
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-sm font-medium leading-snug text-foreground">
                {md?.lastReview ||
                  st?.rationale ||
                  "En attente de revue (Lancer ou scan autonome)."}
              </p>
              {st?.rationale && md?.lastReview && st.rationale !== md.lastReview && (
                <p className="mt-1 text-[11px] text-muted-foreground">Entrée : {st.rationale}</p>
              )}
              <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Décision = 1re ligne · historique en dessous
              </p>
              {log.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-border pt-2 text-[11px] leading-snug text-muted-foreground">
                  {log.slice(-5).reverse().map((l) => (
                    <li key={l.t}>
                      <span className="tabular">{new Date(l.t).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                      {" · "}
                      {l.text}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
