const CACHE = 'glucoreg-v2';
const ASSETS = ['/','/style.css?v=2','/shared.js?v=2','/glucose.html','/pressure.html','/import.html','/dashboard.html','/admin.html','/profile.html','/favicon.svg','/icon.svg','/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
