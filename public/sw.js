/* Upside Lab app-shell worker. Data (book, quotes, holdings) lives in
 * IndexedDB + localStorage; this file only keeps the JS/CSS/icons around
 * so a refresh while offline still hydrates the last painted page. */

/* The cache name carries two parts and they move for different reasons.
 * The `v<n>` half is bumped by hand for shell-only changes, exactly as it
 * always was. The hex half is the mark-source hash from
 * src/lib/brand/mark-version.ts: this worker serves /icons/ cache-first,
 * so only a renamed cache makes an installed app drop yesterday's logo,
 * and mark-version.test.ts fails until the hash here matches the mark the
 * icons were drawn from. That turns the "remember to bump CACHE" step of
 * docs/BRAND_MARK.md into one that cannot be forgotten.
 *
 * v13: the mark-source hash joined the name (no visual change).
 *
 * v11: the icons moved to the accent-on-field colourway, so every
 * precached tile changed again.
 *
 * v10: the mark was redrawn (docs/BRAND_MARK.md), so every precached icon
 * changed and the old shell has to go rather than serving yesterday's logo
 * to anyone who already installed.
 *
 * v9: dropped /upside-mark.png from the precache. The header mark is inline
 * SVG now (UpsideLogo.tsx), so precaching a 260 KB PNG nothing requests
 * just cost every install a quarter-megabyte. */
const CACHE = "upside-shell-v13-f93cf950";
const PRECACHE = [
  "/manifest.webmanifest",
  "/upside-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/icon-32.png",
  "/icons/icon-192-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "upside-sync") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: "upside-flush-sync" });
      }
    })
  );
});

function isGet(request) {
  return request.method === "GET";
}

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function skipUrl(url) {
  const path = url.pathname;
  if (path.startsWith("/api/")) return true;
  if (path.startsWith("/auth/")) return true;
  if (path.startsWith("/sw.js")) return true;
  return false;
}

function isStaticAsset(url) {
  const path = url.pathname;
  if (path.startsWith("/_next/static/")) return true;
  if (path.startsWith("/icons/")) return true;
  return /\.(?:js|css|woff2|png|svg|ico|webp|webmanifest)$/.test(path);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) {
    const copy = res.clone();
    const cache = await caches.open(CACHE);
    await cache.put(request, copy);
  }
  return res;
}

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const copy = res.clone();
      const cache = await caches.open(CACHE);
      await cache.put(request, copy);
    }
    return res;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = await caches.match("/");
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!isGet(request)) return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (!sameOrigin(url) || skipUrl(url)) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
