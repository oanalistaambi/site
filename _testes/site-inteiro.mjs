// Teste do site inteiro: abre TODAS as páginas publicadas no celular (390 px) e no computador
// (1366 px), como a pessoa que antes navegava o site todo para ver se nada quebrou.
// Confere em cada página: abre (HTTP 200), sem rolagem lateral, sem erro de JavaScript,
// título, descrição, idioma, ajuste para celular e imagem de compartilhamento (og:image);
// todo link e arquivo interno existe; nenhuma imagem passa de 500 KB; o menu do celular abre.
// Confere também que todo endereço do sitemap.xml existe.
// Uso: npm test (sobe o servidor e roda todos os testes) ou, com o servidor no ar,
//      BASE=http://127.0.0.1:8765 node _testes/site-inteiro.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://127.0.0.1:8765";
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const LIMITE_IMG = 500 * 1024;
let falhas = 0, oks = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log("FALHA:", m); } else { oks++; if (process.env.DETALHE) console.log("ok:", m); } };

// Páginas: todo .html fora de pastas com "_" ou "." (não publicadas) e de node_modules.
// radar/estudio/ são quadros de vídeo 1080 x 1920 (noindex), fora do teste de página.
function paginas(dir = RAIZ, rel = "") {
  const saida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("_") || e.name.startsWith(".") || e.name === "node_modules") continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (r !== "radar/estudio") saida.push(...paginas(path.join(dir, e.name), r)); }
    else if (e.name.endsWith(".html")) saida.push(r);
  }
  return saida.sort();
}

// Endereço do site → arquivo, como o GitHub Pages resolve ("x" → x, x.html ou x/index.html).
function arquivoDe(urlPath) {
  const p = decodeURIComponent(urlPath.split(/[?#]/)[0]).replace(/^\//, "");
  const alvo = path.join(RAIZ, p);
  for (const c of [alvo, alvo + ".html", path.join(alvo, "index.html")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const lista = paginas();
const nav = await chromium.launch({ args: ["--no-proxy-server"] });

// 1) Sitemap: todo endereço publicado existe.
const sitemap = fs.readFileSync(path.join(RAIZ, "sitemap.xml"), "utf8");
for (const [, loc] of sitemap.matchAll(/<loc>https:\/\/www\.oanalistaambiental\.com(\/[^<]*)<\/loc>/g)) {
  ok(arquivoDe(loc) !== null, `sitemap: ${loc} existe`);
}

const internos = new Map();   // caminho → página onde apareceu
for (const [nome, viewport] of [["celular", { width: 390, height: 844 }], ["computador", { width: 1366, height: 800 }]]) {
  const ctx = await nav.newContext({ viewport });
  // Nada de rede externa (fontes do Google, APIs): só o servidor local.
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  for (const p of lista) {
    const pg = await ctx.newPage();
    const erros = [];
    pg.on("pageerror", e => erros.push(String(e).slice(0, 160)));
    pg.on("console", m => { if (m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) erros.push(m.text().slice(0, 160)); });
    const r = await pg.goto(`${BASE}/${p}`, { waitUntil: "load" }).catch(e => null);
    ok(r && r.status() === 200, `${nome}: ${p} abre (HTTP ${r && r.status()})`);
    if (!r) { await pg.close(); continue; }
    const info = await pg.evaluate(() => ({
      largura: document.documentElement.scrollWidth,
      titulo: document.title.trim(),
      descricao: document.querySelector('meta[name="description"]')?.content?.trim() || "",
      viewport: !!document.querySelector('meta[name="viewport"]'),
      lang: document.documentElement.lang,
      ogImage: document.querySelector('meta[property="og:image"]')?.content || "",
      noindex: /noindex/.test(document.querySelector('meta[name="robots"]')?.content || ""),
      semAlt: [...document.images].filter(i => !i.hasAttribute("alt")).map(i => i.getAttribute("src")),
      refs: [...document.querySelectorAll("a[href], img[src], script[src], link[href], source[src], audio[src], video[src]")]
        .map(e => e.getAttribute("href") ?? e.getAttribute("src"))
    }));
    ok(info.largura <= viewport.width, `${nome}: ${p} sem rolagem lateral (${info.largura} px)`);
    ok(erros.length === 0, `${nome}: ${p} sem erro de JavaScript ${erros.join(" | ")}`);
    if (nome === "celular") {
      ok(info.titulo.length > 0, `${p} tem título`);
      ok(info.descricao.length >= 50, `${p} tem descrição (${info.descricao.length} caracteres)`);
      ok(info.viewport, `${p} ajusta à tela do celular (meta viewport)`);
      ok(/^pt|^en/.test(info.lang), `${p} declara o idioma (${info.lang || "sem lang"})`);
      ok(info.noindex || info.ogImage.startsWith("https://www.oanalistaambiental.com/"), `${p} tem imagem de compartilhamento (og:image)`);
      if (info.ogImage.startsWith("https://www.oanalistaambiental.com/")) {
        ok(arquivoDe(new URL(info.ogImage).pathname) !== null, `${p}: og:image existe (${info.ogImage})`);
      }
      ok(info.semAlt.length === 0, `${p}: toda imagem tem texto alternativo ${info.semAlt.join(", ")}`);
      for (const ref of info.refs) {
        if (!ref || /^(https?:|mailto:|tel:|data:|javascript:|#|\/\/)/.test(ref)) continue;
        const abs = new URL(ref, `${BASE}/${p}`);
        if (abs.origin !== new URL(BASE).origin) continue;
        if (!internos.has(abs.pathname)) internos.set(abs.pathname, p);
      }
      // Menu do celular: o botão ☰ abre a lista de links.
      if (await pg.locator(".nav__burger").count() === 1) {
        await pg.locator(".nav__burger").click();
        ok(await pg.locator(".nav__links.is-open").isVisible(), `${p}: o menu do celular abre`);
      }
    }
    await pg.close();
  }
  await ctx.close();
}
await nav.close();

// 2) Links e arquivos internos existem; imagem pesada deixa a página lenta no celular.
for (const [caminho, origem] of internos) {
  const arq = arquivoDe(caminho);
  ok(arq !== null, `link interno ${caminho} (em ${origem}) existe`);
  if (arq && /\.(png|jpe?g|webp|gif|svg)$/i.test(arq)) {
    const tam = fs.statSync(arq).size;
    ok(tam <= LIMITE_IMG, `imagem ${caminho} até 500 KB (${Math.round(tam / 1024)} KB)`);
  }
}

console.log(`\n${lista.length} páginas, ${oks} verificações certas, ${falhas} falha(s).`);
if (falhas) { console.log("Há falhas."); process.exit(1); }
console.log("Tudo certo.");
