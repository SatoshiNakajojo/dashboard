import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { GSD_LEVERAGE, GSD_MIN_NOTIONAL } from "./bot";
import {
  BTC_RULE,
  plan,
  replay,
  type Account,
  type Action,
  type DayBar,
  type Levels,
  type RuleTrade,
} from "./btc-rule";
import { logDecision } from "./decisions.server";
import { fmtPx, readHlBalances, readHlPositions, reduceDeptPosition, type HlSession } from "./hl";

const DAY = 86_400_000;
/** Première barre journalière servie par Hyperliquid, et début de la recherche. */
const HISTORY_START = Date.UTC(2020, 7, 19);

export type BtcSnapshot = {
  at: number;
  /** État de la règle, rejouée sur tout l'historique. */
  long: boolean;
  entryT: number | null;
  entryPx: number | null;
  levels: Levels | null;
  markPx: number | null;
  /** Taille BTC portée par le compte après ce passage. */
  position: number;
  equity: number | null;
  stops: { buy: boolean; triggerPx: number; size: number }[];
  lastTrade: RuleTrade | null;
  trades: number;
  error: string | null;
};

const jour = (t: number) =>
  new Date(t).toISOString().slice(8, 10) + "/" + new Date(t).toISOString().slice(5, 7);
const dollars = (x: number) => Math.round(x).toLocaleString("fr-FR");

type Ctx = {
  session: HlSession;
  info: InfoClient;
  exchange: ExchangeClient;
  idx: number;
  szDecimals: number;
};

async function readAccount(c: Ctx): Promise<Account> {
  const coin = BTC_RULE.coin;
  const [positions, bal, open, mids] = await Promise.all([
    readHlPositions(c.session.master),
    readHlBalances(c.session.master),
    c.info.frontendOpenOrders({ user: c.session.master }),
    c.info.allMids(),
  ]);
  const pos = positions.find((p) => p.coin === coin);
  return {
    position: pos ? (pos.side === "LONG" ? pos.size : -pos.size) : 0,
    equity: Number(bal.trading),
    markPx: Number((mids as Record<string, string>)[coin]),
    orders: open
      .filter((o) => o.coin === coin)
      .map((o) => ({
        oid: o.oid,
        isBuy: o.side === "B",
        reduceOnly: o.reduceOnly,
        isTrigger: o.isTrigger,
        triggerPx: o.isTrigger ? Number(o.triggerPx) : null,
        size: Number(o.sz),
      })),
  };
}

/** La marge doit être côté perps avant un achat ; au mieux, comme pour les autres ordres. */
async function prepareBuy(c: Ctx) {
  try {
    const bal = await readHlBalances(c.session.master);
    if (Number(bal.spotFree) >= 1) {
      await c.exchange.usdClassTransfer({
        amount: String(Math.floor(Number(bal.spotFree) * 100) / 100),
        toPerp: true,
      });
    }
  } catch {
    /* compte unifié, ou transfert refusé */
  }
  try {
    await c.exchange.updateLeverage({ asset: c.idx, isCross: true, leverage: GSD_LEVERAGE });
  } catch {
    /* levier déjà réglé */
  }
}

function statusError(status: unknown): string | null {
  return status && typeof status === "object" && "error" in status
    ? String((status as { error: string }).error)
    : null;
}

