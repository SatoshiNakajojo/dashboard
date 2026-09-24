import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import {
  GSD_BACKSTOP_R,
  GSD_DUST_NOTIONAL,
  GSD_LEVERAGE,
  GSD_MAX_BOOK_PCT,
  GSD_MAX_OPEN,
  GSD_MAX_STOP_FRAC,
  GSD_MIN_NOTIONAL,
  GSD_RISK_PCT,
} from "./bot";
import { classifyHl, marginCeiling, orderTarget, planSize } from "./sizing";
import type { HlBalances, SizePlan } from "./sizing";

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
  /** Retour sur la marge engagée, EN POURCENT. L'unité est dans le nom :
   *  c'est une double conversion silencieuse qui a coûté un facteur 100. */
  roePct: number;
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
      // L'API rend une FRACTION. Une seule conversion, ici, sans deviner :
      // toute normalisation supplémentaire en aval est un bug.
      roePct: Number(p.returnOnEquity) * 100,
      liq: p.liquidationPx == null ? null : Number(p.liquidationPx),
      margin: Number(p.marginUsed),
      leverage: Number(p.leverage?.value ?? p.leverage ?? 0),
      levType: p.leverage.type,
      funding: Number(p.cumFunding.sinceOpen),
    });
  }
  return out;
}

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

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

export {
  orderTarget,
  marginCeiling,
  orderNotional,
  planSize,
  classifyHl,
  hlTradingEquity,
} from "./sizing";
export type { SizeBind, SizePlan, HlBalances } from "./sizing";

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
  const spotHold = usdc && "hold" in usdc ? n(usdc.hold) : 0;
  const bal = classifyHl(perps, spotUsd, withdrawable, marginUsed, spotHold);
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

