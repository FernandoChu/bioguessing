// Offline-first cache for BioGuessing, so repeat visits don't depend on the host's speed.
// - Pages, scripts, styles, tree data, d3 and fonts: served from cache immediately and refreshed
//   in the background (stale-while-revalidate). The first visit after a deploy may show the old
//   data; bump VERSION when deploying to switch everyone over on their next load instead.
// - Photos (iNaturalist, Wikimedia Commons): cache-first, keeping the most recent MAX_PHOTOS.
const VERSION = "bg-v2";
const SHELL = `${VERSION}-shell`;
const PHOTOS = "bg-photos";
const MAX_PHOTOS = 400; // medium photos are ~100 KB, so about 40 MB at most

const PRECACHE = [
  "./", "index.html", "radial.html", "sunburst.html", "hyperbolic.html", "strip.html", "clade-atlas.html",
  "shared/style.css", "shared/data.js", "shared/ui.js", "data/tree.js",
  "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js",
];
const SHELL_HOSTS = new Set([self.location.host, "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"]);
const PHOTO_HOSTS = new Set(["inaturalist-open-data.s3.amazonaws.com", "upload.wikimedia.org"]);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // one missing file should not stop the rest from being cached
    await Promise.allSettled(PRECACHE.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.endsWith("-shell") && n !== SHELL).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (PHOTO_HOSTS.has(url.host)) event.respondWith(cacheFirst(req));
  else if (SHELL_HOSTS.has(url.host)) event.respondWith(staleWhileRevalidate(req, event));
});

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(req, { ignoreSearch: true });
  const fresh = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  if (cached) {
    event.waitUntil(fresh.catch(() => {}));
    return cached;
  }
  return fresh;
}

async function cacheFirst(req) {
  const cache = await caches.open(PHOTOS);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") {
    await cache.put(req, res.clone());
    trim(cache);
  }
  return res;
}

async function trim(cache) {
  const keys = await cache.keys(); // oldest first
  for (let i = 0; i < keys.length - MAX_PHOTOS; i++) await cache.delete(keys[i]);
}
