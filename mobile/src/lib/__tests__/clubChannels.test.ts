/**
 * Les groupes du club : trois, un par soirée, et rien d'autre ne s'ouvre
 * qu'une adresse web sûre.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CLUB_CHANNELS, channelUrl } from '@/lib/clubChannels';
import { KNOWN_THEMES } from '@/lib/nightThemes';

describe('les groupes du club', () => {
  it('en compte un par sorte de soirée', () => {
    assert.deepEqual(
      CLUB_CHANNELS.map((channel) => channel.theme),
      [...KNOWN_THEMES],
    );
  });

  it('portent les noms des groupes Facebook', () => {
    assert.deepEqual(
      CLUB_CHANNELS.map((channel) => channel.name),
      ['Bitcoin Club', 'Stocks Club', 'Vibe-Coding Club'],
    );
  });

  it('n’ont que des adresses sûres, ou aucune', () => {
    for (const channel of CLUB_CHANNELS) {
      assert.ok(
        channel.url === '' || channelUrl(channel) !== null,
        `${channel.name} : ${channel.url}`,
      );
    }
  });
});

describe('ouverture d’un groupe', () => {
  it('ouvre une adresse Facebook', () => {
    const url = 'https://www.facebook.com/groups/bitcoinclubnoumea';
    assert.equal(channelUrl({ url }), url);
  });

  it('complète une adresse saisie sans schéma', () => {
    assert.equal(
      channelUrl({ url: 'facebook.com/groups/stocks' }),
      'https://facebook.com/groups/stocks',
    );
  });

  it('n’ouvre rien sans adresse', () => {
    assert.equal(channelUrl({ url: '' }), null);
    assert.equal(channelUrl({ url: '   ' }), null);
  });

  it('refuse ce qui n’est pas du https', () => {
    assert.equal(channelUrl({ url: 'javascript:alert(1)' }), null);
    assert.equal(channelUrl({ url: 'http://facebook.com/groups/x' }), null);
  });
});
