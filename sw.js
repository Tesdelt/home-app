// Service worker: offline cache. Při každém nasazení zvýšit VERSION
// (a APP_VERSION v js/config.js) a nové soubory doplnit do ASSETS.
const VERSION = '0.4.0';
const CACHE = `home-app-v${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/router.js',
  'js/db.js',
  'js/store.js',
  'js/categories.js',
  'js/catalog.js',
  'js/config.js',
  'js/ui.js',
  'js/dates.js',
  'js/supabase.js',
  'js/auth.js',
  'js/sync.js',
  'js/vendor/supabase.js',
  'js/views/login.js',
  'js/views/home.js',
  'js/views/shopping.js',
  'js/views/tasks.js',
  'js/views/money.js',
  'js/views/more.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' obejde HTTP cache prohlížeče, ať se nestáhne stará verze
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('home-app-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch (err) {
      if (request.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
