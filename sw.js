// Service worker: app shell cache-first; reference data network-first with
// a cached fallback so the app keeps working offline.
// Bump CACHE on every deploy-worthy change.
const CACHE = 'ep-v1';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'styles/app.css',
  'vendor/chart.umd.min.js',
  'assets/fonts/inter-latin-wght-normal.woff2',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'src/app.js',
  'src/state.js',
  'src/storage.js',
  'src/data.js',
  'src/reference.js',
  'src/engine/time.js',
  'src/engine/load.js',
  'src/engine/pvgis.js',
  'src/engine/tariff.js',
  'src/engine/simulate.js',
  'src/engine/finance.js',
  'src/engine/scenario.js',
  'src/ui/dom.js',
  'src/ui/charts.js',
  'src/ui/home.js',
  'src/ui/modeller.js',
  'src/ui/compare.js',
  'src/ui/about.js',
  'data/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/data/')) {
    // Network first so monthly data refreshes arrive; cache for offline.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    })),
  );
});
