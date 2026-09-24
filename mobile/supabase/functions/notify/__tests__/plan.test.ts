import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recipientsOf, settle, targetsOf, type Prefs, type SubscriptionRow } from '../plan.ts';

const MEMBERS = ['john', 'alex', 'lea'];
const NO_PREFS = new Map<string, Prefs>();

const sub = (id: string, user: string): SubscriptionRow => ({
  id,
  user_id: user,
  endpoint: `https://web.push.apple.com/${id}`,
  p256dh: 'k',
  auth: 'a',
});

const ok = { status: 201, ok: true, gone: false, detail: null };
const gone = { status: 410, ok: false, gone: true, detail: 'expired' };
const busy = { status: 503, ok: false, gone: false, detail: 'indisponible' };
const refused = { status: 403, ok: false, gone: false, detail: 'vapid' };

describe('qui est prévenu', () => {
  it('tout le club sauf l’auteur du geste', () => {
    assert.deepEqual(
      recipientsOf({ kind: 'call_new', actor: 'john', recipients: null }, MEMBERS, NO_PREFS),
      ['alex', 'lea'],
    );
  });

  it('respecte un réglage décoché, et seulement celui-là', () => {
    const prefs = new Map<string, Prefs>([['alex', { calls: false, nights: true }]]);
    assert.deepEqual(
      recipientsOf({ kind: 'call_closed', actor: 'john', recipients: null }, MEMBERS, prefs),
      ['lea'],
    );
    assert.deepEqual(
      recipientsOf({ kind: 'night_new', actor: 'john', recipients: null }, MEMBERS, prefs),
      ['alex', 'lea'],
    );
  });

  it('un rappel sans auteur va à tout le club', () => {
    assert.deepEqual(
      recipientsOf(
        { kind: 'night_reminder', actor: null, recipients: null },
        MEMBERS,
        NO_PREFS,
      ),
      MEMBERS,
    );
  });

  it('un fait adressé ne va qu’à ses destinataires, s’ils sont encore membres', () => {
    assert.deepEqual(
      recipientsOf(
        { kind: 'oracle_resolved', actor: null, recipients: ['lea', 'parti'] },
        MEMBERS,
        NO_PREFS,
      ),
      ['lea'],
    );
  });

  it('retrouve les appareils des destinataires', () => {
    const subs = [sub('a', 'john'), sub('b', 'lea'), sub('c', 'lea')];
    assert.deepEqual(
      targetsOf(['lea'], subs).map((s) => s.id),
      ['b', 'c'],
    );
  });
});

describe('ce qu’on retient d’un envoi', () => {
  const targets = [sub('a', 'john'), sub('b', 'lea'), sub('c', 'lea')];

  it('envoyé, avec les abonnements expirés à oublier', () => {
    const result = settle({ attempts: 1 }, targets, [ok, gone, refused]);
    assert.equal(result.done, true);
    assert.deepEqual(result.gone, ['b']);
    assert.match(
      result.report,
      /^1\/3 appareil\(s\) · 1 abonnement\(s\) expiré\(s\) · échecs : 403 vapid$/,
    );
  });

  it('retenté si tout a échoué pour une raison passagère', () => {
    assert.equal(settle({ attempts: 1 }, targets, [busy, busy, busy]).done, false);
    assert.equal(
      settle({ attempts: 5 }, targets, [busy, busy, busy]).done,
      true,
      'pas au-delà de cinq',
    );
  });

  it('pas retenté si un appareil l’a reçu : il sonnerait deux fois', () => {
    assert.equal(settle({ attempts: 1 }, targets, [ok, busy, busy]).done, true);
  });

  it('personne à prévenir : fait clos', () => {
    const result = settle({ attempts: 1 }, [], []);
    assert.deepEqual(result, { done: true, report: '0/0 appareil(s)', gone: [] });
  });
});
