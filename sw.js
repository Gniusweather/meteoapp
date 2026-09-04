/* RWCAPP service worker
   v14 — small precache, network-first HTML so deploys show up fast. */
const CACHE = 'rwcapp-shell-v14';

// Only the files needed to boot. Optional images / Leaflet are cached on demand.
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg'
];

const LIVE_HOSTS = [
  'tgftp.nws.noaa.gov',
  'aviationweather.gov',
  'api.open-meteo.com',
  'marine-api.open-meteo.com',
  'api.allorigins.win',
  'corsproxy.io',
  'r.jina.ai',
  'www.ogimet.com',
  'www.knmidc.org',
  'www.nhc.noaa.gov',
  'api.adsb.lol',
  'opendata.adsb.fi',
  'api.rainviewer.com',
  'tilecache.rainviewer.com',
  'server.arcgisonline.com',
  'basemaps.cartocdn.com',
  'tile.openstreetmap.org',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'd.liveatc.net'
];

function isLiveRequest(url) {
  return LIVE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
}

function isHtmlRequest(req, url) {
  if (req.mode === 'navigate') return true;
  if (url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) return true;
  const accept = req.headers.get('accept') || '';
  return accept.includes('text/html');
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Weather / traffic / fonts / tiles — never intercept (stay fresh, no SW delay)
  if (isLiveRequest(url)) return;

  const sameOrigin = url.origin === self.location.origin;
  const isLeaflet = url.hostname === 'unpkg.com';
  if (!sameOrigin && !isLeaflet) return;

  // App HTML: network first so a new GitHub Pages deploy wins immediately
  if (sameOrigin && isHtmlRequest(req, url)) {
    e.respondWith(networkFirst(req));
    return;
  }

  // Static shell + Leaflet: cache first, refresh in background
  e.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const hit = await cache.match(req) || await cache.match('./index.html') || await cache.match('./');
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) {
    fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
    }).catch(() => {});
    return hit;
  }
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}
