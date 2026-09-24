import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { GSD_MIN_NOTIONAL } from "./bot";
import {
  BTC_RULE,
  planSpot,
  replay,
  type DayBar,
  type Levels,
  type RuleTrade,
  type SpotAccount,
  type SpotAction,
} from "./btc-rule";
import { logDecision } from "./decisions.server";
import { reduceDeptPosition, type HlSession } from "./hl";

const DAY = 86_400_000;
/** Première barre journalière servie par Hyperliquid, et début de la recherche. */
const HISTORY_START = Date.UTC(2020, 7, 19);
/** Le BTC au comptant d'Hyperliquid : Unit Bitcoin, contre USDC. */
const SPOT_BASE = "UBTC";
const SPOT_QUOTE = "USDC";

export type BtcSnapshot = {
  at: number;
  venue: "comptant";
  /** Paire au comptant, « @142 » pour UBTC/USDC. */
  pair: string | null;
  /** État de la règle, rejouée sur tout l'historique. */
  long: boolean;
  entryT: number | null;
  entryPx: number | null;
  levels: Levels | null;
  markPx: number | null;
  /** UBTC détenu après ce passage. */
  position: number;
  /** USDC disponible après ce passage. */
  quote: number | null;
  equity: number | null;
  lastTrade: RuleTrade | null;
  trades: number;
  error: string | null;
};

const jour = (t: number) =>
  new Date(t).toISOString().slice(8, 10) + "/" + new Date(t).toISOString().slice(5, 7);
const dollars = (x: number) => Math.round(x).toLocaleString("fr-FR");

type Spot = { asset: number; coin: string; szDecimals: number };
type Ctx = {
  session: HlSession;
  info: InfoClient;
  exchange: ExchangeClient;
  spot: Spot;
  perpIdx: number;
};

async function resolveSpot(info: InfoClient): Promise<Spot> {
  const meta = await info.spotMeta();
  const base = meta.tokens.find((t) => t.name === SPOT_BASE);
  const quote = meta.tokens.find((t) => t.name === SPOT_QUOTE);
  if (!base || !quote) throw new Error(`${SPOT_BASE}/${SPOT_QUOTE} introuvable au comptant`);
  const pair = meta.universe.find((u) => u.tokens[0] === base.index && u.tokens[1] === quote.index);
  if (!pair) throw new Error(`paire ${SPOT_BASE}/${SPOT_QUOTE} introuvable`);
  // Au comptant, l'identifiant d'actif d'un ordre est 10 000 + l'index de la paire.
  return { asset: 10_000 + pair.index, coin: pair.name, szDecimals: Number(base.szDecimals) };
}

/** Prix au comptant : 5 chiffres significatifs, au plus 8 − szDecimals décimales. */
function spotPx(px: number, szDecimals: number) {
  if (!Number.isFinite(px) || px <= 0) return null;
  const sig = Number(px.toPrecision(5));
  return String(Number(sig.toFixed(Math.max(0, 8 - szDecimals))));
}

async function readAccount(c: Ctx): Promise<SpotAccount & { equity: number }> {
  const user = c.session.master;
  const [spot, perp, open, mids] = await Promise.all([
    c.info.spotClearinghouseState({ user }),
    c.info.clearinghouseState({ user }),
    c.info.frontendOpenOrders({ user }),
    c.info.allMids(),
  ]);
  const libre = (coin: string) => {
    const b = spot.balances.find((x) => x.coin === coin);
    return b ? Number(b.total) - Number(b.hold) : 0;
  };
  const total = (coin: string) => Number(spot.balances.find((x) => x.coin === coin)?.total ?? 0);
  const pos = perp.assetPositions.find((p) => p.position.coin === BTC_RULE.coin);
  const markPx = Number((mids as Record<string, string>)[c.spot.coin]);
  const perpValue = Number(perp.marginSummary.accountValue) || 0;
  return {
    base: libre(SPOT_BASE),
    quote: libre(SPOT_QUOTE),
    markPx,
    perpPosition: pos ? Number(pos.position.szi) : 0,
    perpOrders: open.filter((o) => o.coin === BTC_RULE.coin).map((o) => o.oid),
    // Compte unifié : la marge perp est bloquée sur les USDC au comptant, déjà
    // comptée dans la valeur du compte perp. On n'ajoute donc que le libre.
    equity: libre(SPOT_QUOTE) + perpValue + total(SPOT_BASE) * markPx,
  };
}

