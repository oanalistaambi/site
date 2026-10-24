/* Service worker da página memorial-geo.html: guarda a página e o que ela usa para abrir sem internet.
   Rede primeiro (para pegar a versão nova), cópia guardada quando a rede falha. Só arquivos do próprio site:
   blocos do mapa e fontes externas não são guardados. */
var CACHE = "memorial-geo-v1";
var ARQUIVOS = ["memorial-geo.html", "css/style.css", "js/nav.js", "js/memorial-geo.js", "assets/logo.png"];

self.addEventListener("install", function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (ev) {
  ev.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf("memorial-geo-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

var GUARDADOS = ARQUIVOS.map(function (a) { return new URL(a, self.location).pathname; });

self.addEventListener("fetch", function (ev) {
  var req = ev.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || GUARDADOS.indexOf(url.pathname) < 0) return;
  ev.respondWith(fetch(req).then(function (resp) {
    if (resp.ok) { var copia = resp.clone(); caches.open(CACHE).then(function (c) { c.put(url.pathname, copia); }); }
    return resp;
  }).catch(function () {
    return caches.match(url.pathname).then(function (r) { return r || Response.error(); });
  }));
});
