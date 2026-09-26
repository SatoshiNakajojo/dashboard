import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isSeriesInterval, parseYahooSeries, SERIES_RANGES } from '../yahooSeries.ts';

describe('série Yahoo pour l’historique du bitcoin', () => {
  it('rend les clôtures datées en millisecondes, sans les trous', () => {
    const payload = {
      chart: {
        result: [
          {
            timestamp: [1_758_830_400, 1_758_834_000, 1_758_837_600],
            indicators: { quote: [{ close: [84_010.5, null, 84_220] }] },
          },
        ],
      },
    };
    assert.deepEqual(parseYahooSeries(payload), [
      [1_758_830_400_000, 84_010.5],
      [1_758_837_600_000, 84_220],
    ]);
  });

  it('ne lève pas sur une réponse illisible', () => {
    assert.deepEqual(parseYahooSeries(null), []);
    assert.deepEqual(parseYahooSeries({ chart: { result: [] } }), []);
    assert.deepEqual(parseYahooSeries({ chart: { error: { code: 'Not Found' } } }), []);
  });

  it('ne connaît que les deux séries de l’Oracle', () => {
    assert.equal(isSeriesInterval('1h'), true);
    assert.equal(isSeriesInterval('1d'), true);
    assert.equal(isSeriesInterval('5m'), false);
    assert.equal(isSeriesInterval(null), false);
    assert.deepEqual(SERIES_RANGES, { '1h': '3mo', '1d': '1y' });
  });
});
