/* LeadMighty HR — minimal service worker.
 *
 * The app is auth-gated and data-heavy, so we deliberately do NOT cache API or
 * page responses (stale HR data is worse than a network wait). This worker
 * exists to make the app installable as a PWA and to give a graceful offline
 * fallback for navigations. Everything else passes straight through to network.
 */
const OFFLINE_URL = "/offline.html"
const CACHE = "leadmighty-shell-v1"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  // Only handle top-level navigations; let the browser fetch everything else.
  if (request.mode !== "navigate") return
  event.respondWith(
    fetch(request).catch(() => caches.match(OFFLINE_URL)),
  )
})
