import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { submitDeptOrder, readHlPositions, readHlClosingFills } from "./hl";
import type { HlSession } from "./hl";
import type { Stage } from "./types";
import { ASSETS, INTERVALS } from "./types";
import type { SetupProposal } from "./types";
import type { Managed } from "./manage.server";
import { logDecision } from "./decisions.server";
import type { BtcSnapshot } from "./btc-rule.server";

type ScanCell = { stage: Stage; side: string | null };
type Queued = {
  t: number;
  asset: string;
  interval: string;
  side: "LONG" | "SHORT";
  entry: number;
  stop: number;
  target: number | null;
  horizonHours: number;
  tries: number;
  error: string;
};
/**
 * `btc_25_10` : la règle BTC testée dans research/grok-btc, seule.
 * `legacy` : Donchian 20 + Supertrend 10×3 sur 10 paires × 4 TF — sans edge
 * mesuré (étape 9), gardée pour pouvoir revenir en arrière.
 */
export type Strategy = "btc_25_10" | "legacy";

type PilotFile = {
  strategy: Strategy;
  btc: BtcSnapshot | null;
  autonome: boolean;
  kill: boolean;
  asset: string;
  interval: string;
  lastStage: Stage | null;
  lastReason: string;
  lastAt: number;
  lastError: string | null;
  cycles: number;
  board: Record<string, ScanCell>;
  lastOrder: string | null;
  fired: Record<string, number>;
  lastSetup: SetupProposal | null;
  lastSetups: Record<string, SetupProposal>;
  grokCallsPerHour: number;
  scanEveryMin: number;
  grokUsdPerDay: number;
  queue: Queued[];
  managed: Record<string, Managed>;
  navPeak: number;
  lastBackupAt: number;
  lastAdaptAt: number;
};

const g = globalThis as unknown as {
  __gsdPilot?: ReturnType<typeof setInterval>;
  __gsdNavBeat?: ReturnType<typeof setInterval>;
  __gsdBusy?: boolean;
};

function dir() {
  return process.env.GSD_DATA_DIR || "/tmp/gsd";
}

function path() {
  return join(dir(), "pilot.json");
}

function defaults(): PilotFile {
  return {
    strategy: "btc_25_10",
    btc: null,
    autonome: true,
    kill: false,
    asset: "BTCUSDT",
    interval: "1h",
    lastStage: null,
    lastReason: "",
    lastAt: 0,
    lastError: null,
    cycles: 0,
    board: {},
    lastOrder: null,
    fired: {},
    lastSetup: null,
    lastSetups: {},
    grokCallsPerHour: 6,
    scanEveryMin: 15,
    grokUsdPerDay: 1,
    queue: [],
    managed: {},
    navPeak: 0,
    lastBackupAt: 0,
    lastAdaptAt: 0,
  };
}

export function readPilot(): PilotFile {
  try {
    const raw = readFileSync(path(), "utf8");
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

function writePilot(s: PilotFile) {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(path(), JSON.stringify(s));
}

function hlSession(): HlSession | null {
  const rawKey = process.env.HL_AGENT_KEY;
  const rawMaster = process.env.HL_MASTER;
  if (!rawKey || !rawMaster) return null;
  const key = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const master = (rawMaster.startsWith("0x") ? rawMaster : `0x${rawMaster}`) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key) || !/^0x[a-fA-F0-9]{40}$/.test(master)) return null;
  const agent = privateKeyToAccount(key).address as `0x${string}`;
  return { key, master, agent };
}

export function hlReady() {
  return hlSession() != null;
}

/**
 * Cette fonction dupliquait le calcul de solde, avec le même défaut :
 * `trading: p` lisait l'équité sur le seul `accountValue`, qui ne vaut que la
 * marge immobilisée quand le collatéral vit en spot. Elle alimente l'affichage
 * du pupitre ET `book.snapshot()` — la courbe d'équité du livre était donc
 * enregistrée sur ce chiffre faux. Un seul calcul désormais, dans `classifyHl`.
 */
export async function liveWallet() {
  const s = hlSession();
  if (!s) return { error: "HL_AGENT_KEY / HL_MASTER absents" };
  try {
    const { readHlBalances } = await import("./hl");
    return await readHlBalances(s.master);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "lecture Hyperliquid refusee" };
  }
}

