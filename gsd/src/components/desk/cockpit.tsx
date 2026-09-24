"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Loader2,
  Power,
  Radar,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GROK_STRATEGY_BOT_ID, GROK_STRATEGY_BOT_LABEL, GROK_STRATEGY_BOT_URL } from "@/lib/desk/bot";
import { runDeskCycle } from "@/lib/desk/cycle";
import { getPilot, resumeRegime, runPilotTick, setPilot } from "@/lib/desk/pilot";
import { placeDeptOrder } from "@/lib/desk/hl";
import { loadMarket } from "@/lib/desk/market";
import { readEngines } from "@/lib/desk/strats";
import { useDesk } from "@/lib/desk/store";
import { ASSETS, INTERVALS, type CycleResult } from "@/lib/desk/types";
import { ChainPanel } from "@/components/desk/chain-panel";
import { DecisionsPanel } from "@/components/desk/decisions-panel";
import { EquityPanel } from "@/components/desk/equity-panel";
import { WalletPanel } from "@/components/desk/wallet-panel";
import { ScanBoard } from "@/components/desk/scan-board";
import { dirFrom, ImpulseTri } from "@/components/desk/impulse-tri";
import { ChartLevels } from "@/components/desk/chart-levels";
import { ChartMarks } from "@/components/desk/chart-marks";
import { TickerTape } from "@/components/desk/ticker-tape";
import type { HlBalances, HlOpenPos } from "@/lib/desk/hl";
import { PositionsLive } from "@/components/desk/positions-live";
import { SettingsPanel } from "@/components/desk/settings-panel";
import { TalkPanel } from "@/components/desk/talk-panel";
import { StrategyPanel } from "@/components/desk/strategy-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeskTabs } from "@/components/desk/desk-tabs";
import { getBook } from "@/lib/desk/book";
import { cn } from "@/lib/utils";

function isCycle(v: unknown): v is CycleResult {
  return Boolean(v && typeof v === "object" && "stage" in v && "mandate" in v);
}

