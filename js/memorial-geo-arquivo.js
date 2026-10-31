/* ==========================================================================
   Leitura de arquivo para a página memorial-geo.html: PDF com texto, PDF
   escaneado e foto da certidão. Tudo no navegador, nada vai para servidor.

   - PDF com texto (gerado no computador, como o do SIGEF): o texto sai do
     próprio arquivo, pelo pdf.js (Mozilla).
   - Página sem texto (escaneada) e foto: reconhecimento de texto por imagem
     (OCR), pelo Tesseract.js, com o modelo do português.

   Mesma ideia do LeitorPdf.kt do app Chão Geo MG: página com texto vem do PDF,
   página sem texto vai para o OCR, no máximo 40 páginas de OCR, e as linhas de
   tabela são remontadas pela posição na página (MemorialGeo.montarLinhas).

   As bibliotecas ficam em js/vendor/ (versão no nome da pasta). A página baixa
   cada arquivo com fetch, que passa pelo service worker: depois do primeiro uso
   a leitura funciona sem internet. Os workers recebem o código e o modelo já
   baixados, sem buscar nada sozinhos.
   ========================================================================== */
(function (raiz) {
  "use strict";
  var M = raiz.MemorialGeo;
  var VENDOR = new URL("js/vendor/", document.baseURI).href;
  var PDFJS = VENDOR + "pdfjs-6.4.299/";
  var TESS = VENDOR + "tesseract-7.0.0/";
  /** Página aberta do disco (file://, ou content:// no Android): sem origem própria. */
  var SEM_ORIGEM = !/^https?:$/.test(location.protocol);
  /** Acima disto, página escaneada fica sem OCR (a mesma regra do app). */
  var LIMITE_OCR = 40;
  /**
   * Larguras da página desenhada para o OCR (~250 e ~190 dpi num A4). O OCR erra um dígito aqui e
   * ali, e cada tamanho erra em lugar diferente. O memorial traz o próprio teste, o fechamento:
   * se a primeira leitura não fecha bem, as páginas escaneadas são lidas de novo no segundo tamanho
   * e fica a leitura que fecha melhor.
   */
  var LARGURAS_OCR = [2100, 1600];

  function Falha(msg) { var e = new Error(msg); e.falha = true; return e; }

  // ------------------------------------------------------------ baixar as bibliotecas

  var guardados = {};
  /** Baixa um arquivo das bibliotecas (o service worker guarda) e devolve o conteúdo. */
  function baixar(url, tipo) {
    if (!guardados[url + tipo]) {
      guardados[url + tipo] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return tipo === "texto" ? r.text() : r.arrayBuffer();
      }).catch(function (e) {
        delete guardados[url + tipo];
        throw Falha(navigator.onLine === false
          ? "Sem internet, e o leitor de PDF ainda não foi guardado neste navegador. Abra a página com internet uma vez e use o arquivo; depois ele funciona sem internet."
          : "Não deu para carregar o leitor de PDF (" + (e && e.message || e) + "). Tente de novo.");
      });
    }
    return guardados[url + tipo];
  }
  function encerrar(w) { try { var p = w.terminate(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* já encerrado */ } }
  function blobUrl(codigo) { return URL.createObjectURL(new Blob([codigo], { type: "text/javascript" })); }

  /**
   * Worker do tipo módulo funciona aqui? Não funciona numa página sem origem (o HTML único aberto do
   * disco, file:// ou content:// no Android): o worker morre calado e o pdf.js esperaria para sempre.
   */
  function workerModuloFunciona() {
    return new Promise(function (ok) {
      var w;
      try { w = new Worker(blobUrl("postMessage(1)"), { type: "module" }); } catch (e) { ok(false); return; }
      var fim = function (v) { clearTimeout(relogio); w.terminate(); ok(v); };
      var relogio = setTimeout(function () { fim(false); }, 4000);
      w.onmessage = function () { fim(true); };
      w.onerror = function () { fim(false); };
    });
  }

  var pdfjsPromessa = null;
  /**
   * pdf.js, importado de um blob (não depende do tipo que o servidor dá ao .mjs) e com o worker já criado.
   * Sem worker de módulo, o pdf.js roda na própria página (mais lento num PDF grande, mas lê).
   */
  function pdfjs() {
    if (!pdfjsPromessa) {
      pdfjsPromessa = Promise.all([baixar(PDFJS + "pdf.min.mjs", "texto"), baixar(PDFJS + "pdf.worker.min.mjs", "texto"), workerModuloFunciona()]).then(function (c) {
        return import(blobUrl(c[0])).then(function (lib) {
          if (c[2]) {
            lib.GlobalWorkerOptions.workerPort = new Worker(blobUrl(c[1]), { type: "module" });
            return lib;
          }
          return import(blobUrl(c[1])).then(function (trabalho) { raiz.pdfjsWorker = trabalho; return lib; });
        });
      }).catch(function (e) { pdfjsPromessa = null; throw e.falha ? e : Falha("Este navegador não conseguiu abrir o leitor de PDF (" + (e && e.message || e) + ")."); });
    }
    return pdfjsPromessa;
  }

  var tesseractPromessa = null;
  function tesseract() {
    if (!tesseractPromessa) {
      tesseractPromessa = baixar(TESS + "tesseract.min.js", "texto").then(function (codigo) {
        return new Promise(function (ok, erro) {
          var s = document.createElement("script");
          s.src = blobUrl(codigo);
          s.onload = function () { raiz.Tesseract ? ok(raiz.Tesseract) : erro(Falha("O OCR não carregou.")); };
          s.onerror = function () { erro(Falha("O OCR não carregou.")); };
          document.head.appendChild(s);
        });
      }).catch(function (e) { tesseractPromessa = null; throw e; });
    }
    return tesseractPromessa;
  }

  /** Qual versão do motor o aparelho roda (os mesmos testes que o Tesseract.js faz sozinho). */
  function versaoDoMotor() {
    function aceita(bytes) { try { return WebAssembly.validate(new Uint8Array(bytes)); } catch (e) { return false; } }
    if (aceita([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11])) return "tesseract-core-relaxedsimd-lstm.wasm.js";
    if (aceita([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])) return "tesseract-core-simd-lstm.wasm.js";
    return "tesseract-core-lstm.wasm.js";
  }

  /**
   * O Tesseract.js 7 tem um defeito ao receber o idioma já em memória ({ code, data }): carrega o
   * modelo e depois tenta abrir os bytes como nome do idioma. Então a página grava o modelo que ela
   * baixou no mesmo cache local que o Tesseract lê (IndexedDB "keyval-store", tabela "keyval", do
   * idb-keyval) e o leitor o encontra ali, sem rede. Se o navegador não deixar gravar, o Tesseract
   * busca o modelo em langPath (com internet).
   */
  var CACHE_TESS = "memorial-geo-tess-7";
  function gravarModelo(dados) {
    return new Promise(function (ok) {
      try {
        var req = indexedDB.open("keyval-store");
        req.onupgradeneeded = function () { req.result.createObjectStore("keyval"); };
        req.onerror = function () { ok(false); };
        req.onsuccess = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains("keyval")) { db.close(); ok(false); return; }
          var tx = db.transaction("keyval", "readwrite");
          tx.objectStore("keyval").put(new Uint8Array(dados), CACHE_TESS + "/por.traineddata");
          tx.oncomplete = function () { db.close(); ok(true); };
          tx.onerror = tx.onabort = function () { db.close(); ok(false); };
        };
      } catch (e) { ok(false); }
    });
  }

  /**
   * Um "leitor de imagem" do Tesseract, com o português. Na primeira vez baixa uns 5 MB (o motor e
   * o modelo); depois vem do cache do navegador. `aoProgresso(fracao, frase, reconhecendo)`.
   */
  async function criarOcr(aoProgresso) {
    aoProgresso = aoProgresso || function () {};
    aoProgresso(0, "Preparando o leitor de imagem (na primeira vez baixa cerca de 5 MB)…");
    var T = await tesseract();
    var motor = TESS + "core/" + versaoDoMotor();
    var op;
    if (SEM_ORIGEM) {
      // HTML único aberto do disco: o worker não enxerga os blobs da página nem o IndexedDB dela, então
      // ele mesmo busca o motor e o modelo no site (precisa de internet, como a página avisa).
      op = { workerPath: blobUrl(await baixar(TESS + "worker.min.js", "texto")), workerBlobURL: false,
        langPath: TESS + "lang", corePath: motor, cacheMethod: "none" };
    } else {
      var partes = await Promise.all([
        baixar(TESS + "worker.min.js", "texto"),
        baixar(motor, "texto"),
        baixar(TESS + "lang/por.traineddata.gz", "binario")
      ]);
      await gravarModelo(partes[2]);
      op = {
        workerPath: blobUrl(partes[0]),
        workerBlobURL: false,
        langPath: TESS + "lang",
        cachePath: CACHE_TESS,
        // O Tesseract.js só usa o endereço como arquivo se ele terminar em "js"; o "#…" não muda o blob.
        corePath: blobUrl(partes[1]) + "#motor.js",
        cacheMethod: "readOnly"
      };
    }
    var fase = "";
    op.logger = function (m) {
      if (m.status === "recognizing text") aoProgresso(m.progress, "Reconhecendo o texto da imagem…", true);
      else if (m.status !== fase) { fase = m.status; aoProgresso(0, "Preparando o leitor de imagem…"); }
    };
    var w = await T.createWorker("por", 1, op);
    await w.setParameters({ preserve_interword_spaces: "1" });
    return w;
  }

  /**
   * OCR de uma imagem (canvas): as linhas do Tesseract remontadas pela posição, e as correções de OCR.
   * O Tesseract não abandona um reconhecimento em andamento; o "Parar" corta a espera pelo `sinal`.
   * A imagem vai em bytes PNG já prontos: com o canvas, o Tesseract ainda converteria a imagem antes de
   * mandar o pedido ao worker, e um "Parar" nesse meio deixaria um erro solto (worker já encerrado).
   */
  async function reconhecer(w, canvas, sinal) {
    var espera = function (p) { return sinal && sinal.cancelado ? Promise.race([p, sinal.cancelado]) : p; };
    var png = await espera(new Promise(function (ok, erro) {
      canvas.toBlob(function (b) { b ? b.arrayBuffer().then(ok, erro) : erro(Falha("Não deu para preparar a imagem para o OCR.")); }, "image/png");
    }));
    if (sinal && sinal.parado) throw Falha("Leitura interrompida.");
    var r = await espera(w.recognize(new Uint8Array(png), {}, { text: true, blocks: true }));
    var linhas = [];
    (r.data.blocks || []).forEach(function (b) {
      (b.paragraphs || []).forEach(function (p) { linhas.push.apply(linhas, p.lines || []); });
    });
    var pedacos = M.pedacosDoOcr(linhas, canvas.width);
    return M.limparOcr(pedacos.length ? M.montarLinhas(pedacos) : r.data.text || "");
  }

  /** Foto ou imagem num canvas, de pé (EXIF) e num tamanho bom para o OCR. */
  async function imagemEmCanvas(arquivo) {
    var bmp;
    try { bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" }); }
    catch (e) { throw Falha("Não deu para abrir esta imagem. Use JPG ou PNG (foto HEIC do iPhone: exporte como JPG)."); }
    var k = bmp.width > 3200 ? 3200 / bmp.width : bmp.width < 1400 ? 1400 / bmp.width : 1;
    var c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return c;
  }

  /** Texto da página do PDF, com as linhas remontadas pela posição (tabela volta a ficar em linha). */
  async function textoDaPagina(pagina) {
    var tc = await pagina.getTextContent();
    var vp = pagina.getViewport({ scale: 1 });
    var pedacos = tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
      var t = it.transform, h = Math.max(1, it.height || Math.hypot(t[2], t[3]));
      var y = vp.height - t[5];
      return { texto: it.str, x0: t[4], x1: t[4] + (it.width || 0), y0: y - h, y1: y };
    });
    return M.montarLinhas(pedacos);
  }

  async function desenhar(pagina, largura) {
    var vp0 = pagina.getViewport({ scale: 1 });
    var vp = pagina.getViewport({ scale: Math.min(4, largura / vp0.width) });
    var c = document.createElement("canvas");
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await pagina.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise;
    return c;
  }

  /** Nota de uma leitura, para escolher entre duas: fecha bem > fecha com folga > não fecha; depois mais lados; depois melhor 1:N. */
  function nota(texto) {
    var r = M.analisar(texto), p = r.poligonal;
    if (!p) return [0, r.lados.length, 0];
    var q = p.fonte === "coordenadas" ? "ok" : p.qualidade.nivel;
    return [q === "ok" ? 3 : q === "atencao" ? 2 : 1, r.lados.length, p.precisaoRelativa || 1e12];
  }
  function melhorQue(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; }
  function redimensionar(c, k) {
    var d = document.createElement("canvas");
    d.width = Math.round(c.width * k); d.height = Math.round(c.height * k);
    var ctx = d.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, d.width, d.height);
    ctx.drawImage(c, 0, 0, d.width, d.height);
    return d;
  }

  // ------------------------------------------------------------ leitura

  /**
   * Lê o arquivo e devolve { paginas: [{ texto, origem: "pdf" | "ocr" | "texto" | "sem-ocr" }], ocr, semOcr }.
   * op: { forcarOcr, progresso(fracao, frase), sinal: { parado } }. Página com menos de 20 letras é
   * tratada como escaneada (a mesma regra do app).
   */
  async function ler(arquivo, op) {
    op = op || {};
    var prog = op.progresso || function () {}, sinal = op.sinal || {};
    sinal.cancelado = new Promise(function (_, erro) { sinal.cancelar = function () { erro(Falha("Leitura interrompida.")); }; });
    sinal.cancelado.catch(function () {});
    var nome = arquivo.name || "", tipo = arquivo.type || "";
    function parar() { if (sinal.parado) throw Falha("Leitura interrompida."); }

    if (tipo === "text/plain" || /\.txt$/i.test(nome)) return { paginas: [{ texto: await arquivo.text(), origem: "texto" }], ocr: 0, semOcr: 0 };

    if (/^image\//.test(tipo) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(nome)) {
      prog(0, "Abrindo a imagem…");
      var canvas = await imagemEmCanvas(arquivo);
      var leituraImg = "";
      var w = await criarOcr(function (f, frase, lendo) { prog(lendo ? f : 0, lendo ? "Reconhecendo o texto da imagem (OCR)" + leituraImg + ": " + Math.round(f * 100) + "%…" : frase); });
      sinal.ocr = w;
      var segunda = false;
      try {
        parar();
        var t = await reconhecer(w, canvas, sinal);
        if (nota(t)[0] < 3) {
          parar();
          leituraImg = ", segunda leitura em outro tamanho";
          var t2 = await reconhecer(w, redimensionar(canvas, canvas.width > 1800 ? 0.75 : 1.35), sinal);
          if (melhorQue(nota(t2), nota(t))) t = t2;
          segunda = true;
        }
      } finally { sinal.ocr = null; encerrar(w); }
      return { paginas: [{ texto: t, origem: "ocr" }], ocr: 1, semOcr: 0, segundaLeitura: segunda };
    }

    if (tipo !== "application/pdf" && !/\.pdf$/i.test(nome)) {
      throw Falha("Este tipo de arquivo não é lido aqui. Envie PDF, JPG ou PNG, ou copie o texto e cole no campo.");
    }
    prog(0, "Preparando o leitor de PDF (na primeira vez baixa cerca de 2 MB)…");
    var lib = await Promise.race([pdfjs(), sinal.cancelado]);
    prog(0, "Abrindo o PDF…");
    var doc, tarefa = lib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()), wasmUrl: PDFJS + "wasm/", enableXfa: false });
    try {
      var relogio, demorou = new Promise(function (_, erro) {
        relogio = setTimeout(function () { erro(Falha("O PDF não abriu em 1 minuto. Tente de novo, ou abra a página no site: oanalistaambiental.com/memorial-geo.html")); }, 60000);
      });
      try { doc = await Promise.race([tarefa.promise, demorou, sinal.cancelado]); } finally { clearTimeout(relogio); }
    } catch (e) {
      tarefa.destroy();
      if (e && e.falha) throw e;
      if (e && e.name === "PasswordException") throw Falha("O PDF está protegido por senha. Abra no leitor de PDF, salve uma cópia sem senha e tente de novo.");
      if (e && e.name === "InvalidPDFException") throw Falha("O arquivo não parece ser um PDF válido.");
      throw Falha("Não deu para abrir o PDF: " + (e && e.message || e));
    }
    try {
      var total = doc.numPages, paginas = [], semTexto = [];
      for (var p = 1; p <= total; p++) {
        parar();
        prog((p - 1) / total, "Lendo o texto do PDF: página " + p + " de " + total + "…");
        var pg = await doc.getPage(p);
        var texto = await textoDaPagina(pg);
        pg.cleanup();
        if (!op.forcarOcr && texto.replace(/\s+/g, "").length >= 20) paginas.push({ texto: texto, origem: "pdf" });
        else { paginas.push({ texto: "", origem: "sem-ocr" }); semTexto.push(p); }
      }
      var paraOcr = semTexto.slice(0, LIMITE_OCR), feitas = 0, segunda = false;
      if (paraOcr.length) {
        var vez = { k: 0, rotulo: "" };
        var ocr = await criarOcr(function (f, frase, lendo) {
          if (lendo) prog((vez.k + f) / paraOcr.length, vez.rotulo + ": " + Math.round(f * 100) + "%…");
          else prog(0, frase);
        });
        sinal.ocr = ocr;
        var lerTudo = async function (largura, qual) {
          var saida = paginas.slice();
          for (var k = 0; k < paraOcr.length; k++) {
            parar();
            var n = paraOcr[k], rotulo = "Reconhecendo por imagem (OCR)" + qual + ": página " + n + " de " + total +
              (paraOcr.length > 1 ? " (" + (k + 1) + " de " + paraOcr.length + " escaneadas)" : "");
            vez.k = k; vez.rotulo = rotulo;
            prog(k / paraOcr.length, rotulo + "…");
            var pagina = await doc.getPage(n);
            var c = await desenhar(pagina, largura);
            pagina.cleanup();
            var t2 = await reconhecer(ocr, c, sinal);
            c.width = c.height = 0;
            saida[n - 1] = { texto: t2, origem: "ocr" };
          }
          return saida;
        };
        try {
          var lida = await lerTudo(LARGURAS_OCR[0], "");
          var n1 = nota(juntar({ paginas: lida }));
          if (n1[0] < 3) {
            var outra = await lerTudo(LARGURAS_OCR[1], ", segunda leitura em outro tamanho");
            if (melhorQue(nota(juntar({ paginas: outra })), n1)) lida = outra;
            segunda = true;
          }
          paginas = lida;
          feitas = paraOcr.length;
        } finally { sinal.ocr = null; encerrar(ocr); }
      }
      return { paginas: paginas, ocr: feitas, semOcr: semTexto.length - paraOcr.length, total: total, segundaLeitura: segunda };
    } finally { tarefa.destroy(); }
  }

  /** Junta as páginas num texto só, com uma linha de página entre elas (só quando há mais de uma). */
  function juntar(res) {
    var n = res.paginas.length;
    if (n === 1) return res.paginas[0].texto;
    return res.paginas.map(function (p, i) {
      var origem = p.origem === "ocr" ? "lida por imagem" : p.origem === "sem-ocr" ? "sem texto, não lida" : "texto do PDF";
      return "— página " + (i + 1) + " de " + n + " (" + origem + ") —\n" + p.texto.trim();
    }).join("\n\n");
  }

  /**
   * Deixa o leitor pronto para usar sem internet: baixa o pdf.js, o OCR com o motor deste aparelho e
   * o português, e liga o OCR uma vez numa imagem em branco (confirma que funciona neste navegador).
   */
  async function preparar(aoProgresso) {
    await pdfjs();
    await Promise.all(["jbig2.wasm", "openjpeg.wasm", "qcms_bg.wasm"].map(function (f) { return baixar(PDFJS + "wasm/" + f, "binario"); }));
    var w = await criarOcr(aoProgresso);
    var c = document.createElement("canvas"); c.width = 60; c.height = 30;
    var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 60, 30);
    await w.recognize(c);
    await w.terminate();
  }

  raiz.LeitorArquivo = { ler: ler, juntar: juntar, preparar: preparar, versaoDoMotor: versaoDoMotor, LIMITE_OCR: LIMITE_OCR };
})(self);
