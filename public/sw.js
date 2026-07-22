// Minimal service worker — caches ONLY the immutable build assets so the app's
// JS/CSS/fonts load from cache instantly when you reopen the PWA (no bundle
// re-download over cellular). Pages, RSC payloads and API calls are never
// cached, so there is zero risk of stale content. New deploys ship new hashed
// filenames → fetched fresh; old caches are pruned on activate.
const CACHE = 'iris-static-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Same-origin immutable assets only: Next build output + fonts.
  const cacheable =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') || /\.(woff2?|ttf|otf)$/.test(url.pathname));
  if (!cacheable) return; // pages / RSC / API → straight to network (always fresh)

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    }),
  );
});
