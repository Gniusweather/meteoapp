/* RWCAPP service worker v20 — full single-file app */
const CACHE = 'rwcapp-shell-v20';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon.svg', './sw.js'];
const LIVE_HOSTS = [
  'tgftp.nws.noaa.gov','aviationweather.gov','api.open-meteo.com','marine-api.open-meteo.com',
  'api.allorigins.win','corsproxy.io','r.jina.ai','www.ogimet.com','www.knmidc.org',
  'www.nhc.noaa.gov','api.adsb.lol','adsb.lol','globe.adsbexchange.com','opendata.adsb.fi',
  'api.rainviewer.com','tilecache.rainviewer.com','server.arcgisonline.com',
  'basemaps.cartocdn.com','tile.openstreetmap.org','fonts.googleapis.com','fonts.gstatic.com',
  'd.liveatc.net','www.liveatc.net','unpkg.com'
];
function isLive(url){ return LIVE_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.'+h)); }
function isHtml(req, url){
  if (req.mode === 'navigate') return true;
  if (url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) return true;
  return (req.headers.get('accept')||'').includes('text/html');
}
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(PRECACHE.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isLive(url)) return;
  const same = url.origin === self.location.origin;
  if (!same && url.hostname !== 'unpkg.com') return;
  if (same && isHtml(req, url)) { e.respondWith(networkFirst(req)); return; }
  e.respondWith(cacheFirst(req));
});
async function networkFirst(req){
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    return (await cache.match(req)) || (await cache.match('./index.html')) || Promise.reject(err);
  }
}
async function cacheFirst(req){
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) {
    fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); }).catch(()=>{});
    return hit;
  }
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}
