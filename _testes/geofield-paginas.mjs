// Teste das páginas do app GeoField Kit (pasta geofield/).
// A pasta _testes/ não é publicada (o GitHub Pages/Jekyll ignora pastas com "_").
// Uso: python3 -m http.server 8765 (na raiz do site) e, em outro terminal,
//      BASE=http://127.0.0.1:8765 node _testes/geofield-paginas.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:8765";
const slugs = ["guia", "fontes", "suporte", "privacidade", "privacy"];
// O app abre /geofield/guia.html e /geofield/privacidade.html; a ficha da Play usa /geofield/ e /geofield/privacidade.html.
const paginas = ["/geofield/", "/geofield/index.html", ...slugs.map(s => `/geofield/${s}`), ...slugs.map(s => `/geofield/${s}.html`), "/ferramentas.html"];
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log("FALHA:", m); } else console.log("ok:", m); };

const nav = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());

const internos = new Set();
for (const p of paginas) {
  const pg = await ctx.newPage();
  const erros = [];
  pg.on("console", m => { if (m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  pg.on("pageerror", e => erros.push(String(e)));
  const r = await pg.goto(BASE + p, { waitUntil: "load" });
  ok(r.status() === 200, `${p} abre (HTTP ${r.status()})`);
  const larg = await pg.evaluate(() => document.documentElement.scrollWidth);
  ok(larg <= 390, `${p} sem rolagem lateral em 390 px (${larg})`);
  ok(erros.length === 0, `${p} sem erro de console ${erros.join(" | ")}`);
  if (p.startsWith("/geofield")) {
    ok(await pg.locator("header.nav").count() === 1 && await pg.locator("footer").count() === 1, `${p} com cabeçalho e rodapé do site`);
    ok(await pg.locator('meta[name="robots"]').count() === 0, `${p} sem noindex`);
    const html = await pg.content();
    ok(html.includes("contato@oanalistaambiental.com"), `${p} com o contato`);
    ok(/independente|independent/i.test(html) || !p.match(/\/geofield\/(index\.html)?$/), `${p} se declara independente`);
    ok(!/\.apk\b/i.test(await pg.locator("main").innerText()), `${p} sem APK para baixar`);
    const can = await pg.getAttribute('link[rel="canonical"]', "href");
    ok(can.startsWith("https://www.oanalistaambiental.com/geofield/"), `${p} canonical com www (${can})`);
  }
  for (const h of await pg.$$eval("a[href]", as => as.map(a => a.href))) if (h.startsWith(BASE)) internos.add(h.split("#")[0]);
  for (const s of await pg.$$eval("img[src]", is => is.map(i => i.src))) if (s.startsWith(BASE)) internos.add(s);
  await pg.close();
}
const pg = await ctx.newPage();
for (const h of internos) {
  const r = await pg.request.get(h);
  ok(r.status() === 200, `link interno ${h.replace(BASE, "")} (HTTP ${r.status()})`);
}
await pg.goto(BASE + "/geofield/");
ok((await pg.locator("main").innerText()).includes("Google Play em breve"), "início: disponível na Google Play em breve");
for (const [p, txt] of [["/geofield/privacidade", "Pl@ntNet"], ["/geofield/privacy", "OpenTimestamps"]]) {
  await pg.goto(BASE + p);
  ok((await pg.locator("main").innerText()).includes(txt), `${p} cita ${txt}`);
}
await nav.close();
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
