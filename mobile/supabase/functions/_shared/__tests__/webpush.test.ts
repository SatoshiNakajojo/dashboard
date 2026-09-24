/**
 * Le chiffrement Web Push, recoupé de deux façons :
 *
 *   • le vecteur de test de la RFC 8291 (§5), rejoué octet pour octet ;
 *   • un déchiffrement écrit ici avec `node:crypto` — une autre implémentation
 *     que le WebCrypto du module — comme le ferait le navigateur.
 *
 * Un défaut de chiffrement ne lève rien côté serveur : Apple et Google
 * acceptent le message, et c'est le téléphone qui le jette en silence.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';

import {
  b64urlDecode,
  b64urlEncode,
  encrypt,
  importLocalKeys,
  isPushEndpoint,
  sendPush,
  vapidAuthorization,
} from '../webpush.ts';

/** Ce que fait le navigateur à la réception — RFC 8291 §3.4, avec node:crypto. */
function decrypt(body: Uint8Array, ua: crypto.ECDH, authSecret: Buffer): string {
  const buf = Buffer.from(body);
  const salt = buf.subarray(0, 16);
  const idlen = buf[20]!;
  const asPublic = buf.subarray(21, 21 + idlen);
  const ciphertext = buf.subarray(21 + idlen);

  const shared = ua.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16),
  );
  const nonce = Buffer.from(
    crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12),
  );

  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const record = Buffer.concat([
    decipher.update(ciphertext.subarray(0, ciphertext.length - 16)),
    decipher.final(),
  ]);
  assert.equal(record[record.length - 1], 2, 'délimiteur du dernier enregistrement');
  return record.subarray(0, record.length - 1).toString('utf8');
}

describe('chiffrement aes128gcm', () => {
  it('rejoue le vecteur de la RFC 8291', async () => {
    const body = await encrypt(
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      b64urlDecode(
        'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      ),
      b64urlDecode('BTBZMqHH6r4Tts7J_aSIgg'),
      {
        salt: b64urlDecode('DGv6ra1nlYgDCS1FRnbzlw'),
        local: await importLocalKeys(
          b64urlDecode('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
          b64urlDecode(
            'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
          ),
        ),
      },
    );
    assert.equal(
      b64urlEncode(body),
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('se déchiffre côté appareil, accents et symboles compris', async () => {
    const ua = crypto.createECDH('prime256v1');
    ua.generateKeys();
    const auth = crypto.randomBytes(16);
    const message = JSON.stringify({
      title: 'Ce soir · Crypto Night',
      body: 'Rooftop — Alex, 19 h 30. ₿',
    });

    const body = await encrypt(
      new TextEncoder().encode(message),
      new Uint8Array(ua.getPublicKey()),
      new Uint8Array(auth),
    );
    assert.equal(decrypt(body, ua, auth), message);
  });

  it('refuse un message trop long pour un seul enregistrement', async () => {
    const ua = crypto.createECDH('prime256v1');
    ua.generateKeys();
    await assert.rejects(
      encrypt(new Uint8Array(4090), new Uint8Array(ua.getPublicKey()), new Uint8Array(16)),
      /trop long/,
    );
  });
});

describe('signature VAPID', () => {
  it('produit un JWT ES256 vérifiable, pour l’origine du service de push', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = privateKey.export({ format: 'jwk' });
    const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-65);

    const now = Date.UTC(2026, 8, 24, 3);
    const header = await vapidAuthorization(
      'https://web.push.apple.com/QGuQyavXutnMH',
      {
        publicKey: b64urlEncode(new Uint8Array(raw)),
        privateKey: jwk.d!,
        subject: 'https://satoshinakajojo.github.io/dashboard/club/',
      },
      now,
    );

    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    assert.ok(m, header);
    const verified = crypto.verify(
      'sha256',
      Buffer.from(`${m[1]}.${m[2]}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(b64urlDecode(m[3]!)),
    );
    assert.ok(verified, 'signature valide');

    const claims = JSON.parse(Buffer.from(b64urlDecode(m[2]!)).toString('utf8'));
    assert.equal(claims.aud, 'https://web.push.apple.com');
    assert.equal(claims.exp, now / 1000 + 12 * 3600);
    assert.equal(m[4], b64urlEncode(new Uint8Array(raw)));
  });
});

describe('envoi', () => {
  it('n’écrit qu’aux services de push connus', () => {
    assert.ok(isPushEndpoint('https://web.push.apple.com/QGuQ'));
    assert.ok(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
    assert.ok(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'));
    assert.ok(!isPushEndpoint('http://web.push.apple.com/x'), 'HTTPS seulement');
    assert.ok(!isPushEndpoint('https://evil.example.com/push.apple.com'));
    assert.ok(!isPushEndpoint('https://push.apple.com.evil.example/x'));
    assert.ok(!isPushEndpoint('pas une adresse'));
  });

  it('signale un abonnement disparu (410) pour qu’on l’oublie', async () => {
    const ua = crypto.createECDH('prime256v1');
    ua.generateKeys();
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    let seen: { url: string; init: RequestInit } | null = null;
    const outcome = await sendPush(
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        p256dh: b64urlEncode(new Uint8Array(ua.getPublicKey())),
        auth: b64urlEncode(new Uint8Array(crypto.randomBytes(16))),
      },
      { title: 't' },
      {
        publicKey: b64urlEncode(
          new Uint8Array(publicKey.export({ format: 'der', type: 'spki' }).subarray(-65)),
        ),
        privateKey: privateKey.export({ format: 'jwk' }).d!,
        subject: 'https://example.com',
      },
      {
        fetchImpl: (async (url: string, init: RequestInit) => {
          seen = { url, init };
          return new Response('expired', { status: 410 });
        }) as typeof fetch,
      },
    );
    assert.deepEqual(
      { status: outcome.status, ok: outcome.ok, gone: outcome.gone },
      { status: 410, ok: false, gone: true },
    );
    const headers = seen!.init.headers as Record<string, string>;
    assert.equal(headers['content-encoding'], 'aes128gcm');
    assert.equal(headers.ttl, '86400');
    assert.match(headers.authorization!, /^vapid t=.+, k=/);
  });
});
