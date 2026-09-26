import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BINANCE_KLINES,
  DAILY_DAYS,
  HOURLY_DAYS,
  binanceRequests,
  mergePages,
  parseBinanceKlines,
  seriesFor,
  seriesKey,
  sinceOrigin,
} from '@/lib/btcSeries';
import { FINE_DAYS } from '@/features/oracle/judging';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 26, 0, 12);

describe('les séries du cours BTC', () => {
  it('deux séries seulement, quel que soit le repère', () => {
    // 1 SEM, 2 SEM, 1 MOIS, la série fine qui juge les paris : l'horaire.
    for (const days of [2, 5, 19, 45, FINE_DAYS + 2]) {
      assert.deepEqual(seriesFor(days), { daily: false, days: HOURLY_DAYS });
    }
    // Au-delà de 90 jours : la journalière, sur un an.
    assert.deepEqual(seriesFor(HOURLY_DAYS + 1), { daily: true, days: DAILY_DAYS });
    assert.deepEqual(seriesFor(400), { daily: true, days: DAILY_DAYS });
  });

  it('une clé de cache fixe : une origine qui glisse ne crée plus d’entrée', () => {
    assert.equal(seriesKey(seriesFor(4)), seriesKey(seriesFor(30)));
    assert.notEqual(seriesKey(seriesFor(4)), seriesKey(seriesFor(200)));
  });

  it('chaque écran découpe depuis son origine', () => {
    const raw = [
      { timestamp: NOW - 3 * DAY, price: 80_000 },
      { timestamp: NOW - DAY, price: 82_000 },
      { timestamp: NOW, price: 84_000 },
      { timestamp: NOW - 2 * DAY, price: Number.NaN },
    ];
    assert.deepEqual(sinceOrigin(raw, NOW - 2 * DAY), [
      { day: 1, price: 82_000 },
      { day: 2, price: 84_000 },
    ]);
  });
});

describe('Binance, en secours', () => {
  it('couvre 90 jours horaires en trois requêtes, l’année en une', () => {
    const hourly = binanceRequests({ daily: false, days: HOURLY_DAYS }, NOW);
    assert.equal(hourly.length, 3);
    assert.ok(hourly.every((u) => u.startsWith(BINANCE_KLINES) && u.includes('interval=1h')));
    const starts = hourly.map((u) => Number(new URL(u).searchParams.get('startTime')));
    assert.equal(starts[0], NOW - HOURLY_DAYS * DAY);
    assert.equal(starts[1]! - starts[0]!, 1000 * HOUR);
    const daily = binanceRequests({ daily: true, days: DAILY_DAYS }, NOW);
    assert.equal(daily.length, 1);
    assert.ok(daily[0]!.includes('interval=1d') && daily[0]!.includes('symbol=BTCUSDT'));
  });

  it('lit le cours de clôture, daté de la fin de la bougie', () => {
    const open = NOW - 2 * HOUR;
    const payload = [
      [
        open,
        '84000.1',
        '84500',
        '83900',
        '84210.5',
        '12.3',
        open + HOUR - 1,
        '0',
        1,
        '0',
        '0',
        '0',
      ],
      // La bougie en cours finit dans le futur : datée de maintenant.
      [open + HOUR, '84210.5', '84300', '84100', '84150', '3.1', open + 2 * HOUR + HOUR - 1],
      ['illisible'],
      [open, 'x', 'x', 'x', 'pas un prix', '0', open + HOUR - 1],
    ];
    assert.deepEqual(parseBinanceKlines(payload, NOW), [
      { timestamp: open + HOUR, price: 84_210.5 },
      { timestamp: NOW, price: 84_150 },
    ]);
    assert.deepEqual(parseBinanceKlines({ code: -1121 }, NOW), []);
  });

  it('assemble les pages sans doublon, dans l’ordre', () => {
    const a = [
      { timestamp: 2, price: 2 },
      { timestamp: 1, price: 1 },
    ];
    const b = [
      { timestamp: 2, price: 2 },
      { timestamp: 3, price: 3 },
    ];
    assert.deepEqual(
      mergePages([b, a]).map((p) => p.timestamp),
      [1, 2, 3],
    );
  });
});