export function fmtPx(px: number, szDecimals: number) {
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

/**
 * Retire les TP/SL au repos d'un actif avant d'en reposer, ou avant de
 * sortir. Sans ça ils s'accumulent : 24 ordres au repos pour 6 positions
 * ont été relevés en production, dimensionnés jusqu'à 415 fois la position,
 * et ce sont eux qui empêchaient la coupe d'urgence de passer.
 */
async function cancelCoinTriggers(
  exchange: ExchangeClient,
  info: InfoClient,
  master: `0x${string}`,
  coin: string,
  idx: number,
): Promise<number> {
  try {
    const open = await info.frontendOpenOrders({ user: master });
    const cancels = open
      .filter((o) => String(o.coin).toUpperCase() === coin.toUpperCase() && o.reduceOnly)
      .map((o) => ({ a: idx, o: Number(o.oid) }))
      .filter((c) => Number.isFinite(c.o));
    if (!cancels.length) return 0;
    await exchange.cancel({ cancels });
    return cancels.length;
  } catch {
    return 0;
  }
}

/** Taille réellement exécutée, lue dans la réponse — jamais la taille demandée. */
function filledSize(status: unknown): { filled: number; oid: string; avgPx: number | null } {
  if (status && typeof status === "object") {
    if ("filled" in status) {
      const f = (status as { filled: { totalSz: string; avgPx: string; oid: number } }).filled;
      return {
        filled: Math.abs(Number(f.totalSz)) || 0,
        oid: String(f.oid),
        avgPx: finitePx(f.avgPx),
      };
    }
    if ("resting" in status) {
      return { filled: 0, oid: String((status as { resting: { oid: number } }).resting.oid), avgPx: null };
    }
  }
  return { filled: 0, oid: "ok", avgPx: null };
}

export type DeptOrderOk = {
  ok: true;
  oid: string;
  /** Taille DEMANDÉE. */
  requested: number;
  /** Taille EXÉCUTÉE, lue chez l'exchange. Peut être très inférieure. */
  size: number;
  avgPx: number | null;
  plan: SizePlan;
  notes: string[];
};

export async function submitDeptOrder(
  session: HlSession,
  input: {
    asset: string;
    side: "LONG" | "SHORT";
    entry: number;
    stop: number;
    target?: number | null;
  },
): Promise<DeptOrderOk | { ok: false; error: string }> {
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
    if (Number(bal.spotFree) >= 1) {
      try {
        await exchange.usdClassTransfer({
          amount: String(Math.floor(Number(bal.spotFree) * 100) / 100),
          toPerp: true,
        });
      } catch {
        /* compte unifié, ou transfert refusé : planSize bornera sur `free`. */
      }
    }

    const fresh = await readHlBalances(session.master);
    const equity = Number(fresh.trading ?? fresh.perps ?? 0);
    const free = Number(fresh.free);
    if (!Number.isFinite(equity) || equity < 5) {
      return { ok: false, error: `Fonds insuffisants (${Number.isFinite(equity) ? equity.toFixed(2) : "?"} USDC Perps).` };
    }

    const opensNow = await readHlPositions(session.master);
    if (opensNow.length >= GSD_MAX_OPEN && !opensNow.some((o) => o.coin === coin)) {
      return {
        ok: false,
        error: `déjà ${opensNow.map((o) => o.coin).join(",")} — max ${GSD_MAX_OPEN} positions.`,
      };
    }
    const bookNotional = opensNow.reduce((s, o) => s + (Number.isFinite(o.value) ? o.value : 0), 0);

    // Le stop décide de la taille. Le prix de référence est le mid courant,
    // pas la clôture de barre du signal : c'est là qu'on entre réellement.
    const planned = planSize({ equity, free, entry: mid, stop: input.stop, bookNotional });
    if (!planned.ok) return { ok: false, error: `${coin}: ${planned.error}` };
    const plan = planned.plan;

    const size = lotSize(plan.notional, mid, szDecimals);
    if (!size || Number(size) * mid < GSD_MIN_NOTIONAL) {
      return { ok: false, error: `${coin}: ticket ${plan.notional.toFixed(2)} $ non arrondissable au lot.` };
    }

    const limitPx = fmtPx(isBuy ? mid * 1.02 : mid * 0.98, szDecimals);
    if (!limitPx) return { ok: false, error: `${coin}: prix limite illisible, ordre ignoré.` };
    if (!Number.isFinite(Number(size)) || Number(size) <= 0) {
      return { ok: false, error: `${coin}: NaN bloqué avant envoi (size=${size}).` };
    }

    const notes: string[] = [
      `taille bridée par « ${plan.bind} » · risque ${plan.risqueUsd.toFixed(2)} $ · stop ${(plan.stopFrac * 100).toFixed(1)} %`,
    ];

    // Les triggers de l'entrée précédente partent AVANT, sinon ils s'empilent.
    const purgés = await cancelCoinTriggers(exchange, info, session.master, coin, idx);
    if (purgés) notes.push(`${purgés} trigger(s) périmé(s) annulé(s)`);

    await exchange.updateLeverage({ asset: idx, isCross: true, leverage: GSD_LEVERAGE });

    // L'entrée part SEULE. Le bracket « normalTpsl » dimensionnait le TP/SL
    // sur l'ordre parent : ordre de 433, exécution de 1, stop de 415.
    const res = await exchange.order({
      orders: [{ a: idx, b: isBuy, p: String(limitPx), s: size, r: false, t: { limit: { tif: "FrontendMarket" } } }],
      grouping: "na",
    });
    const status = res.response.data.statuses[0];
    if (status && typeof status === "object" && "error" in status) {
      return { ok: false, error: String((status as { error: string }).error) };
    }
    const { filled, oid, avgPx } = filledSize(status);
    const requested = Number(size);

    if (filled <= 0) {
      await cancelCoinTriggers(exchange, info, session.master, coin, idx);
      return { ok: false, error: `${coin}: aucune exécution (demandé ${requested}).` };
    }
    if (filled < requested * 0.999) {
      notes.push(`exécution PARTIELLE ${filled}/${requested} — la marge n'autorisait pas plus`);
    }

    // Vérité de l'exchange, pas la mémoire du bot.
    const after = (await readHlPositions(session.master)).find((p) => p.coin === coin);
    if (!after || after.size <= 0) {
      return { ok: false, error: `${coin}: exécuté ${filled} mais aucune position lue — état incohérent, rien n'a été armé.` };
    }
    if (after.value < GSD_DUST_NOTIONAL) {
      notes.push(`position ${after.value.toFixed(2)} $ sous le seuil de miette — on referme`);
      await cancelCoinTriggers(exchange, info, session.master, coin, idx);
      await reduceDeptPosition(session, coin, 1);
      return { ok: false, error: `${coin}: exécution résiduelle ${after.value.toFixed(2)} $, refermée.` };
    }

    // TP/SL dimensionnés sur la position RÉELLE.
    const arme = {
      idx,
      szDecimals,
      isBuy,
      size: after.size,
      stop: input.stop,
      target: input.target ?? null,
      entry: after.entry,
    };
    let armed = await armProtection(exchange, arme);
    if (armed.startsWith("STOP NON ARMÉ")) armed = await armProtection(exchange, arme);

    // Une position sans stop dans un bot qui ne repasse que toutes les cinq
    // minutes, c'est exactement comme naît un −36 %. On préfère la refermer.
    if (armed.startsWith("STOP NON ARMÉ")) {
      const close = await reduceDeptPosition(session, coin, 1);
      return {
        ok: false,
        error: `${coin}: stop impossible à poser (${armed}) — position ${close.ok ? "refermée" : "À FERMER À LA MAIN"}.`,
      };
    }
    notes.push(armed);

    return { ok: true, oid, requested, size: after.size, avgPx, plan, notes };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ordre Hyperliquid refusé";
    if (/NaN|not finite/i.test(msg)) {
      return { ok: false, error: `${coinOf(input.asset)}: taille/prix invalide, ordre ignoré.` };
    }
    return { ok: false, error: msg };
  }
}

