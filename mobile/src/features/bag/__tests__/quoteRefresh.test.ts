/**
 * Rafraîchissement des cours côté app.
 *
 * Le défaut d'origine ne levait rien : toutes les cartes affichaient 0 %, ce
 * qui est une valeur parfaitement plausible. C'est le genre de panne qu'on ne
 * voit qu'en regardant l'écran des semaines plus tard.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EMPTY_QUOTES,
  entryBtcFor,
  liveBtc,
  freshPrice,
  mergeQuotes,
  quoteTargets,
  type QuoteMap,
} from '@/features/bag/quoteRefresh';
import type { AssetClass } from '@/theme/tokens';
import type { Ticker } from '@/types/domain';

const call = (id: string, assetClass: AssetClass, extra: Partial<Ticker> = {}): Ticker => ({
  id,
  userId: 'u1',
  symbol: '$X',
  assetClass,
  entryPrice: 100,
  currentPrice: 100,
  entryBtcPrice: 60_000,
  sizeUsd: null,
  thesis: '',
  coingeckoId: null,
  yahooSymbol: null,
  enteredOn: null,
  editedAt: null,
  exitPrice: null,
  exitBtcPrice: null,
  closedOn: null,
  closedAt: null,
  priceUpdatedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...extra,
});

describe('ce qu’il faut demander', () => {
  it('range chaque call chez son fournisseur', () => {
    const cibles = quoteTargets([
      call('a', 'BTC', { coingeckoId: 'bitcoin' }),
      call('b', 'ACTION', { yahooSymbol: 'MSTR' }),
      call('c', 'ALT', { coingeckoId: 'ethereum' }),
      call('d', 'ETF', { yahooSymbol: 'IBIT' }),
      call('e', 'DEGEN', { coingeckoId: 'dogwifcoin' }),
    ]);
    assert.deepEqual(cibles.coingeckoIds, ['bitcoin', 'ethereum', 'dogwifcoin']);
    assert.deepEqual(cibles.yahooSymbols, ['MSTR', 'IBIT']);
  });

  it('ne demande qu’une fois ce que deux membres suivent', () => {
    // CoinGecko facture à la requête : sept membres sur `$BTC` ne doivent pas
    // faire sept demandes.
    const cibles = quoteTargets([
      call('a', 'BTC', { coingeckoId: 'bitcoin' }),
      call('b', 'BTC', { coingeckoId: 'bitcoin' }),
      call('c', 'ACTION', { yahooSymbol: 'MSTR' }),
      call('d', 'ACTION', { yahooSymbol: 'MSTR' }),
    ]);
    assert.deepEqual(cibles.coingeckoIds, ['bitcoin']);
    assert.deepEqual(cibles.yahooSymbols, ['MSTR']);
  });

  it('ignore un call sans identifiant plutôt que de deviner', () => {
    // Une position close, ou un call publié pendant une panne de résolution :
    // deviner un identifiant depuis le symbole coterait le mauvais actif.
    const cibles = quoteTargets([call('a', 'ALT'), call('b', 'ACTION')]);
    assert.deepEqual(cibles, { coingeckoIds: [], yahooSymbols: [] });
  });

  it('ne cherche pas un jeton chez Yahoo ni une action chez CoinGecko', () => {
    // Un identifiant rangé dans la mauvaise colonne ne doit pas être utilisé :
    // la classe d'actif décide du fournisseur, pas la présence d'un champ.
    const cibles = quoteTargets([
      call('a', 'ACTION', { coingeckoId: 'bitcoin' }),
      call('b', 'ALT', { yahooSymbol: 'MSTR' }),
    ]);
    assert.deepEqual(cibles, { coingeckoIds: [], yahooSymbols: [] });
  });
});

describe('cours frais d’un call', () => {
  const quotes: QuoteMap = { coingecko: { bitcoin: 120_000 }, yahoo: { MSTR: 412 } };

  it('lit le bon fournisseur', () => {
    assert.equal(freshPrice(call('a', 'BTC', { coingeckoId: 'bitcoin' }), quotes), 120_000);
    assert.equal(freshPrice(call('b', 'ACTION', { yahooSymbol: 'MSTR' }), quotes), 412);
  });

  it('renvoie null quand la réponse ne contient pas ce call', () => {
    assert.equal(freshPrice(call('c', 'ALT', { coingeckoId: 'solana' }), quotes), null);
    assert.equal(freshPrice(call('d', 'ALT'), quotes), null);
  });

  it('refuse un cours nul ou négatif', () => {
    // Une réponse à zéro afficherait -100 % : mieux vaut garder le dernier
    // cours connu et le dire hors ligne.
    const cassé: QuoteMap = { coingecko: { bitcoin: 0, ethereum: -3 }, yahoo: {} };
    assert.equal(freshPrice(call('a', 'BTC', { coingeckoId: 'bitcoin' }), cassé), null);
    assert.equal(freshPrice(call('b', 'ALT', { coingeckoId: 'ethereum' }), cassé), null);
  });
});

describe('recollage', () => {
  it('remplace le cours courant', () => {
    const avant = [call('a', 'BTC', { coingeckoId: 'bitcoin', currentPrice: 103_200 })];
    const après = mergeQuotes(avant, { coingecko: { bitcoin: 120_911 }, yahoo: {} });
    assert.equal(après[0]!.currentPrice, 120_911);
    assert.equal(après[0]!.entryPrice, 100, 'le prix d’entrée ne bouge jamais');
  });

  it('garde le cours stocké quand la demande n’a rien rendu', () => {
    // Une panne CoinGecko ne doit pas effacer un prix déjà connu.
    const avant = [call('a', 'BTC', { coingeckoId: 'bitcoin', currentPrice: 103_200 })];
    assert.equal(mergeQuotes(avant, EMPTY_QUOTES)[0]!.currentPrice, 103_200);
  });

  it('rend la liste d’origine quand rien ne change', () => {
    // Une nouvelle référence à chaque rendu relancerait tous les `useMemo` en
    // aval — classements compris — pour un résultat identique.
    const avant = [call('a', 'BTC', { coingeckoId: 'bitcoin', currentPrice: 120_911 })];
    assert.equal(mergeQuotes(avant, EMPTY_QUOTES), avant);
    assert.equal(mergeQuotes(avant, { coingecko: { bitcoin: 120_911 }, yahoo: {} }), avant);
  });

  it('ne touche qu’aux calls concernés', () => {
    const avant = [
      call('a', 'BTC', { coingeckoId: 'bitcoin', currentPrice: 103_200 }),
      call('b', 'ALT', { coingeckoId: 'solana', currentPrice: 210 }),
    ];
    const après = mergeQuotes(avant, { coingecko: { bitcoin: 120_911 }, yahoo: {} });
    assert.equal(après[0]!.currentPrice, 120_911);
    assert.equal(après[1], avant[1], 'l’objet non concerné est réutilisé tel quel');
  });
});

describe('prix du BTC à l’entrée', () => {
  it('un call BTC est son propre référentiel', () => {
    // Sans ça, publier un call BTC pendant une panne CoinGecko laissait la
    // colonne vide alors que la réponse était sous la main.
    assert.equal(entryBtcFor('BTC', 103_200, null), 103_200);
    assert.equal(entryBtcFor('BTC', 103_200, 120_911), 103_200, 'le prix d’entrée prime');
  });

  it('les autres classes prennent le spot', () => {
    assert.equal(entryBtcFor('ACTION', 412, 120_911), 120_911);
    assert.equal(entryBtcFor('ALT', 1.84, 120_911), 120_911);
  });

  it('rend null plutôt qu’un chiffre inventé', () => {
    // « — » est honnête ; un zéro se lirait comme une performance.
    assert.equal(entryBtcFor('ACTION', 412, null), null);
    assert.equal(entryBtcFor('ACTION', 412, 0), null);
    assert.equal(entryBtcFor('ALT', 1.84, Number.NaN), null);
    assert.equal(
      entryBtcFor('BTC', 0, 120_911),
      null,
      'un prix d’entrée nul n’est pas un prix',
    );
  });
});

describe('spot BTC utilisable', () => {
  it('écarte le cours de repli, jamais reçu', () => {
    // Pris comme référence, il donnait une perf BTC nulle — « vs ₿ » = perf.
    assert.equal(liveBtc({ usd: 120_911, fetchedAt: 0 }), null);
  });

  it('garde un cours reçu, même ancien', () => {
    assert.equal(liveBtc({ usd: 112_000, fetchedAt: 1_758_600_000_000 }), 112_000);
  });
});

describe('une position close', () => {
  const close = { exitPrice: 150, exitBtcPrice: 66_000, closedOn: '2026-09-01' };

  it('ne réclame plus de cours', () => {
    const cibles = quoteTargets([
      call('a', 'ALT', { coingeckoId: 'ethereum', ...close }),
      call('b', 'ACTION', { yahooSymbol: 'SMR', ...close }),
    ]);
    assert.deepEqual(cibles, { coingeckoIds: [], yahooSymbols: [] });
  });

  it('garde son prix de sortie même si un cours arrive', () => {
    const closed = call('a', 'ALT', { coingeckoId: 'ethereum', currentPrice: 150, ...close });
    const quotes = { coingecko: { ethereum: 4_000 }, yahoo: {} };
    assert.equal(freshPrice(closed, quotes), null);
    const tickers = [closed];
    assert.equal(mergeQuotes(tickers, quotes), tickers);
  });
});
