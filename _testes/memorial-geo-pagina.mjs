// Teste da página memorial-geo.html no Chromium: exemplo, leitura, larguras de 1280 e 390 px sem rolagem
// lateral, diagnóstico do fechamento com "Testar" e "Desfazer", memorial por coordenadas, destaque do lado
// no mapa, os downloads (o .zip com os quatro arquivos do shapefile, DXF, CSV e o memorial em texto),
// relatório para imprimir, funcionamento sem internet depois do primeiro carregamento e o HTML único.
// Desde a v3: "Ver um exemplo pronto" no topo, leitura ao vivo, resumo em linguagem simples, "?" nos números,
// marcas no texto lido, percurso lado a lado, aproximar, arrastar e enquadrar, "Entenda em 1 minuto".
// Desde a v4: envio de PDF com texto, PDF escaneado e foto (OCR), "Parar", tipo não aceito, e a leitura
// de PDF e foto sem internet depois do primeiro uso. Os arquivos de teste são gerados aqui, com o
// memorial fictício do exemplo.
// Uso: python3 -m http.server 8765 (na raiz do site) e, em outro terminal,
//      BASE=http://127.0.0.1:8765 node _testes/memorial-geo-pagina.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
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

/** Certidão fictícia com o memorial do exemplo: PDF com texto, PDF só imagem (~300 dpi) e foto (~150 dpi). */
async function gerarArquivos() {
  const html = readFileSync("memorial-geo.html", "utf8");
  const ex = JSON.parse(html.match(/var EXEMPLO = (".*?");\n/)[1]);
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const corpo = `<!doctype html><meta charset="utf-8"><style>body{font-family:"Times New Roman",serif;font-size:12pt;line-height:1.45;margin:2cm 2.2cm;color:#000;background:#fff}
    p{text-align:justify;margin:0 0 .8em}</style><p><b>CERTIDÃO DE INTEIRO TEOR — EXEMPLO FICTÍCIO</b></p>` + ex.split("\n").map(l => "<p>" + esc(l) + "</p>").join("");
  const pg = await nav.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 3.125 });
  await pg.setContent(corpo);
  await pg.pdf({ path: join(SAIDA, "certidao-texto.pdf"), format: "A4" });
  const png300 = await pg.screenshot({ fullPage: true });
  await pg.setContent(`<!doctype html><style>@page{size:A4;margin:0}body{margin:0}img{width:210mm;display:block}</style><img src="data:image/png;base64,${png300.toString("base64")}">`);
  await pg.pdf({ path: join(SAIDA, "certidao-escaneada.pdf"), format: "A4" });
  await pg.close();
  const foto = await nav.newPage({ viewport: { width: 1240, height: 1754 } });
  await foto.setContent(corpo);
  writeFileSync(join(SAIDA, "foto-certidao.png"), await foto.screenshot({ fullPage: true }));
  await foto.close();
}
await gerarArquivos();
/** Espera a leitura do arquivo terminar (o botão "Parar" some) e devolve o resumo dela. */
async function fimDaLeitura(pg, limite = 120000) {
  await pg.waitForFunction(() => !document.getElementById("leitura").hidden && document.getElementById("leitura-parar").hidden &&
    !/Parando/.test(document.getElementById("leitura-txt").textContent), null, { timeout: limite });
  return (await pg.textContent("#leitura-txt")).trim();
}
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

  ok(await pg.isVisible("#vazio") && await pg.locator(".como li").count() === 3, `${larg}px: estado vazio e "como funciona" em 3 passos`);
  await pg.click("#exemplo-topo");
  await pg.waitForSelector("#saida:not([hidden])");
  await pg.waitForFunction(() => { const r = document.getElementById("o-fecho").getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight / 2; }, null, { timeout: 4000 });
  ok(true, `${larg}px: "Ver um exemplo pronto" leva a tela até o resultado`);
  ok(/Fecha bem/.test(await pg.textContent("#o-fecho")) && /30 vértices, 2\.324,0124 ha/.test(await pg.textContent("#o-fecho")), `${larg}px: resumo em linguagem simples`);
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

  // "?" dos números.
  await pg.click('.ajuda[aria-label="O que é erro de fechamento?"]');
  ok(await pg.isVisible("#o-erro + .ajuda__txt") && /último deveria voltar/.test(await pg.textContent("#o-erro + .ajuda__txt")), `${larg}px: "?" explica o erro de fechamento`);

  // O que foi lido, marcado no texto.
  await pg.click("#o-lido summary");
  ok(await pg.locator("#o-lido-texto mark[data-lado]").count() === 30 && await pg.locator("#o-lido-texto .lido__m--partida").count() === 1 && /30 lados marcados/.test(await pg.textContent("#o-lido-n")),
    `${larg}px: 30 lados e a partida marcados no texto`);
  await pg.click('#o-lido-texto mark[data-lado="4"]');
  ok(await pg.getAttribute("#o-tab tbody tr.sel", "data-i") === "4" && await pg.locator("#mapa .m-destaque").count() === 1, `${larg}px: tocar na marca destaca o lado na tabela e no mapa`);

  // Mapa: aproximar, arrastar e enquadrar.
  const z0 = Number(await pg.getAttribute("#mapa", "data-zoom")), cx0 = Number(await pg.getAttribute("#mapa .m-v0", "cx"));
  await pg.click('[data-zoom="1"]');
  ok(Number(await pg.getAttribute("#mapa", "data-zoom")) === z0 + 1, `${larg}px: aproximar (zoom ${z0} → ${z0 + 1})`);
  const antes = Number(await pg.getAttribute("#mapa .m-v0", "cx"));
  const caixa = await pg.locator("#mapa").boundingBox();
  await pg.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await pg.mouse.down();
  await pg.mouse.move(caixa.x + caixa.width / 2 + 60, caixa.y + caixa.height / 2, { steps: 5 });
  await pg.mouse.up();
  const depois = Number(await pg.getAttribute("#mapa .m-v0", "cx"));
  ok(depois - antes > 40, `${larg}px: arrastar move o mapa (${antes.toFixed(0)} → ${depois.toFixed(0)})`);
  await pg.click("#enquadrar");
  ok(Number(await pg.getAttribute("#mapa", "data-zoom")) === z0 && Number(await pg.getAttribute("#mapa .m-v0", "cx")) === cx0, `${larg}px: enquadrar volta ao polígono inteiro`);

  // Percurso lado a lado.
  await pg.click("#percorrer");
  ok(await pg.isVisible("#percurso-barra") && /Lado 1 de 30/.test(await pg.textContent("#percurso-txt")) && await pg.locator("#mapa .m-passo").count() === 1 &&
    await pg.locator("#mapa .m-norte-q").count() === 1, `${larg}px: percurso começa no lado 1, com o norte e o lado da vez`);
  await pg.click('[data-passo="1"]');
  await pg.click('[data-passo="1"]');
  ok(/Lado 3 de 30/.test(await pg.textContent("#percurso-txt")) && /67°58'10"/.test(await pg.textContent("#percurso-txt")) && await pg.locator("#mapa .m-arco").count() === 1 &&
    await pg.getAttribute("#o-tab tbody tr.sel", "data-i") === "2", `${larg}px: próximo lado, com o arco do azimute e a linha da tabela`);
  await pg.click("#percurso-play");
  await pg.waitForFunction(() => /Lado [4-9] de 30/.test(document.getElementById("percurso-txt").textContent), null, { timeout: 5000 });
  ok(/Pausar/.test(await pg.textContent("#percurso-play")), `${larg}px: "Reproduzir" avança sozinho e vira "Pausar"`);
  await pg.click('[data-passo="sair"]');
  ok(await pg.isHidden("#percurso-barra") && await pg.locator("#mapa polygon.m-pol").count() === 1, `${larg}px: sair do percurso volta ao polígono`);

  // Leitura ao vivo: colar o texto, sem tocar em botão.
  await pg.fill("#texto", "E=612000,00 N=7795000,00 fuso 23\nV1; 90°; 100\nV2; 180°; 100\nV3; 270°; 100\nV4; 0°; 100");
  await pg.waitForFunction(() => /1,0000 ha/.test(document.getElementById("o-area").textContent), null, { timeout: 4000 });
  ok(/Lido: 4 lados e a partida/.test(await pg.textContent("#aovivo")), `${larg}px: leitura ao vivo, sem tocar em botão`);

  // "Entenda em 1 minuto" e os limites.
  await pg.click('a[href="#entenda"]');
  await pg.waitForFunction(() => { const r = document.getElementById("entenda").getBoundingClientRect(); return r.top >= -5 && r.top < innerHeight; }, null, { timeout: 4000 });
  ok(await pg.locator("#entenda .ent svg").count() === 3, `${larg}px: "Entenda em 1 minuto" com os três desenhos`);
  ok(await pg.isVisible("#limite") && await pg.locator("#limite > ul > li").count() >= 6 && await pg.locator(".limite__mais li").count() === 3, `${larg}px: limites à vista e mais 3 num clique`);

  // Fechamento ruim: um lado a menos no exemplo.
  await pg.click("#exemplo");
  await pg.evaluate(() => { const t = document.getElementById("texto"); t.value = t.value.replace(/; deste, segue com azimute de [^;]*?até o vértice V-12/, ""); });
  await pg.click("#ler");
  ok(/ruim/.test(await pg.textContent("#o-fecho")), `${larg}px: lado faltando dá fechamento ruim com aviso`);
  ok(await pg.locator("#mapa .m-chegada").count() === 1, `${larg}px: mapa marca a chegada do último lado`);

  // Diagnóstico: o "Exemplo com erro" (dígitos invertidos numa distância), "Testar" e "Desfazer".
  await pg.click("#exemplo-erro");
  ok(await pg.isVisible("#o-diag") && /742,69 m em vez de 724,69 m \(dois dígitos invertidos\)/.test(await pg.textContent("#o-diag")), `${larg}px: diagnóstico aponta a distância com dígitos invertidos`);
  await pg.click("#o-diag [data-ver]");
  ok(await pg.locator("#mapa .m-destaque").count() === 1 && await pg.locator("#o-tab tbody tr.sel").count() === 1, `${larg}px: "Ver no mapa" destaca o lado no mapa e na tabela`);
  await pg.click("#o-diag [data-testar='0']");
  ok(/bom/.test(await pg.textContent("#o-fecho")) && /Correção em teste/.test(await pg.textContent("#o-diag")) && /Correção só para teste/.test(await pg.textContent("#o-conf")), `${larg}px: "Testar esta correção" fecha e avisa que é teste`);
  ok((await pg.inputValue("#texto")).includes("724,69"), `${larg}px: o texto colado não muda com o teste`);
  await pg.click("#o-diag [data-desfazer]");
  ok(/fraco|ruim/.test(await pg.textContent("#o-fecho")) && /Por que não fecha/.test(await pg.textContent("#o-diag")), `${larg}px: "Desfazer o teste" volta ao cálculo do texto`);

  // Memorial por coordenadas e as duas leituras.
  await pg.fill("#texto", `Partida: E 610.000,00 m, N 7.800.000,00 m, fuso 23, SIRGAS 2000
| Vértice | E (m) | N (m) | Azimute ou rumo | Distância (m) | Página |
| V1 | 610.000,00 | 7.800.000,00 | 90°00'00" | 100,00 | 2 |
| V2 | 610.100,00 | 7.800.000,00 | N 0° E | 100,00 | 2 |
| V3 | 610.100,00 | 7.800.100,00 | 270°00'00" | 100,00 | 3 |
| V4 | 610.000,00 | 7.800.100,00 | S 0° E | 100,00 | 3 |`);
  await pg.click("#ler");
  ok(await pg.isVisible("#o-fonte") && await pg.locator("#mapa .m-outra").count() === 1, `${larg}px: duas leituras: seletor e tracejado da outra no mapa`);
  await pg.check('#o-fonte input[value="coordenadas"]');
  ok(/lidos das coordenadas/.test(await pg.textContent("#o-n")) && /não se aplica/.test(await pg.textContent("#o-erro")) && /1,0000 ha/.test(await pg.textContent("#o-area")),
    `${larg}px: desenhar pelas coordenadas`);
  await pg.fill("#texto", "Vértice | E (m) | N (m)\nV1 | 610.000,00 | 7.800.000,00\nV2 | 610.100,00 | 7.800.000,00\nV3 | 610.100,00 | 7.800.100,00\nV4 | 610.000,00 | 7.800.100,00\nCoordenadas UTM, SIRGAS 2000, fuso 23 S.");
  await pg.click("#ler");
  ok(!(await pg.isVisible("#o-fonte")) && /lidos das coordenadas/.test(await pg.textContent("#o-n")), `${larg}px: tabela só de coordenadas vira polígono`);
  await pg.click("#o-tab tbody tr:nth-child(2)");
  ok(await pg.locator("#mapa .m-destaque").count() === 1, `${larg}px: tocar na linha destaca o lado no mapa`);

  // Rumo e partida corrigida na mão.
  await pg.fill("#texto", "Partida E 612.000,00 m e N 7.795.000,00 m, SAD 69.\nV1; N 0° E; 100\nV2; 90°; 100\nV3; S 0° E; 100\nV4; 270°; 100");
  await pg.click("#ler");
  ok(/1,0000 ha/.test(await pg.textContent("#o-area")), `${larg}px: tabela simples com rumo dá 1 ha`);
  ok(/SAD 69/.test(await pg.textContent("#o-conf")), `${larg}px: aviso de SAD 69`);
  await pg.fill("#pe", "500.000,00"); await pg.selectOption("#fuso", "22"); await pg.click("#recalcular");
  ok(/500\.000,00/.test(await pg.textContent("#o-tab tbody tr:first-child")) && /22 S/.test(await pg.textContent("#o-sis")), `${larg}px: recalcula com partida e fuso informados`);

  // Os downloads.
  await pg.click("#exemplo");
  await pg.fill("#nome", "Fazenda Vereda do Exemplo");
  for (const [tipo, ext] of [["kml", ".kml"], ["geojson", ".geojson"], ["shp", "-shp.zip"], ["dxf", ".dxf"], ["csv", ".csv"], ["txt", "-memorial.txt"]]) {
    const [d] = await Promise.all([pg.waitForEvent("download"), pg.click(`[data-baixar="${tipo}"]`)]);
    const nome = d.suggestedFilename(), caminho = join(SAIDA, `${larg}-${nome}`);
    await d.saveAs(caminho);
    const buf = readFileSync(caminho);
    ok(nome === "fazenda-vereda-do-exemplo" + ext, `${larg}px: download ${nome}`);
    if (tipo === "kml") ok(/<kml xmlns="http:\/\/www.opengis.net\/kml\/2.2">/.test(buf.toString()) && (buf.toString().match(/<Placemark>/g) || []).length === 31, `${larg}px: KML com o polígono e 30 vértices`);
    if (tipo === "geojson") { const g = JSON.parse(buf.toString()); ok(g.features[0].geometry.type === "Polygon" && g.features[0].geometry.coordinates[0].length === 31, `${larg}px: GeoJSON com anel de 31 pontos`); }
    if (tipo === "dxf") ok(/AC1009/.test(buf.toString()) && (buf.toString().match(/\r\nVERTEX\r\n/g) || []).length === 30, `${larg}px: DXF com a polilinha de 30 vértices`);
    if (tipo === "csv") ok(buf.toString("utf8").split("\r\n").length === 32 && /^\uFEFFvertice;e_m;n_m/.test(buf.toString("utf8")), `${larg}px: CSV com 30 vértices`);
    if (tipo === "txt") ok(/^MEMORIAL DESCRITIVO RECONSTRUÍDO — Fazenda Vereda do Exemplo/.test(buf.toString("utf8")), `${larg}px: memorial em texto`);
    if (tipo === "shp") {
      const nomes = nomesNoZip(buf);
      ok(JSON.stringify(nomes) === JSON.stringify(["fazenda-vereda-do-exemplo.shp", "fazenda-vereda-do-exemplo.shx", "fazenda-vereda-do-exemplo.dbf", "fazenda-vereda-do-exemplo.prj"]), `${larg}px: zip com os quatro arquivos (${nomes.join(", ")})`);
    }
  }

  // Copiar o memorial com coordenadas e o relatório impresso.
  await pg.click("#copiar-memorial");
  ok(/^MEMORIAL DESCRITIVO RECONSTRUÍDO/.test(await pg.evaluate(() => navigator.clipboard.readText())), `${larg}px: copia o memorial com coordenadas`);
  await pg.emulateMedia({ media: "print" });
  await pg.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  ok(await pg.evaluate(() => document.querySelector(".limite__mais").open) && await pg.isHidden("#percorrer") && await pg.isHidden(".como"), `${larg}px: impressão abre os limites recolhidos e esconde os controles`);
  ok(await pg.isHidden("header.nav") && await pg.isHidden("#texto") && await pg.isHidden("#pedido-ia") && await pg.isVisible("#mapa") && await pg.isVisible("#o-tab") && await pg.isVisible("#limite"),
    `${larg}px: impressão só com o resultado, o mapa, a tabela e os limites`);
  ok(/relatório gerado em \d{2}\/\d{2}\/\d{4}/.test(await pg.textContent("#impresso-em")) && await pg.isVisible("#impresso-em"), `${larg}px: impressão com data e origem no topo`);
  if (larg === 1280) await pg.pdf({ path: join(SAIDA, "relatorio.pdf"), format: "A4", printBackground: true });
  await pg.emulateMedia({ media: "screen" });

  // Botão Copiar do pedido para IA.
  await pg.click("#copiar-ia");
  const copiado = await pg.evaluate(() => navigator.clipboard.readText());
  ok(/^PAPEL/.test(copiado) && /\| Vértice \| Azimute ou rumo \| Distância \(m\) \| Página \|/.test(copiado), `${larg}px: copia o pedido para IA`);
  ok(erros.length === 0, `${larg}px: sem erro de JavaScript ${erros.join(" | ")}`);
  await ctx.close();
}

