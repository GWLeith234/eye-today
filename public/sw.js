// Eye Today service worker.
//
// A news site must never serve yesterday's front page because a cache said so, so this is
// deliberately modest: every navigation goes to the network, and the cache exists only to put
// something readable on the screen when the phone has no signal.
//
// It does NOT cache build output. An earlier version kept every /_next/static/ asset here, which was
// both redundant — those filenames are content-hashed and the browser's own HTTP cache already holds
// them as immutable — and unbounded: this file never changes between deploys, so `activate` never
// re-runs, so nothing was ever evicted and an installed reader accumulated every build ever shipped.
// The only things cached now are the offline card and one icon, which is all the offline case needs.
//
// Anything that reads or writes a reader's own data — the API, admin, account, sign-in, previews —
// is not touched at all.
//
// To retire this worker, ship a sw.js whose `activate` handler deletes every cache, claims the open
// clients and then unregisters — in that order. Unregistering from `install` does not work: the old
// worker stays in control of every open client until all of them close, which for a home-screen app
// can be weeks, and `unregister()` on its own leaves Cache Storage behind:
//
//   self.addEventListener("activate", (event) => {
//     event.waitUntil(
//       caches.keys()
//         .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
//         .then(() => self.clients.claim())
//         .then(() => self.registration.unregister()),
//     );
//   });

const VERSION = "v2";
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

// Drops every older cache, including v1's accumulated build output, and turns on navigation preload.
//
// Preload matters here precisely because every navigation is network-first: without it the browser
// waits for this worker to boot before the request is even sent, so an installed reader pays worker
// startup on every page to receive exactly what the network would have given them anyway. With it,
// the request goes out in parallel with the boot.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key))))
      .then(() => (self.registration.navigationPreload ? self.registration.navigationPreload.enable() : undefined))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  // Pages only. Everything else — build output, images, fonts — goes straight to the network and is
  // left to the browser's own HTTP cache, which already knows how long each one may be kept.
  if (request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (BYPASS.test(url.pathname)) return;

  // Use the preloaded response when there is one, otherwise go to the network as before.
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        return preloaded || (await fetch(request));
      } catch {
        return (await caches.match(OFFLINE)) ?? Response.error();
      }
    })(),
  );
});
