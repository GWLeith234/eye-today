// Eye Today service worker.
//
// A news site must never serve yesterday's front page because a cache said so, so this is deliberately
// modest: every navigation goes to the network, and the cache exists only to put something readable on the
// screen when the phone has no signal. Build output under /_next/static/ is content-hashed and immutable, so
// that alone is cache-first.
//
// Anything that reads or writes a reader's own data — the API, admin, account, sign-in, previews — is not
// touched at all.
//
// To retire this worker, ship a sw.js whose install handler calls self.registration.unregister().

const VERSION = "v1";
const SHELL = `eye-today-${VERSION}`;
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icons/icon-192.png"];

const BYPASS = /^\/(api|admin|account|auth|login|preview)(\/|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (BYPASS.test(url.pathname)) return;

  // Pages: always the network. Offline, show the offline card rather than a browser error.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE).then((hit) => hit ?? Response.error())));
    return;
  }

  // Immutable build output and the app icons.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
