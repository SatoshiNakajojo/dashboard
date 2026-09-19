/**
 * Lecture d'une réponse Yahoo, et routage des fournisseurs.
 *
 * Les charges utiles reproduisent la forme que le dashboard JCGI analyse
 * (`app.jsx`, `fetchYahoo`) : `chart.result[0].meta.regularMarketPrice`, avec
 * repli sur `indicators.quote[0].close`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  YahooError,
  neededRates,
  parseYahooQuote,
  toUsd,
  type YahooChartResponse,
} from '@/lib/yahooParse';
import {
  DEFAULT_EXCHANGE,
  EXCHANGES,
  EXCHANGE_SUFFIX,
  fxSymbol,
  providerFor,
  toYahooSymbol,
} from '@/lib/quotes';

/** Réponse type d'une action américaine en séance. */
const live: YahooChartResponse = {
  chart: {
    result: [
      {
        meta: {
          symbol: 'MSTR',
          currency: 'USD',
          regularMarketPrice: 463.088,
          chartPreviousClose: 412,
        },
        indicators: { quote: [{ close: [405.1, 409.4, 412, null] }] },
      },
    ],
  },
};

describe('lecture d’une cotation Yahoo', () => {
  it('préfère le prix de séance', () => {
    const quote = parseYahooQuote(live);
    assert.equal(quote.price, 463.088);
    assert.equal(quote.currency, 'USD');
    assert.equal(quote.symbol, 'MSTR');
  });

  it('calcule la variation depuis la clôture précédente', () => {
    const quote = parseYahooQuote(live);
    assert.equal(Math.round(quote.changePercent! * 10) / 10, 12.4);
  });

  it('retombe sur la dernière clôture non nulle quand le marché est fermé', () => {
    const closed: YahooChartResponse = {
      chart: {
        result: [
          {
            meta: { currency: 'USD', regularMarketPrice: null },
            indicators: { quote: [{ close: [405.1, 412, null, null] }] },
          },
        ],
      },
    };
    assert.equal(parseYahooQuote(closed).price, 412);
  });

  it('lève plutôt que d’inventer un prix', () => {
    const empty: YahooChartResponse = {
      chart: { result: [{ meta: { currency: 'USD' }, indicators: { quote: [{ close: [] }] } }] },
    };
    assert.throws(() => parseYahooQuote(empty), YahooError);
    assert.throws(() => parseYahooQuote({ chart: { result: [] } }), YahooError);
    assert.throws(() => parseYahooQuote({}), YahooError);
  });

  it('relaie l’erreur déclarée par Yahoo', () => {
    const notFound: YahooChartResponse = {
      chart: { error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } },
    };
    assert.throws(() => parseYahooQuote(notFound), /delisted/);
  });

  it('rejette un prix nul ou négatif', () => {
    const bad: YahooChartResponse = {
      chart: {
        result: [
          {
            meta: { currency: 'USD', regularMarketPrice: 0 },
            indicators: { quote: [{ close: [0, -3] }] },
          },
        ],
      },
    };
    assert.throws(() => parseYahooQuote(bad), YahooError);
  });

  it('suppose le dollar quand la devise n’est pas déclarée', () => {
    const quote = parseYahooQuote({
      chart: { result: [{ meta: { regularMarketPrice: 10 }, indicators: { quote: [{}] } }] },
    });
    assert.equal(quote.currency, 'USD');
  });

  it('ne renvoie pas de variation sans clôture précédente', () => {
    const quote = parseYahooQuote({
      chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 10 } }] },
    });
    assert.equal(quote.changePercent, null);
  });
});

describe('conversion en dollars', () => {
  const quote = (price: number, currency: string) => ({
    price,
    currency,
    changePercent: null,
    symbol: null,
  });

  it('laisse le dollar tranquille', () => {
    assert.equal(toUsd(quote(412, 'USD'), {}), 412);
  });

  it('applique le taux pour une cotation en euros', () => {
    assert.equal(toUsd(quote(100, 'EUR'), { EUR: 1.08 }), 108);
  });

  it('traite les pence de Londres — le piège qui multiplie par cent', () => {
    // 250 GBp = 2,50 GBP = 3,25 $ à 1,30.
    assert.equal(toUsd(quote(250, 'GBp'), { GBP: 1.3 }), 3.25);
    assert.equal(toUsd(quote(250, 'GBX'), { GBP: 1.3 }), 3.25);
  });

  it('renvoie null plutôt qu’un prix faux quand le taux manque', () => {
    assert.equal(toUsd(quote(100, 'EUR'), {}), null);
    assert.equal(toUsd(quote(100, 'EUR'), { EUR: 0 }), null);
  });

  it('liste les devises à demander, sans le dollar', () => {
    assert.deepEqual(
      neededRates([quote(1, 'USD'), quote(1, 'EUR'), quote(1, 'GBp'), quote(1, 'EUR')]),
      ['EUR', 'GBP'],
    );
  });
});

