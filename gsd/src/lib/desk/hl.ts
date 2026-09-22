import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { GSD_MAX_OPEN, GSD_MIN_NOTIONAL, GSD_NOTIONAL_USD, GSD_SLOT_PCT } from "./bot";

const STORAGE = "gsd-hl-agent-v1";

export type HlSession = {
  key: `0x${string}`;
  master: `0x${string}`;
  agent: `0x${string}`;
};

function normalizeKey(raw: string): `0x${string}` {
  const hex = raw.trim().startsWith("0x") ? raw.trim() : `0x${raw.trim()}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("Clé API invalide — 64 caractères hex, avec ou sans 0x.");
  }
  return hex as `0x${string}`;
}

function normalizeAddr(raw: string): `0x${string}` | null {
  const a = raw.trim();
  if (!a) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(a)) throw new Error("Adresse maître invalide.");
  return a as `0x${string}`;
}

export function loadHlSession(): HlSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return null;
    const p = JSON.parse(raw) as { k?: string; m?: string; a?: string };
    if (!p.k || !p.m || !p.a) return null;
    return { key: p.k as `0x${string}`, master: p.m as `0x${string}`, agent: p.a as `0x${string}` };
  } catch {
    return null;
  }
}

export function clearHlSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE);
}

function saveSession(s: HlSession) {
  localStorage.setItem(STORAGE, JSON.stringify({ k: s.key, m: s.master, a: s.agent }));
}

export type HlOpenPos = {
  coin: string;
  side: "LONG" | "SHORT";
  size: number;
  entry: number;
  value: number;
  pnl: number;
  roe: number;
  liq: number | null;
  margin: number;
  leverage: number;
  levType: string;
  funding: number;
};

export async function readHlPositions(master: `0x${string}`): Promise<HlOpenPos[]> {
  const info = new InfoClient({ transport: new HttpTransport() });
  const perp = await info.clearinghouseState({ user: master });
  const out: HlOpenPos[] = [];
  for (const row of perp.assetPositions) {
    const p = row.position;
    const size = Number(p.szi);
    if (!Number.isFinite(size) || size === 0) continue;
    out.push({
      coin: p.coin,
      side: size > 0 ? "LONG" : "SHORT",
      size: Math.abs(size),
      entry: Number(p.entryPx),
      value: Number(p.positionValue),
      pnl: Number(p.unrealizedPnl),
      roe: (() => {
        const r = Number(p.returnOnEquity);
        return Math.abs(r) <= 5 ? r * 100 : r;
      })(),
      liq: p.liquidationPx == null ? null : Number(p.liquidationPx),
      margin: Number(p.marginUsed),
      leverage: Number(p.leverage?.value ?? p.leverage ?? 0),
      levType: p.leverage.type,
      funding: Number(p.cumFunding.sinceOpen),
    });
  }
  return out;
}

export type HlBalances = {
  perps: number;
  spot: number;
  total: number;
  withdrawable: number;
  marginUsed: number;
  unified: boolean;
  trading: number;
  free: number;
  upnl: number;
  cash: number;
};

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Une seule règle : le bot trade sur les Perps. On n’additionne jamais Spot + Perps. */
export type HlFill = {
  t: number;
  coin: string;
  side: "LONG" | "SHORT";
  px: number;
  size: number;
  pnl: number;
  dir: string;
};

export async function readHlClosingFills(master: `0x${string}`): Promise<HlFill[]> {
  const user = master.startsWith("0x") ? master : (`0x${master}` as `0x${string}`);
  let raw: Array<{
    time?: number;
    coin?: string;
    px?: string;
    sz?: string;
    closedPnl?: string;
    dir?: string;
    side?: string;
  }> = [];
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "userFillsByTime",
        user,
        startTime: Date.now() - 21 * 86400000,
      }),
    });
    if (res.ok) {
      const j = (await res.json()) as unknown;
      if (Array.isArray(j)) raw = j as typeof raw;
    }
  } catch {
    /* */
  }
  if (!raw.length) {
    try {
      const info = new InfoClient({ transport: new HttpTransport() });
      raw = ((await info.userFills({ user })) as typeof raw) || [];
    } catch {
      raw = [];
    }
  }
  const out: HlFill[] = [];
  for (const f of raw) {
    const pnl = Number(f.closedPnl);
    const dir = String(f.dir || "");
    const isClose = /close/i.test(dir) || (Number.isFinite(pnl) && pnl !== 0);
    if (!isClose) continue;
    const sideRaw = String(f.side || "");
    const closedSide: "LONG" | "SHORT" = /A|sell/i.test(sideRaw) ? "LONG" : "SHORT";
    out.push({
      t: Number(f.time) || Date.now(),
      coin: String(f.coin || ""),
      side: closedSide,
      px: Number(f.px),
      size: Math.abs(Number(f.sz)),
      pnl: Number.isFinite(pnl) ? pnl : 0,
      dir,
    });
  }
  return out.slice(0, 400);
}

export function classifyHl(perps: number, spot: number, withdrawable = 0, marginUsed = 0): HlBalances {
  const p = n(perps);
  const s = n(spot);
  const w = n(withdrawable);
  const m = n(marginUsed);
  const unified = p > 0 && s > 0 && Math.abs(p - s) <= Math.max(1, 0.05 * Math.max(p, s));
  const trading = p;
  const free = w > 0 ? w : Math.max(0, p - m);
  return {
    perps: p,
    spot: s,
    total: trading,
    withdrawable: w,
    marginUsed: m,
    unified,
    trading,
    free,
    upnl: 0,
    cash: trading,
  };
}

export function hlTradingEquity(perps: number, spot: number) {
  return classifyHl(perps, spot).trading;
}

export function orderTarget(equity: number) {
  const eq = Number.isFinite(equity) ? Math.max(0, equity) : 0;
  return Math.min(GSD_NOTIONAL_USD, eq * GSD_SLOT_PCT * 2);
}

export function orderNotional(equity: number, free?: number) {
  let cap = orderTarget(equity);
  if (free != null && Number.isFinite(free)) cap = Math.min(cap, Math.max(0, free) * 2 * 0.8);
  return Number.isFinite(cap) ? cap : 0;
}

export async function readHlBalances(master: `0x${string}`): Promise<HlBalances> {
  const info = new InfoClient({ transport: new HttpTransport() });
  const [perp, spot] = await Promise.all([
    info.clearinghouseState({ user: master }),
    info.spotClearinghouseState({ user: master }),
  ]);
  const perps = n(perp.marginSummary.accountValue);
  const marginUsed = n(perp.marginSummary.totalMarginUsed);
  const withdrawable = n(perp.withdrawable);
  let upnl = 0;
  for (const row of perp.assetPositions) upnl += n(row.position.unrealizedPnl);
  const usdc = spot.balances.find((b) => "coin" in b && b.coin === "USDC");
  const spotUsd = usdc && "total" in usdc ? n(usdc.total) : 0;
  const bal = classifyHl(perps, spotUsd, withdrawable, marginUsed);
  return { ...bal, upnl, cash: perps - upnl };
}

export async function connectHl(privateKey: string, masterRaw: string) {
  const key = normalizeKey(privateKey);
  const agent = privateKeyToAccount(key);
  const master = normalizeAddr(masterRaw);
  if (!master) {
    throw new Error(
      "Adresse maître obligatoire — c’est le wallet où sont tes 25$, pas l’adresse de la clé API.",
    );
  }
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });
  if (master.toLowerCase() !== agent.address.toLowerCase()) {
    const agents = await info.extraAgents({ user: master });
    const ok = agents.some((x) => x.address.toLowerCase() === agent.address.toLowerCase());
    if (!ok) {
      throw new Error(
        "Grok Strategy Dp n'est pas un agent de cette adresse. Vérifie le wallet qui a autorisé la clé.",
      );
    }
  }
  saveSession({ key, master, agent: agent.address });
  const bal = await readHlBalances(master);
  return { agent: agent.address, master, ...bal };
}

export async function retargetMaster(masterRaw: string) {
  const session = loadHlSession();
  if (!session) throw new Error("Clé API absente — reconnecte d’abord.");
  return connectHl(session.key, masterRaw);
}

export async function readHlEquity(master: `0x${string}`): Promise<number | null> {
  const bal = await readHlBalances(master);
  return bal.trading;
}

function coinOf(asset: string) {
  return asset.replace(/USDT$/i, "").toUpperCase();
}

function finitePx(v: unknown) {
  const n = typeof v === "string" ? Number(v.trim()) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickMid(mids: unknown, coin: string, fallback?: unknown) {
  const bag = (mids && typeof mids === "object" ? mids : {}) as Record<string, unknown>;
  const inner =
    bag[coin] ??
    bag[coin.toUpperCase()] ??
    (bag.mids && typeof bag.mids === "object" ? (bag.mids as Record<string, unknown>)[coin] : undefined);
  return finitePx(inner) ?? finitePx(fallback) ?? (() => {
    for (const [k, v] of Object.entries(bag)) {
      if (k.replace(/[^A-Z]/gi, "").toUpperCase() === coin) return finitePx(v);
    }
    return null;
  })();
}

function lotSize(notional: number, px: number, szDecimals: number) {
  const dec = Number.isInteger(szDecimals) && szDecimals >= 0 && szDecimals <= 8 ? szDecimals : 3;
  if (!Number.isFinite(notional) || notional < GSD_MIN_NOTIONAL || !Number.isFinite(px) || px <= 0) return null;
  const raw = notional / px;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const f = 10 ** dec;
  const rounded = Math.floor(raw * f + 1e-9) / f;
  if (!Number.isFinite(rounded) || rounded <= 0) return null;
  const s = dec === 0 ? String(Math.floor(rounded)) : rounded.toFixed(dec);
  if (!Number.isFinite(Number(s)) || Number(s) <= 0) return null;
  return s;
}

function fmtPx(px: number, szDecimals: number) {
  const decIn = Number.isInteger(szDecimals) && szDecimals >= 0 && szDecimals <= 8 ? szDecimals : 2;
  const maxDec = Math.max(6 - decIn, 0);
  if (!Number.isFinite(px) || px <= 0) return null;
  const sig = Number(px.toPrecision(5));
  if (!Number.isFinite(sig) || sig <= 0) return null;
  const f = 10 ** maxDec;
  const rounded = Math.round(sig * f) / f;
  if (!Number.isFinite(rounded) || rounded <= 0) return null;
  return maxDec === 0 ? String(Math.round(rounded)) : String(rounded);
}

export async function submitDeptOrder(
  session: HlSession,
  input: {
    asset: string;
    side: "LONG" | "SHORT";
    entry: number;
    stop: number;
    target?: number | null;
  },
): Promise<{ ok: true; oid: string; size: number } | { ok: false; error: string }> {
  try {
    const wallet = privateKeyToAccount(session.key);
    const transport = new HttpTransport();
    const info = new InfoClient({ transport });
    const exchange = new ExchangeClient({ transport, wallet });
    const meta = await info.meta();
    const coin = coinOf(input.asset);
    const idx = meta.universe.findIndex((u) => u.name === coin);
    if (idx < 0) return { ok: false, error: `${coin} n'est pas un perp Hyperliquid.` };
    const szDecimals = Number.isFinite(Number(meta.universe[idx].szDecimals))
      ? Number(meta.universe[idx].szDecimals)
      : 2;
    const isBuy = input.side === "LONG";
    const mids = await info.allMids();
    const mid = pickMid(mids, coin, input.entry);
    if (mid == null) return { ok: false, error: `${coin}: prix illisible, ordre ignoré.` };

    const bal = await readHlBalances(session.master);
    const equity = Number(bal.trading ?? bal.perps ?? 0);
    if (!Number.isFinite(equity) || (equity < 5 && Number(bal.spot) < 5)) {
      return { ok: false, error: `Fonds insuffisants (${Number.isFinite(equity) ? equity.toFixed(2) : "?"} USDC Perps).` };
    }
    if (Number(bal.spot) >= 5 && !bal.unified && Number(bal.spot) > 1) {
      try {
        await exchange.usdClassTransfer({ amount: String(Math.floor(Number(bal.spot) * 100) / 100), toPerp: true });
      } catch {
        /* Unified */
      }
    }
    const fresh = await readHlBalances(session.master);
    const trading = Number(fresh.trading ?? fresh.perps ?? 0);
    const freeN = Number(fresh.free);
    const opensNow = await readHlPositions(session.master);
    if (opensNow.length >= GSD_MAX_OPEN && !opensNow.some((o) => o.coin === coin)) {
      return {
        ok: false,
        error: `déjà ${opensNow.map((o) => o.coin).join(",")} — max ${GSD_MAX_OPEN} slots (20 % chacun).`,
      };
    }
    const notional = orderNotional(trading, Number.isFinite(freeN) ? freeN : undefined);
    const size = lotSize(notional, mid, szDecimals);
    if (!size || Number(size) * mid < GSD_MIN_NOTIONAL) {
      return {
        ok: false,
        error: `${coin}: ticket trop petit (min ${GSD_MIN_NOTIONAL}$ · NAV ${Number.isFinite(trading) ? trading.toFixed(2) : "?"} · px ${mid}). Ignoré.`,
      };
    }

    const limitPx = fmtPx(isBuy ? mid * 1.02 : mid * 0.98, szDecimals);
    const stopN = finitePx(input.stop) ?? (isBuy ? mid * 0.97 : mid * 1.03);
    const stopPx = fmtPx(stopN, szDecimals);
    if (!limitPx || !stopPx) return { ok: false, error: `${coin}: prix de lot illisible, ordre ignoré.` };

    type HlOrder = {
      a: number;
      b: boolean;
      p: string;
      s: string;
      r: boolean;
      t: { limit: { tif: "FrontendMarket" } } | { trigger: { isMarket: boolean; triggerPx: string; tpsl: "tp" | "sl" } };
    };
    const orders: HlOrder[] = [
      { a: idx, b: isBuy, p: String(limitPx), s: size, r: false, t: { limit: { tif: "FrontendMarket" } } },
      { a: idx, b: !isBuy, p: String(stopPx), s: size, r: true, t: { trigger: { isMarket: true, triggerPx: String(stopPx), tpsl: "sl" } } },
    ];
    const tgt = finitePx(input.target);
    if (tgt != null) {
      const tp = fmtPx(tgt, szDecimals);
      const half = lotSize(notional * 0.5, mid, szDecimals);
      if (tp && half) {
        orders.push({
          a: idx,
          b: !isBuy,
          p: tp,
          s: half,
          r: true,
          t: { trigger: { isMarket: true, triggerPx: tp, tpsl: "tp" } },
        });
      }
    }

    for (const o of orders) {
      if (!Number.isFinite(Number(o.s)) || Number(o.s) <= 0 || !Number.isFinite(Number(o.p)) || Number(o.p) <= 0) {
        return { ok: false, error: `${coin}: NaN bloqué avant envoi (size=${o.s} px=${o.p}).` };
      }
    }

    await exchange.updateLeverage({ asset: idx, isCross: true, leverage: 2 });
    const res = await exchange.order({ orders, grouping: "normalTpsl" });
    const status = res.response.data.statuses[0];
    if (status && typeof status === "object" && "error" in status) {
      return { ok: false, error: String(status.error) };
    }
    const oid =
      status && typeof status === "object" && "resting" in status
        ? String(status.resting.oid)
        : status && typeof status === "object" && "filled" in status
          ? String(status.filled.oid)
          : "ok";
    return { ok: true, oid, size: Number(size) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ordre Hyperliquid refusé";
    if (/NaN|not finite/i.test(msg)) {
      return { ok: false, error: `${coinOf(input.asset)}: taille/prix invalide, ordre ignoré.` };
    }
    return { ok: false, error: msg };
  }
}