export async function liveOpens() {
  const s = hlSession();
  if (!s) return [];
  return readHlPositions(s.master);
}

const TF_COOL_MS: Record<string, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
};

export function patchPilot(
  p: Partial<Pick<PilotFile, "autonome" | "kill" | "asset" | "interval" | "grokCallsPerHour" | "scanEveryMin" | "grokUsdPerDay" | "strategy">>,
) {
  const s = readPilot();
  const wasKill = s.kill;
  if (p.strategy === "btc_25_10" || p.strategy === "legacy") s.strategy = p.strategy;
  if (p.autonome != null) s.autonome = p.autonome;
  if (p.kill != null) s.kill = p.kill;
  if (p.asset && ASSETS.includes(p.asset as (typeof ASSETS)[number])) s.asset = p.asset;
  if (p.interval && INTERVALS.includes(p.interval as (typeof INTERVALS)[number])) s.interval = p.interval;
  if (p.grokCallsPerHour != null && Number.isFinite(p.grokCallsPerHour)) {
    s.grokCallsPerHour = Math.max(0, Math.min(48, Math.floor(p.grokCallsPerHour)));
  }
  if (p.scanEveryMin != null && Number.isFinite(p.scanEveryMin)) {
    s.scanEveryMin = Math.max(5, Math.min(120, Math.floor(p.scanEveryMin)));
  }
  if (p.grokUsdPerDay != null && Number.isFinite(p.grokUsdPerDay)) {
    s.grokUsdPerDay = Math.max(0, Math.min(50, Number(p.grokUsdPerDay)));
  }
  if (s.kill) s.autonome = false;
  writePilot(s);
  if (p.scanEveryMin != null) restartPilotClock();
  if (p.kill && !wasKill) {
    void import("./alerts.server").then((a) => a.notify("KILL", "Kill switch armé — plus d'ordre."));
  }
  return s;
}

export async function forceTick() {
  g.__gsdBusy = false;
  const s = readPilot();
  s.lastReason = "scan forcé…";
  s.lastError = null;
  writePilot(s);
  await tickPilot(true);
  return readPilot();
}

