/* Service worker da página memorial-geo.html: guarda a página e o que ela usa para abrir sem internet.
   Página e scripts: rede primeiro (para pegar a versão nova), cópia guardada quando a rede falha.
   Bibliotecas de leitura de PDF e foto (js/vendor/, versão no nome da pasta, nunca mudam): guardadas
   no primeiro uso e servidas do cache dali em diante. Blocos do mapa e fontes externas não são guardados. */
var CACHE = "memorial-geo-v2";
var LIBS = "leitor-libs-v1";
var ARQUIVOS = ["memorial-geo.html", "css/style.css", "js/nav.js", "js/memorial-geo.js", "js/memorial-geo-arquivo.js", "assets/logo.png"];

self.addEventListener("install", function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (ev) {
  ev.waitUntil(caches.keys().then(function (ks) {
    // Só as versões antigas da página ("memorial-geo-v1"…); as bibliotecas ficam.
    return Promise.all(ks.filter(function (k) { return k.indexOf("memorial-geo-v") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

var GUARDADOS = ARQUIVOS.map(function (a) { return new URL(a, self.location).pathname; });
var VENDOR = new URL("js/vendor/", self.location).pathname;

self.addEventListener("fetch", function (ev) {
  var req = ev.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.indexOf(VENDOR) === 0) {
    ev.respondWith(caches.open(LIBS).then(function (c) {
      return c.match(url.pathname).then(function (r) {
        return r || fetch(req).then(function (resp) {
          if (resp.ok) c.put(url.pathname, resp.clone());
          return resp;
        });
      });
    }));
    return;
  }

  if (GUARDADOS.indexOf(url.pathname) < 0) return;
  ev.respondWith(fetch(req).then(function (resp) {
    if (resp.ok) { var copia = resp.clone(); caches.open(CACHE).then(function (c) { c.put(url.pathname, copia); }); }
    return resp;
  }).catch(function () {
    return caches.match(url.pathname).then(function (r) { return r || Response.error(); });
  }));
});
