// Renderiza cena.html quadro a quadro e entrega ao ffmpeg (com o áudio). Uso: node render.mjs [segundo_para_foto]
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const DIR = new URL(".", import.meta.url).pathname;
const BASE = process.env.BASE || "/tmp/pilula"; // BASE.mp3 (áudio) e BASE.dados.json (amplitude e tempos)
const dados = JSON.parse(readFileSync(BASE + ".dados.json", "utf8"));
const nav = await chromium.launch({ args: ["--no-proxy-server", "--allow-file-access-from-files"] });
const pg = await nav.newPage({ viewport: { width: 1080, height: 1920 } });
await pg.addInitScript(d => { window.DADOS = d; }, dados);
await pg.goto("file://" + DIR + "cena.html");
await pg.waitForTimeout(500);
const foto = process.argv[2];
if (foto) {
  for (const s of foto.split(",")) { await pg.evaluate(t => render(t), +s); await pg.screenshot({ path: `${BASE}-quadro-${s}.png` }); }
} else {
  const n = Math.floor(dados.dur * dados.fps);
  const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(dados.fps), "-i", "-",
    "-i", BASE + ".mp3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
    "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", BASE + ".mp4"], { stdio: ["pipe", "inherit", "inherit"] });
  for (let i = 0; i < n; i++) {
    await pg.evaluate(t => render(t), i / dados.fps);
    const buf = await pg.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (i % 240 === 0) console.log(`${i}/${n}`);
  }
  ff.stdin.end(); await new Promise(r => ff.on("close", r));
}
await nav.close();
