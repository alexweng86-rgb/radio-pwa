var CACHE_NAME = 'dnb-radio-v12';

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  var path = url.pathname;
  if (path.indexOf('/radio-pwa/') !== 0) return;
  e.respondWith(
    fetch(e.request).catch(function() {
      if (e.request.mode === 'navigate') {
        return fetch('/radio-pwa/index.html');
      }
      return new Response('', { status: 404 });
    })
  );
});
