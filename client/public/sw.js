// Afro AI Service Worker
// Strategy:
//  - Navigation requests: network-first, fall back to cached "/" when offline.
//  - Same-origin GET assets (JS, CSS, images, fonts): stale-while-revalidate.
//  - Everything else (POST, cross-origin, /api/*): pass-through, no caching.
//
// Bump CACHE_VERSION on any change to force old clients to refresh.

const CACHE_VERSION = "afroai-v1";
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const PRECACHE = `${CACHE_VERSION}-precache`;

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/")
    || url.pathname.startsWith("/cf-auth/")
    || url.pathname.startsWith("/auth/");
}

function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (isApiRequest(url)) return false;
  return /\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?|ttf|ico|json)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Navigation requests → network-first with offline fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache the latest copy of the shell
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((c) => c || caches.match(req))),
    );
    return;
  }

  // Same-origin static assets → stale-while-revalidate
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // Default: pass-through
});
