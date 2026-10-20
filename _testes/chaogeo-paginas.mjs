// Teste das páginas do app Chão Geo (pasta chaogeo/) e da leitura de ?lat=&lon= e ?ibge=.
// A pasta _testes/ não é publicada (o GitHub Pages/Jekyll ignora pastas com "_").
// Uso: python3 -m http.server 8765 (na raiz do site) e, em outro terminal,
//      BASE=http://127.0.0.1:8765 node _testes/chaogeo-paginas.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:8765";
const paginas = ["/chaogeo/", "/chaogeo/como-usar", "/chaogeo/fontes", "/chaogeo/suporte", "/chaogeo/privacidade", "/chaogeo/termos",
  "/chaogeo/index.html", "/chaogeo/privacidade.html", "/ferramentas.html"];
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log("FALHA:", m); } else console.log("ok:", m); };

const nav = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
// Nada de rede externa no teste (fontes do Google, ANA): só o servidor local.
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
  if (p.startsWith("/chaogeo")) {
    ok(await pg.locator("header.nav").count() === 1 && await pg.locator("footer").count() === 1, `${p} com cabeçalho e rodapé do site`);
    ok(await pg.locator('meta[name="robots"]').count() === 0, `${p} sem noindex`);
    ok((await pg.content()).includes("contato@oanalistaambiental.com"), `${p} com o contato`);
  }
  for (const h of await pg.$$eval("a[href]", as => as.map(a => a.href))) {
    if (h.startsWith(BASE)) internos.add(h.split("#")[0]);
  }
  await pg.close();
}
const pg = await ctx.newPage();
for (const h of internos) {
  const r = await pg.request.get(h);
  ok(r.status() === 200, `link interno ${h.replace(BASE, "")} (HTTP ${r.status()})`);
}

// Política: diz o que vai ao site pelos botões e o pedido de avaliação.
await pg.goto(BASE + "/chaogeo/privacidade");
const txt = await pg.locator("main").innerText();
ok(txt.includes("Botões das ferramentas do site") && txt.includes("Pedido de avaliação"), "política cita botões do site e pedido de avaliação");

// Rio: ?lat=&lon= preenche, não consulta sozinho.
const pedidosAna = [];
pg.on("request", q => { if (/snirh|ana\.gov/.test(q.url())) pedidosAna.push(q.url()); });
await pg.goto(BASE + "/artigos/rio-federal-ou-estadual.html?lat=-25.520500&lon=-48.509500#completo");
ok(await pg.inputValue("#lat-d") === "-25,520500" && await pg.inputValue("#lon-d") === "-48,509500", "rio: coordenada do link no formulário completo");
ok(await pg.locator("#rf-do-link").count() === 1, "rio: aviso de coordenada recebida");
ok(await pg.getAttribute('#rf-fmt [data-fmt="dec"]', "aria-pressed") === "true", "rio: formato decimal escolhido");
await pg.waitForTimeout(800);
ok(pedidosAna.length === 0, "rio: nada vai à ANA sem tocar em Consultar");
await pg.goto(BASE + "/artigos/rio-federal-ou-estadual.html?lat=48.85&lon=2.35#completo");
ok(await pg.locator("#rf-do-link").count() === 0, "rio: coordenada fora do Brasil é ignorada");
// Modo guiado: o passo da coordenada mostra o que veio do link.
await pg.goto(BASE + "/artigos/rio-federal-ou-estadual.html?lat=-25.520500&lon=-48.509500");
const vals = await pg.evaluate(() => [document.getElementById("lat-d").value, document.getElementById("lon-d").value]);
ok(vals[0] === "-25,520500", "rio (guiado): campo original preenchido");

// Imóvel rural: ?ibge= preenche o município.
await pg.goto(BASE + "/artigos/calculadora-imovel-rural-car.html?ibge=4118204#completo");
await pg.waitForFunction(() => document.getElementById("mun").value !== "", null, { timeout: 5000 }).catch(() => {});
ok(await pg.inputValue("#mun") === "Paranaguá - PR", `imóvel rural: município do link (${await pg.inputValue("#mun")})`);
await pg.goto(BASE + "/artigos/calculadora-imovel-rural-car.html?ibge=9999999#completo");
await pg.waitForTimeout(600);
ok(await pg.inputValue("#mun") === "", "imóvel rural: código inexistente é ignorado");

await nav.close();
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