describe('routage des fournisseurs', () => {
  it('envoie les titres chez Yahoo et les cryptos chez CoinGecko', () => {
    assert.equal(providerFor('ACTION'), 'yahoo');
    assert.equal(providerFor('ETF'), 'yahoo');
    assert.equal(providerFor('BTC'), 'coingecko');
    assert.equal(providerFor('ALT'), 'coingecko');
    assert.equal(providerFor('DEGEN'), 'coingecko');
  });
});

describe('symboles Yahoo', () => {
  it('retire le $ du club', () => {
    assert.equal(toYahooSymbol('$MSTR'), 'MSTR');
    assert.equal(toYahooSymbol('mstr'), 'MSTR');
  });

  it('ajoute le suffixe de place', () => {
    assert.equal(toYahooSymbol('$AI', 'Paris'), 'AI.PA');
    assert.equal(toYahooSymbol('$AVIO', 'milan'), 'AVIO.MI');
  });

  it('conserve un suffixe déjà écrit', () => {
    assert.equal(toYahooSymbol('$AI.PA', 'Londres'), 'AI.PA', 'le suffixe explicite fait foi');
  });

  it('ignore une place inconnue plutôt que d’inventer un suffixe', () => {
    assert.equal(toYahooSymbol('$MSTR', 'Ouagadougou'), 'MSTR');
  });

  it('renvoie null pour une saisie vide', () => {
    assert.equal(toYahooSymbol('$'), null);
    assert.equal(toYahooSymbol('   '), null);
  });

  it('laisse un titre américain sans suffixe', () => {
    // La place par défaut du composer ne doit rien ajouter : `MSTR.US`
    // n'existe pas chez Yahoo.
    assert.equal(toYahooSymbol('$MSTR', DEFAULT_EXCHANGE), 'MSTR');
  });

  it('distingue deux sociétés qui partagent un ticker', () => {
    // `$AI` est C3.ai à New York et Air Liquide à Paris. Sans la place, le
    // composer proposerait le prix de l'une pour un call sur l'autre.
    assert.notEqual(toYahooSymbol('$AI', 'us'), toYahooSymbol('$AI', 'paris'));
    assert.equal(toYahooSymbol('$AI', 'us'), 'AI');
    assert.equal(toYahooSymbol('$AI', 'paris'), 'AI.PA');
  });
});

describe('places de cotation', () => {
  it('propose les États-Unis en premier, sans suffixe', () => {
    assert.equal(EXCHANGES[0].key, DEFAULT_EXCHANGE);
    assert.equal(EXCHANGES[0].suffix, '');
  });

  it('expose chaque place du sélecteur dans la table des suffixes', () => {
    // Les deux sont dérivées l'une de l'autre : un écart voudrait dire qu'un
    // choix du composer ne produit aucun suffixe.
    for (const { key, suffix } of EXCHANGES) {
      assert.equal(EXCHANGE_SUFFIX[key], suffix, key);
    }
  });

  it('ne propose pas deux fois la même place', () => {
    const keys = EXCHANGES.map((e) => e.key);
    assert.equal(new Set(keys).size, keys.length);
    const suffixes = EXCHANGES.map((e) => e.suffix);
    assert.equal(new Set(suffixes).size, suffixes.length);
  });

  it('accepte les noms alternatifs qu’un membre peut écrire', () => {
    assert.equal(toYahooSymbol('$SAP', 'xetra'), 'SAP.DE');
    assert.equal(toYahooSymbol('$SHEL', 'london'), 'SHEL.L');
  });

  it('construit la paire de change', () => {
    assert.equal(fxSymbol('eur'), 'EURUSD=X');
    assert.equal(fxSymbol('GBP'), 'GBPUSD=X');
  });
});
