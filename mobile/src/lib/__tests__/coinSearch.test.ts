/**
 * Choix d'un jeton parmi les homonymes.
 *
 * CoinGecko renvoie tout ce qui ressemble à la saisie, dans un ordre qui lui
 * est propre. Ce qui se joue ici n'est pas le confort de frappe : un call dont
 * le fournisseur est faux affiche un cours crédible et faux, et personne ne
 * s'en aperçoit avant le classement de fin de saison.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bestCoin, normalizeTicker, rankCoins, type RawCoin } from '@/lib/coinSearch';

/** Forme réelle d'une réponse `/search` sur « wif ». */
const WIF: RawCoin[] = [
  { id: 'wifedoge', symbol: 'WIFEDOGE', name: 'Wife Doge', market_cap_rank: null },
  { id: 'dogwifcoin', symbol: 'WIF', name: 'dogwifhat', market_cap_rank: 62 },
  { id: 'wif-token', symbol: 'WIF', name: 'Wif Token', market_cap_rank: null },
  { id: 'wifi-token', symbol: 'WIFI', name: 'WiFi Map', market_cap_rank: 1420 },
];

describe('normalisation du ticker', () => {
  it('retire le $ du club, les espaces et la casse', () => {
    assert.equal(normalizeTicker('$WIF '), 'wif');
    assert.equal(normalizeTicker('  sol'), 'sol');
    assert.equal(normalizeTicker('$'), '');
  });
});

describe('propositions du composer', () => {
  it('met le symbole exact le mieux classé en tête', () => {
    const [first, second] = rankCoins(WIF, '$WIF');
    assert.equal(first?.id, 'dogwifcoin');
    assert.equal(first?.name, 'dogwifhat');
    assert.equal(second?.id, 'wif-token', 'l’homonyme non classé suit, il ne disparaît pas');
  });

  it('classe les préfixes après les symboles exacts', () => {
    // Dans chaque rang, la capitalisation tranche : `WIFI` est classé 1420ᵉ,
    // `WIFEDOGE` ne l'est pas du tout.
    const ids = rankCoins(WIF, 'wif').map((coin) => coin.id);
    assert.deepEqual(ids, ['dogwifcoin', 'wif-token', 'wifi-token', 'wifedoge']);
  });

  it('retrouve un jeton par son nom, pour qui ignore le ticker', () => {
    const coins: RawCoin[] = [
      { id: 'solana', symbol: 'SOL', name: 'Solana', market_cap_rank: 5 },
      { id: 'solar', symbol: 'SXP', name: 'Solar', market_cap_rank: 380 },
    ];
    const ids = rankCoins(coins, 'sola').map((coin) => coin.id);
    assert.deepEqual(ids, ['solana', 'solar']);
  });

  it('un jeton non classé ne passe jamais devant un jeton classé', () => {
    const coins: RawCoin[] = [
      { id: 'obscur', symbol: 'SOL', name: 'Obscur', market_cap_rank: null },
      { id: 'solana', symbol: 'SOL', name: 'Solana', market_cap_rank: 5 },
    ];
    assert.equal(rankCoins(coins, 'sol')[0]?.id, 'solana');
  });

  it('ne propose jamais deux fois le même jeton', () => {
    const doubled = [...WIF, ...WIF];
    const ids = rankCoins(doubled, 'wif').map((coin) => coin.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('respecte la limite et se tait sur une saisie vide', () => {
    assert.equal(rankCoins(WIF, 'wif', 2).length, 2);
    assert.deepEqual(rankCoins(WIF, '$'), []);
  });

  it('survit à une entrée abîmée plutôt que de lever', () => {
    const broken = [
      { id: '', symbol: 'WIF' },
      { id: 'sans-symbole', symbol: '' },
      { id: 'sans-nom', symbol: 'WIF' },
    ] as RawCoin[];
    const matches = rankCoins(broken, 'wif');
    assert.deepEqual(matches.map((coin) => coin.id), ['sans-nom']);
    assert.equal(matches[0]?.name, 'WIF', 'à défaut de nom, le symbole');
  });
});

describe('résolution sans choix du membre', () => {
  it('retient le symbole exact le mieux classé', () => {
    assert.equal(bestCoin(WIF, '$WIF')?.id, 'dogwifcoin');
  });

  it('refuse de choisir sur une simple ressemblance de nom', () => {
    // La garantie qui compte : publier sans fournisseur laisse une carte figée
    // au prix d'entrée — visible. Publier avec le mauvais jeton affiche un
    // cours faux et crédible, que personne ne remet en question.
    const coins: RawCoin[] = [{ id: 'solana', symbol: 'SOL', name: 'Solana', market_cap_rank: 5 }];
    assert.equal(bestCoin(coins, 'sola'), null);
    assert.equal(bestCoin(coins, 'solana'), null);
  });

  it('renvoie null sur une saisie vide ou une liste vide', () => {
    assert.equal(bestCoin(WIF, ''), null);
    assert.equal(bestCoin([], 'wif'), null);
  });
});
