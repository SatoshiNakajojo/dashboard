import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  appendEntry,
  describeJournal,
  journaledFetch,
  parseJournal,
  signOutReason,
  storedSessionUser,
  type JournalEntry,
} from '@/lib/authJournal';

const T = Date.UTC(2026, 8, 25, 7, 2);
const HOUR = 3_600_000;

describe('la session rangée sur l’appareil', () => {
  it('reconnaît une session qui peut revivre : un jeton de renouvellement et un membre', () => {
    const raw = JSON.stringify({
      access_token: 'a',
      refresh_token: 'r',
      expires_at: 1,
      user: { id: 'lea' },
    });
    assert.equal(storedSessionUser(raw), 'lea');
  });

  it('ignore ce qui ne peut pas revivre', () => {
    assert.equal(storedSessionUser(null), null);
    assert.equal(storedSessionUser('pas du json'), null);
    assert.equal(storedSessionUser('null'), null);
    assert.equal(storedSessionUser(JSON.stringify({ user: { id: 'lea' } })), null);
    assert.equal(
      storedSessionUser(JSON.stringify({ refresh_token: '', user: { id: 'lea' } })),
      null,
    );
    assert.equal(storedSessionUser(JSON.stringify({ refresh_token: 'r' })), null);
  });
});

describe('le journal de session', () => {
  it('garde les derniers événements, et regroupe les répétitions rapprochées', () => {
    let list: JournalEntry[] = [];
    list = appendEntry(list, { t: T, e: 'SIGNED_IN' });
    list = appendEntry(list, { t: T + 60_000, e: 'SIGNED_IN' });
    assert.equal(list.length, 1, 'deux connexions à une minute : une seule ligne');
    assert.equal(list[0]!.t, T + 60_000);
    list = appendEntry(list, { t: T + HOUR, e: 'SIGNED_IN' });
    assert.equal(list.length, 2);
    for (let i = 0; i < 50; i += 1)
      list = appendEntry(list, { t: T + i * HOUR * 2, e: 'TOKEN_REFRESHED', d: String(i) }, 30);
    assert.equal(list.length, 30);
  });

  it('relit un journal abîmé sans planter', () => {
    assert.deepEqual(parseJournal(null), []);
    assert.deepEqual(parseJournal('{'), []);
    assert.deepEqual(parseJournal('{"t":1}'), []);
    assert.deepEqual(parseJournal('[{"t":1,"e":"SIGNED_IN"},{"x":2},null]'), [
      { t: 1, e: 'SIGNED_IN' },
    ]);
  });

  it('dit pourquoi l’appareil n’est plus connecté', () => {
    assert.equal(signOutReason([]), null, 'premier passage : rien à dire');
    const refused = signOutReason([
      { t: T, e: 'SIGNED_IN' },
      { t: T + HOUR, e: 'REFRESH_REFUSED', d: '400 refresh_token_already_used' },
      { t: T + HOUR, e: 'SIGNED_OUT' },
    ]);
    assert.match(
      refused!,
      /refusé de renouveler la session \(400 refresh_token_already_used\)/,
    );
    const wiped = signOutReason([{ t: T, e: 'SIGNED_IN' }]);
    assert.match(wiped!, /effacée — par le navigateur ou le système/);
    assert.match(
      signOutReason([
        { t: T, e: 'SIGNED_IN' },
        { t: T + 1, e: 'SIGNED_OUT' },
      ])!,
      /^Déconnecté le /,
    );
  });

  it('se résume en une ligne pour « À propos »', () => {
    assert.equal(describeJournal([]), 'SESSION · AUCUN ÉVÉNEMENT');
    const line = describeJournal([
      { t: T, e: 'SIGNED_IN' },
      { t: T + HOUR, e: 'REFRESH_NETWORK', d: 'Load failed' },
      { t: T + HOUR, e: 'PENDING' },
      { t: T + HOUR + 1, e: 'TOKEN_REFRESHED' },
      { t: T + HOUR + 2, e: 'RECOVERED' },
      { t: T + HOUR + 3, e: 'PERSIST', d: 'oui' },
    ]);
    assert.equal(
      line,
      'SESSION · 1 RENOUVELLEMENT · 1 REPRISE · 1 ÉCHEC RÉSEAU · STOCKAGE PERSISTANT',
    );
  });
});

describe('la trace des renouvellements', () => {
  const REFRESH = 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token';

  it('laisse passer tout le reste sans y toucher', async () => {
    let calls = 0;
    const fake = (async () => {
      calls += 1;
      return new Response('[]', { status: 401 });
    }) as typeof fetch;
    const response = await journaledFetch(fake)('https://x.supabase.co/rest/v1/events');
    assert.equal(response.status, 401);
    assert.equal(calls, 1);
  });

  it('rend la réponse du serveur telle quelle, et l’erreur réseau aussi', async () => {
    const refused = (async () =>
      new Response(JSON.stringify({ error_code: 'refresh_token_already_used' }), {
        status: 400,
      })) as typeof fetch;
    const response = await journaledFetch(refused)(REFRESH, { method: 'POST' });
    assert.equal(response.status, 400);
    assert.equal(
      ((await response.json()) as { error_code: string }).error_code,
      'refresh_token_already_used',
    );

    const offline = (async () => {
      throw new TypeError('Load failed');
    }) as typeof fetch;
    await assert.rejects(journaledFetch(offline)(REFRESH), /Load failed/);
  });
});
