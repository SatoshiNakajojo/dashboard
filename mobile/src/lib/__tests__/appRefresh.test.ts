import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PENDING_OPEN_TTL_MS,
  RESUME_AFTER_MS,
  appBaseOf,
  bundleOf,
  isOpenMessage,
  pendingRoute,
  readAppRefresh,
  refreshAppData,
  routeForNotification,
  shouldRefreshOnResume,
  subscribeToAppRefresh,
} from '@/lib/appRefresh';

const BASE = 'https://satoshinakajojo.github.io/dashboard/club/';

describe('actualiser l’app', () => {
  it('prévient chaque écran, jusqu’à ce qu’il se désabonne', () => {
    const before = readAppRefresh();
    let calls = 0;
    const stop = subscribeToAppRefresh(() => {
      calls += 1;
    });
    refreshAppData();
    assert.equal(readAppRefresh(), before + 1);
    assert.equal(calls, 1);
    stop();
    refreshAppData();
    assert.equal(calls, 1);
  });

  it('relit au retour après une vraie absence, pas après un aller-retour', () => {
    const now = 1_000_000;
    assert.equal(shouldRefreshOnResume(null, now), false);
    assert.equal(shouldRefreshOnResume(now - 3_000, now), false);
    assert.equal(shouldRefreshOnResume(now - RESUME_AFTER_MS, now), true);
    assert.equal(shouldRefreshOnResume(now - 5 * 60_000, now), true);
  });
});

describe('le toucher d’une notification', () => {
  it('mène à l’onglet dont elle parle', () => {
    assert.equal(routeForNotification(BASE, BASE), '/');
    assert.equal(routeForNotification(`${BASE}bag`, BASE), '/bag');
    assert.equal(routeForNotification(`${BASE}oracle/`, BASE), '/oracle');
    assert.equal(routeForNotification(`${BASE}index`, BASE), '/');
    assert.equal(
      routeForNotification('https://satoshinakajojo.github.io/dashboard/club', BASE),
      '/',
    );
    // Un lien relatif, comme ceux des messages.
    assert.equal(routeForNotification('./bag', BASE), '/bag');
  });

  it('ne sort pas de l’app', () => {
    assert.equal(routeForNotification('https://example.com/dashboard/club/bag', BASE), null);
    assert.equal(routeForNotification('https://satoshinakajojo.github.io/desk/', BASE), null);
    assert.equal(routeForNotification('pas une url', 'pas une base'), null);
  });

  it('reconnaît le message du service worker', () => {
    assert.equal(isOpenMessage({ type: 'club:open', url: `${BASE}bag` }), true);
    assert.equal(isOpenMessage({ type: 'club:open' }), false);
    assert.equal(isOpenMessage('SKIP_WAITING'), false);
    assert.equal(isOpenMessage(null), false);
  });

  it('suit la notification gardée tant qu’elle est récente', () => {
    const now = 5_000_000;
    assert.equal(pendingRoute({ url: `${BASE}oracle`, at: now - 1_000 }, BASE, now), '/oracle');
    assert.equal(
      pendingRoute({ url: `${BASE}oracle`, at: now - PENDING_OPEN_TTL_MS - 1 }, BASE, now),
      null,
    );
    assert.equal(pendingRoute({ url: `${BASE}oracle` }, BASE, now), null);
    assert.equal(pendingRoute('oracle', BASE, now), null);
  });
});

describe('une nouvelle version en ligne', () => {
  const script = `${BASE}_expo/static/js/web/entry-8723920ba353112dec5f99833922a12e.js`;

  it('se reconnaît à son bundle', () => {
    assert.equal(bundleOf(script), 'entry-8723920ba353112dec5f99833922a12e.js');
    const html = `<!doctype html><script src="/dashboard/club/_expo/static/js/web/entry-0f1e.js" defer></script>`;
    assert.equal(bundleOf(html), 'entry-0f1e.js');
    assert.equal(bundleOf('<html></html>'), null);
  });

  it('se lit à l’adresse d’où vient le bundle', () => {
    assert.equal(appBaseOf(script), BASE);
    assert.equal(appBaseOf('https://example.com/app.js'), null);
  });
});
