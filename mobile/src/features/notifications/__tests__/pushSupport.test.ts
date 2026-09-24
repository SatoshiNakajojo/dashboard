import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { keyToBytes, pushSupportOf, sameKey } from '@/features/notifications/pushSupport';

const all = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  isIos: false,
  standalone: false,
};

describe('ce que l’appareil permet', () => {
  it('un navigateur de bureau ou Android : prêt, même dans un onglet', () => {
    assert.equal(pushSupportOf(all), 'ready');
  });

  it('iPhone dans Safari : il faut d’abord ajouter l’app à l’écran d’accueil', () => {
    // Safari n'expose même pas l'API dans un onglet.
    assert.equal(
      pushSupportOf({ ...all, isIos: true, hasPushManager: false, hasNotification: false }),
      'needs-install',
    );
    // Et un navigateur iOS qui l'exposerait n'en délivrerait pas pour autant.
    assert.equal(pushSupportOf({ ...all, isIos: true }), 'needs-install');
  });

  it('iPhone, app ouverte depuis l’écran d’accueil : prêt', () => {
    assert.equal(pushSupportOf({ ...all, isIos: true, standalone: true }), 'ready');
  });

  it('sans service worker ou sans API push : non pris en charge', () => {
    assert.equal(pushSupportOf({ ...all, hasPushManager: false }), 'unsupported');
    assert.equal(pushSupportOf({ ...all, hasServiceWorker: false }), 'unsupported');
  });
});

describe('clé du serveur', () => {
  const key =
    'BFEFid3MPqVfCVlPp8bvkcS6zuMHFf_9nFJXi3yufCPljycvVaiMgKynSBLUXplWW-3joLShZZODL8UhW3aVrTI';

  it('se décode en point P-256 non compressé', () => {
    const bytes = keyToBytes(key);
    assert.equal(bytes.length, 65);
    assert.equal(bytes[0], 4);
  });

  it('reconnaît un abonnement pris avec la même clé, et pas avec une autre', () => {
    const bytes = keyToBytes(key);
    assert.ok(sameKey(bytes.slice().buffer, bytes));
    const other = bytes.slice();
    other[64] = other[64]! ^ 1;
    assert.ok(!sameKey(other.buffer, bytes));
    assert.ok(!sameKey(null, bytes));
  });
});