export async function tickPilot(force?: boolean) {
  const s0 = readPilot();
  if (g.__gsdBusy && !force && Date.now() - (s0.lastAt || 0) < 90_000) return;
  const s = s0;
  if (s.kill) return;
  if (!force && !s.autonome) return;
  g.__gsdBusy = true;
  try {
    const notes: string[] = [];
    let placed = false;
    const session0 = hlSession();
    s.managed = s.managed || {};
    s.queue = s.queue || [];
    if (s.strategy !== "legacy") {
      await tickBtc(s, session0);
      return;
    }
    if (session0) {
      try {
        const { flattenLosers } = await import("./hl");
        const cuts = await flattenLosers(session0);
        logCuts(cuts);
        if (cuts.length) {
          notes.unshift(...cuts);
          s.lastReason = cuts.join(" · ");
          s.lastAt = Date.now();
          writePilot(s);
        }
      } catch (e) {
        notes.unshift("COUPE fail " + (e instanceof Error ? e.message : String(e)));
      }
    }
    if (session0) {
      try {
        const mg = await import("./manage.server");
        const out = await mg.manageOpens(session0, s.managed, s.lastSetups);
        s.managed = out.managed;
        if (out.notes.length) notes.unshift(...out.notes);
        const w0 = await import("./hl").then((h) => h.readHlBalances(session0.master));
        const navNow = Number(w0.trading || 0);
        s.navPeak = Math.max(s.navPeak || 0, navNow);
        const dd = s.navPeak > 0 ? (s.navPeak - navNow) / s.navPeak : 0;
        const needAdapt =
          Date.now() - (s.lastAdaptAt || 0) > 45 * 60_000 &&
          (dd >= 0.015 || out.notes.some((n) => /invalid|miettes|slot|time-stop|REVUE/.test(n)));
        if (needAdapt) {
          const ad = await import("./adapt.server");
          const opensNow = await import("./hl").then((h) => h.readHlPositions(session0.master));
          const adOut = await ad.adaptBook(session0, opensNow, s.managed, navNow, s.navPeak);
          s.managed = adOut.managed;
          s.lastAdaptAt = Date.now();
          if (adOut.notes.length) notes.unshift(...adOut.notes);
        }
      } catch (e) {
        notes.unshift("REVUE fail " + (e instanceof Error ? e.message : String(e)));
      }
    }

    let gateOk = true;
    try {
      const rg = await import("./regime.server");
      const opensG = session0 ? await liveOpens() : [];
      const wG = session0 ? await import("./hl").then((h) => h.readHlBalances(session0.master)) : null;
      const eqG = wG ? Number(wG.trading || 0) : 0;
      const notionalG = opensG.reduce((a, p) => a + Number(p.value || 0), 0);
      let btc15: Awaited<ReturnType<typeof import("./market").fetchBars>> = [];
      let btc1h: typeof btc15 = [];
      try {
        const mkt = await import("./market");
        [btc15, btc1h] = await Promise.all([mkt.fetchBars("BTCUSDT", "15m", 220), mkt.fetchBars("BTCUSDT", "1h", 220)]);
      } catch {
        /* */
      }
      const snap = await rg.evaluateGate({
        equity: eqG,
        open_positions: opensG.length,
        gross_notional: notionalG,
        btc15,
        btc1h,
      });
      gateOk = snap.can_open_new_trade;
      logDecision({
        stage: "J0",
        decider: "règle",
        question: "ouvrir de nouvelles positions ?",
        answer: gateOk ? "oui" : "non",
        applied: true,
        detail: gateOk ? `${snap.regime}/${snap.bias}` : snap.kill_reasons.join("+"),
      });
      if (!gateOk) notes.unshift("GATE halt " + snap.kill_reasons.join("+") + " · pas de nouvel ordre");
    } catch (e) {
      notes.unshift("GATE fail " + (e instanceof Error ? e.message : String(e)));
      logDecision({
        stage: "J0",
        decider: "règle",
        question: "ouvrir de nouvelles positions ?",
        answer: "erreur",
        applied: true,
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    if (session0 && gateOk) {
      const leftover: typeof s.queue = [];
      for (const q of s.queue) {
        if (q.tries >= 6 || Date.now() - q.t > 6 * 3600_000) continue;
        const order = await submitDeptOrder(session0, {
          asset: q.asset,
          side: q.side,
          entry: q.entry,
          stop: q.stop,
          target: q.target,
        });
        logDecision({
          stage: "ORDRE",
          decider: "exchange",
          asset: q.asset.replace(/USDT$/i, ""),
          tf: q.interval,
          question: "l'ordre en attente passe-t-il ?",
          answer: order.ok ? "rempli" : "refusé",
          applied: order.ok,
          detail: order.ok
            ? `file d'attente · ${order.size} exécuté · ${order.plan.notional.toFixed(2)} $ visés`
            : `file d'attente · ${order.error}`,
        });
        if (order.ok) {
          s.lastOrder = `queue ${q.side} ${q.asset} · ${order.oid}`;
          s.lastReason = s.lastOrder;
          placed = true;
          void import("./alerts.server").then((a) => a.notify("Fill (queue)", s.lastOrder || q.asset));
        } else {
          leftover.push({ ...q, tries: q.tries + 1, error: order.error });
        }
      }
      s.queue = leftover.slice(-8);
    }
    const cycleMod = await import("./cycle.server");
    s.lastError = null;
    let nPas = 0;
    let nErr = 0;
    s.board = s.board || {};
    s.fired = s.fired || {};
    let bestSetup: SetupProposal | null = null;
    let filledSetup: SetupProposal | null = null;
    for (const asset of ASSETS) {
      for (const interval of INTERVALS) {
        const res = await cycleMod.executeCycle({ asset, interval });
        const tag = `${asset.replace("USDT", "")} ${interval}`;
        const key = `${asset}:${interval}`;
        if (!res || typeof res !== "object" || !("stage" in res)) {
          const err =
            res && typeof res === "object" && "error" in res
              ? String((res as { error: string }).error)
              : "cycle interrompu";
          notes.push(`${tag} erreur`);
          s.lastError = err;
          nErr += 1;
          s.board[key] = { stage: "PAS_DE_SETUP", side: null };
          continue;
        }
        s.lastStage = res.stage;
        s.board[key] = { stage: res.stage, side: res.setup?.side ?? null };
        if (res.setup && res.stage === "ORDRE") {
          bestSetup = res.setup;
          const c = (res.setup.asset || asset).replace("USDT", "");
          s.lastSetups = { ...(s.lastSetups ?? {}), [c]: res.setup };
        } else if (res.setup && !bestSetup) bestSetup = res.setup;
        if (res.stage === "PAS_DE_SETUP") nPas += 1;
        else notes.push(`${tag} ${res.stage}`);
        const setup = res.setup;
        if (res.stage === "ORDRE" && setup?.side) {
          const coinS = setup.asset.replace(/USDT$/i, "");
          logDecision({
            stage: "SIGNAL",
            decider: "règle",
            asset: coinS,
            tf: interval,
            question: "nouveau signal ?",
            answer: setup.side,
            applied: true,
            detail: `${setup.evaluation?.[0] ?? "moteur"} · entrée ${setup.entry_price} · stop ${setup.stop_price}`,
          });
          const ecarte = !gateOk
            ? "régime fermé (J0)"
            : placed
              ? "un ordre déjà passé ce tour"
              : setup.stop_price == null || setup.entry_price == null
                ? "niveaux d'entrée ou de stop manquants"
                : null;
          if (ecarte) {
            logDecision({
              stage: "FILTRE",
              decider: "règle",
              asset: coinS,
              tf: interval,
              question: "le signal peut-il être traité ?",
              answer: "écarté",
              applied: true,
              detail: ecarte,
            });
          }
        }
        if (
          gateOk &&
          !placed &&
          res.stage === "ORDRE" &&
          setup?.side &&
          setup.stop_price != null &&
          setup.entry_price != null
        ) {
          const opensNow = await liveOpens();
          const coin = setup.asset.replace(/USDT$/i, "");
          if (opensNow.length >= 1 && !opensNow.some((o) => o.coin === coin)) {
            notes.push(`${tag} skip: déjà ${opensNow.map((o) => o.coin).join(",")}`);
            logDecision({
              stage: "FILTRE",
              decider: "règle",
              asset: coin,
              tf: interval,
              question: "le signal peut-il être traité ?",
              answer: "écarté",
              applied: true,
              detail: `une position à la fois — déjà ${opensNow.map((o) => o.coin).join(", ")}`,
            });
            continue;
          }
          const fk = `${asset}:${interval}:${setup.side}`;
          const cool = TF_COOL_MS[interval] ?? 60 * 60 * 1000;
          if (s.fired[fk] && Date.now() - s.fired[fk] < cool) {
            logDecision({
              stage: "FILTRE",
              decider: "règle",
              asset: coin,
              tf: interval,
              question: "le signal peut-il être traité ?",
              answer: "écarté",
              applied: true,
              detail: "même signal traité il y a moins d'une barre",
            });
            s.board[key] = { stage: "PAS_DE_SETUP", side: null };
            nPas += 1;
            continue;
          }
          let j1ok = true;
          let j1dec: { allow: boolean; family: "S1_TREND" | "S2_REVERSION" | "MM" | "OTHER"; reasons: string[]; shadow: boolean } = {
            allow: true,
            family: "S1_TREND",
            reasons: [],
            shadow: false,
          };
          try {
            const sg = await import("./signal-gate.server");
            const rg = await import("./regime.server");
            const dec = sg.decide(rg.readRegime(), {
              name: (setup.evaluation && setup.evaluation[0]) || setup.rationale || "Donchian",
              side: setup.side,
              asset: setup.asset,
              interval,
            });
            j1dec = dec;
            if (!dec.allow) {
              j1ok = false;
              notes.push(`${tag} J1 BLOCK ${dec.family} ${dec.reasons.join("+")}`);
              s.board[key] = { stage: "PAS_DE_SETUP", side: null };
              nPas += 1;
            }
          } catch (e) {
            j1ok = false;
            notes.push(`${tag} J1 fail-closed`);
            logDecision({
              stage: "J1",
              decider: "règle",
              asset: coin,
              tf: interval,
              question: "la famille du signal convient-elle au régime ?",
              answer: "erreur",
              applied: true,
              detail: `fermé par défaut — ${e instanceof Error ? e.message : String(e)}`,
            });
          }
          if (!j1ok) continue;
          try {
            const com = await import("./committee.server");
            const rg2 = await import("./regime.server");
            const extras: Record<string, unknown> = {};
            const ind = (res as { context?: { indicateurs?: Record<string, unknown> } }).context?.indicateurs;
            if (ind) {
              extras.rsi = ind.rsi_14;
              extras.atr_pct = ind.atr_pct_du_prix;
            }
            const rec = await com.review(
              rg2.readRegime(),
              {
                name: (setup.evaluation && setup.evaluation[0]) || setup.rationale || "Donchian",
                side: setup.side,
                asset: setup.asset,
                interval,
              },
              j1dec,
              extras,
            );
            notes.push(`${tag} J2 ombre score ${rec.pm.score.toFixed(2)}`);
          } catch {
            notes.push(`${tag} J2 skip`);
          }
          const session = hlSession();
          if (!session) {
            s.lastError = "Autonome VPS : ajoute HL_AGENT_KEY et HL_MASTER dans .env";
            logDecision({
              stage: "FILTRE",
              decider: "règle",
              asset: coin,
              tf: interval,
              question: "le signal peut-il être traité ?",
              answer: "écarté",
              applied: true,
              detail: "clés Hyperliquid absentes",
            });
          } else {
            const order = await submitDeptOrder(session, {
              asset: setup.asset,
              side: setup.side,
              entry: setup.entry_price,
              stop: setup.stop_price,
              target: setup.target_price,
            });
            logDecision({
              stage: "ORDRE",
              decider: "exchange",
              asset: coin,
              tf: interval,
              question: "l'ordre est-il exécuté et protégé ?",
              answer: order.ok ? "rempli" : "refusé",
              applied: order.ok,
              detail: order.ok
                ? `${order.size} exécuté sur ${order.requested} · ${order.plan.notional.toFixed(2)} $ visés · risque ${order.plan.risqueUsd.toFixed(2)} $${order.notes.length ? ` · ${order.notes.join(" · ")}` : ""}`
                : order.error,
            });
            if (!order.ok) {
              s.lastError = `${tag} ${order.error}`;
              if (/insufficient margin|marge trop|fonds insuffisants|taille trop/i.test(order.error)) {
                s.queue = (s.queue || []).concat({
                  t: Date.now(),
                  asset: setup.asset,
                  interval,
                  side: setup.side,
                  entry: setup.entry_price,
                  stop: setup.stop_price,
                  target: setup.target_price,
                  horizonHours: setup.horizon_hours || 24,
                  tries: 0,
                  error: order.error,
                }).slice(-8);
              }
              if (/api key|incorrect api|HL_|clé/i.test(order.error)) {
                void import("./alerts.server").then((a) => a.notify("Erreur clé", order.error));
              }
            } else {
              s.lastReason = `ordre ${setup.side} ${tag} · ${order.oid}`;
              s.lastOrder = s.lastReason;
              s.lastStage = "ORDRE";
              placed = true;
              filledSetup = setup;
              const coin = setup.asset.replace("USDT", "");
              s.managed = {
                ...(s.managed || {}),
                [coin]: {
                  coin,
                  side: setup.side,
                  entry: setup.entry_price,
                  stop: setup.stop_price,
                  openedAt: Date.now(),
                  horizonHours: setup.horizon_hours || 24,
                  size0: order.size,
                  partial: false,
                  rationale: setup.rationale,
                },
              };
              void import("./alerts.server").then((a) => a.notify("Fill", s.lastOrder || tag));
            }
            s.fired[fk] = Date.now();
          }
        }
      }
    }
    s.lastAt = Date.now();
    s.cycles += 1;
    if (!placed) {
      s.lastReason = `${ASSETS.length} tickers × 4 TF · ${nPas} PAS_DE_SETUP${nErr ? ` · ${nErr} erreurs` : ""}${notes.length ? ` · ${notes.join(" · ")}` : ""}`;
    }
    if (filledSetup) {
      s.lastSetup = filledSetup;
      const coin = filledSetup.asset.replace("USDT", "");
      s.lastSetups = { ...(s.lastSetups ?? {}), [coin]: filledSetup };
    }
    else if (!(s.lastSetup && !s.lastSetup.abstained)) {
      s.lastSetup = {
        agent: "strategie",
        abstained: true,
        abstain_reason: s.lastReason,
        latency_ms: 0,
        model_id: "engines",
        asset: s.asset,
        side: null,
        entry_price: null,
        stop_price: null,
        target_price: null,
        horizon_hours: 24,
        rationale: "Donchian 20 + Supertrend 10×3 sur 10 paires × 4 TF. Pas de nouveau breakout.",
        evaluation: ["Donchian:20", "Supertrend:10x3", "SCAN_10x4"],
      };
    }
    try {
      const talk = await import("./talk.server");
      talk.recordTalk({
        t: Date.now(),
        asset: "SCAN",
        interval: "10×4",
        stage: placed ? "ORDRE" : "PAS_DE_SETUP",
        bot: s.lastReason || "scan terminé",
      });
    } catch {
      /* ignore */
    }
    await bookAndBackup(s);
    writePilot(s);
  } catch (e) {
    s.lastError = e instanceof Error ? e.message : "pilot";
    writePilot(s);
  } finally {
    g.__gsdBusy = false;
    journalCycle(s);
  }
}

/** Les coupes du filet, inscrites au journal des décisions. */
function logCuts(cuts: string[]) {
  for (const c of cuts) {
    if (!/^COUPE/.test(c)) continue;
    const echec = /^COUPE FAIL/.test(c);
    logDecision({
      stage: "COUPE",
      decider: "règle",
      asset: c.match(/^COUPE(?: FAIL)? (\S+)/)?.[1],
      question: "la perte dépasse-t-elle le filet ?",
      answer: echec ? "échec" : "couper",
      applied: !echec,
      detail: c,
    });
  }
}

/** Fin de passage, dans les deux modes : NAV, alerte de repli, sauvegarde. */
async function bookAndBackup(s: PilotFile) {
  try {
    const [w, opensNow, fills] = await Promise.all([
      liveWallet(),
      liveOpens(),
      hlSession() ? readHlClosingFills(hlSession()!.master) : Promise.resolve([]),
    ]);
    const nav = w && "trading" in w ? Number(w.trading) : NaN;
    const book = await import("./book.server");
    if (Number.isFinite(nav)) {
      book.snapshot(nav, opensNow, s.lastSetups, fills);
      s.navPeak = Math.max(s.navPeak || 0, nav);
      if (s.navPeak > 0 && (s.navPeak - nav) / s.navPeak >= 0.05) {
        void import("./alerts.server").then((a) =>
          a.notify("Drawdown", `NAV ${nav.toFixed(2)} · pic ${s.navPeak.toFixed(2)} · ${(((s.navPeak - nav) / s.navPeak) * 100).toFixed(1)} %`),
        );
      }
    }
  } catch {
    /* book */
  }
  if (!s.lastBackupAt || Date.now() - s.lastBackupAt > 6 * 3600_000) {
    try {
      const b = await import("./backup.server");
      await b.pushBackupOffsite();
      s.lastBackupAt = Date.now();
    } catch {
      /* backup */
    }
  }
}

/**
 * Un passage en mode règle BTC 25/10. Les anciennes stratégies ne scannent
 * plus rien. Leur filet et leur gestion ne s'appliquent qu'aux positions
 * autres que BTC, s'il en reste : calibrés sur 1 % de risque par trade, ils
 * couperaient la position BTC dès −1,5 %, bien avant son stop à 10 jours.
 */
async function tickBtc(s: PilotFile, session: HlSession | null) {
  const notes: string[] = [];
  s.lastError = null;
  if (!session) {
    s.lastError = "Autonome VPS : ajoute HL_AGENT_KEY et HL_MASTER dans .env";
    s.lastAt = Date.now();
    s.cycles += 1;
    writePilot(s);
    return;
  }
  try {
    const autres = (await readHlPositions(session.master)).filter((p) => p.coin !== "BTC");
    if (autres.length) {
      const { flattenLosers } = await import("./hl");
      logCuts(await flattenLosers(session, ["BTC"]));
      const mg = await import("./manage.server");
      const out = await mg.manageOpens(session, s.managed, s.lastSetups, ["BTC"]);
      s.managed = out.managed;
      notes.push(...out.notes);
    }
  } catch (e) {
    notes.push("anciennes positions : " + (e instanceof Error ? e.message : String(e)));
  }
  const { runBtcRule } = await import("./btc-rule.server");
  const out = await runBtcRule(session);
  s.btc = out.snapshot;
  s.lastError = out.snapshot.error;
  s.lastStage = out.snapshot.long ? "ORDRE" : "PAS_DE_SETUP";
  s.lastReason = [out.summary, ...out.notes, ...notes].join(" · ");
  const fill = out.notes.find((n) => /^BTC (entrée|sortie) rempli/.test(n));
  if (fill) {
    s.lastOrder = fill;
    void import("./alerts.server").then((a) => a.notify("Règle BTC", fill));
  }
  s.lastAt = Date.now();
  s.cycles += 1;
  await bookAndBackup(s);
  writePilot(s);
}

/**
 * Une ligne par cycle sur la sortie standard.
 *
 * Sans elle, `docker logs` ne montrait que « Listening on: … » : sept heures
 * de silence total ressemblaient exactement à sept heures de fonctionnement
 * normal. Le journal doit permettre de distinguer les deux d'un coup d'œil.
 */
function journalCycle(s: PilotFile) {
  try {
    const bribes = [
      `cycle ${s.cycles ?? 0}`,
      s.autonome ? "autonome" : "manuel",
      s.kill ? "KILL" : null,
      s.lastStage ? `étape ${s.lastStage}` : null,
      s.lastOrder ? `ordre ${s.lastOrder}` : null,
      s.lastError ? `ERREUR ${s.lastError}` : null,
      s.lastReason || null,
    ].filter(Boolean);
    console.log(`[gsd] ${bribes.join(" · ")}`);
  } catch {
    /* journal */
  }
}

export function startPilot() {
  if (g.__gsdPilot) {
    ensureNavBeat();
    return;
  }
  mkdirSync(dir(), { recursive: true });
  try {
    readFileSync(path());
  } catch {
    writePilot(defaults());
  }
  void tickPilot();
  restartPilotClock(true);
  ensureNavBeat();
}

function ensureNavBeat() {
  if (g.__gsdNavBeat) return;
  g.__gsdNavBeat = setInterval(() => void snapshotNavOnly(), 60_000);
}

async function snapshotNavOnly() {
  try {
    const sCut = readPilot();
    if (sCut.autonome && !sCut.kill) {
      const session = hlSession();
      if (session) {
        const { flattenLosers } = await import("./hl");
        // La règle BTC a son propre stop : le filet ne la touche pas.
        const cuts = await flattenLosers(session, sCut.strategy === "legacy" ? [] : ["BTC"]);
        logCuts(cuts);
        if (cuts.some((c) => c.startsWith("COUPE"))) {
          sCut.lastReason = cuts.join(" · ");
          sCut.lastAt = Date.now();
          writePilot(sCut);
          // Une coupe est l'événement le plus important du bot : elle ne passe
          // jamais en silence, même hors cycle.
          console.log(`[gsd] ${cuts.join(" · ")}`);
        }
      }
    }
  } catch {
    /* coupe beat */
  }
  try {
    const w = await liveWallet();
    const nav = w && "trading" in w ? Number(w.trading) : NaN;
    if (Number.isFinite(nav)) {
      const book = await import("./book.server");
      const opens = await liveOpens();
      book.snapshot(nav, opens, readPilot().lastSetups);
    }
  } catch {
    /* beat */
  }
  const s = readPilot();
  const min = Math.max(5, s.scanEveryMin || 15);
  if (s.autonome && !s.kill && Date.now() - (s.lastAt || 0) > min * 60_000 * 2) {
    g.__gsdBusy = false;
    void tickPilot(true);
  }
}

try {
  setTimeout(() => {
    try {
      startPilot();
    } catch {
      /* boot */
    }
  }, 2000);
} catch {
  /* */
}

function restartPilotClock(keepExisting?: boolean) {
  if (g.__gsdPilot) {
    if (keepExisting) {
      clearInterval(g.__gsdPilot);
    } else {
      clearInterval(g.__gsdPilot);
    }
  }
  const min = Math.max(5, readPilot().scanEveryMin || 15);
  g.__gsdPilot = setInterval(() => void tickPilot(), min * 60 * 1000);
}