// Leitura de arquivo: PDF com texto, PDF escaneado (OCR), "Parar" e tipo não aceito.
for (const [larg, alt] of [[1280, 900], [390, 844]]) {
  const ctx = await nav.newContext({ viewport: { width: larg, height: alt } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const pg = await ctx.newPage();
  const erros = [];
  pg.on("pageerror", e => erros.push(String(e)));
  await pg.goto(BASE + "/memorial-geo.html", { waitUntil: "load" });
  ok(await pg.isVisible("#envio") && await pg.isVisible("#arquivo-escolher"), `${larg}px: área para enviar o PDF ou a foto`);
  await pg.setInputFiles("#arquivo", join(SAIDA, "certidao-texto.pdf"));
  let resumo = await fimDaLeitura(pg);
  ok(/Achei 30 lados/.test(resumo) && /Fecha bem/.test(await pg.textContent("#o-fecho")) && /452\.318,40/.test(await pg.inputValue("#pe")),
    `${larg}px: PDF com texto lido na hora (${resumo.slice(0, 60)})`);
  ok(/MEMORIAL DESCRITIVO/.test(await pg.inputValue("#texto")), `${larg}px: o texto do PDF vai para o campo, para conferir`);
  await pg.click("#leitura-ver");
  await pg.waitForFunction(() => { const r = document.getElementById("resultado").getBoundingClientRect(); return r.top >= -2 && r.top < window.innerHeight / 2; }, null, { timeout: 5000 });
  ok(true, `${larg}px: "Ver o mapa e o resultado" leva ao Passo 3`);
  const sobra = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(sobra <= 0, `${larg}px: sem rolagem horizontal com a leitura de arquivo (sobra ${sobra})`);
  if (larg === 1280) {
    await pg.setInputFiles("#arquivo", join(SAIDA, "certidao-escaneada.pdf"));
    await pg.waitForFunction(() => /Preparando|Reconhecendo/.test(document.getElementById("leitura-txt").textContent), null, { timeout: 30000 });
    ok(await pg.isVisible("#leitura-parar") && await pg.isVisible(".leitura__barra"), "PDF escaneado: progresso com barra e botão Parar");
    resumo = await fimDaLeitura(pg);
    ok(/lida por imagem/.test(resumo) && /Achei 30 lados/.test(resumo) && /Fecha bem/.test(await pg.textContent("#o-fecho")), `PDF escaneado lido por OCR (${resumo.slice(0, 80)})`);
    await pg.setInputFiles("#arquivo", join(SAIDA, "certidao-escaneada.pdf"));
    await pg.waitForFunction(() => /Reconhecendo/.test(document.getElementById("leitura-txt").textContent), null, { timeout: 30000 });
    await pg.click("#leitura-parar");
    resumo = await fimDaLeitura(pg, 20000);
    ok(/interrompida/.test(resumo), `"Parar" interrompe a leitura (${resumo})`);
    await pg.setInputFiles("#arquivo", { name: "planilha.zip", mimeType: "application/zip", buffer: Buffer.from("PK\x03\x04") });
    resumo = await fimDaLeitura(pg);
    ok(/não é lido aqui/.test(resumo), "tipo de arquivo não aceito: aviso claro");
  }
  ok(erros.length === 0, `${larg}px: leitura de arquivo sem erro de JavaScript ${erros.join(" | ")}`);
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
  ok(!/^<script src=|^<link rel="stylesheet" href="css/m.test(html) && /MemorialGeo/.test(html) && /LeitorArquivo/.test(html) && /--ochre/.test(html), "HTML único: JS e CSS dentro do arquivo");

  // Um arquivo lido com rede deixa a leitura guardada (pdf.js, OCR e o português).
  await pg.setInputFiles("#arquivo", join(SAIDA, "certidao-escaneada.pdf"));
  ok(/Achei 30 lados/.test(await fimDaLeitura(pg)), "com rede: PDF escaneado lido (a leitura fica guardada)");

  await ctx.setOffline(true);
  const r = await pg.reload({ waitUntil: "load" });
  ok(r && r.ok(), "sem internet: a página abre da cópia guardada");
  ok(await pg.evaluate(() => getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)" && typeof window.MemorialGeo === "object"), "sem internet: CSS e motor de cálculo carregados");
  await pg.click("#exemplo");
  await pg.waitForSelector("#saida:not([hidden])");
  ok(/^30/.test(await pg.textContent("#o-n")), "sem internet: calcula o exemplo");
  ok(await pg.locator("#mapa image.m-tile").count() === 0 && await pg.locator("#mapa polygon.m-pol").count() === 1 && !(await pg.isVisible("#attr")), "sem internet: desenho sem fundo, sem atribuição");
  ok(/Sem internet/.test(await pg.textContent("#mapa-info")), "sem internet: aviso no mapa");
  await pg.setInputFiles("#arquivo", join(SAIDA, "foto-certidao.png"));
  let lidoOff = await fimDaLeitura(pg);
  ok(/Achei 30 lados/.test(lidoOff) && /Fecha bem/.test(await pg.textContent("#o-fecho")), `sem internet: foto da certidão lida por OCR (${lidoOff.slice(0, 50)})`);
  await pg.setInputFiles("#arquivo", join(SAIDA, "certidao-texto.pdf"));
  lidoOff = await fimDaLeitura(pg);
  ok(/Achei 30 lados/.test(lidoOff), "sem internet: PDF com texto lido");
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
  await p2.setInputFiles("#arquivo", join(SAIDA, "certidao-texto.pdf"));
  const avisoUnico = await fimDaLeitura(p2, 30000);
  ok(/internet/.test(avisoUnico) && /precisa de internet/.test(await p2.textContent("#envio-ajuda")), `HTML único sem rede: ler PDF avisa que precisa de internet (${avisoUnico.slice(0, 60)})`);
  ok(e2.length === 0, "HTML único: sem erro de JavaScript " + e2.join(" | "));
  await c2.close();
}

await nav.close();
console.log(`\nArquivos e telas em ${SAIDA}`);
console.log(falhas ? `${falhas} falha(s)` : "Tudo certo.");
process.exit(falhas ? 1 : 0);
