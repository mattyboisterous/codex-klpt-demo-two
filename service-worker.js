const CACHE_NAME = "codex-klpt-demo-two-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/dist/styles.css",
  "/src/app.js",
  "/data/domains.json",
  "/data/avatars.json",
  "/data/navigation.json",
  "/img/avatars/pink-pig.png",
  "/img/avatars/yellow-horse.png",
  "/img/avatars/red-dog.png",
  "/img/avatars/white-dolphin.png",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached ?? fetch(event.request);
    })
  );
});

