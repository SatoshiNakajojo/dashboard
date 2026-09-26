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

  // Une navigation dans l'app — recharger `…/club/oracle`, rouvrir sur
  // `…/club/bag` : c'est toujours la coquille qu'il faut servir. L'app est une
  // SPA, et GitHub Pages ne connaît que `index.html` : il répondait par sa page
  // 404 à toute autre adresse. Le routeur lit ensuite l'adresse et affiche
  // l'onglet.
  if (request.mode === 'navigate') {
    const shell = new Request(self.registration.scope);
    event.respondWith(
      fetch(shell)
        .then(function (response) {
          if (response.ok) return put(shell, response);
          return caches.match(shell).then(function (hit) {
            return hit || response;
          });
        })
        .catch(function () {
          return caches.match(shell).then(function (hit) {
            return hit || caches.match('./');
          });
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

/*
 * Une notification du club arrive, déjà déchiffrée par le navigateur : titre,
 * texte, lien et étiquette (voir `supabase/functions/_shared/notifyMessages.ts`).
 *
 * Elle s'affiche **toujours** : l'abonnement promet `userVisibleOnly`, et un
 * push reçu sans notification visible fait révoquer l'abonnement par Safari.
 */
self.addEventListener('push', function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_error) {
    // Un message qui n'est pas du JSON s'affiche tel quel, plutôt que rien.
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Satoshi Social Club', {
      body: data.body || '',
      icon: 'icon-192.png',
      // Deux notifications de même étiquette se remplacent : le rappel d'une
      // soirée prend la place de son annonce.
      tag: data.tag || undefined,
      data: { url: data.url || './' },
    }),
  );
});

/**
 * La dernière notification touchée, gardée pour l'app.
 *
 * Mise en veille par iOS, l'app ne se recharge pas quand on touche une
 * notification : elle reprend l'écran tel qu'on l'avait laissé, et ni le
 * message ni la navigation ci-dessous n'arrivent toujours. Elle relit donc
 * cette entrée en revenant au premier plan (`src/lib/appRefresh.ts`).
 */
const PENDING_OPEN = './__club-open';

function rememberOpen(target) {
  return caches
    .open(CACHE)
    .then(function (cache) {
      return cache.put(
        PENDING_OPEN,
        new Response(JSON.stringify({ url: target, at: Date.now() }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    })
    .catch(function () {});
}

/** Toucher la notification ouvre l'onglet dont elle parle — dans l'app si elle est ouverte. */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  const target = new URL(url, self.registration.scope).href;

  event.waitUntil(
    rememberOpen(target)
      .then(function () {
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      })
      .then(function (list) {
        const open = list.find(function (client) {
          return client.url.indexOf(self.registration.scope) === 0;
        });
        // On ouvre toujours l'accueil de l'app, que GitHub Pages sait servir ;
        // l'app lit ensuite la notification gardée et va à son écran.
        if (!open) return self.clients.openWindow(self.registration.scope);
        // L'app était en veille : elle relit ses données et va à l'écran dit,
        // même si la navigation ci-dessous est refusée.
        try {
          open.postMessage({ type: 'club:open', url: target });
        } catch (_error) {
          // L'entrée gardée prendra le relais au retour au premier plan.
        }
        // Le focus peut être refusé (pas d'activation) : on navigue quand même.
        return open
          .focus()
          .catch(function () {
            return open;
          })
          .then(function (client) {
            return client && 'navigate' in client
              ? client.navigate(self.registration.scope).catch(function () {
                  return client;
                })
              : client;
          });
      }),
  );
});
