/* 離線讀已看過的章節；上網時優先取新檔。 */
var CACHE = "shanhe-v3";

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll([
        "./",
        "./index.html",
        "./toc.html",
        "./chapter.html",
        "./css/style.css",
        "./js/app.js",
        "./manifest.json",
        "./data/chapters.json",
        "./data/books.json",
        "./icons/icon-192.png",
        "./icons/icon-512.png",
        "./icons/apple-touch-icon.png",
      ]);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
          return caches.delete(k);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (cached) {
          if (cached) return cached;
          if (url.pathname.endsWith("/chapter.html") || url.pathname.endsWith("chapter.html")) {
            return caches.match("./chapter.html");
          }
          if (url.pathname.endsWith("/") || url.pathname.endsWith("index.html")) {
            return caches.match("./index.html");
          }
          return caches.match("./index.html");
        });
      })
  );
});
