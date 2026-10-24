// Teste da página memorial-geo.html no Chromium: exemplo, leitura, larguras de 1280 e 390 px sem rolagem
// lateral, os três downloads (o .zip com os quatro arquivos do shapefile), funcionamento sem internet
// depois do primeiro carregamento e o HTML único.
// Uso: python3 -m http.server 8765 (na raiz do site) e, em outro terminal,
//      BASE=http://127.0.0.1:8765 node _testes/memorial-geo-pagina.mjs
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:8765";
const SAIDA = process.env.SAIDA || mkdtempSync(join(tmpdir(), "memorial-geo-"));
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log("FALHA:", m); } else console.log("ok:", m); };

// Regras de tom e de dados do site.
const fonte = readFileSync("memorial-geo.html", "utf8");
ok(!/SEMAD|\bIEF\b|FEAM|Igam/.test(fonte.replace(/<header[\s\S]*?<\/header>/, "")), "sem órgão ligado ao autor (fora do menu do site)");
ok(!/gere renda/i.test(fonte), "sem 'gere renda'");
ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(fonte), "sem CPF");
ok(/FICTÍCIO/.test(fonte) && /Matrícula: fictícia/.test(fonte), "exemplo marcado como fictício, sem número de matrícula");
ok(/https:\/\/www\.oanalistaambiental\.com\/memorial-geo\.html/.test(readFileSync("sitemap.xml", "utf8")), "no sitemap");
ok(/href="memorial-geo\.html"/.test(readFileSync("ferramentas.html", "utf8")), "cartão em ferramentas.html");
ok(!/<script[^>]+src="https?:/.test(fonte), "nenhum script externo");

// Lê os nomes de arquivo de um .zip "stored" (sem compressão).
function nomesNoZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), nomes = [];
  let o = 0;
  while (o + 30 <= buf.length && dv.getUint32(o, true) === 0x04034b50) {
    const n = dv.getUint16(o + 26, true), t = dv.getUint32(o + 18, true);
    nomes.push(Buffer.from(buf.subarray(o + 30, o + 30 + n)).toString("latin1"));
    o += 30 + n + t;
  }
  return nomes;
}

