import { chromium } from "playwright";
import { spawn } from "node:child_process"; import { readFileSync } from "node:fs";
const DIR = new URL(".", import.meta.url).pathname;
const dados = JSON.parse(readFileSync(DIR + "dados.json", "utf8"));
const nav = await chromium.launch({ args: ["--no-proxy-server", "--allow-file-access-from-files"] });
const pg = await nav.newPage({ viewport: { width: 1080, height: 1920 } });
const erros=[]; pg.on("pageerror", e => erros.push(String(e)));
await pg.addInitScript(d => { window.DADOS = d; }, dados);
await pg.goto("file://" + DIR + "anim.html"); await pg.waitForTimeout(500);
const foto = process.argv[2];
if (foto) { for (const s of foto.split(",")) { await pg.evaluate(t => render(t), +s); await pg.screenshot({ path: `${DIR}q-${s}.png` }); } }
else {
  const n = Math.floor(dados.dur * dados.fps);
  const ff = spawn("ffmpeg", ["-loglevel","error","-y","-f","image2pipe","-framerate",String(dados.fps),"-i","-","-i",DIR+"audio.mp3",
    "-c:v","libx264","-pix_fmt","yuv420p","-preset","medium","-crf","20","-c:a","aac","-b:a","128k","-shortest","-movflags","+faststart",DIR+"ana-ze-outorga.mp4"],{stdio:["pipe","inherit","inherit"]});
  for (let i = 0; i < n; i++) { await pg.evaluate(t => render(t), i / dados.fps); const b = await pg.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(b)) await new Promise(r => ff.stdin.once("drain", r)); }
  ff.stdin.end(); await new Promise(r => ff.on("close", r));
}
console.log(erros.length ? "ERROS: " + erros.join(" | ") : "sem erros");
await nav.close();
