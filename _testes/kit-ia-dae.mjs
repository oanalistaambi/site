// Teste da página kit-ia-dae.html (filtros por público, índice, botões Copiar, celular sem rolagem lateral).
// Uso: python3 -m http.server 8765 (na raiz do site) e, em outro terminal,
//      BASE=http://127.0.0.1:8765 node _testes/kit-ia-dae.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:8765";
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log("FALHA:", m); } else console.log("ok:", m); };

const fonte = readFileSync("kit-ia-dae.html", "utf8");
ok(!/\bTJ\b|\bMP\b|Minist[ée]rio P[úu]blico|[Tt]ribuna|[Pp]romotori/.test(fonte), "sem TJ, MP, Ministério Público, tribunal ou promotoria");
ok(!/SEMAD|\bIEF\b|FEAM|Igam/.test(fonte), "sem órgão ligado ao autor");
ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(fonte), "sem CPF");
ok(!/kit-ia-dae/.test(readFileSync("sitemap.xml", "utf8")), "fora do sitemap");

const nav = await chromium.launch({ args: ["--no-proxy-server"] });
for (const [larg, alt] of [[1280, 900], [390, 844]]) {
  const ctx = await nav.newContext({ viewport: { width: larg, height: alt } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const pg = await ctx.newPage();
  const erros = [];
  pg.on("pageerror", e => erros.push(String(e)));
  const r = await pg.goto(BASE + "/kit-ia-dae.html", { waitUntil: "load" });
  ok(r.status() === 200, `${larg}px: abre`);
  ok(await pg.locator('meta[name="robots"][content*="noindex"]').count() === 1, `${larg}px: noindex`);
  ok(/Preparado com apoio de IA e revisado pelo autor\. Opiniões pessoais, sem representar órgão público\./.test(await pg.locator(".rodape").innerText()), `${larg}px: rodapé`);
  const mat = await pg.$$eval('nav[aria-label="Material da palestra"] .material a', as => as.map(a => [a.getAttribute("href"), a.getBoundingClientRect().height]));
  const esperados = ["palestra-ia-dae-2026.html", "memorial-geo.html", "ferramentas.html", "radar-audio.html#federal", "chao-geo-mg.html#baixar", "chaogeo/#baixar"];
  ok(mat.length === esperados.length && esperados.every((h, i) => mat[i][0] === h) && mat.every(([, a]) => a >= 44), `${larg}px: ${esperados.length} links do material da palestra, fáceis de tocar`);
  const fichas = await pg.locator("section.ficha").count();
  ok(fichas >= 10, `${larg}px: ${fichas} pedidos`);
  const sobra = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(sobra <= 0, `${larg}px: sem rolagem horizontal (sobra ${sobra})`);
  const margem = await pg.evaluate(() => document.querySelector("section.ficha").getBoundingClientRect().left);
  if (larg === 390) ok(margem >= 16, `390px: margem lateral ${margem}px`);

  // Estrutura padrão-ouro em todo pedido.
  const textos = await pg.$$eval("section.ficha pre", ps => ps.map(p => p.textContent));
  const partes = ["PAPEL", "TAREFA", "MATERIAL", "REGRAS", "SAÍDA"];
  ok(textos.every(t => partes.every(p => t.includes(p + "\n") || t.includes(p + " "))), `${larg}px: todo pedido tem as 5 partes`);
  ok(textos.every(t => /não encontrado|não está nas fontes|nada hoje|nenhum trecho/.test(t) || /REGRAS DE OURO|pedido final deve conter/.test(t)), `${larg}px: todo pedido traz a regra do "não encontrado" ou as regras de ouro`);

  // Todo botão Copiar copia o texto do seu pedido.
  const botoes = pg.locator("[data-copia]");
  const nb = await botoes.count();
  let certos = 0;
  for (let i = 0; i < nb; i++) {
    const b = botoes.nth(i);
    const id = await b.getAttribute("data-copia");
    await pg.evaluate(() => navigator.clipboard.writeText(""));
    await b.click();
    const copiado = await pg.evaluate(() => navigator.clipboard.readText());
    const esperado = await pg.locator("#" + id).textContent();
    if (copiado === esperado && copiado.length > 200) certos++; else console.log("  copiar errado:", id);
  }
  ok(certos === nb && nb === fichas, `${larg}px: ${certos}/${nb} botões Copiar copiam o texto certo`);

  // Filtros por público.
  const publicos = await pg.$$eval("[data-filtro]", bs => bs.map(b => [b.dataset.filtro, +b.querySelector("span").textContent]));
  for (const [f, n] of publicos) {
    await pg.click(`[data-filtro="${f}"]`);
    const visiveis = await pg.locator("section.ficha:visible").count();
    ok(visiveis === n, `${larg}px: filtro ${f} mostra ${visiveis} (esperado ${n})`);
  }
  ok(publicos.length === 6 && publicos.slice(1).every(([, n]) => n >= 1), `${larg}px: 5 públicos, todos com pedido`);
  // Com filtro ativo, link para pedido escondido volta a "Todos".
  await pg.click('[data-filtro="advogado"]');
  await pg.evaluate(() => { location.hash = "#triagem"; });
  await pg.waitForTimeout(200);
  ok(await pg.locator("#triagem").isVisible(), `${larg}px: âncora para pedido escondido reabre`);
  // Texto do pedido começa recolhido; os colchetes aparecem destacados.
  await pg.goto(BASE + "/kit-ia-dae.html", { waitUntil: "load" });
  ok(await pg.locator("details.pedido[open]").count() === 0, `${larg}px: pedidos começam recolhidos`);
  ok(await pg.locator("#p19 mark.campo").count() >= 3, `${larg}px: campos [entre colchetes] destacados`);
  // Busca sem acento e combinada com o público.
  await pg.fill("#busca", "infracao");
  ok(await pg.locator("section.ficha:visible").count() >= 1 && await pg.locator("#auto").isVisible(), `${larg}px: busca "infracao" acha o auto de infração`);
  await pg.click('[data-filtro="consultor"]');
  ok(await pg.locator("section.ficha:visible").count() === 0 && await pg.locator("#vazio").isVisible(), `${larg}px: busca + público sem resultado mostra aviso`);
  await pg.fill("#busca", "");
  await pg.click('[data-filtro="todos"]');
  // Link direto por público.
  await pg.goto(BASE + "/kit-ia-dae.html?publico=controle", { waitUntil: "load" });
  ok(await pg.locator("section.ficha:visible").count() === 2 && await pg.locator('[data-filtro="controle"][aria-pressed="true"]').count() === 1, `${larg}px: ?publico=controle abre filtrado`);
  // Link para um pedido abre o texto dele.
  await pg.goto(BASE + "/kit-ia-dae.html#minuta", { waitUntil: "load" });
  ok(await pg.locator("#minuta details.pedido[open]").count() === 1, `${larg}px: #minuta abre o texto do pedido`);
  await pg.screenshot({ path: process.env.FOTO_DIR ? `${process.env.FOTO_DIR}/kit-${larg}.png` : `/dev/null`, fullPage: false }).catch(() => {});
  ok(erros.length === 0, `${larg}px: sem erro de script ${erros.join(" | ")}`);
  await ctx.close();
}
await nav.close();
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo ok");
process.exit(falhas ? 1 : 0);
