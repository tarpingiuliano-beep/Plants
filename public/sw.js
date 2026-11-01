/* Copia sin conexión: siempre intenta la red primero (así las mejoras llegan solas) y, si no hay internet, usa lo último guardado. */
const CACHE = 'plantas-shell-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(
    // las páginas se revalidan siempre (GitHub Pages las guarda 10 min): así la versión nueva llega al abrir
    fetch(r.mode === 'navigate' ? r.url : r, r.mode === 'navigate' ? { cache: 'no-cache' } : undefined)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(r, copy));
        }
        return res;
      })
      .catch(() => caches.match(r).then((m) => m || caches.match('./'))),
  );
});