function lireExecution(status: unknown): {
  filled: number;
  avgPx: number | null;
  error: string | null;
} {
  if (status && typeof status === "object") {
    if ("error" in status)
      return { filled: 0, avgPx: null, error: String((status as { error: string }).error) };
    if ("filled" in status) {
      const f = (status as { filled: { totalSz: string; avgPx: string } }).filled;
      return { filled: Number(f.totalSz) || 0, avgPx: Number(f.avgPx) || null, error: null };
    }
  }
  return { filled: 0, avgPx: null, error: null };
}

async function execute(
  c: Ctx,
  actions: SpotAction[],
  state: { long: boolean; levels: Levels },
  notes: string[],
) {
  const coin = BTC_RULE.coin;
  let migre = false;
  for (const a of actions) {
    if (a.kind === "cancelPerp") {
      try {
        await c.exchange.cancel({ cancels: a.oids.map((o) => ({ a: c.perpIdx, o })) });
        logDecision({
          stage: "STOP",
          decider: "règle",
          asset: coin,
          tf: "1d",
          question: "le bot surveille-t-il les niveaux ?",
          answer: "annulé",
          applied: true,
          detail: `${a.why} (${a.oids.length})`,
        });
      } catch (e) {
        notes.push(`BTC annulation perp refusée : ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (a.kind === "closePerp") {
      const r = await reduceDeptPosition(c.session, coin, 1);
      const answer = r.ok ? "rempli" : "refusé";
      const detail = r.ok ? `${a.why} · ${r.closed} BTC` : `${a.why} · ${r.error}`;
      notes.push(`BTC migration ${answer} — ${detail}`);
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
      migre = r.ok;
    } else if (a.kind === "buy" || a.kind === "sell") {
      const px = spotPx(a.limitPx, c.spot.szDecimals);
      const size = a.size.toFixed(c.spot.szDecimals);
      let answer = "refusé";
      let detail = a.why;
      if (px && Number(size) > 0) {
        try {
          const res = await c.exchange.order({
            orders: [
              {
                a: c.spot.asset,
                b: a.kind === "buy",
                p: px,
                s: size,
                r: false,
                t: { limit: { tif: "Ioc" } },
              },
            ],
            grouping: "na",
          });
          const x = lireExecution(res.response.data.statuses[0]);
          if (x.error) detail = `${a.why} · ${x.error}`;
          else if (x.filled > 0) {
            answer = "rempli";
            detail = `${a.why} · ${x.filled} UBTC à ${x.avgPx ? dollars(x.avgPx) : "?"} $`;
          } else detail = `${a.why} · aucune exécution sous ${px} $`;
        } catch (e) {
          detail = `${a.why} · ${e instanceof Error ? e.message : String(e)}`;
        }
      } else detail = `${a.why} · prix ou taille illisible`;
      notes.push(`BTC ${a.kind === "buy" ? "entrée" : "sortie"} ${answer} — ${detail}`);
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
    } else if (a.kind === "hold") {
      logDecision({
        stage: "STOP",
        decider: "règle",
        asset: coin,
        tf: "1d",
        question: "le bot surveille-t-il les niveaux ?",
        answer: "surveillé",
        applied: true,
        detail: state.long
          ? `sortie si le BTC passe sous ${dollars(state.levels.exit)} $ — vérifié chaque minute`
          : `entrée si le BTC dépasse ${dollars(state.levels.entry)} $ — vérifié chaque minute`,
      });
    } else if (a.kind === "none") {
      notes.push(`BTC ${a.why}`);
      logDecision({
        stage: "STOP",
        decider: "règle",
        asset: coin,
        tf: "1d",
        question: "le bot surveille-t-il les niveaux ?",
        answer: "aucun",
        applied: true,
        detail: a.why,
      });
    }
  }
  return migre;
}

/** Après la fermeture du perp, les USDC qui y restent repassent au comptant (sans effet en compte unifié). */
async function rapatrier(c: Ctx) {
  try {
    const perp = await c.info.clearinghouseState({ user: c.session.master });
    const w = Math.floor(Number(perp.withdrawable) * 100) / 100;
    if (w >= 1) await c.exchange.usdClassTransfer({ amount: String(w), toPerp: false });
  } catch {
    /* compte unifié : rien à transférer */
  }
}

/**
 * Un passage de la règle, au comptant : la rejouer sur tout l'historique
 * journalier du BTC pour connaître son état, puis aligner le compte dessus en
 * UBTC. Pas d'ordre stop au repos : le pilote relance un passage dès que le
 * prix franchit un des deux niveaux, vérifiés chaque minute.
 */
export async function runBtcRule(
  session: HlSession,
): Promise<{ notes: string[]; summary: string; snapshot: BtcSnapshot }> {
  const coin = BTC_RULE.coin;
  const notes: string[] = [];
  const snapshot: BtcSnapshot = {
    at: Date.now(),
    venue: "comptant",
    pair: null,
    long: false,
    entryT: null,
    entryPx: null,
    levels: null,
    markPx: null,
    position: 0,
    quote: null,
    equity: null,
    lastTrade: null,
    trades: 0,
    error: null,
  };
  try {
    const transport = new HttpTransport();
    const info = new InfoClient({ transport });
    const exchange = new ExchangeClient({ transport, wallet: privateKeyToAccount(session.key) });
    const [meta, spot, candles] = await Promise.all([
      info.meta(),
      resolveSpot(info),
      info.candleSnapshot({ coin, interval: "1d", startTime: HISTORY_START }),
    ]);
    const perpIdx = meta.universe.findIndex((u) => u.name === coin);
    const c: Ctx = { session, info, exchange, spot, perpIdx };
    snapshot.pair = spot.coin;

    // Le signal se lit sur les bougies du BTC d'Hyperliquid, celles de la recherche.
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

    const opts = { step: 10 ** -spot.szDecimals, minNotional: GSD_MIN_NOTIONAL };
    const input = { long: state.long, levels };
    let acc = await readAccount(c);
    if (!Number.isFinite(acc.markPx) || !(acc.markPx > 0))
      throw new Error(`prix de ${spot.coin} illisible`);
    if (await execute(c, planSpot(input, acc, opts), input, notes)) {
      await rapatrier(c);
      acc = await readAccount(c);
      await execute(c, planSpot(input, acc, opts), input, notes);
    }
    acc = await readAccount(c);
    snapshot.markPx = acc.markPx;
    snapshot.position = acc.base;
    snapshot.quote = acc.quote;
    snapshot.equity = acc.equity;
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
  const summary = snapshot.error
    ? `BTC 25/10 au comptant · erreur : ${snapshot.error}`
    : `BTC 25/10 au comptant · règle ${snapshot.long ? `en position depuis le ${jour(snapshot.entryT as number)} (${dollars(snapshot.entryPx as number)} $)` : "à plat"}` +
      ` · compte ${snapshot.position * (snapshot.markPx ?? 0) >= GSD_MIN_NOTIONAL ? `${snapshot.position} UBTC` : "en USDC"}` +
      (snapshot.levels
        ? snapshot.long
          ? ` · sortie sous ${dollars(snapshot.levels.exit)} $`
          : ` · entrée au-dessus de ${dollars(snapshot.levels.entry)} $`
        : "");
  return { notes, summary, snapshot };
}