/** Pose le stop (taille pleine) et le TP (moitié) sur la position réelle. */
async function armProtection(
  exchange: ExchangeClient,
  a: {
    idx: number;
    szDecimals: number;
    isBuy: boolean;
    size: number;
    stop: number;
    target: number | null;
    entry: number;
  },
): Promise<string> {
  const f = 10 ** a.szDecimals;
  const full = (Math.floor(a.size * f + 1e-9) / f).toFixed(a.szDecimals);
  const half = (Math.floor(a.size * 0.5 * f + 1e-9) / f).toFixed(a.szDecimals);
  const stopPx = fmtPx(a.stop, a.szDecimals);
  if (!stopPx || !(Number(full) > 0)) return "STOP NON ARMÉ — position nue, à surveiller";

  const orders: Array<Record<string, unknown>> = [
    {
      a: a.idx,
      b: !a.isBuy,
      p: String(stopPx),
      s: full,
      r: true,
      t: { trigger: { isMarket: true, triggerPx: String(stopPx), tpsl: "sl" } },
    },
  ];
  const tp = a.target != null ? fmtPx(a.target, a.szDecimals) : null;
  if (tp && Number(half) > 0) {
    orders.push({
      a: a.idx,
      b: !a.isBuy,
      p: String(tp),
      s: half,
      r: true,
      t: { trigger: { isMarket: true, triggerPx: String(tp), tpsl: "tp" } },
    });
  }
  try {
    await exchange.order({ orders: orders as never, grouping: "na" });
    return `stop ${stopPx} sur ${full}${tp ? ` · TP ${tp} sur ${half}` : ""}`;
  } catch (e) {
    return `STOP NON ARMÉ (${e instanceof Error ? e.message : "refus"}) — position nue`;
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

    // Les triggers reduceOnly au repos bloquent une sortie reduceOnly quand
    // leur taille cumulée dépasse la position. C'est l'hypothèse la mieux
    // étayée de l'audit pour expliquer AVAX à −13 % jamais coupé.
    await cancelCoinTriggers(exchange, info, session.master, pos.coin, idx);

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
    const { filled } = filledSize(st);
    if (filled <= 0) return { ok: false, error: `${coin}: sortie sans exécution (demandé ${sz})` };

    // Si on a soldé, plus rien ne doit rester au repos.
    if (frac >= 1) await cancelCoinTriggers(exchange, info, session.master, pos.coin, idx);
    return { ok: true, closed: filled };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "close refusé" };
  }
}