export function Cockpit() {
  const desk = useDesk();

  useEffect(() => {
    void useDesk.persist.rehydrate();
  }, []);

  const pilot = useQuery({
    queryKey: ["pilot"],
    queryFn: () => getPilot({ data: {} }),
    refetchInterval: 15_000,
  });

  const wallet = (pilot.data as { wallet?: HlBalances | null } | undefined)?.wallet ?? null;
  const nav = wallet?.trading ?? null;
  const navTick = useRef<number | null>(null);
  const [navDir, setNavDir] = useState<1 | -1 | 0>(0);
  useEffect(() => {
    if (nav == null) return;
    if (navTick.current != null) {
      if (nav > navTick.current + 0.004) setNavDir(1);
      else if (nav < navTick.current - 0.004) setNavDir(-1);
    }
    navTick.current = nav;
  }, [nav]);

  const chartAsset = desk.asset;

  const market = useQuery({
    queryKey: ["market", chartAsset, desk.interval],
    queryFn: () => loadMarket({ data: { asset: chartAsset, interval: desk.interval } }),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!pilot.data) return;
    desk.setAutonome(pilot.data.autonome);
    if (pilot.data.kill !== desk.kill) {
      if (pilot.data.kill && !desk.kill) desk.toggleKill();
      if (!pilot.data.kill && desk.kill) desk.toggleKill();
    }
    if (pilot.data.lastError) desk.setError(pilot.data.lastError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pilot.data]);

  useEffect(() => {
    if (!market.data) return;
    const last = market.data.bars[market.data.bars.length - 1];
    if (last) desk.markToMarket({ [last.asset]: last.close });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market.data]);

  const cycleMut = useMutation({
    mutationFn: () => runDeskCycle({ data: { asset: desk.asset, interval: desk.interval } }),
    onMutate: () => {
      desk.setRunning(true);
      desk.setError(null);
    },
    onSuccess: (res) => {
      if (!isCycle(res)) {
        desk.setError("error" in res ? res.error : "cycle interrompu");
        return;
      }
      desk.applyCycle(res);
      const last = market.data?.bars.at(-1);
      const setup = res.setup;
      const side = setup?.side;
      const stop = setup?.stop_price;
      if (res.stage !== "ORDRE" || !last || desk.kill || !side || stop == null) {
        return;
      }
      void (async () => {
        if (useDesk.getState().hlLive) {
          const r = await placeDeptOrder({
            asset: setup.asset,
            side,
            entry: last.close,
            stop,
            target: setup.target_price,
          });
          if (!r.ok) {
            desk.setError(r.error);
            return;
          }
        }
        desk.fillOrder(res, last.close);
      })();
    },
    onError: (e: Error) => desk.setError(e.message),
    onSettled: () => desk.setRunning(false),
  });

  const bookQ = useQuery({
    queryKey: ["gsd-book"],
    queryFn: () => getBook({ data: {} }),
    refetchInterval: 15_000,
  });
  const eqPts = bookQ.data?.equity ?? [];
  const navPrev = (() => {
    if (!eqPts.length || nav == null) return null;
    const target = Date.now() - 60 * 60 * 1000;
    let best = eqPts[0];
    for (const p of eqPts) if (p.t <= target) best = p;
    if (best.nav === nav && eqPts.length > 1) return eqPts[eqPts.length - 2]?.nav ?? null;
    return best.nav;
  })();
  const eqDir: 1 | -1 | 0 =
    eqPts.length >= 2 ? dirFrom(eqPts[eqPts.length - 1]!.nav, eqPts[eqPts.length - 2]!.nav) : navDir;

  const ctx = market.data?.context;
  const bars = market.data?.bars ?? [];
  const chart = useMemo(() => {
    const slice = bars.slice(-120);
    const coin = desk.asset.replace("USDT", "");
    const openY: Array<number | null> = slice.map(() => null);
    const closeY: Array<number | null> = slice.map(() => null);
    function idxPx(px: number, from = slice.length - 1) {
      if (!slice.length || !Number.isFinite(px)) return Math.max(0, slice.length - 1);
      let best = Math.max(0, Math.min(from, slice.length - 1));
      let d = Infinity;
      for (let i = 0; i <= Math.min(from, slice.length - 1); i++) {
        const inBar = slice[i].low <= px && px <= slice[i].high;
        const dd = inBar ? 0 : Math.abs(slice[i].close - px);
        if (dd < d) {
          d = dd;
          best = i;
        }
      }
      return best;
    }
    function idxTs(ts: number) {
      let best = slice.length - 1;
      let d = Infinity;
      for (let i = 0; i < slice.length; i++) {
        const dd = Math.abs(slice[i].ts - ts);
        if (dd < d) {
          d = dd;
          best = i;
        }
      }
      return best;
    }
    const livePos = (pilot.data?.opens ?? []).find((p) => p.coin === coin);
    if (livePos) {
      const tracked = (bookQ.data?.opens as { coin: string; openedAt?: number }[] | undefined)?.find((o) => o.coin === coin);
      const i = tracked?.openedAt ? idxTs(tracked.openedAt) : idxPx(livePos.entry);
      openY[i] = livePos.entry;
    }
    for (const tr of bookQ.data?.closed ?? []) {
      if (tr.coin !== coin) continue;
      const ci = tr.t ? idxTs(tr.t) : idxPx(tr.exit);
      const oi = tr.openedAt ? idxTs(tr.openedAt) : idxPx(tr.entry, Math.max(0, ci));
      openY[oi] = tr.entry;
      closeY[ci] = tr.exit;
    }
    return slice.map((b, i) => ({
      ts: b.ts,
      t: new Date(b.ts).toLocaleString("fr-FR", { month: "short", day: "numeric", hour: "2-digit" }),
      c: b.close,
      openY: openY[i],
      closeY: closeY[i],
      isOpen: openY[i] != null,
      isClose: closeY[i] != null,
    }));
  }, [bars, desk.asset, pilot.data?.opens, bookQ.data]);
  const cycle = desk.lastCycle;
  const lastPx = bars.at(-1)?.close;
  const pxDir: 1 | -1 | 0 =
    lastPx != null && bars.length > 1 ? dirFrom(lastPx, bars[bars.length - 2]!.close) : 0;
  const engines = useMemo(() => (bars.length ? readEngines(bars) : null), [bars]);
  const live = (pilot.data?.opens ?? []).find((p) => p.coin === desk.asset.replace("USDT", "")) ?? null;
  const openX = (() => {
    const i = chart.findIndex((d) => d.openY != null);
    return i >= 0 ? ((i + 0.5) / chart.length) * 100 : 50;
  })();
  const levels = useMemo(
    () => tradeLevels(live, pilot.data?.lastSetup ?? null, chartAsset),
    [live, pilot.data?.lastSetup, chartAsset],
  );
  const yDomain = useMemo(() => {
    const ys = chart.map((d) => d.c);
    if (levels) ys.push(levels.entry, levels.stop, levels.target);
    for (const d of chart) {
      if (d.openY != null) ys.push(d.openY);
      if (d.closeY != null) ys.push(d.closeY);
    }
    if (!ys.length) return [0, 1] as [number, number];
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const pad = (hi - lo) * 0.1 || hi * 0.02;
    return [lo - pad, hi + pad] as [number, number];
  }, [chart, levels]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="h-px w-full bg-gradient-to-r from-accent/70 via-accent/20 to-transparent" />
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Radar className="size-5 text-accent" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Branche isolée</p>
              <h1 className="text-sm font-semibold leading-tight">Grok Strategy Department</h1>
            </div>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <select
              className="h-11 rounded-[var(--radius-sm)] border border-border bg-secondary px-3 text-sm"
              value={desk.asset}
              onChange={(e) => {
                desk.setAsset(e.target.value);
                void setPilot({ data: { asset: e.target.value } });
              }}
              aria-label="Actif"
            >
              {ASSETS.map((a) => (
                <option key={a} value={a}>
                  {a.replace("USDT", "")}
                </option>
              ))}
            </select>
            <select
              className="h-11 rounded-[var(--radius-sm)] border border-border bg-secondary px-3 text-sm"
              value={desk.interval}
              onChange={(e) => {
                desk.setInterval(e.target.value);
                void setPilot({ data: { interval: e.target.value } });
              }}
              aria-label="Timeframe du graphique"
              title="Graphique seulement — le scan tourne sur 15m 1h 4h 12h"
            >
              {INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            <Badge variant={desk.kill ? "danger" : desk.autonome ? "live" : "accent"}>
              {desk.kill ? "Kill" : desk.autonome ? "VPS Autonome" : "Manuel"}
            </Badge>
            <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">GSD-44</span>
            <a
              href={GROK_STRATEGY_BOT_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex"
            >
              <Badge variant="accent" title={GROK_STRATEGY_BOT_ID}>
                {GROK_STRATEGY_BOT_LABEL} · {GROK_STRATEGY_BOT_ID.slice(0, 8)}
              </Badge>
            </a>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {nav != null ? "Perps HL" : "…"}
              </p>
              <p
                className={
                  "flex items-center justify-end gap-2 tabular text-lg font-medium " +
                  (navDir > 0 || (navDir === 0 && navPrev != null && nav != null && nav >= navPrev)
                    ? "text-ok"
                    : navDir < 0 || (navPrev != null && nav != null && nav < navPrev)
                      ? "text-danger"
                      : "text-accent")
                }
              >
                {nav != null && (
                  <ImpulseTri dir={eqDir} pulse={nav.toFixed(2)} />
                )}
                {nav != null ? `${nav.toFixed(2)} USDC` : "—"}
              </p>
            </div>
            <Button
              variant={desk.autonome ? "default" : "secondary"}
              size="sm"
              disabled={desk.kill}
              onClick={() => {
                const on = !desk.autonome;
                desk.setAutonome(on);
                void setPilot({ data: { autonome: on } }).then(() => pilot.refetch());
              }}
            >
              {desk.autonome ? "Autonome" : "Manuel"}
            </Button>
            <Button
              variant={desk.kill ? "danger" : "secondary"}
              size="sm"
              onClick={() => {
                const nextKill = !desk.kill;
                desk.toggleKill();
                void setPilot({ data: { kill: nextKill } }).then(() => void pilot.refetch());
              }}
            >
              <Power className="size-4" />
              Kill
            </Button>
          </div>
        </div>
      </header>

      {(pilot.data as { regime?: { can_open_new_trade?: boolean; regime?: string; kill_reasons?: string[] } } | undefined)
        ?.regime?.can_open_new_trade === false && (
        <div className="border-b border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          GATE halt · {(pilot.data as { regime?: { regime?: string; kill_reasons?: string[] } }).regime?.regime} ·{" "}
          {((pilot.data as { regime?: { kill_reasons?: string[] } }).regime?.kill_reasons || []).join(" · ")} — plus de
          nouvel ordre, positions ouvertes intactes.
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => {
              void resumeRegime({ data: {} }).then(() => void pilot.refetch());
            }}
          >
            Réarmer
          </button>
        </div>
      )}

      <TickerTape
        opens={pilot.data?.opens ?? []}
        lastReason={pilot.data?.lastReason ?? ""}
        lastOrder={pilot.data?.lastOrder ?? null}
        cycles={pilot.data?.cycles ?? 0}
        lastAt={pilot.data?.lastAt ?? 0}
        equity={nav ?? 0}
        navDir={eqDir}
        asset={desk.asset}
        onPick={(a) => {
          desk.setAsset(a);
          void setPilot({ data: { asset: a } });
        }}
      />

      <main className="mx-auto grid max-w-[1600px] gap-3 overflow-x-hidden p-3 pb-16 lg:grid-cols-12 lg:pb-3">
        <section className="gsd-panel min-w-0 rounded-[var(--radius-lg)] p-3 lg:col-span-12">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {chartAsset.replace("USDT", "")}
                {live ? ` · ${live.side}` : ""}
              </p>
              <p className="flex items-center gap-2 tabular text-3xl font-medium tracking-tight">
                {pxDir !== 0 && <ImpulseTri dir={pxDir} pulse={lastPx ?? 0} />}
                {lastPx != null ? lastPx.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "—"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {ctx && (
                <p
                  className={cn(
                    "tabular text-sm",
                    ctx.prix.variation_periode_pct >= 0 ? "text-ok" : "text-danger",
                  )}
                >
                  {ctx.prix.variation_periode_pct >= 0 ? "+" : ""}
                  {ctx.prix.variation_periode_pct}%
                </p>
              )}
              <div className="flex gap-1">
                {INTERVALS.map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    className={cn(
                      "h-8 min-w-11 rounded-[var(--radius-sm)] px-2 text-xs tabular",
                      desk.interval === tf
                        ? "bg-foreground text-background"
                        : "border border-border bg-elevated text-muted-foreground",
                    )}
                    onClick={() => {
                      desk.setInterval(tf);
                      void setPilot({ data: { interval: tf } });
                    }}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="relative h-56 w-full sm:h-96">
            {chart.length > 2 ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <defs>
                      <linearGradient id="px" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 6" />
                    <XAxis
                      dataKey="t"
                      tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
                      tickLine={{ stroke: "var(--color-border)" }}
                      axisLine={{ stroke: "var(--color-border)" }}
                      interval="preserveStartEnd"
                      minTickGap={28}
                      label={{ value: "Temps", position: "insideBottomRight", offset: -2, fill: "var(--color-muted-foreground)", fontSize: 10 }}
                    />
                    <YAxis
                      domain={yDomain}
                      tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
                      tickLine={{ stroke: "var(--color-border)" }}
                      axisLine={{ stroke: "var(--color-border)" }}
                      width={56}
                      tickFormatter={(v: number) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
                      label={{ value: "USD", angle: -90, position: "insideLeft", fill: "var(--color-muted-foreground)", fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-elevated)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        color: "var(--color-fg)",
                        fontSize: 12,
                      }}
                      formatter={(v: number, name: string) => {
                        const label = name === "c" ? "Prix" : name === "openDot" ? "Ouverture" : name === "closeDot" ? "Clôture" : name;
                        return [Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 4 }) + " USD", label];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="c"
                      stroke="var(--color-accent)"
                      fill="url(#px)"
                      strokeWidth={1.6}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="linear"
                      dataKey="openY"
                      stroke="none"
                      connectNulls={false}
                      isAnimationActive={false}
                      name="Ouverture"
                      dot={{ r: 8, fill: "var(--color-ok)", stroke: "#0c0d10", strokeWidth: 2 }}
                      activeDot={{ r: 10 }}
                    />
                    <Line
                      type="linear"
                      dataKey="closeY"
                      stroke="none"
                      connectNulls={false}
                      isAnimationActive={false}
                      name="Clôture"
                      dot={{ r: 8, fill: "var(--color-danger)", stroke: "#0c0d10", strokeWidth: 2 }}
                    />
                    {levels ? (
                      <>
                        <ReferenceLine y={levels.entry} stroke="var(--color-foreground)" strokeDasharray="4 4" strokeOpacity={0.45} />
                        <ReferenceLine y={levels.stop} stroke="var(--color-danger)" strokeDasharray="5 4" />
                        <ReferenceLine y={levels.target} stroke="var(--color-ok)" strokeDasharray="5 4" />
                      </>
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
                <ChartLevels
                  live={live}
                  closed={(bookQ.data?.closed ?? []).filter((c) => c.coin === desk.asset.replace("USDT", ""))}
                  lo={yDomain[0]}
                  hi={yDomain[1]}
                  xPct={openX}
                />
                <ChartMarks
                  lo={yDomain[0]}
                  hi={yDomain[1]}
                  points={chart.flatMap((d, i) => {
                    const out: { i: number; n: number; y: number; kind: "open" | "close"; label: string }[] = [];
                    if (d.openY != null) out.push({ i, n: chart.length, y: d.openY, kind: "open", label: `OPEN ${d.openY.toFixed(2)}` });
                    if (d.closeY != null) out.push({ i, n: chart.length, y: d.closeY, kind: "close", label: `CLOSE ${d.closeY.toFixed(2)}` });
                    return out;
                  })}
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {market.isLoading ? "Chargement du flux…" : "Marché indisponible"}
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Axe X · temps · axe Y · USD · pastille verte = OPEN · rouge = CLOSE
          </p>
          {(pilot.data?.opens ?? []).some((o) => o.coin !== desk.asset.replace("USDT", "")) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {(pilot.data?.opens ?? [])
                .filter((o) => o.coin !== desk.asset.replace("USDT", ""))
                .map((o) => (
                  <button
                    key={o.coin}
                    type="button"
                    className="rounded-[var(--radius-sm)] border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok"
                    onClick={() => {
                      desk.setAsset(`${o.coin}USDT`);
                      void setPilot({ data: { asset: `${o.coin}USDT` } });
                    }}
                  >
                    Position {o.side} {o.coin} — afficher le graphique
                  </button>
                ))}
            </div>
          )}
          {ctx && (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Stat k="RSI 14" v={fmt(ctx.indicateurs.rsi_14, 1)} />
              <Stat k="Donchian 20" v={engines?.snaps.find((s) => s.name === "Donchian")?.trend ?? "—"} />
              <Stat k="Supertrend" v={engines?.snaps.find((s) => s.name === "Supertrend")?.trend ?? "—"} />
              <Stat k="Signal" v={engines?.signal ? `${engines.signal.source} ${engines.signal.side}` : "aucun"} />
            </dl>
          )}
        </section>

        <DeskTabs
          panes={{
            pos: (
              <PositionsLive
                opens={pilot.data?.opens ?? []}
                setups={(pilot.data as { lastSetups?: Record<string, { rationale?: string }> } | undefined)?.lastSetups}
                managed={(pilot.data as { managed?: Record<string, { lastReview?: string }> } | undefined)?.managed}
              />
            ),
            radar: (
              <>
                <ScanBoard
                  board={pilot.data?.board ?? {}}
                  asset={desk.asset}
                  opens={pilot.data?.opens ?? []}
                  onPick={(a: string) => {
                    desk.setAsset(a);
                    void setPilot({ data: { asset: a } });
                  }}
                />
                <WalletPanel />
              </>
            ),
            nav: <EquityPanel />,
            bot: (
              <>
                <section className="gsd-panel flex min-w-0 flex-col rounded-[var(--radius-lg)] p-4 lg:col-span-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Département</p>
                      <h2 className="text-lg font-medium">Grok Strategy</h2>
                    </div>
                    <Button
                      disabled={desk.running || desk.kill}
                      onClick={() => {
                        desk.setRunning(true);
                        desk.setError(null);
                        void runPilotTick({ data: {} })
                          .then((r) => {
                            const row = r as { lastError?: string | null; lastReason?: string; lastStage?: string };
                            if (row.lastError) desk.setError(row.lastError);
                            void pilot.refetch();
                          })
                          .catch((e: unknown) => desk.setError(e instanceof Error ? e.message : "cycle"))
                          .finally(() => desk.setRunning(false));
                      }}
                    >
                      {desk.running ? <Loader2 className="animate-spin" /> : <Sparkles />}
                      {desk.running ? "Cycle…" : "Lancer"}
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {(pilot.data as { strategy?: string } | undefined)?.strategy === "legacy"
                      ? "Scan 10 paires × 4 TF maintenant. 30–90 s. Résultat sous le bouton."
                      : "Règle BTC 25/10 : relit le canal et aligne le compte et ses ordres stop, même en mode manuel. Quelques secondes."}
                  </p>
                  {pilot.data?.lastReason && (
                    <p className="mt-2 text-xs leading-snug text-muted-foreground">{pilot.data.lastReason}</p>
                  )}
                  {desk.error && (
                    <p className="mt-3 rounded-[var(--radius-md)] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                      {desk.error}
                    </p>
                  )}
                </section>
                <StrategyPanel
                  opens={pilot.data?.opens ?? []}
                  asset={desk.asset}
                  setups={(pilot.data as { lastSetups?: Record<string, import("@/lib/desk/types").SetupProposal> } | undefined)?.lastSetups}
                  managed={(pilot.data as { managed?: Record<string, { lastReview?: string; log?: { t: number; text: string }[] }> } | undefined)?.managed}
                  onPick={(a) => {
                    desk.setAsset(a);
                    void setPilot({ data: { asset: a } });
                  }}
                />
                <div className="lg:col-span-12">
                  <ChainPanel />
                </div>
              </>
            ),
            journal: <TalkPanel />,
            chaine: <ChainPanel />,
            decisions: <DecisionsPanel />,
            reglages: (
              <SettingsPanel
                strategy={String((pilot.data as { strategy?: string } | undefined)?.strategy ?? "btc_25_10")}
                grokCallsPerHour={Number((pilot.data as { grokCallsPerHour?: number } | undefined)?.grokCallsPerHour ?? 6)}
                scanEveryMin={Number((pilot.data as { scanEveryMin?: number } | undefined)?.scanEveryMin ?? 15)}
                grokUsdPerDay={Number((pilot.data as { grokUsdPerDay?: number } | undefined)?.grokUsdPerDay ?? 1)}
                regime={(pilot.data as { regime?: { halted?: boolean; can_open_new_trade?: boolean; regime?: string; kill_reasons?: string[]; day_pnl_pct?: number; loss_streak?: number } } | undefined)?.regime}
                onSaved={() => void pilot.refetch()}
              />
            ),
          }}
        />
      </main>
    </div>
  );
}

function tradeLevels(
  live: HlOpenPos | null | undefined,
  lastSetup: CycleResult["setup"] | null,
  asset: string,
) {
  if (!live) return null;
  if (asset.replace("USDT", "") !== live.coin) return null;
  const base = lastSetup && !lastSetup.abstained && lastSetup.asset.replace("USDT", "") === live.coin ? lastSetup : null;
  const entry = base?.entry_price ?? live.entry;
  let stop = base?.stop_price ?? null;
  if (stop == null || (live.liq != null && Math.abs(stop - live.liq) < 1e-8)) {
    stop = live.side === "LONG" ? entry * 0.97 : entry * 1.03;
  }
  const risk = Math.abs(entry - stop) || entry * 0.03;
  const target = base?.target_price ?? (live.side === "LONG" ? entry + risk * 1.5 : entry - risk * 1.5);
  return { entry, stop, target, side: live.side, coin: live.coin };
}

function ago(ts: number) {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  return `${Math.floor(s / 3600)} h`;
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-elevated px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="tabular mt-0.5">{v}</dd>
    </div>
  );
}

function fmt(v: number | null | undefined, d = 2) {
  if (v == null) return "—";
  return v.toFixed(d);
}

function Book({
  positions,
  journal,
}: {
  positions: ReturnType<typeof useDesk.getState>["positions"];
  journal: ReturnType<typeof useDesk.getState>["journal"];
}) {
  return (
    <section className="rounded-[var(--radius-xl)] border border-border bg-card p-4 lg:col-span-7">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-accent" />
        <h2 className="text-lg font-medium">Ordres du département</h2>
      </div>
      <div className="mt-3 -mx-1 max-w-full overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Côté</th>
              <th className="font-medium">Actif</th>
              <th className="font-medium">Entrée</th>
              <th className="font-medium">Stop</th>
              <th className="font-medium">Statut</th>
              <th className="font-medium">PnL</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-muted-foreground">
                  Pas d’ordre. Autonome ou « Lancer un cycle » : le bot décide, le département envoie.
                </td>
              </tr>
            )}
            {positions.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className={cn("py-2", p.side === "LONG" ? "text-long" : "text-short")}>{p.side}</td>
                <td>{p.asset.replace("USDT", "")}</td>
                <td className="tabular">{p.entry.toFixed(2)}</td>
                <td className="tabular">{p.stop.toFixed(2)}</td>
                <td>{p.status}</td>
                <td className="tabular">{p.pnl != null ? p.pnl.toFixed(2) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
        {journal.slice(0, 12).map((j) => (
          <li key={j.id}>
            <span className="tabular mr-2">{new Date(j.ts).toLocaleTimeString("fr-FR")}</span>
            {j.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
