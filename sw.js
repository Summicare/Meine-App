// sw.js – Service Worker für Offline-Nutzung
//
// WICHTIG: "Netzwerk-zuerst"-Strategie. Vorher war es "Cache-zuerst", wodurch
// nach der allerersten Installation IMMER die alte, zwischengespeicherte
// Version ausgeliefert wurde – auch nachdem die App längst aktualisiert war.
// Das war die Ursache dafür, dass Fixes auf dem Handy nicht ankamen.
const CACHE_NAME = "baerchen-cache-v2"; // Version erhöht, damit alte Caches verworfen werden
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Beim Installieren: alle wichtigen Dateien in den Cache legen
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Alte Caches aufräumen, wenn eine neue Version aktiv wird
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Immer zuerst versuchen, die AKTUELLE Datei aus dem Netz zu laden.
// Nur wenn das fehlschlägt (z. B. offline), wird auf den Cache zurückgegriffen.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return networkResponse;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
