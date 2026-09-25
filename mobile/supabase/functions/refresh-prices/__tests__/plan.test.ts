/**
 * Le plan de rafraîchissement — ce qui sera écrit dans `tickers`.
 *
 * Trois garanties comptent plus que le reste, et sont testées comme telles :
 * on n'efface jamais un prix connu, on ne réveille pas les clients pour rien,
 * et on ne confond jamais les deux fournisseurs.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  chunk,
  planConfirmations,
  planUpdates,
  quoteRequests,
  type PricedTicker,
} from '../plan.ts';

const crypto = (id: string, cg: string, current: number | null): PricedTicker => ({
  id,
  coingecko_id: cg,
  yahoo_symbol: null,
  current_price: current,
});

const stock = (id: string, yahoo: string, current: number | null): PricedTicker => ({
  id,
  coingecko_id: null,
  yahoo_symbol: yahoo,
  current_price: current,
});

describe('regroupement des demandes', () => {
  it('sépare les deux fournisseurs', () => {
    const requests = quoteRequests([
      crypto('a', 'bitcoin', null),
      stock('b', 'MSTR', null),
      stock('c', 'IBIT', null),
    ]);
    assert.deepEqual(requests, { coingecko: ['bitcoin'], yahoo: ['IBIT', 'MSTR'] });
  });

  it('dédoublonne de chaque côté', () => {
    const requests = quoteRequests([
      crypto('a', 'bitcoin', null),
      crypto('b', 'bitcoin', null),
      stock('c', 'MSTR', null),
      stock('d', 'MSTR', null),
    ]);
    assert.deepEqual(requests, { coingecko: ['bitcoin'], yahoo: ['MSTR'] });
  });

  it('ne demande rien pour une ligne sans fournisseur', () => {
    const orphan: PricedTicker = {
      id: 'x',
      coingecko_id: null,
      yahoo_symbol: null,
      current_price: 42,
    };
    assert.deepEqual(quoteRequests([orphan]), { coingecko: [], yahoo: [] });
  });
});

describe('plan de rafraîchissement', () => {
  it('met à jour une crypto depuis CoinGecko', () => {
    const plan = planUpdates([crypto('a', 'bitcoin', 100_000)], {
      coingecko: { bitcoin: 120_911 },
    });
    assert.deepEqual(plan.updates, [{ id: 'a', price: 120_911 }]);
  });

  it('met à jour une action depuis Yahoo', () => {
    const plan = planUpdates([stock('a', 'MSTR', 412)], { yahoo: { MSTR: 463.088 } });
    assert.deepEqual(plan.updates, [{ id: 'a', price: 463.088 }]);
  });

  it('ne confond jamais les deux tables — un symbole homonyme reste distinct', () => {
    // `ETH` existe des deux côtés : le jeton chez CoinGecko, un ETF chez Yahoo.
    const plan = planUpdates([crypto('jeton', 'ETH', 1), stock('etf', 'ETH', 1)], {
      coingecko: { ETH: 4_798 },
      yahoo: { ETH: 31.2 },
    });
    assert.deepEqual(plan.updates, [
      { id: 'jeton', price: 4_798 },
      { id: 'etf', price: 31.2 },
    ]);
  });

  it('renseigne un prix encore inconnu', () => {
    const plan = planUpdates([stock('a', 'NVDA', null)], { yahoo: { NVDA: 153.8 } });
    assert.deepEqual(plan.updates, [{ id: 'a', price: 153.8 }]);
  });

  it('n’efface jamais un prix absent de la réponse', () => {
    const plan = planUpdates([stock('a', 'MSTR', 412)], { yahoo: {} });
    assert.deepEqual(plan.updates, [], 'aucune écriture');
    assert.equal(plan.skipped, 1);
  });

  it('laisse tranquille une ligne sans fournisseur', () => {
    const orphan: PricedTicker = {
      id: 'x',
      coingecko_id: null,
      yahoo_symbol: null,
      current_price: 42,
    };
    const plan = planUpdates([orphan], { coingecko: { x: 1 }, yahoo: { x: 1 } });
    assert.deepEqual(plan.updates, []);
    assert.equal(plan.skipped, 1);
  });

  it('ne réécrit pas un prix inchangé — chaque UPDATE réveille tout le club', () => {
    const plan = planUpdates([crypto('a', 'bitcoin', 120_911)], {
      coingecko: { bitcoin: 120_911 },
    });
    assert.deepEqual(plan.updates, []);
    assert.equal(plan.skipped, 1);
  });

  it('rejette une valeur inexploitable plutôt que de l’écrire', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 'cher' as never]) {
      const plan = planUpdates([stock('a', 'MSTR', 412)], { yahoo: { MSTR: bad } });
      assert.deepEqual(plan.updates, [], `valeur ${String(bad)}`);
      assert.equal(plan.skipped, 1);
    }
  });

  it('applique un même cours à plusieurs positions du même actif', () => {
    const plan = planUpdates([stock('a', 'MSTR', 412), stock('b', 'MSTR', 252)], {
      yahoo: { MSTR: 463.088 },
    });
    assert.deepEqual(plan.updates, [
      { id: 'a', price: 463.088 },
      { id: 'b', price: 463.088 },
    ]);
  });

  it('ne demande rien quand la table est vide', () => {
    assert.deepEqual(planUpdates([], { coingecko: { bitcoin: 1 } }), {
      updates: [],
      skipped: 0,
    });
  });

  it('tolère une absence complète de prix', () => {
    const plan = planUpdates([crypto('a', 'bitcoin', 100)], {});
    assert.deepEqual(plan.updates, []);
    assert.equal(plan.skipped, 1);
  });
});

describe('découpage en lots', () => {
  it('respecte la taille demandée', () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  });

  it('rend un seul lot quand tout tient', () => {
    assert.deepEqual(chunk([1, 2], 100), [[1, 2]]);
  });

  it('rend une liste vide pour une entrée vide', () => {
    assert.deepEqual(chunk([], 10), []);
  });

  it('refuse une taille absurde plutôt que de boucler sans fin', () => {
    assert.throws(() => chunk([1, 2], 0), RangeError);
  });
});

describe('confirmation du prix d’entrée (v1.01)', () => {
  const pending = (over: Partial<PricedTicker>): PricedTicker => ({
    id: 'x',
    coingecko_id: null,
    yahoo_symbol: null,
    current_price: 90,
    asset_class: 'ALT',
    entry_confirmed_at: null,
    ...over,
  });

  it('demande le bitcoin dès qu’une entrée attend sa confirmation', () => {
    assert.deepEqual(quoteRequests([pending({ yahoo_symbol: 'NVDA' })]).coingecko, ['bitcoin']);
    assert.deepEqual(
      quoteRequests([
        pending({ yahoo_symbol: 'NVDA', entry_confirmed_at: '2026-09-25T00:00:00Z' }),
      ]).coingecko,
      [],
    );
    // Une ligne d'avant la v1.01 n'a pas la colonne : elle est confirmée.
    assert.deepEqual(
      quoteRequests([{ id: 'y', coingecko_id: null, yahoo_symbol: 'NVDA', current_price: 1 }])
        .coingecko,
      [],
    );
  });

  it('remplace le prix de l’app par le cours du serveur, avec le bitcoin du même instant', () => {
    const plan = planConfirmations(
      [
        pending({ id: 'sol', coingecko_id: 'solana' }),
        pending({ id: 'nvda', yahoo_symbol: 'NVDA', asset_class: 'ACTION' }),
        pending({ id: 'btc', coingecko_id: 'bitcoin', asset_class: 'BTC' }),
        pending({
          id: 'fait',
          coingecko_id: 'solana',
          entry_confirmed_at: '2026-09-25T00:00:00Z',
        }),
        { id: 'ancien', coingecko_id: 'solana', yahoo_symbol: null, current_price: 1 },
      ],
      { coingecko: { solana: 101.5, bitcoin: 111000 }, yahoo: { NVDA: 131.2 } },
    );
    assert.deepEqual(plan, [
      { id: 'sol', entryPrice: 101.5, entryBtcPrice: 111000 },
      { id: 'nvda', entryPrice: 131.2, entryBtcPrice: 111000 },
      { id: 'btc', entryPrice: 111000, entryBtcPrice: 111000 },
    ]);
  });

  it('attend le relevé suivant plutôt que de confirmer sans cours', () => {
    assert.deepEqual(
      planConfirmations([pending({ coingecko_id: 'solana' })], {
        coingecko: { bitcoin: 111000 },
      }),
      [],
      'sans cours de l’actif',
    );
    assert.deepEqual(
      planConfirmations([pending({ yahoo_symbol: 'NVDA', asset_class: 'ACTION' })], {
        yahoo: { NVDA: 131.2 },
      }),
      [],
      'sans bitcoin pour le référentiel',
    );
    assert.deepEqual(
      planConfirmations([pending({ coingecko_id: 'solana' })], {
        coingecko: { solana: -3, bitcoin: 111000 },
      }),
      [],
      'un cours aberrant',
    );
  });
});
