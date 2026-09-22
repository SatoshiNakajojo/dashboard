/**
 * Les fixtures doivent reproduire le design, pas seulement s'en approcher.
 *
 * Ces tests sont la garde-fou de la fidélité : si quelqu'un retouche un prix
 * d'entrée dans `src/mocks`, c'est ici que l'écart avec `DONNEES_FICTIVES.md`
 * apparaît — pas à la relecture d'une capture d'écran.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MOCK_BTC_SPOT, MOCK_CURRENT_TICKERS, MOCK_TICKERS } from '@/mocks/calls';
import { MEMBERS } from '@/mocks/members';
import {
  performancePercent,
  rektFace,
  romanRank,
  splitLeaderboards,
  vsBitcoinPercent,
} from '@/lib/performance';
import type { CallView } from '@/types/domain';

/** Même projection que `useCalls`, sans React. */
function toViews(tickers = MOCK_TICKERS): CallView[] {
  return tickers.map((ticker) => ({
    ...ticker,
    author: Object.values(MEMBERS).find((m) => m.id === ticker.userId)!,
    performancePercent: performancePercent(ticker.entryPrice, ticker.currentPrice),
    vsBtcPercent:
      ticker.assetClass === 'BTC'
        ? null
        : vsBitcoinPercent(
            ticker.entryPrice,
            ticker.currentPrice,
            ticker.entryBtcPrice,
            MOCK_BTC_SPOT,
          ),
    bull: 0,
    bear: 0,
    myVote: null,
  }));
}

const round = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

describe('fixtures du fil des calls', () => {
  it('reproduit les perfs en dollars du design', () => {
    // Le fil courant seul : les positions historiques portent les mêmes
    // tickers pour certains membres, avec d'autres prix d'entrée.
    const bySymbol = new Map(
      toViews(MOCK_CURRENT_TICKERS).map((c) => [`${c.symbol}@${c.author.displayName}`, c]),
    );
    const expected: [string, number][] = [
      ['$BTC@Léa', 14.9],
      ['$MSTR@John', 12.4],
      ['$ETH@Alex', 21.8],
      ['$IBIT@Rayan', 11.2],
      ['$WIF@Marco', -61],
    ];
    for (const [key, perf] of expected) {
      assert.equal(round(bySymbol.get(key)!.performancePercent), perf, key);
    }
  });

  it('reproduit les perfs vs ₿ du design', () => {
    const bySymbol = new Map(
      toViews(MOCK_CURRENT_TICKERS).map((c) => [`${c.symbol}@${c.author.displayName}`, c]),
    );
    const expected: [string, number | null][] = [
      ['$BTC@Léa', null], // le référentiel n'a pas de perf vs lui-même
      ['$MSTR@John', -2.5],
      ['$ETH@Alex', 6.9],
      ['$IBIT@Rayan', -3.7],
      ['$WIF@Marco', -66.4],
    ];
    for (const [key, vs] of expected) {
      assert.equal(round(bySymbol.get(key)!.vsBtcPercent), vs, key);
    }
  });
});

describe('classements calculés depuis les fixtures', () => {
  it('produit exactement le Hall of Fame du design', () => {
    const { fame } = splitLeaderboards(toViews());
    assert.deepEqual(
      fame.map((c, i) => `${romanRank(i)} ${c.author.displayName} ${c.symbol} ${round(c.performancePercent)}`),
      ['I Léa $BTC 96', 'II Alex $NVDA 74', 'III John $MSTR 63'],
    );
  });

  it('produit exactement le Rekt Board du design', () => {
    const { rekt } = splitLeaderboards(toViews());
    assert.deepEqual(
      rekt.map((c, i) => `${rektFace(i)} ${c.author.displayName} ${c.symbol} ${round(c.performancePercent)}`),
      ['x_x Marco $WIF -61', 'T_T Rayan $ETHW -48', '>_< Sofia $GME -22'],
    );
  });

  it('laisse les calls du milieu hors des deux tableaux', () => {
    const { fame, rekt } = splitLeaderboards(toViews());
    const classed = new Set([...fame, ...rekt].map((c) => c.id));
    const middle = toViews().filter((c) => !classed.has(c.id));
    assert.ok(middle.length > 0, 'le cas ordinaire doit exister');
    assert.deepEqual(
      middle.map((c) => c.symbol).sort(),
      ['$BTC', '$ETH', '$IBIT', '$MSTR'],
      'les calls en cours restent dans le fil, pas au classement',
    );
  });
});