/**
 * Filet de sécurité, pas la sortie principale.
 *
 * Le contrôle du risque est le stop posé chez l'exchange. Cette fonction ne
 * se déclenche que s'il a échoué : perte latente au-delà de GSD_BACKSTOP_R
 * fois le risque prévu. L'ancienne règle coupait à −1 % de ROE sur un ROE
 * lu avec un facteur 100 d'erreur — elle liquidait du bruit de marché.
 */
export async function flattenLosers(session: HlSession, skip: string[] = []): Promise<string[]> {
  // Un actif géré par sa propre règle (la règle BTC et son stop à 10 jours)
  // ne passe pas par ce filet, calibré sur 1 % de risque par trade.
  const opens = (await readHlPositions(session.master)).filter((p) => !skip.includes(p.coin));
  const notes: string[] = [];
  if (!opens.length) return notes;

  const bal = await readHlBalances(session.master);
  const equity = Number(bal.trading) || 0;
  const budget = GSD_RISK_PCT * equity * GSD_BACKSTOP_R;

  for (const p of opens) {
    const miette = p.value < GSD_DUST_NOTIONAL;
    const creve = budget > 0 && p.pnl < -budget;
    if (!miette && !creve) continue;
    const pourquoi = miette
      ? `miette ${p.value.toFixed(2)} $`
      : `perte ${p.pnl.toFixed(2)} $ > ${budget.toFixed(2)} $ (${GSD_BACKSTOP_R}R)`;
    const r = await reduceDeptPosition(session, p.coin, 1);
    notes.push(
      r.ok
        ? `COUPE ${p.coin} ${p.side} — ${pourquoi} · ROE ${p.roePct.toFixed(1)} %`
        : `COUPE FAIL ${p.coin} — ${pourquoi} → ${r.error}`,
    );
  }
  if (!notes.length) {
    notes.push(
      `barre a vu ${opens.map((p) => `${p.coin} ${p.roePct.toFixed(1)} %`).join(", ")} — rien au-delà de ${budget.toFixed(2)} $`,
    );
  }
  return notes;
}

export async function addDeptSize(
  session: HlSession,
  coin: string,
  extraUsd: number,
  /** Stop de la position, pour réarmer sur la taille agrandie. */
  stop?: number,
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

    // Un renfort reste borné par la marge et par le livre, comme une entrée.
    const bal = await readHlBalances(session.master);
    const opens = await readHlPositions(session.master);
    const book = opens.reduce((s, o) => s + (Number.isFinite(o.value) ? o.value : 0), 0);
    const plafond = Math.min(
      marginCeiling(Number(bal.free)),
      Math.max(0, Number(bal.trading) * GSD_MAX_BOOK_PCT - book),
      Math.max(0, orderTarget(Number(bal.trading)) - pos.value),
    );
    const montant = Math.min(extraUsd, plafond);
    if (montant < GSD_MIN_NOTIONAL) {
      return { ok: false, error: `${coin}: renfort ${montant.toFixed(2)} $ sous le minimum` };
    }

    const size = lotSize(montant, mid, szDecimals);
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
    const { filled } = filledSize(st);
    if (filled <= 0) return { ok: false, error: `${coin}: renfort sans exécution` };

    // Le stop doit couvrir la position agrandie, pas l'ancienne.
    const after = (await readHlPositions(session.master)).find((x) => x.coin === pos.coin);
    if (after) {
      await cancelCoinTriggers(exchange, info, session.master, pos.coin, idx);
      const stopN =
        Number.isFinite(stop) && (stop as number) > 0
          ? (stop as number)
          : pos.side === "LONG"
            ? after.entry * (1 - GSD_MAX_STOP_FRAC / 2)
            : after.entry * (1 + GSD_MAX_STOP_FRAC / 2);
      const armed = await armProtection(exchange, {
        idx,
        szDecimals,
        isBuy,
        size: after.size,
        stop: stopN,
        target: null,
        entry: after.entry,
      });
      if (armed.startsWith("STOP NON ARMÉ")) {
        return { ok: false, error: `${coin}: renfort exécuté mais stop non réarmé — ${armed}` };
      }
    }
    return { ok: true, size: filled };
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
}): Promise<DeptOrderOk | { ok: false; error: string }> {
  const session = loadHlSession();
  if (!session) return { ok: false, error: "Clé API Hyperliquid non configurée." };
  return submitDeptOrder(session, input);
}
