/* JCGI Service Worker — #90
   Stratégie NETWORK-FIRST pour la coquille d'app (index.html, app.jsx, seeds.js,
   manifest) : on tente toujours le réseau d'abord et on ne sert le cache qu'en
   secours hors-ligne. Fini les PWA iOS bloqués sur une version en cache.
   Les librairies CDN versionnées (unpkg) restent en cache-first (URLs stables).

   #90 — L'API du worker Cloudflare (*.workers.dev, ex. /read, /write-bases) est
   désormais en RÉSEAU SEUL, JAMAIS mise en cache. Avant, étant cross-origin, elle
   tombait dans la branche « autres ressources » cache-first : le PC servait alors
   éternellement une ancienne réponse /read en cache et n'adoptait jamais le cash
   matelas modifié sur un autre appareil. */
var CACHE = "jcgi-shell-v3"; // #140 bump v3 : purge l'ancien SW « skipWaiting » qui rechargeait en boucle
var SHELL_RE = /\/(index\.html|app\.jsx|seeds\.js|manifest\.json)(\?|$)/;

// Domaines d'API à ne JAMAIS mettre en cache (toujours réseau)
function isApi(url) {
  return /(^|\.)workers\.dev$/.test(url.hostname);
}

self.addEventListener("install", function (e) {
  // #140 — NE PLUS appeler skipWaiting() ici : l'activation forcée à chaque install déclenchait
  // controllerchange → location.reload() en boucle (app qui « se recharge toute seule » ~5 min sur iOS).
  // La nouvelle version attend en « waiting » et s'active à la prochaine ouverture (ou via SKIP_WAITING manuel).
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // #90 — API du worker : réseau SEUL, jamais de cache (ni lecture ni écriture du cache).
  if (isApi(url)) {
    e.respondWith(fetch(req));
    return;
  }

  var sameOrigin = (url.origin === self.location.origin);
  var isShell = sameOrigin && (SHELL_RE.test(url.pathname + url.search) || req.mode === "navigate");

  if (isShell) {
    // NETWORK-FIRST : toujours la dernière version, cache en secours
    e.respondWith(
      fetch(req).then(function (res) {
        try { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); } catch (x) {}
        return res;
      }).catch(function () {
        return caches.match(req).then(function (c) { return c || caches.match("index.html"); });
      })
    );
    return;
  }

  // Autres ressources (CDN versionnées, images…) : cache-first
  e.respondWith(
    caches.match(req).then(function (c) {
      return c || fetch(req).then(function (res) {
        try { if (url.protocol.startsWith("http")) { var cp = res.clone(); caches.open(CACHE).then(function (cc) { cc.put(req, cp); }); } } catch (x) {}
        return res;
      });
    })
  );
});

// Permet à la page de forcer l'activation d'une nouvelle version
self.addEventListener("message", function (e) {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});
