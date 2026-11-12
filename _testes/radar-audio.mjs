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
const comAudio = dou.episodios.filter(e => e.audio); // episódio sem crédito de voz sai sem MP3 (voz do navegador)
const mg = dados.fontes.find(f => f.id === "mg");

const nav = await chromium.launch({ args: ["--no-proxy-server", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
const pg = await ctx.newPage();
await ctx.addInitScript(() => { HTMLMediaElement.prototype.play = function () { Object.defineProperty(this, "paused", { value: false, configurable: true }); this.dispatchEvent(new Event("play")); return Promise.resolve(); }; HTMLMediaElement.prototype.pause = function () { Object.defineProperty(this, "paused", { value: true, configurable: true }); };
  window.__falas = []; if (window.speechSynthesis) { speechSynthesis.speak = u => window.__falas.push(u.text); speechSynthesis.cancel = () => {}; } });
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
  const esperado = comAudio[i].duracao_s;
  ok(Math.abs(dur - esperado) < 3 && dur <= 300, `${comAudio[i].id}: MP3 carrega (${dur.toFixed(0)} s, até 5 min)`);
}
for (const ep of comAudio) {
  ok(ep.capitulos.every((c, k) => k === 0 || c.inicio_s > ep.capitulos[k - 1].inicio_s), `${ep.id}: capítulos em ordem de tempo`);
}
// "Ouvir agora": toca o episódio mais recente; ao terminar, segue para o anterior; tela bloqueada recebe título e capa
ok(await pg.waitForFunction(() => !document.getElementById("ra-agora").disabled, null, { timeout: 15000 }).then(() => true, () => false), "botão Ouvir agora fica ativo");
await pg.click("#ra-agora");
await pg.waitForTimeout(700);
if (comAudio.length) {
  ok(await pg.$eval(`#ep-${comAudio[0].data}`, el => !el.paused), "Ouvir agora toca o episódio mais recente com áudio");
  ok(/DOU de/.test(await pg.evaluate(() => navigator.mediaSession && navigator.mediaSession.metadata ? navigator.mediaSession.metadata.title : "")), "título e capa vão para a tela bloqueada");
} else {
  const lido = await pg.evaluate(() => window.__falas.join(" "));
  ok(lido.includes(dou.episodios[0].capitulos[0].fala.slice(0, 40)), "sem MP3, Ouvir agora lê o episódio mais recente com a voz do navegador");
}
if (comAudio.length >= 2) { // a sequência só existe com dois ou mais episódios com áudio na página
  await pg.$eval(`#ep-${comAudio[0].data}`, el => el.dispatchEvent(new Event("ended")));
  await pg.waitForTimeout(700);
  ok(await pg.$eval(`#ep-${comAudio[1].data}`, el => !el.paused), "ao terminar, segue para a edição anterior");
} else console.log("(sequência não conferida: só um episódio com áudio na página hoje)");
await pg.$$eval("#ra-painel audio", as => as.forEach(a => a.pause()));
const assinar = await pg.$$eval("#assinar a", as => as.map(a => a.getAttribute("href")));
ok(assinar.some(h => /^pktc:\/\/subscribe\/www\.oanalistaambiental\.com\/radar\/podcast\.xml$/.test(h)), "botão de assinar no app de podcast");
{ // no Android, Pocket Casts e Podcast Addict abrem o app ou a Play Store
  const and = await (await nav.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36" })).newPage();
  await and.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await and.goto(BASE + "/radar-audio.html", { waitUntil: "networkidle" });
  const hs = await and.$$eval("#assinar a", as => as.map(a => a.getAttribute("href")));
  ok(hs.some(h => /^https:\/\/antennapod\.org\/deeplink\/subscribe\//.test(h)) && hs.filter(h => /^intent:\/\/.*S\.browser_fallback_url=https%3A%2F%2Fplay\.google\.com/.test(h)).length === 2, "Android: AntennaPod, e Pocket Casts e Podcast Addict com volta para a Play Store");
  await and.close();
}
// pular para o 2º destaque do episódio mais recente
if (comAudio.length) {
const ep0 = comAudio[0];
const alvo = ep0.capitulos.filter(c => c.atos.length)[0];
// pular no áudio exige servidor com Range (o GitHub Pages tem; o http.server do Python, não)
const range = (await ctx.request.get(BASE + "/" + ep0.audio, { headers: { Range: "bytes=0-99" } })).status() === 206;
const art0 = pg.locator(`article:has(#ep-${ep0.data})`);
if (!(await art0.locator(".ra-cap__t").first().isVisible())) await art0.locator("details summary").first().click();
await art0.locator(".ra-cap__t").first().click();
await pg.waitForTimeout(800);
const t = await pg.$eval(`#ep-${ep0.data}`, el => el.currentTime);
if (range) ok(Math.abs(t - alvo.inicio_s) < 1.5, `capítulo pula para ${alvo.inicio_s} s (${t.toFixed(1)})`);
else console.log(`(pulado: o servidor de teste não aceita Range; o salto de capítulo é conferido no site publicado)`);
await art0.locator("[data-vel='1.5']").click();
ok(await pg.$eval(`#ep-${ep0.data}`, el => el.playbackRate) === 1.5, "velocidade 1,5×");
await pg.$eval(`#ep-${ep0.data}`, el => el.pause());
} else console.log("(capítulos e velocidade não conferidos: nenhum episódio com MP3 na página hoje)");
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
ok(/<title>Ambiental Inteligência<\/title>/.test(rss), "podcast se chama Ambiental Inteligência");
ok(/<itunes:owner>/.test(rss) && /<itunes:image href="https:\/\/www\.oanalistaambiental\.com\/radar\/podcast-capa\.jpg"\/>/.test(rss), "RSS com dono e capa");
ok(itens.length === (dou.podcast || dou.episodios).filter(e => e.audio).length && itens.length > 0, `RSS com ${itens.length} episódio(s)`);
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
{
  const semMp3 = JSON.parse(JSON.stringify(dados));
  semMp3.fontes.forEach(f => (f.episodios || []).forEach(e => { e.audio = null; e.duracao_s = null; }));
  const p2 = await ctx.newPage();
  await p2.route(/radar\/audio\.json/, r => r.fulfill({ contentType: "application/json", body: JSON.stringify(semMp3) }));
  await p2.goto(BASE + "/radar-audio.html", { waitUntil: "networkidle" });
  const ativo = await p2.waitForFunction(() => !document.getElementById("ra-agora").disabled, null, { timeout: 8000 }).then(() => true, () => false);
  ok(ativo, "regressão 12/11: sem nenhum MP3, o botão Ouvir agora não fica desativado");
  if (ativo) { await p2.click("#ra-agora"); await p2.waitForTimeout(400); }
  ok((await p2.evaluate(() => window.__falas.join(" "))).includes(semMp3.fontes.find(f => f.id === "dou").episodios[0].capitulos[0].fala.slice(0, 40)),
     "regressão 12/11: e lê o episódio mais recente com a voz do navegador");
  await p2.close();
}
await nav.close();
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
