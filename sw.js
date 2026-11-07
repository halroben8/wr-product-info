/* Grapevine service worker — offline support (Version 2026.11.04.28).
   Strategy:
   - The app page (index.html / the site root): network-first. Online,
     the freshest copy always wins and a copy is kept in the cache;
     offline, the kept copy opens — so Grapevine works with no
     connection, and a new version still shows up promptly when
     there IS a connection (no worse than the 10-minute HTTP cache
     the page already had).
   - Icons and the PDF documents (manual + impact PDFs): cache-first,
     refreshed in the background, so they open offline after the
     first view.
   - Everything else (above all the Supabase shared list at
     supabase.co) is never touched: data always goes to the network,
     and offline data changes are the app page's own outbox's job,
     not this worker's.
   The cache name carries the app version: shipping a new version =
   a new worker file = old caches are deleted on activate. */
var CACHE = 'grapevine-v2026.11.04.29';
var CORE = ['./', './index.html', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(CORE); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        return k.indexOf('grapevine-') === 0 && k !== CACHE ? caches.delete(k) : null;
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return; /* Supabase etc.: straight to network */

  if(req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')){
    /* App page: network-first, cached copy as the offline fallback */
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put('./index.html', copy); });
        return res;
      }).catch(function(){
        return caches.match('./index.html', { ignoreSearch: true });
      })
    );
    return;
  }

  /* Same-origin files (icons, PDFs): cache-first, refresh behind */
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function(hit){
      var net = fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    })
  );
});
