/* JCGI Service Worker — #88
   Stratégie NETWORK-FIRST pour la coquille d'app (index.html, app.jsx, seeds.js,
   manifest) : on tente toujours le réseau d'abord et on ne sert le cache qu'en
   secours hors-ligne. Fini les PWA iOS bloqués sur une version en cache.
   Les librairies CDN versionnées (unpkg) restent en cache-first (URLs stables). */
var CACHE = "jcgi-shell-v1";
var SHELL_RE = /\/(index\.html|app\.jsx|seeds\.js|manifest\.json)(\?|$)/;

self.addEventListener("install", function (e) {
  self.skipWaiting(); // activer immédiatement la nouvelle version
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
