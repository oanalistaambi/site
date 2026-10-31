// Teste da página radar-audio.html: episódios federais (DOU) com capítulos e áudios por tema de MG.
// Uso: python3 -m http.server 8765 (na raiz do site) e, em outro terminal,
//      BASE=http://127.0.0.1:8765 node _testes/radar-audio.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:8765";
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log("FALHA:", m); } else console.log("ok:", m); };
const OFICIAL = /^https:\/\/(www\.in\.gov\.br|www\.jornalminasgerais\.mg\.gov\.br)\//;
const dados = JSON.parse(readFileSync("radar/audio.json", "utf8"));
const dou = dados.fontes.find(f => f.id === "dou");
const mg = dados.fontes.find(f => f.id === "mg");

const nav = await chromium.launch({ args: ["--no-proxy-server", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
const pg = await ctx.newPage();
const erros = [];
pg.on("console", m => { if (m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) erros.push(m.text()); });
pg.on("pageerror", e => erros.push(String(e)));
const r = await pg.goto(BASE + "/radar-audio.html", { waitUntil: "networkidle" });
ok(r.status() === 200, "abre (HTTP " + r.status() + ")");
ok(await pg.locator('meta[name="robots"][content="noindex"]').count() === 1, "noindex");
ok(/inteligência artificial/.test(await pg.locator(".ra-aviso").innerText()), "aviso de IA visível");
ok(await pg.locator('#aba-federal[aria-selected="true"]').count() === 1, "abre na aba Federal");

// Federal: episódios
ok(dou.episodios.length >= 4, `DOU com pelo menos 4 edições (${dou.episodios.length})`);
ok(await pg.locator("#ra-painel .ra-ep").count() === dou.episodios.length, "um cartão por edição");
const audios = await pg.$$("#ra-painel audio");
ok(audios.length === dou.episodios.filter(e => e.audio).length, `${audios.length} episódio(s) com player`);
for (const [i, a] of audios.entries()) {
  const dur = await a.evaluate(el => new Promise(res => { if (el.readyState >= 1) return res(el.duration); el.onloadedmetadata = () => res(el.duration); el.onerror = () => res(-1); el.load(); }));
  const esperado = dou.episodios[i].duracao_s;
  ok(Math.abs(dur - esperado) < 3 && dur <= 300, `${dou.episodios[i].id}: MP3 carrega (${dur.toFixed(0)} s, até 5 min)`);
}
for (const ep of dou.episodios) {
  ok(ep.capitulos.every((c, k) => k === 0 || c.inicio_s > ep.capitulos[k - 1].inicio_s), `${ep.id}: capítulos em ordem de tempo`);
}
// pular para o 2º destaque do episódio mais recente
const ep0 = dou.episodios[0];
const alvo = ep0.capitulos.filter(c => c.atos.length)[0];
// pular no áudio exige servidor com Range (o GitHub Pages tem; o http.server do Python, não)
const range = (await ctx.request.get(BASE + "/" + ep0.audio, { headers: { Range: "bytes=0-99" } })).status() === 206;
await pg.locator(".ra-ep--destaque .ra-cap__t").first().click();
await pg.waitForTimeout(800);
const t = await pg.$eval(`#ep-${ep0.data}`, el => el.currentTime);
if (range) ok(Math.abs(t - alvo.inicio_s) < 1.5, `capítulo pula para ${alvo.inicio_s} s (${t.toFixed(1)})`);
else console.log(`(pulado: o servidor de teste não aceita Range; o salto de capítulo é conferido no site publicado)`);
await pg.locator(".ra-ep--destaque [data-vel='1.5']").click();
ok(await pg.$eval(`#ep-${ep0.data}`, el => el.playbackRate) === 1.5, "velocidade 1,5×");
await pg.$eval(`#ep-${ep0.data}`, el => el.pause());
let links = await pg.$$eval("#ra-painel .ra-ato a", as => as.map(a => a.href));
ok(links.length > 0 && links.every(h => OFICIAL.test(h)), `federal: todo ato com link oficial (${links.length})`);
ok(await pg.evaluate(() => document.documentElement.scrollWidth) <= 390, "federal: sem rolagem lateral em 390 px");

// Minas Gerais
await pg.click("#aba-mg");
ok(await pg.locator("#ra-painel .ra-ep").count() === mg.temas.length, `MG: ${mg.temas.length} tema(s)`);
for (const a of await pg.$$("#ra-painel audio")) {
  const dur = await a.evaluate(el => new Promise(res => { if (el.readyState >= 1) return res(el.duration); el.onloadedmetadata = () => res(el.duration); el.onerror = () => res(-1); el.load(); }));
  ok(dur > 10 && dur < 45, `MG: áudio carrega (${dur.toFixed(1)} s)`);
}
links = await pg.$$eval("#ra-painel .ra-ato a", as => as.map(a => a.href));
ok(links.every(h => OFICIAL.test(h)), `MG: links oficiais (${links.length})`);
ok(await pg.evaluate(() => document.documentElement.scrollWidth) <= 390, "MG: sem rolagem lateral em 390 px");

const txt = await pg.locator("main").innerText() + JSON.stringify(dados);
ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{5}\.\d{6}\/\d{4}-\d{2}/.test(txt), "sem CPF, CNPJ ou processo (tela e dados)");
await pg.goto(BASE + "/radar-audio.html#mg", { waitUntil: "networkidle" });
ok(await pg.locator('#aba-mg[aria-selected="true"]').count() === 1, "#mg abre direto na aba Minas Gerais");
// podcast: bloco na página, RSS válido e arquivos que os apps vão baixar
await pg.click("#aba-federal");
ok(await pg.locator(".ra-pod [data-copiar]").count() === 1, "bloco do podcast com o link do RSS");
const rss = await (await ctx.request.get(BASE + "/radar/podcast.xml")).text();
const itens = [...rss.matchAll(/<enclosure url="https:\/\/www\.oanalistaambiental\.com\/([^"]+)" length="(\d+)" type="audio\/mpeg"\/>/g)];
ok(/<itunes:owner>/.test(rss) && /<itunes:image href="https:\/\/www\.oanalistaambiental\.com\/radar\/podcast-capa\.jpg"\/>/.test(rss), "RSS com dono e capa");
ok(itens.length === dou.episodios.filter(e => e.audio).length, `RSS com ${itens.length} episódio(s)`);
for (const [, arq, tam] of itens) {
  const r = await ctx.request.get(BASE + "/" + arq);
  ok(r.status() === 200 && (await r.body()).length === +tam, `RSS: ${arq} existe com ${tam} bytes`);
}
const capa = await (await ctx.request.get(BASE + "/radar/podcast-capa.jpg")).body();
const sof = capa.indexOf(Buffer.from([0xff, 0xc0])) >= 0 ? capa.indexOf(Buffer.from([0xff, 0xc0])) : capa.indexOf(Buffer.from([0xff, 0xc2]));
ok(capa.readUInt16BE(sof + 5) === 3000 && capa.readUInt16BE(sof + 7) === 3000, "capa do podcast em 3000×3000");
ok(erros.length === 0, "sem erro de console " + erros.join(" | "));
for (const p of ["/index.html", "/radar.html", "/ferramentas.html", "/sitemap.xml"]) {
  const t = await (await ctx.request.get(BASE + p)).text();
  ok(!t.includes("radar-audio"), `${p} não aponta para radar-audio (fora dos menus; o kit do DAE aponta desde o PR #36)`);
}
await nav.close();
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
