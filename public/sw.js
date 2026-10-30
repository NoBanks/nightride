// Keeps NIGHTRIDE usable with no signal: the app shell, the emergency guard and the
// verified playbook are saved on the phone. Live features (AI, places, maps) still need signal.
const CACHE = "nightride-v6";
const SHELL = [
  "/", "/index.html", "/app.css", "/app.js", "/manifest.webmanifest",
  "/icon-192.png", "/icon-512.png", "/shared/dispatch.js", "/shared/match.js", "/shared/stages.js", "/api/playbook",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Everything else under /api is live data: never serve it stale.
  if (url.pathname.startsWith("/api/") && url.pathname !== "/api/playbook") return;
  // Network first so updates land; the saved copy answers when there's no signal.
  e.respondWith(fetch(e.request)
    .then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
      return res;
    })
    .catch(() => caches.match(e.request).then((hit) => hit || caches.match("/"))));
});
