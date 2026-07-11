// K-Arise - service worker : cache l'app pour un fonctionnement hors-ligne
const CACHE = "karise-v8";
const ASSETS = [
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/store.js",
  "./js/engine.js",
  "./js/timer.js",
  "./js/screens.js",
  "./js/ui.js",
  "./js/running.js",
  "./js/strava.js",
  "./js/screen-course.js",
  "./js/screen-run-live.js",
  "./js/screen-status.js",
  "./js/screen-onboarding.js",
  "./js/screen-equipment.js",
  "./js/screen-session.js",
  "./js/screen-libre.js",
  "./js/screen-suivi.js",
  "./js/screen-nutrition.js",
  "./js/screen-profile.js",
  "./js/nutrition.js",
  "./data/exercises.json",
  "./data/recipes.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./manifest.webmanifest"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // network-first pour les fichiers locaux : code a jour quand en ligne, cache en secours hors-ligne
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
    );
  }
});