async function execute(c: Ctx, actions: Action[], notes: string[]): Promise<boolean> {
  const coin = BTC_RULE.coin;
  let traded = false;
  const cancels = actions.filter(
    (a): a is Extract<Action, { kind: "cancel" }> => a.kind === "cancel",
  );
  const posing = actions.some((a) => a.kind === "stop");
  if (cancels.length) {
    try {
      await c.exchange.cancel({ cancels: cancels.map((a) => ({ a: c.idx, o: a.oid })) });
      if (!posing) {
        for (const a of cancels) {
          logDecision({
            stage: "STOP",
            decider: "exchange",
            asset: coin,
            tf: "1d",
            question: "l'ordre stop est-il en place ?",
            answer: "annulé",
            applied: true,
            detail: a.why,
          });
        }
      }
    } catch (e) {
      notes.push(`BTC annulation refusée : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const a of actions) {
    if (a.kind === "keep") {
      const o = a.oid;
      logDecision({
        stage: "STOP",
        decider: "exchange",
        asset: coin,
        tf: "1d",
        question: "l'ordre stop est-il en place ?",
        answer: "en place",
        applied: true,
        detail: `${a.why} · ordre ${o}`,
      });
    } else if (a.kind === "none") {
      notes.push(`BTC ${a.why}`);
      logDecision({
        stage: "STOP",
        decider: "règle",
        asset: coin,
        tf: "1d",
        question: "l'ordre stop est-il en place ?",
        answer: "aucun",
        applied: true,
        detail: a.why,
      });
    } else if (a.kind === "market") {
      traded = true;
      if (a.purpose === "entrée") {
        await prepareBuy(c);
        const mids = await c.info.allMids();
        const mark = Number((mids as Record<string, string>)[coin]);
        const px = fmtPx(mark * 1.01, c.szDecimals);
        const size = a.size.toFixed(c.szDecimals);
        let answer = "refusé";
        let detail = a.why;
        if (px && Number(size) > 0) {
          try {
            const res = await c.exchange.order({
              orders: [
                {
                  a: c.idx,
                  b: true,
                  p: px,
                  s: size,
                  r: false,
                  t: { limit: { tif: "FrontendMarket" } },
                },
              ],
              grouping: "na",
            });
            const st = res.response.data.statuses[0];
            const err = statusError(st);
            const filled =
              st && typeof st === "object" && "filled" in st
                ? (st as { filled: { totalSz: string; avgPx: string } }).filled
                : null;
            if (err) detail = `${a.why} · ${err}`;
            else if (filled && Number(filled.totalSz) > 0) {
              answer = "rempli";
              detail = `${a.why} · ${filled.totalSz} BTC à ${dollars(Number(filled.avgPx))} $`;
            } else detail = `${a.why} · aucune exécution`;
          } catch (e) {
            detail = `${a.why} · ${e instanceof Error ? e.message : String(e)}`;
          }
        }
        notes.push(`BTC entrée ${answer} — ${detail}`);
        logDecision({
          stage: "ORDRE",
          decider: "exchange",
          asset: coin,
          tf: "1d",
          question: "le compte suit-il la règle ?",
          answer,
          applied: answer === "rempli",
          detail,
        });
      } else {
        // Sortie, ou position courte inattendue : on referme tout.
        const r = await reduceDeptPosition(c.session, coin, 1);
        const answer = r.ok ? "rempli" : "refusé";
        const detail = r.ok ? `${a.why} · ${r.closed} BTC` : `${a.why} · ${r.error}`;
        notes.push(`BTC sortie ${answer} — ${detail}`);
        logDecision({
          stage: "ORDRE",
          decider: "exchange",
          asset: coin,
          tf: "1d",
          question: "le compte suit-il la règle ?",
          answer,
          applied: r.ok,
          detail,
        });
      }
    } else if (a.kind === "stop") {
      if (a.buy) await prepareBuy(c);
      const px = fmtPx(a.triggerPx, c.szDecimals);
      const size = a.size.toFixed(c.szDecimals);
      let answer = cancels.length ? "remplacé" : "posé";
      let detail = `${a.why} · ${px} $ · ${size} BTC`;
      if (!px || !(Number(size) > 0)) {
        answer = "refusé";
        detail = `${a.why} · prix ou taille illisible`;
      } else {
        try {
          const res = await c.exchange.order({
            orders: [
              {
                a: c.idx,
                b: a.buy,
                p: px,
                s: size,
                r: a.reduceOnly,
                t: { trigger: { isMarket: true, triggerPx: px, tpsl: "sl" } },
              },
            ],
            grouping: "na",
          });
          const err = statusError(res.response.data.statuses[0]);
          if (err) {
            answer = "refusé";
            detail = `${a.why} · ${err}`;
          }
        } catch (e) {
          answer = "refusé";
          detail = `${a.why} · ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      if (answer === "refusé") {
        notes.push(
          `BTC stop refusé — ${detail} · le pilote rattrapera au marché au prochain passage`,
        );
      }
      logDecision({
        stage: "STOP",
        decider: "exchange",
        asset: coin,
        tf: "1d",
        question: "l'ordre stop est-il en place ?",
        answer,
        applied: answer !== "refusé",
        detail,
      });
    }
  }
  return traded;
}

/**
 * Un passage de la règle : la rejouer sur tout l'historique journalier pour
 * connaître son état, puis aligner le compte dessus. Les ordres stop posés
 * chez Hyperliquid font le travail entre deux passages ; le passage suivant
 * rattrape au marché ce qu'un stop refusé ou absent aurait manqué.
 */
export async function runBtcRule(
  session: HlSession,
): Promise<{ notes: string[]; summary: string; snapshot: BtcSnapshot }> {
  const coin = BTC_RULE.coin;
  const notes: string[] = [];
  const snapshot: BtcSnapshot = {
    at: Date.now(),
    long: false,
    entryT: null,
    entryPx: null,
    levels: null,
    markPx: null,
    position: 0,
    equity: null,
    stops: [],
    lastTrade: null,
    trades: 0,
    error: null,
  };
  try {
    const transport = new HttpTransport();
    const info = new InfoClient({ transport });
    const exchange = new ExchangeClient({ transport, wallet: privateKeyToAccount(session.key) });
    const [meta, candles] = await Promise.all([
      info.meta(),
      info.candleSnapshot({ coin, interval: "1d", startTime: HISTORY_START }),
    ]);
    const idx = meta.universe.findIndex((u) => u.name === coin);
    if (idx < 0) throw new Error("BTC introuvable chez Hyperliquid");
    const szDecimals = Number(meta.universe[idx].szDecimals) || 5;
    const c: Ctx = { session, info, exchange, idx, szDecimals };

    const bars: DayBar[] = candles
      .map((b) => ({
        t: Number(b.t),
        o: Number(b.o),
        h: Number(b.h),
        l: Number(b.l),
        c: Number(b.c),
      }))
      .filter((b) => [b.t, b.o, b.h, b.l, b.c].every(Number.isFinite))
      .sort((a, b) => a.t - b.t);
    const today = Math.floor(Date.now() / DAY) * DAY;
    const state = replay(bars);
    const levels = state.lastBarT === today ? state.levels : state.nextLevels;
    if (!levels) throw new Error("historique journalier insuffisant");
    snapshot.long = state.long;
    snapshot.entryT = state.entryT;
    snapshot.entryPx = state.entryPx;
    snapshot.levels = levels;
    snapshot.trades = state.trades.length;
    snapshot.lastTrade = state.trades.length ? state.trades[state.trades.length - 1] : null;

    logDecision({
      stage: "CANAL",
      decider: "règle",
      asset: coin,
      tf: "1d",
      question: "la règle est-elle en position ?",
      answer: state.long ? "en position" : "à plat",
      applied: true,
      detail:
        `plus haut 25 j ${dollars(levels.entry)} $ · plus bas 10 j ${dollars(levels.exit)} $` +
        (state.long && state.entryT
          ? ` · entrée le ${jour(state.entryT)} à ${dollars(state.entryPx as number)} $`
          : ""),
    });

    const opts = { step: 10 ** -szDecimals, minNotional: GSD_MIN_NOTIONAL };
    const input = { long: state.long, exitedToday: state.lastExitT === today, levels };
    let acc = await readAccount(c);
    if (!Number.isFinite(acc.markPx) || !Number.isFinite(acc.equity))
      throw new Error("prix ou équité illisible");
    const traded = await execute(c, plan(input, acc, opts), notes);
    if (traded) {
      // Après un ordre au marché, la position a changé : on replanifie les stops.
      acc = await readAccount(c);
      await execute(
        c,
        plan(input, acc, opts).filter((a) => a.kind !== "market"),
        notes,
      );
    }
    acc = await readAccount(c);
    snapshot.markPx = acc.markPx;
    snapshot.position = acc.position;
    snapshot.equity = acc.equity;
    snapshot.stops = acc.orders
      .filter((o) => o.isTrigger && o.triggerPx != null)
      .map((o) => ({ buy: o.isBuy, triggerPx: o.triggerPx as number, size: o.size }));
  } catch (e) {
    snapshot.error = e instanceof Error ? e.message : String(e);
    notes.push(`BTC erreur : ${snapshot.error}`);
    logDecision({
      stage: "CANAL",
      decider: "règle",
      asset: coin,
      tf: "1d",
      question: "la règle est-elle en position ?",
      answer: "erreur",
      applied: true,
      detail: snapshot.error,
    });
  }
  const stop = snapshot.stops[0];
  const summary = snapshot.error
    ? `BTC 25/10 · erreur : ${snapshot.error}`
    : `BTC 25/10 · règle ${snapshot.long ? `en position depuis le ${jour(snapshot.entryT as number)} (${dollars(snapshot.entryPx as number)} $)` : "à plat"}` +
      ` · compte ${snapshot.position > 0 ? `${snapshot.position} BTC` : "à plat"}` +
      (stop
        ? ` · stop ${stop.buy ? "d'entrée" : "de sortie"} ${dollars(stop.triggerPx)} $`
        : " · aucun stop");
  return { notes, summary, snapshot };
}