export async function reduceDeptPosition(
  session: HlSession,
  coin: string,
  fraction: number,
): Promise<{ ok: true; closed: number } | { ok: false; error: string }> {
  try {
    const pos = (await readHlPositions(session.master)).find((p) => p.coin.toUpperCase() === coin.toUpperCase());
    if (!pos) return { ok: false, error: `${coin}: déjà plat` };
    const frac = Math.min(1, Math.max(0.05, fraction));
    const wallet = privateKeyToAccount(session.key);
    const transport = new HttpTransport();
    const info = new InfoClient({ transport });
    const exchange = new ExchangeClient({ transport, wallet });
    const meta = await info.meta();
    const idx = meta.universe.findIndex((u) => u.name === pos.coin);
    if (idx < 0) return { ok: false, error: `${coin} introuvable` };
    const szDecimals = Number(meta.universe[idx].szDecimals) || 3;
    const mids = await info.allMids();
    const mid = pickMid(mids, pos.coin, pos.entry);
    if (mid == null) return { ok: false, error: `${coin}: mid illisible` };
    const raw = pos.size * frac;
    const f = 10 ** szDecimals;
    const sz = (Math.floor(raw * f + 1e-9) / f).toFixed(szDecimals);
    if (!(Number(sz) > 0)) return { ok: false, error: `${coin}: taille close nulle` };
    const isBuy = pos.side === "SHORT";
    const px = fmtPx(isBuy ? mid * 1.08 : mid * 0.92, szDecimals);
    if (!px) return { ok: false, error: `${coin}: px close illisible` };
    const res = await exchange.order({
      orders: [{ a: idx, b: isBuy, p: px, s: sz, r: true, t: { limit: { tif: "FrontendMarket" } } }],
      grouping: "na",
    });
    const st = res.response.data.statuses[0];
    if (st && typeof st === "object" && "error" in st) return { ok: false, error: String(st.error) };
    return { ok: true, closed: Number(sz) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "close refusé" };
  }
}

