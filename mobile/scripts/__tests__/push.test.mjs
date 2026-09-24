import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  describeStatus,
  generateVapidKeys,
  newNotifySecret,
  projectRefOf,
  upsertEnv,
  validVapidKeys,
} from '../push.mjs';

describe('mise en place des notifications', () => {
  it('lit l’identifiant du projet dans son adresse', () => {
    assert.equal(
      projectRefOf('https://tvfcpjckeploltpeprom.supabase.co'),
      'tvfcpjckeploltpeprom',
    );
    assert.equal(
      projectRefOf('https://tvfcpjckeploltpeprom.supabase.co/'),
      'tvfcpjckeploltpeprom',
    );
    assert.equal(projectRefOf('http://127.0.0.1:54321'), null);
    assert.equal(projectRefOf(''), null);
  });

  it('génère une paire VAPID qui signe et se vérifie', () => {
    const { publicKey, privateKey } = generateVapidKeys();
    assert.ok(validVapidKeys(publicKey, privateKey));

    const pub = Buffer.from(publicKey, 'base64url');
    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      x: pub.subarray(1, 33).toString('base64url'),
      y: pub.subarray(33).toString('base64url'),
    };
    const signature = sign(
      'sha256',
      Buffer.from('vapid'),
      createPrivateKey({ key: { ...jwk, d: privateKey }, format: 'jwk' }),
    );
    assert.ok(
      verify(
        'sha256',
        Buffer.from('vapid'),
        createPublicKey({ key: jwk, format: 'jwk' }),
        signature,
      ),
    );
  });

  it('refuse une clé tronquée au copier-coller', () => {
    const { publicKey, privateKey } = generateVapidKeys();
    assert.ok(!validVapidKeys(publicKey.slice(0, -4), privateKey));
    assert.ok(!validVapidKeys(publicKey, privateKey.slice(1)));
    assert.ok(!validVapidKeys('', ''));
  });

  it('un secret d’appel long et neuf à chaque fois', () => {
    const a = newNotifySecret();
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, newNotifySecret());
  });

  it('pose les clés dans .env sans toucher au reste', () => {
    const before = [
      '# Supabase',
      'EXPO_PUBLIC_SUPABASE_URL=https://x.supabase.co',
      'EXPO_PUBLIC_VAPID_PUBLIC_KEY=ancienne',
      'SUPABASE_SERVICE_ROLE_KEY=secret',
      '',
    ].join('\n');
    const after = upsertEnv(
      before,
      { EXPO_PUBLIC_VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' },
      'Notifications push',
    );
    assert.equal(
      after,
      [
        '# Supabase',
        'EXPO_PUBLIC_SUPABASE_URL=https://x.supabase.co',
        'EXPO_PUBLIC_VAPID_PUBLIC_KEY=pub',
        'SUPABASE_SERVICE_ROLE_KEY=secret',
        '',
        '# Notifications push',
        'VAPID_PRIVATE_KEY=priv',
        '',
      ].join('\n'),
    );
    assert.equal(upsertEnv(after, { VAPID_PRIVATE_KEY: 'priv' }), after, 'rejouable');
  });

  it('traduit le diagnostic de la base', () => {
    const lines = describeStatus({
      configured: true,
      scheduled: false,
      subscriptions: 3,
      pending: 1,
      abandoned: 0,
    });
    assert.deepEqual(
      lines.map((line) => [line.label, line.ok]),
      [
        ['Coffre-fort', true],
        ['Battement', false],
        ['Appareils', true],
        ['File', true],
      ],
    );
    assert.equal(describeStatus(null)[0].ok, false);
  });
});
