/**
 * `npm run members:add` : les adresses qu'on colle, et ce que Supabase répond.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interpretCreate, keyKind, memberRows, parseEmails } from '../members.mjs';

describe('adresses collées', () => {
  it('accepte espaces, virgules, points-virgules et majuscules', () => {
    const { valid, invalid } = parseEmails(['Alex@Mail.com,', 'lea@x.nc;sofia@y.fr', ' marco@z.com ']);
    assert.deepEqual(valid, ['alex@mail.com', 'lea@x.nc', 'sofia@y.fr', 'marco@z.com']);
    assert.deepEqual(invalid, []);
  });

  it('retire les doublons', () => {
    assert.deepEqual(parseEmails(['a@b.com', 'A@B.com']).valid, ['a@b.com']);
  });

  it('met de côté ce qui n’est pas une adresse', () => {
    const { valid, invalid } = parseEmails(['alex', 'lea@x.nc', 'sofia@', '<rayan@z.com>']);
    assert.deepEqual(valid, ['lea@x.nc', 'rayan@z.com']);
    assert.deepEqual(invalid, ['alex', 'sofia@']);
  });
});

describe('réponse de Supabase', () => {
  it('compte créé', () => {
    assert.equal(interpretCreate(200, { id: 'x' }).kind, 'created');
  });

  it('adresse déjà inscrite : pas une erreur', () => {
    // Relancer la commande avec la même liste doit être sans danger.
    assert.equal(interpretCreate(422, { error_code: 'email_exists' }).kind, 'exists');
    assert.equal(
      interpretCreate(422, { msg: 'A user with this email address has already been registered' }).kind,
      'exists',
    );
  });

  it('clé refusée : le dit en clair', () => {
    const r = interpretCreate(401, { message: 'Invalid API key' });
    assert.equal(r.kind, 'error');
    assert.match(r.detail, /service_role/);
  });

  it('réseau coupé', () => {
    assert.match(interpretCreate(0, null).detail, /injoignable/);
  });
});

describe('tableau des membres', () => {
  it('dit qui a créé son profil', () => {
    const rows = memberRows(
      [
        { id: '2', email: 'Lea@x.nc', last_sign_in_at: null },
        { id: '1', email: 'john@x.nc', last_sign_in_at: '2026-09-20T10:00:00Z' },
      ],
      [{ id: '1', display_name: 'John' }],
    );
    assert.deepEqual(rows, [
      { email: 'john@x.nc', name: 'John', lastSignIn: '2026-09-20T10:00:00Z' },
      { email: 'lea@x.nc', name: null, lastSignIn: null },
    ]);
  });
});

describe('clé Supabase', () => {
  const jwt = (role) =>
    `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`;

  it('reconnaît la clé secrète, ancien et nouveau format', () => {
    assert.equal(keyKind(jwt('service_role')), 'secret');
    assert.equal(keyKind('sb_secret_abc'), 'secret');
  });

  it('reconnaît la clé publique, qui ne suffit pas', () => {
    assert.equal(keyKind(jwt('anon')), 'public');
    assert.equal(keyKind('sb_publishable_abc'), 'public');
  });

  it('signale une clé absente', () => {
    assert.equal(keyKind(''), 'missing');
    assert.equal(keyKind(undefined), 'missing');
  });
});
