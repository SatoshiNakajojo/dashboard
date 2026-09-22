"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GSD_HL_AGENT_NAME } from "@/lib/desk/bot";
import { orderNotional, orderTarget } from "@/lib/desk/hl";
import { loadDeptWallet } from "@/lib/desk/pilot";

type Snap = {
  perps: number;
  spot: number;
  trading: number;
  free: number;
  marginUsed: number;
  withdrawable: number;
  unified: boolean;
  upnl?: number;
  cash?: number;
  error?: string;
};

function fmt(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function asSnap(v: unknown): Snap | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.trading !== "number") return null;
  return o as Snap;
}

export function WalletPanel({ wallet: passed }: { wallet?: Snap | null; equity?: number }) {
  const q = useQuery({
    queryKey: ["dept-wallet"],
    queryFn: () => loadDeptWallet({ data: {} }),
    refetchInterval: 15_000,
  });
  const snap = asSnap(q.data) ?? asSnap(passed);
  const err =
    q.isError
      ? q.error instanceof Error
        ? q.error.message
        : "lecture refusee"
      : q.data && typeof q.data === "object" && "error" in q.data && !asSnap(q.data)
        ? String((q.data as { error: string }).error)
        : null;
  const live = snap != null;
  const cap = live ? orderNotional(snap.trading, snap.free) : 0;
  const target = live ? orderTarget(snap.trading) : 0;

  return (
    <section className="gsd-panel rounded-[var(--radius-lg)] p-4 lg:col-span-7">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-accent" />
          <h2 className="text-lg font-medium">Wallet du département</h2>
        </div>
        <Badge variant={live ? "live" : "default"}>{live ? "HL live" : q.isFetching ? "lecture…" : "hors ligne"}</Badge>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">agent {GSD_HL_AGENT_NAME} · source Hyperliquid uniquement</p>

      {err && (
        <p className="mt-3 rounded-[var(--radius-md)] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {err}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-[var(--radius-md)] border border-foreground/20 bg-elevated p-3 sm:col-span-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">NAV trading (Perps)</p>
          <p className="tabular mt-1 text-2xl font-medium">{live ? fmt(snap.trading) : "—"} USDC</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            = chiffre Hyperliquid Perps (accountValue). Inclut le P&L flottant. Pas de Spot.
            {live && snap.upnl != null ? ` uPnL ${snap.upnl >= 0 ? "+" : ""}${fmt(snap.upnl)}$` : ""}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-elevated p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Marge utilisée</p>
          <p className="tabular mt-1 text-lg">{live ? fmt(snap.marginUsed) : "—"}</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-elevated p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Marge libre</p>
          <p className="tabular mt-1 text-lg">{live ? fmt(snap.free) : "—"}</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-elevated p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Ticket / trade</p>
          <p className="tabular mt-1 text-lg">{live ? `${(snap.trading * 0.2).toFixed(0)} $` : "—"}</p>
          <p className="text-[10px] text-muted-foreground">20 % du NAV · max 5 slots · GSD-23</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-elevated p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Reste dispo</p>
          <p className="tabular mt-1 text-lg">{live ? (cap < 5 ? "0 $ · plein" : `${cap.toFixed(0)} $`) : "—"}</p>
          <p className="text-[10px] text-muted-foreground">ce qu’on peut encore engager · pas un 2e ticket théorique</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-elevated p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">P&L flottant</p>
          <p className="tabular mt-1 text-lg">
            {live && snap.upnl != null ? `${snap.upnl >= 0 ? "+" : ""}${fmt(snap.upnl)}` : "—"}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-elevated p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Spot USDC</p>
          <p className="tabular mt-1 text-lg">{live ? (snap.unified ? "inclus" : fmt(snap.spot)) : "—"}</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-elevated p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Retirable</p>
          <p className="tabular mt-1 text-lg">{live ? fmt(snap.withdrawable) : "—"}</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-elevated p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Compte</p>
          <p className="mt-1 text-sm">{live ? (snap.unified ? "Unified" : "Spot séparé") : "—"}</p>
        </div>
      </div>

      {live && !snap.unified && snap.spot >= 1 && (
        <p className="mt-3 rounded-[var(--radius-md)] border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          {fmt(snap.spot)} USDC en Spot — le bot ne les utilise pas. Transfert Spot → Perps sur Hyperliquid.
        </p>
      )}
      {live && snap.unified && (
        <p className="mt-3 text-xs text-muted-foreground">
          Compte Unified : Spot et Perps sont le même USDC. Un seul chiffre.
        </p>
      )}
      {!live && !err && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Lecture HL…
        </p>
      )}
    </section>
  );
}
