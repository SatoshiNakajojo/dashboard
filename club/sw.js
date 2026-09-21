/* Satoshi Social Club — service worker.
 *
 * Deux stratégies, et la distinction compte :
 *
 *   • la coquille d'app (HTML, bundle, CSS) en RÉSEAU D'ABORD — on ne sert le
 *     cache qu'en secours hors-ligne. Sans cela, une PWA iOS reste bloquée des
 *     semaines sur une version périmée ;
 *   • les fichiers versionnés par empreinte (bundles `_expo/static/...`,
 *     polices, images) en CACHE D'ABORD — leur URL change à chaque
 *     modification, donc un cache ne peut pas devenir périmé.
 *
 * Les API (Supabase, CoinGecko, Yahoo) ne sont JAMAIS mises en cache : une
 * réponse figée y serait un prix faux.
 *
 * Pas de `skipWaiting()` : activer de force à chaque installation déclenche
 * `controllerchange` → rechargement en boucle sur iOS. La nouvelle version
 * attend et prend la main à la prochaine ouverture.
 */

const CACHE = 'ssc-shell-v1';

/** Ressources à empreinte : leur URL change quand leur contenu change. */
const IMMUTABLE_RE = /\/_expo\/static\/|\.(woff2?|ttf|otf|wasm|png|jpe?g|svg|ico)(\?|$)/;

/** Rien de tout cela ne doit être servi depuis un cache. */
function isApi(url) {
  return (
    /(^|\.)supabase\.co$/.test(url.hostname) ||
    /(^|\.)coingecko\.com$/.test(url.hostname) ||
    /(^|\.)yahoo\.com$/.test(url.hostname) ||
    /(^|\.)mempool\.space$/.test(url.hostname)
  );
}

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE;
            })
            .map(function (key) {
              return caches.delete(key);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

/** Met en cache une réponse valable, sans faire échouer la requête si ça rate. */
function put(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return response;
  const copy = response.clone();
  caches.open(CACHE).then(function (cache) {
    cache.put(request, copy).catch(function () {});
  });
  return response;
}

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isApi(url)) return; // réseau seul, pas d'interception
  if (url.origin !== self.location.origin) return;

  // Ressources à empreinte : cache d'abord.
  if (IMMUTABLE_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(function (hit) {
        return (
          hit ||
          fetch(request).then(function (response) {
            return put(request, response);
          })
        );
      }),
    );
    return;
  }

  // Coquille d'app : réseau d'abord, cache en secours.
  event.respondWith(
    fetch(request)
      .then(function (response) {
        return put(request, response);
      })
      .catch(function () {
        return caches.match(request).then(function (hit) {
          // Une navigation hors-ligne retombe sur la coquille : l'app est une
          // SPA, toutes ses routes sont servies par le même document.
          return hit || (request.mode === 'navigate' ? caches.match('./') : undefined);
        });
      }),
  );
});

/** Permet à l'app de forcer l'activation d'une version en attente, si besoin. */
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