const nav = await chromium.launch({ args: ["--no-proxy-server"] });
for (const [larg, alt] of [[1280, 900], [390, 844]]) {
  const ctx = await nav.newContext({ viewport: { width: larg, height: alt }, acceptDownloads: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  // Fora do site: blocos do mapa vêm de imagem vazia; fontes externas são cortadas.
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => /tile\.openstreetmap\.org/.test(r.request().url())
    ? r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64") })
    : r.abort());
  const pg = await ctx.newPage();
  const erros = [];
  pg.on("pageerror", e => erros.push(String(e)));
  const r = await pg.goto(BASE + "/memorial-geo.html", { waitUntil: "load" });
  ok(r.status() === 200, `${larg}px: abre`);

  await pg.click("#exemplo");
  await pg.waitForSelector("#saida:not([hidden])");
  const n = await pg.textContent("#o-n");
  ok(/^30/.test(n), `${larg}px: exemplo com 30 vértices (${n.trim()})`);
  ok(/ha/.test(await pg.textContent("#o-area")), `${larg}px: área em ha (${(await pg.textContent("#o-area")).trim()})`);
  ok(/^1:/.test(await pg.textContent("#o-prec")), `${larg}px: precisão 1:N (${(await pg.textContent("#o-prec")).trim()})`);
  ok(/bom/.test(await pg.textContent("#o-fecho")), `${larg}px: exemplo fecha bem`);
  ok(await pg.locator("#o-tab tbody tr").count() === 30, `${larg}px: tabela com 30 vértices`);
  ok(await pg.locator("#mapa polygon.m-pol").count() === 1 && await pg.locator("#mapa .m-norte").count() === 1 && await pg.locator("#mapa .m-grade line").count() >= 4, `${larg}px: mapa com polígono, norte e grade`);
  ok(await pg.locator("#mapa image.m-tile").count() > 0 && await pg.isVisible("#attr"), `${larg}px: com internet, blocos do OSM e atribuição`);
  ok((await pg.inputValue("#pe")) === "452.318,40" && (await pg.inputValue("#fuso")) === "23", `${larg}px: partida e fuso preenchidos do texto`);

  const sobra = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(sobra <= 0, `${larg}px: sem rolagem horizontal (sobra ${sobra})`);
  if (larg === 390) {
    const margem = await pg.evaluate(() => document.querySelector("#calc").getBoundingClientRect().left);
    ok(margem >= 16, `390px: margem lateral ${margem}px`);
  }
  await pg.screenshot({ path: join(SAIDA, `memorial-geo-${larg}.png`), fullPage: true });

  // Fechamento ruim: um lado a menos no exemplo.
  await pg.evaluate(() => { const t = document.getElementById("texto"); t.value = t.value.replace(/; deste, segue com azimute de [^;]*?até o vértice V-12/, ""); });
  await pg.click("#ler");
  ok(/ruim/.test(await pg.textContent("#o-fecho")), `${larg}px: lado faltando dá fechamento ruim com aviso`);
  ok(await pg.locator("#mapa .m-chegada").count() === 1, `${larg}px: mapa marca a chegada do último lado`);

  // Rumo e partida corrigida na mão.
  await pg.fill("#texto", "Partida E 612.000,00 m e N 7.795.000,00 m, SAD 69.\nV1; N 0° E; 100\nV2; 90°; 100\nV3; S 0° E; 100\nV4; 270°; 100");
  await pg.click("#ler");
  ok(/1,0000 ha/.test(await pg.textContent("#o-area")), `${larg}px: tabela simples com rumo dá 1 ha`);
  ok(/SAD 69/.test(await pg.textContent("#o-conf")), `${larg}px: aviso de SAD 69`);
  await pg.fill("#pe", "500.000,00"); await pg.selectOption("#fuso", "22"); await pg.click("#recalcular");
  ok(/500\.000,00/.test(await pg.textContent("#o-tab tbody tr:first-child")) && /22 S/.test(await pg.textContent("#o-sis")), `${larg}px: recalcula com partida e fuso informados`);

  // Os três downloads.
  await pg.click("#exemplo");
  await pg.fill("#nome", "Fazenda Vereda do Exemplo");
  for (const [tipo, ext] of [["kml", ".kml"], ["geojson", ".geojson"], ["shp", "-shp.zip"]]) {
    const [d] = await Promise.all([pg.waitForEvent("download"), pg.click(`[data-baixar="${tipo}"]`)]);
    const nome = d.suggestedFilename(), caminho = join(SAIDA, `${larg}-${nome}`);
    await d.saveAs(caminho);
    const buf = readFileSync(caminho);
    ok(nome === "fazenda-vereda-do-exemplo" + ext, `${larg}px: download ${nome}`);
    if (tipo === "kml") ok(/<kml xmlns="http:\/\/www.opengis.net\/kml\/2.2">/.test(buf.toString()) && (buf.toString().match(/<Placemark>/g) || []).length === 31, `${larg}px: KML com o polígono e 30 vértices`);
    if (tipo === "geojson") { const g = JSON.parse(buf.toString()); ok(g.features[0].geometry.type === "Polygon" && g.features[0].geometry.coordinates[0].length === 31, `${larg}px: GeoJSON com anel de 31 pontos`); }
    if (tipo === "shp") {
      const nomes = nomesNoZip(buf);
      ok(JSON.stringify(nomes) === JSON.stringify(["fazenda-vereda-do-exemplo.shp", "fazenda-vereda-do-exemplo.shx", "fazenda-vereda-do-exemplo.dbf", "fazenda-vereda-do-exemplo.prj"]), `${larg}px: zip com os quatro arquivos (${nomes.join(", ")})`);
    }
  }

  // Botão Copiar do pedido para IA.
  await pg.click("#copiar-ia");
  const copiado = await pg.evaluate(() => navigator.clipboard.readText());
  ok(/^PAPEL/.test(copiado) && /\| Vértice \| Azimute ou rumo \| Distância \(m\) \| Página \|/.test(copiado), `${larg}px: copia o pedido para IA`);
  ok(erros.length === 0, `${larg}px: sem erro de JavaScript ${erros.join(" | ")}`);
  await ctx.close();
}

// Sem internet: primeiro carregamento com rede, depois o contexto fica offline.
{
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const pg = await ctx.newPage();
  const erros = [];
  pg.on("pageerror", e => erros.push(String(e)));
  await pg.goto(BASE + "/memorial-geo.html", { waitUntil: "load" });
  await pg.evaluate(async () => { await navigator.serviceWorker.ready; });
  await pg.waitForFunction(() => !!navigator.serviceWorker.controller || true);
  await pg.reload({ waitUntil: "load" });
  ok(await pg.evaluate(() => !!navigator.serviceWorker.controller), "service worker controla a página");

  // HTML único (com rede).
  const [d] = await Promise.all([pg.waitForEvent("download"), pg.click("#baixar-html")]);
  const unico = join(SAIDA, "memorial-geo-unico.html");
  await d.saveAs(unico);
  const html = readFileSync(unico, "utf8");
  ok(!/^<script src=|^<link rel="stylesheet" href="css/m.test(html) && /MemorialGeo/.test(html) && /--ochre/.test(html), "HTML único: JS e CSS dentro do arquivo");

  await ctx.setOffline(true);
  const r = await pg.reload({ waitUntil: "load" });
  ok(r && r.ok(), "sem internet: a página abre da cópia guardada");
  ok(await pg.evaluate(() => getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)" && typeof window.MemorialGeo === "object"), "sem internet: CSS e motor de cálculo carregados");
  await pg.click("#exemplo");
  await pg.waitForSelector("#saida:not([hidden])");
  ok(/^30/.test(await pg.textContent("#o-n")), "sem internet: calcula o exemplo");
  ok(await pg.locator("#mapa image.m-tile").count() === 0 && await pg.locator("#mapa polygon.m-pol").count() === 1 && !(await pg.isVisible("#attr")), "sem internet: desenho sem fundo, sem atribuição");
  ok(/Sem internet/.test(await pg.textContent("#mapa-info")), "sem internet: aviso no mapa");
  const [z] = await Promise.all([pg.waitForEvent("download"), pg.click('[data-baixar="shp"]')]);
  const zc = join(SAIDA, "offline.zip"); await z.saveAs(zc);
  ok(nomesNoZip(readFileSync(zc)).length === 4, "sem internet: shapefile baixa");
  await pg.screenshot({ path: join(SAIDA, "memorial-geo-offline.png"), fullPage: false });
  ok(erros.length === 0, "sem internet: sem erro de JavaScript " + erros.join(" | "));
  await ctx.close();

  // O HTML único aberto do disco, sem rede.
  const c2 = await nav.newContext({ offline: true });
  const p2 = await c2.newPage();
  const e2 = [];
  p2.on("pageerror", e => e2.push(String(e)));
  await p2.goto("file://" + unico, { waitUntil: "load" });
  await p2.click("#exemplo");
  await p2.waitForSelector("#saida:not([hidden])");
  ok(/^30/.test(await p2.textContent("#o-n")) && await p2.isHidden("#baixar-html"), "HTML único aberto do disco, sem rede: calcula");
  ok(e2.length === 0, "HTML único: sem erro de JavaScript " + e2.join(" | "));
  await c2.close();
}

await nav.close();
console.log(`\nArquivos e telas em ${SAIDA}`);
console.log(falhas ? `${falhas} falha(s)` : "Tudo certo.");
process.exit(falhas ? 1 : 0);
