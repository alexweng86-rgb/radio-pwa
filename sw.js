var CACHE_NAME = 'dnb-radio-v9';
var STATIC_CACHE = 'dnb-static-v9';
var STATIC_ASSETS = [
  './',
  'index.html',
  'style.css',
  'manifest.json',
  'icons/icon-192.svg',
  'icons/icon-512.svg'
];

var PROXY_DOMAINS = [
  'radiorecord.hostingradio.ru',
  'corsproxy.io',
  'somafm.com',
  'dnbfm.ru',
  'radioboss.fm',
  'bitflip.ee',
  'edmdnb.com',
  'the-radio.ru'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== STATIC_CACHE; }).map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

function needsProxy(url) {
  for (var i = 0; i < PROXY_DOMAINS.length; i++) {
    if (url.indexOf(PROXY_DOMAINS[i]) >= 0) return true;
  }
  return false;
}

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  var origin = self.location.origin;

  if (url.indexOf(origin) === 0) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(resp) {
          if (resp && resp.status === 200) {
            var clone = resp.clone();
            caches.open(STATIC_CACHE).then(function(cache) { cache.put(e.request, clone); });
          }
          return resp;
        });
      })
    );
    return;
  }

  if (needsProxy(url)) {
    e.respondWith(
      fetch(e.request).then(function(resp) {
        var headers = new Headers(resp.headers);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Allow-Methods', 'GET, HEAD');
        headers.set('Access-Control-Allow-Headers', '*');
        return new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
          headers: headers
        });
      }).catch(function(err) {
        return fetch(e.request);
      })
    );
    return;
  }
});
