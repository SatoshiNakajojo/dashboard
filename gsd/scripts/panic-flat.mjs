#!/usr/bin/env node
/**
 * panic-flat — remet le compte à plat : zéro ordre au repos, zéro position.
 *
 * Écrit pour sortir de l'état relevé le 22/09/2026 : 24 triggers au repos
 * pour 6 positions, dimensionnés jusqu'à 415 fois la position, des miettes
 * sous le notionnel minimal, et une marge à 108 % du compte.
 *
 * Par défaut le script ne fait RIEN : il affiche ce qu'il ferait.
 * Il faut `--go` pour qu'il agisse.
 *
 *   node scripts/panic-flat.mjs            # constat seul
 *   node scripts/panic-flat.mjs --go       # annule les ordres et solde tout
 *   node scripts/panic-flat.mjs --go --orders-only   # n'annule que les ordres
 */

import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

const GO = process.argv.includes("--go");
const ORDERS_ONLY = process.argv.includes("--orders-only");
const SLIP = 0.08;

const KEY = (process.env.HL_AGENT_KEY || "").trim();
const MASTER = (process.env.HL_MASTER || "").trim().toLowerCase();

function bail(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

if (!/^(0x)?[0-9a-fA-F]{64}$/.test(KEY)) bail("HL_AGENT_KEY absente ou mal formée (64 hex).");
if (!/^0x[0-9a-fA-F]{40}$/.test(MASTER)) bail("HL_MASTER absente ou mal formée (adresse 0x…).");

const key = KEY.startsWith("0x") ? KEY : `0x${KEY}`;
const usd = (v) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)} $`;

/** Prix au format perp Hyperliquid : 5 chiffres significatifs, 6−szDecimals décimales. */
function fmtPx(px, szDecimals) {
  const maxDec = Math.max(6 - szDecimals, 0);
  const sig = Number(Number(px).toPrecision(5));
  const f = 10 ** maxDec;
  const r = Math.round(sig * f) / f;
  return maxDec === 0 ? String(Math.round(r)) : String(r);
}

async function main() {
  const transport = new HttpTransport();
  const info = new InfoClient({ transport });
  const wallet = privateKeyToAccount(key);
  const exchange = new ExchangeClient({ transport, wallet });

  const [meta, state, open, mids] = await Promise.all([
    info.meta(),
    info.clearinghouseState({ user: MASTER }),
    info.frontendOpenOrders({ user: MASTER }),
    info.allMids(),
  ]);

  const idxOf = (coin) => meta.universe.findIndex((u) => u.name === coin);
  const szDecOf = (coin) => Number(meta.universe[idxOf(coin)]?.szDecimals ?? 2);

  const positions = state.assetPositions
    .map((r) => r.position)
    .filter((p) => Number(p.szi) !== 0);

  const nav = Number(state.marginSummary.accountValue);
  const marge = Number(state.marginSummary.totalMarginUsed);

  console.log(`\n  compte ${MASTER}`);
  console.log(`  agent  ${wallet.address}`);
  console.log(`  ${GO ? "MODE RÉEL — les ordres partent" : "constat seul — rien ne sera envoyé (ajouter --go)"}\n`);
  console.log(`  valeur du compte   ${usd(nav)}`);
  console.log(`  marge utilisée     ${usd(marge)}  (${nav > 0 ? ((marge / nav) * 100).toFixed(0) : "?"} % du compte)`);
  console.log(`  retirable          ${usd(Number(state.withdrawable))}\n`);

  // ---- 1. les ordres au repos ----
  console.log(`  ── ${open.length} ordre(s) au repos ──`);
  for (const o of open) {
    const pos = positions.find((p) => p.coin === o.coin);
    const taille = pos ? Math.abs(Number(pos.szi)) : 0;
    const ratio = taille > 0 ? `${(Number(o.sz) / taille).toFixed(0)}× la position` : "aucune position";
    console.log(`     ${o.coin.padEnd(6)} ${String(o.orderType).padEnd(20)} sz=${String(o.sz).padStart(10)}  ${ratio}`);
  }

  if (open.length && GO) {
    const cancels = open
      .map((o) => ({ a: idxOf(o.coin), o: Number(o.oid) }))
      .filter((c) => c.a >= 0 && Number.isFinite(c.o));
    try {
      await exchange.cancel({ cancels });
      console.log(`\n     → ${cancels.length} ordre(s) annulé(s)`);
    } catch (e) {
      console.log(`\n     ✗ annulation refusée : ${e instanceof Error ? e.message : e}`);
    }
  }

  // ---- 2. les positions ----
  console.log(`\n  ── ${positions.length} position(s) ouverte(s) ──`);
  for (const p of positions) {
    const sz = Number(p.szi);
    console.log(
      `     ${p.coin.padEnd(6)} ${(sz > 0 ? "LONG " : "SHORT").padEnd(6)} ${String(Math.abs(sz)).padStart(10)}` +
        `  ${usd(Number(p.positionValue)).padStart(10)}  PnL ${usd(Number(p.unrealizedPnl)).padStart(9)}` +
        `  ROE ${(Number(p.returnOnEquity) * 100).toFixed(2)} %`,
    );
  }

  if (ORDERS_ONLY) {
    console.log(`\n  --orders-only : les positions sont laissées telles quelles.\n`);
    return;
  }

  if (positions.length && GO) {
    console.log("");
    for (const p of positions) {
      const coin = p.coin;
      const a = idxOf(coin);
      if (a < 0) {
        console.log(`     ✗ ${coin} introuvable dans le meta`);
        continue;
      }
      const dec = szDecOf(coin);
      const sz = Number(p.szi);
      const isBuy = sz < 0; // on rachète un short, on vend un long
      const mid = Number(mids[coin]);
      if (!Number.isFinite(mid) || mid <= 0) {
        console.log(`     ✗ ${coin} prix illisible, laissée ouverte`);
        continue;
      }
      const f = 10 ** dec;
      const taille = (Math.floor(Math.abs(sz) * f + 1e-9) / f).toFixed(dec);
      const px = fmtPx(isBuy ? mid * (1 + SLIP) : mid * (1 - SLIP), dec);
      try {
        const res = await exchange.order({
          orders: [{ a, b: isBuy, p: px, s: taille, r: true, t: { limit: { tif: "FrontendMarket" } } }],
          grouping: "na",
        });
        const st = res.response.data.statuses[0];
        if (st && typeof st === "object" && "error" in st) {
          console.log(`     ✗ ${coin} refusé : ${st.error}`);
        } else if (st && typeof st === "object" && "filled" in st) {
          console.log(`     → ${coin} soldé ${st.filled.totalSz} @ ${st.filled.avgPx}`);
        } else {
          console.log(`     ~ ${coin} envoyé, sans exécution immédiate`);
        }
      } catch (e) {
        console.log(`     ✗ ${coin} : ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // ---- 3. état final ----
  if (GO) {
    await new Promise((r) => setTimeout(r, 2500));
    const [after, stillOpen] = await Promise.all([
      info.clearinghouseState({ user: MASTER }),
      info.frontendOpenOrders({ user: MASTER }),
    ]);
    const reste = after.assetPositions.filter((r) => Number(r.position.szi) !== 0);
    console.log(`\n  ── après ──`);
    console.log(`     valeur du compte  ${usd(Number(after.marginSummary.accountValue))}`);
    console.log(`     marge utilisée    ${usd(Number(after.marginSummary.totalMarginUsed))}`);
    console.log(`     positions         ${reste.length}`);
    console.log(`     ordres au repos   ${stillOpen.length}`);
    if (reste.length || stillOpen.length) {
      console.log(`\n  ⚠ il reste quelque chose — relancer le script, ou finir à la main sur app.hyperliquid.xyz`);
    } else {
      console.log(`\n  ✓ compte à plat.`);
    }
  } else {
    console.log(`\n  Rien n'a été envoyé. Relancer avec --go pour agir.\n`);
  }
}

main().catch((e) => bail(e instanceof Error ? e.message : String(e)));