export async function flattenLosers(session: HlSession): Promise<string[]> {
  const opens = await readHlPositions(session.master);
  const notes: string[] = [];
  for (const p of opens) {
    const roePct = Math.abs(p.roe) <= 8 && Math.abs(p.roe) > 0 && Math.abs(p.roe) < 1 ? p.roe * 100 : p.roe;
    if (!(roePct <= -1 || p.pnl < -0.2)) continue;
    const r = await reduceDeptPosition(session, p.coin, 1);
    notes.push(
      r.ok
        ? `COUPE ${p.coin} ${p.side} ROE ${roePct.toFixed(1)}% P&L ${p.pnl.toFixed(2)}$`
        : `COUPE FAIL ${p.coin} ROE ${roePct.toFixed(1)}% → ${r.error}`,
    );
  }
  if (!notes.length && opens.length) {
    notes.push(`barre a vu ${opens.map((p) => `${p.coin} ${p.roe.toFixed(1)}%`).join(", ")} — rien sous −1%`);
  }
  return notes;
}

export async function addDeptSize(
  session: HlSession,
  coin: string,
  extraUsd: number,
): Promise<{ ok: true; size: number } | { ok: false; error: string }> {
  try {
    if (!Number.isFinite(extraUsd) || extraUsd < GSD_MIN_NOTIONAL) return { ok: false, error: "add trop petit" };
    const pos = (await readHlPositions(session.master)).find((p) => p.coin.toUpperCase() === coin.toUpperCase());
    if (!pos) return { ok: false, error: `${coin}: plus de position` };
    const wallet = privateKeyToAccount(session.key);
    const transport = new HttpTransport();
    const info = new InfoClient({ transport });
    const exchange = new ExchangeClient({ transport, wallet });
    const meta = await info.meta();
    const idx = meta.universe.findIndex((u) => u.name === pos.coin);
    if (idx < 0) return { ok: false, error: `${coin} introuvable` };
    const szDecimals = Number(meta.universe[idx].szDecimals) || 3;
    const mids = await info.allMids();
    const mid = pickMid(mids, pos.coin, pos.entry);
    if (mid == null) return { ok: false, error: `${coin}: mid illisible` };
    const size = lotSize(extraUsd, mid, szDecimals);
    if (!size) return { ok: false, error: `${coin}: taille add nulle` };
    const isBuy = pos.side === "LONG";
    const px = fmtPx(isBuy ? mid * 1.02 : mid * 0.98, szDecimals);
    if (!px) return { ok: false, error: `${coin}: px add` };
    const res = await exchange.order({
      orders: [{ a: idx, b: isBuy, p: px, s: size, r: false, t: { limit: { tif: "FrontendMarket" } } }],
      grouping: "na",
    });
    const st = res.response.data.statuses[0];
    if (st && typeof st === "object" && "error" in st) return { ok: false, error: String(st.error) };
    return { ok: true, size: Number(size) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "add refusé" };
  }
}

export async function placeDeptOrder(input: {
  asset: string;
  side: "LONG" | "SHORT";
  entry: number;
  stop: number;
  target?: number | null;
}): Promise<{ ok: true; oid: string; size: number } | { ok: false; error: string }> {
  const session = loadHlSession();
  if (!session) return { ok: false, error: "Clé API Hyperliquid non configurée." };
  return submitDeptOrder(session, input);
}
