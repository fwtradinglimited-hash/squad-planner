// Co-Coach offline support. Keeps a copy of the app's own files (never any
// squad or match data, which lives in the browser's local storage) so the app
// opens instantly and works at a pitch with no signal.
//
// VERSION must match APP_VERSION in index.html (a test checks this). Changing
// it is what makes devices fetch the new files: the new worker downloads them
// in the background and the app offers "Update now" (or uses them next launch).
const VERSION = 'beta 0.23';
const CACHE = 'co-coach-' + VERSION.replace(/\s+/g, '-');
const FONT_CACHE = 'co-coach-fonts';
const APP_FILES = ['./', 'index.html', 'privacy.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_FILES.map(u => new Request(u, {cache: 'reload'})))));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('co-coach-') && k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // feedback reports etc. go straight to the network
  const url = new URL(req.url);

  // The heading font: use the saved copy, refresh it in the background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit || Response.error());
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // App pages and files: the saved copy for this version, so the app always
  // opens (even offline) and never mixes files from two versions.
  event.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, {ignoreSearch: true});
    if (hit) return hit;
    // Anything else (e.g. the beta sign-up page) comes from the network; with
    // no signal, a page request falls back to the app itself.
    try { return await fetch(req); }
    catch (e) { return (req.mode === 'navigate' && await c.match('index.html')) || Response.error(); }
  })());
});
