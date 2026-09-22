import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GSD_MAX_OPEN, GSD_NOTIONAL_USD, GSD_WALLET_ADDRESS } from "./bot";
import type { CycleResult, JournalEntry, PaperPosition, Stage } from "./types";

interface DeskState {
  asset: string;
  interval: string;
  kill: boolean;
  autonome: boolean;
  equity: number;
  wallet: string;
  running: boolean;
  lastCycle: CycleResult | null;
  error: string | null;
  positions: PaperPosition[];
  journal: JournalEntry[];
  setAsset: (v: string) => void;
  setInterval: (v: string) => void;
  setRunning: (v: boolean) => void;
  setError: (v: string | null) => void;
  setAutonome: (v: boolean) => void;
  applyCycle: (c: CycleResult) => void;
  toggleKill: () => void;
  fillOrder: (cycle: CycleResult, lastPrice: number) => void;
  markToMarket: (priceByAsset: Record<string, number>) => void;
  hlLive: boolean;
  hlAgent: string;
  hlMaster: string;
  hlEquity: number | null;
  hlPerps: number | null;
  hlSpot: number | null;
  setHl: (v: { live: boolean; agent: string; master: string }) => void;
  setHlEquity: (v: number | null) => void;
  setHlBalances: (v: { perps: number; spot: number; total: number; trading?: number }) => void;
}

function nid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function pushJournal(list: JournalEntry[], entry: Omit<JournalEntry, "id" | "ts">): JournalEntry[] {
  const next: JournalEntry = { id: nid(), ts: Date.now(), ...entry };
  return [next, ...list].slice(0, 80);
}

export const useDesk = create<DeskState>()(
  persist(
    (set, get) => ({
      asset: "BTCUSDT",
      interval: "1h",
      kill: false,
      autonome: false,
      equity: GSD_NOTIONAL_USD,
      wallet: GSD_WALLET_ADDRESS,
      running: false,
      lastCycle: null,
      error: null,
      positions: [],
      journal: [],
      hlLive: false,
      hlAgent: "",
      hlMaster: "",
      hlEquity: null,
      hlPerps: null,
      hlSpot: null,
      setAsset: (asset) => set({ asset }),
      setInterval: (interval) => set({ interval }),
      setRunning: (running) => set({ running }),
      setError: (error) => set({ error }),
      setAutonome: (autonome) =>
        set({
          autonome,
          journal: pushJournal(get().journal, {
            kind: "note",
            text: autonome
              ? "Autonome ON — le département briefe le bot et passe les ordres tout seul"
              : "Autonome OFF",
          }),
        }),
      applyCycle: (c) => {
        set({
          lastCycle: c,
          error: null,
          journal: pushJournal(get().journal, {
            kind: "cycle",
            text: `${c.stage} — ${c.reason}`,
            stage: c.stage as Stage,
          }),
        });
      },
      toggleKill: () => {
        const kill = !get().kill;
        set({
          kill,
          autonome: kill ? false : get().autonome,
          journal: pushJournal(get().journal, {
            kind: "kill",
            text: kill ? "Kill département — plus d'ordre" : "Kill département désarmé",
          }),
        });
      },
      fillOrder: (cycle, lastPrice) => {
        if (get().kill) return;
        const setup = cycle.setup;
        if (!setup?.side || setup.entry_price == null || setup.stop_price == null) return;
        if (cycle.stage !== "ORDRE") return;
        const open = get().positions.filter((p) => p.status === "OPEN").length;
        if (open >= GSD_MAX_OPEN) {
          set({
            journal: pushJournal(get().journal, {
              kind: "note",
              text: "Ordre ignoré — une position déjà ouverte sur le wallet du département",
            }),
          });
          return;
        }
        const pos: PaperPosition = {
          id: nid(),
          asset: setup.asset,
          side: setup.side,
          entry: lastPrice,
          stop: setup.stop_price,
          target: setup.target_price,
          notional: GSD_NOTIONAL_USD,
          opened_at: Date.now(),
          mandate_id: cycle.mandate.mandate_id,
          status: "OPEN",
        };
        set({
          positions: [pos, ...get().positions].slice(0, 40),
          journal: pushJournal(get().journal, {
            kind: "fill",
            text: `GSD ${pos.side} ${pos.asset} @ ${pos.entry.toFixed(2)} · ${pos.notional}$ · wallet département`,
          }),
        });
      },
      markToMarket: (priceByAsset) => {
        const prev = get().positions;
        let delta = 0;
        const positions = prev.map((p) => {
          if (p.status !== "OPEN") return p;
          const px = priceByAsset[p.asset];
          if (px == null) return p;
          const hitStop = p.side === "LONG" ? px <= p.stop : px >= p.stop;
          const hitTarget = p.target != null && (p.side === "LONG" ? px >= p.target : px <= p.target);
          if (hitStop || hitTarget) {
            const dir = p.side === "LONG" ? 1 : -1;
            const exit = hitStop ? p.stop : (p.target as number);
            const pnl = dir * ((exit - p.entry) / p.entry) * p.notional;
            delta += pnl;
            return {
              ...p,
              status: hitStop ? ("STOPPED" as const) : ("TARGET" as const),
              exit,
              pnl,
            };
          }
          return p;
        });
        set({ positions, equity: get().equity + delta });
      },
      setHl: ({ live, agent, master }) =>
        set(
          live
            ? { hlLive: true, hlAgent: agent, hlMaster: master }
            : { hlLive: false, hlAgent: "", hlMaster: "", hlEquity: null, hlPerps: null, hlSpot: null },
        ),
      setHlEquity: (hlEquity) => set({ hlEquity }),
      setHlBalances: ({ perps, spot, total, trading }) =>
        set({ hlPerps: perps, hlSpot: spot, hlEquity: trading ?? total }),
    }),
    {
      name: "gsd-dept-v1",
      skipHydration: true,
      partialize: (s) => ({
        asset: s.asset,
        interval: s.interval,
        kill: s.kill,
        autonome: s.autonome,
        equity: s.equity,
        wallet: s.wallet,
        positions: s.positions,
        journal: s.journal,
      }),
    },
  ),
);
