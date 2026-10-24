// Teste da página radar-audio.html (abas MG e Federal, links oficiais, aviso de IA, voz do navegador sem MP3).
// Uso: python3 -m http.server 8765 (na raiz do site) e, em outro terminal,
//      BASE=http://127.0.0.1:8765 node _testes/radar-audio.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:8765";
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log("FALHA:", m); } else console.log("ok:", m); };

const nav = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
const pg = await ctx.newPage();
const erros = [];
pg.on("console", m => { if (m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) erros.push(m.text()); });
pg.on("pageerror", e => erros.push(String(e)));
const r = await pg.goto(BASE + "/radar-audio.html", { waitUntil: "networkidle" });
ok(r.status() === 200, "abre (HTTP " + r.status() + ")");
ok(await pg.locator('meta[name="robots"][content="noindex"]').count() === 1, "noindex");
ok(/gerad[ao] por IA/.test(await pg.locator(".ra-ia").innerText()), "aviso de IA visível");
const dados = JSON.parse(readFileSync("radar/audio.json", "utf8"));
for (const [fid, aba] of [["mg", "#aba-mg"], ["dou", "#aba-federal"]]) {
  await pg.click(aba);
  const f = dados.fontes.find(x => x.id === fid);
  ok(await pg.locator(aba + '[aria-selected="true"]').count() === 1, `${fid}: aba selecionada`);
  ok(await pg.locator("#ra-painel .ra-tema:not(details)").count() === f.temas.length, `${fid}: ${f.temas.length} tema(s) na tela`);
  const links = await pg.$$eval("#ra-painel .ra-ato a", as => as.map(a => a.href));
  ok(links.length > 0 && links.every(h => /^https:\/\/(www\.in\.gov\.br|www\.jornalminasgerais\.mg\.gov\.br)\//.test(h)), `${fid}: todo ato com link oficial (${links.length})`);
  const semAudio = f.temas.filter(t => !t.audio).length;
  ok(await pg.locator("#ra-painel .ra-ouvir").count() + await pg.locator("#ra-painel audio").count() === f.temas.length,
    `${fid}: cada tema tem áudio ou botão de voz do navegador (${semAudio} sem MP3)`);
  const larg = await pg.evaluate(() => document.documentElement.scrollWidth);
  ok(larg <= 390, `${fid}: sem rolagem lateral em 390 px (${larg})`);
}
const txt = await pg.locator("main").innerText();
ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{5}\.\d{6}\/\d{4}-\d{2}/.test(txt), "sem CPF, CNPJ ou processo na tela");
await pg.goto(BASE + "/radar-audio.html#federal", { waitUntil: "networkidle" });
ok(await pg.locator('#aba-federal[aria-selected="true"]').count() === 1, "#federal abre direto na aba federal");
ok(erros.length === 0, "sem erro de console " + erros.join(" | "));
for (const p of ["/index.html", "/radar.html", "/ferramentas.html", "/kit-ia-dae.html", "/sitemap.xml"]) {
  const t = await (await ctx.request.get(BASE + p)).text();
  ok(!t.includes("radar-audio"), `${p} não aponta para radar-audio (fora dos menus)`);
}
await nav.close();
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
