/* ERA XI service worker — app shell + static assets offline; rooms and APIs stay online-only. */
const VERSION = "eraxi-v14-1";
const SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/favicon.ico", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page tells us what it already loaded before the worker took control (JS chunks, fonts).
self.addEventListener("message", (event) => {
  const urls = event.data && event.data.type === "cache-urls" ? event.data.urls : null;
  if (!Array.isArray(urls)) return;
  const same = urls.filter((u) => typeof u === "string" && u.startsWith(self.location.origin) && !u.includes("/api/"));
  event.waitUntil(caches.open(VERSION).then((c) => Promise.all(same.map((u) => c.add(u).catch(() => null)))));
});

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // live rooms: network only

  // Pages (incl. /c/<token> challenge and /r/<code> room deep links): network first,
  // then the cached app shell — the client reads the token/code from the path.
  if (req.mode === "navigate") {
    event.respondWith(
      withTimeout(fetch(req), 3500)
        .then((res) => {
          if (res.ok && url.pathname === "/") caches.open(VERSION).then((c) => c.put("/", res.clone()));
          return res;
        })
        .catch(async () => (await caches.match("/")) || (await caches.match("/offline.html")) || Response.error()),
    );
    return;
  }

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else same-origin: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
