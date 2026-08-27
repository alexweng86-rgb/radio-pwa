var CACHE_NAME = 'dnb-radio-v11-no-cache';

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
  if (url.hostname.indexOf('github.io') === -1 &&
      url.hostname.indexOf('githubusercontent') === -1 &&
      url.hostname !== location.hostname) {
    return;
  }
  if (url.pathname.indexOf('/radio-pwa/') !== 0) return;
  e.respondWith(
    fetch(e.request).catch(function() {
      if (e.request.mode === 'navigate') {
        return caches.match('/radio-pwa/index.html');
      }
      return new Response('', { status: 404, statusText: 'Not Found' });
    })
  );
});
