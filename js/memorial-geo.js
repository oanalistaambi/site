/* ==========================================================================
   Memorial descritivo → polígono (motor de cálculo da página memorial-geo.html)

   Porte para JavaScript da lógica do app Chão Geo MG ("Ler documento (PDF)"):
   MemorialRumo.kt, ConferenciaPoligonal.kt, ExtratorDocumento.kt e Utm.kt.
   Roda no navegador e no Node (testes em _testes/memorial-geo.mjs). Nada sai do
   aparelho: não há chamada de rede neste arquivo.

   Limite: o azimute é tratado como plano (de quadrícula, no UTM). Rumo
   magnético de data desconhecida não tem como ser corrigido; o fechamento mostra
   se a descrição é coerente, não se o azimute é verdadeiro ou magnético.
   ========================================================================== */
(function (raiz, fabrica) {
  var M = fabrica();
  if (typeof module === "object" && module.exports) module.exports = M;
  else raiz.MemorialGeo = M;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ------------------------------------------------------------------ texto

  /** Mesma limpeza do app: aspas, graus, travessões e quebras de linha. */
  function normalizar(t) {
    return String(t || "")
      .replace(/[   ]/g, " ")
      .replace(/[’´′‘`]/g, "'")
      .replace(/[″“”]/g, '"')
      .replace(/''/g, '"')
      .replace(/[º˚ᵒ]/g, "°")
      .replace(/[–—−]/g, "-")
      .replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  /**
   * Número como o memorial escreve: "1.234,56" (padrão brasileiro), "612345.678" (ponto decimal)
   * e "7.812.345" (milhar). Mesma regra de ExtratorDocumento.numeroMetrico.
   */
  function numeroMetrico(s) {
    var t = String(s).trim().replace(/ /g, "");
    if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}\./.test(t) && /\.\d{3}(\.|$)/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "");
    else if (/\.\d{3}\./.test(t)) { var u = t.lastIndexOf("."); t = t.substring(0, u).replace(/\./g, "") + t.substring(u); }
    var v = Number(t);
    return t === "" || isNaN(v) ? null : v;
  }

  /** Número de área: "1.190,90", "2,35", "516.68", "9.1202"; "1.314" é milhar (ConferenciaPoligonal.numeroBr). */
  function numeroBr(s) {
    var t = String(s).trim().replace(/[.,]+$/, "");
    var v;
    if (t.indexOf(",") >= 0) v = Number(t.replace(/\./g, "").replace(",", "."));
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) v = Number(t.replace(/\./g, ""));
    else v = Number(t);
    return t === "" || isNaN(v) ? null : v;
  }

  /** "2,35 ha" → 23.500 m²; "1.190,90 m²" → 1.190,9 m². Null se não for área. */
  function areaEmM2(valor) {
    var m = /^\s*([\d.,]+)\s*(ha|hectares?|m²|m2)(?![\wà-ú])/i.exec(valor);
    if (!m) return null;
    var n = numeroBr(m[1]);
    if (n == null) return null;
    return m[2].toLowerCase().charAt(0) === "h" ? n * 10000 : n;
  }

  function num(s) { return Number(String(s).replace(",", ".")); }

  // ------------------------------------------------------------------ ângulos

  var ANGULO = "(\\d{1,3}(?:[.,]\\d+)?)\\s*°\\s*(?:(\\d{1,2})\\s*'\\s*(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*\"?)?)?";

  // "azimute plano e distância: 128°42'38.07" e 185,69" (certidões com memorial do SIGEF): as duas palavras antes dos dois números.
  var RE_AZIMUTE = new RegExp("\\b(?:azimute|az\\.?)(?:\\s+(?:plano|de\\s+quadr[íi]cula|verdadeiro|magn[ée]tico))?(\\s+e\\s+dist[âa]ncia)?(?:\\s+de)?\\s*[:=]?\\s*" + ANGULO, "gi");
  /** "distância: 305°39'5.47" e 102,53": o par sem a palavra "azimute" (ela ficou na página anterior, antes do rodapé). */
  var RE_DISTANCIA_ANGULO = new RegExp("\\bdist[âa]ncia\\s*:\\s*" + ANGULO, "gi");
  var RE_RUMO = new RegExp("\\brumo(?:\\s+de)?\\s*[:=]?\\s*([NS][EWOL]?)?\\s*" + ANGULO + "\\s*([NS]?[EWOL])?(?![a-zà-ú])", "gi");
  /** Rumo sem a palavra "rumo": "N 45°30' E", "S 12° W". Só com as duas letras do quadrante. */
  var RE_RUMO_SOLTO = new RegExp("(?<![\\wÀ-ú])([NS])\\s*" + ANGULO + "\\s*([EWOL])(?![\\wà-ú])", "g");
  var RE_DISTANCIA = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?|\d+(?:[.,]\d{1,3})?)\s*(?:m\b|metros\b)/i;
  var RE_DISTANCIA_PAR = /^\s*["']?\s*e\s+(?:[^\d\s]{1,2}\s+)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?|\d+(?:[.,]\d{1,3})?)(?![\d°'])(?:\s*(?:m\b|metros\b))?/i;
  var RE_CABECALHO_TABELA = /\b(?:azimutes?|rumos?)\b.*\bdist(?:[âa]ncias?\b|\.)|\bdist(?:[âa]ncias?\b|\.).*\b(?:azimutes?|rumos?)\b/i;
  var RE_NUMERO = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?|\d+(?:[.,]\d{1,3})?)(?!\s*[°\d'])/;

  function graus(m, i) {
    var g = num(m[i]);
    var mi = m[i + 1] ? Number(m[i + 1]) : 0;
    var s = m[i + 2] ? num(m[i + 2]) : 0;
    if (mi >= 60 || s >= 60) return null;
    return g + mi / 60 + s / 3600;
  }

  /** Rumo (0–90° a partir do N ou do S, para E ou W) em azimute (0–360° a partir do N). */
  function azimuteDeRumo(quadrante, rumoGraus) {
    var q = String(quadrante).toUpperCase().replace(/O/g, "W").replace(/L/g, "E");
    if (rumoGraus > 90) return null;
    switch (q) {
      case "NE": return rumoGraus;
      case "SE": return 180 - rumoGraus;
      case "SW": return 180 + rumoGraus;
      case "NW": return (360 - rumoGraus) % 360;
      default: return null;
    }
  }

  /** O que vem antes termina em ângulo ("19°52'30\" S 44°…"): a letra é hemisfério de latitude, não quadrante. */
  function depoisDeAngulo(texto, ini) {
    return /["'°\d]\s*$/.test(texto.substring(Math.max(0, ini - 6), ini));
  }

  function todos(re, texto) {
    re.lastIndex = 0;
    var out = [], m;
    while ((m = re.exec(texto)) !== null) { out.push(m); if (m[0] === "") re.lastIndex++; }
    return out;
  }

  // ------------------------------------------------------------------ lados

  function lado(az, d, deRumo, posicao, trecho) {
    return { azimuteGraus: az, distanciaM: d, deRumo: deRumo, posicao: posicao, trecho: trecho || "" };
  }

  /**
   * Os lados do memorial, na ordem do texto. Primeiro o texto corrido ("azimute ... e distância
   * de 85,40 m"); se ele não der ao menos 3 lados, a tabela com cabeçalho; por fim a tabela
   * simples separada por ";", tabulação ou "|" (V1; 120°15'30"; 85,40).
   */
  function lados(texto) {
    texto = normalizar(texto);
    var corrido = ladosDoTexto(texto);
    if (corrido.length >= 3) return corrido;
    var melhor = corrido;
    [ladosDeTabela(texto), ladosDeLinhas(texto)].forEach(function (t) { if (t.length > melhor.length) melhor = t; });
    return melhor;
  }

  /** Texto corrido: cada ângulo com a primeira distância em metros logo depois. */
  function ladosDoTexto(texto) {
    var angulos = [];
    function sobrepoe(ini, fim) { return angulos.some(function (a) { return a.ini < fim && ini < a.fim; }); }
    todos(RE_AZIMUTE, texto).forEach(function (m) {
      var az = graus(m, 2);
      if (az != null && az < 360) angulos.push({ ini: m.index, fim: m.index + m[0].length, az: az, rumo: false, txt: m[0], par: !!m[1] });
    });
    todos(RE_DISTANCIA_ANGULO, texto).forEach(function (m) {
      var az = graus(m, 1);
      if (az != null && az < 360 && !sobrepoe(m.index, m.index + m[0].length)) angulos.push({ ini: m.index, fim: m.index + m[0].length, az: az, rumo: false, txt: m[0], par: true });
    });
    todos(RE_RUMO, texto).forEach(function (m) {
      var r = graus(m, 2);
      if (r == null) return;
      var az = azimuteDeRumo(((m[1] || "") + (m[5] || "")).toUpperCase(), r);
      if (az == null || sobrepoe(m.index, m.index + m[0].length)) return;
      angulos.push({ ini: m.index, fim: m.index + m[0].length, az: az, rumo: true, txt: m[0] });
    });
    todos(RE_RUMO_SOLTO, texto).forEach(function (m) {
      if (sobrepoe(m.index, m.index + m[0].length) || depoisDeAngulo(texto, m.index)) return;
      var r = graus(m, 2);
      if (r == null) return;
      var az = azimuteDeRumo(m[1] + m[5], r);
      if (az != null) angulos.push({ ini: m.index, fim: m.index + m[0].length, az: az, rumo: true, txt: m[0] });
    });
    angulos.sort(function (a, b) { return a.ini - b.ini; });
    var out = [];
    angulos.forEach(function (a, k) {
      // A distância do lado fica entre este ângulo e o próximo (no máximo 160 caracteres).
      var prox = k + 1 < angulos.length ? angulos[k + 1].ini : texto.length;
      var limite = Math.max(a.fim, Math.min(prox, a.fim + 160));
      var trecho = texto.substring(a.fim, limite);
      var md = RE_DISTANCIA.exec(trecho);
      // "azimute e distância: 128°42'38" e 185,69": a unidade vem só nas palavras, e a distância logo depois do "e".
      if (a.par && (!md || md.index > 20)) md = RE_DISTANCIA_PAR.exec(trecho) || (md && md.index <= 20 ? md : null);
      if (!md) return;
      var d = numeroMetrico(md[1]);
      if (d == null || d <= 0 || d > 100000) return;
      var l = lado(a.az, d, a.rumo, a.ini, (a.txt + trecho.substring(0, md.index + md[0].length)).replace(/\s+/g, " ").trim());
      l.faixa = [a.ini, a.fim + md.index + md[0].length]; // onde o lado está no texto normalizado (do ângulo ao fim da distância)
      out.push(l);
    });
    return out;
  }

  /** Rumo dentro de uma linha de tabela, com a mesma proteção contra latitude/longitude. */
  function rumoNaLinha(linha) {
    var re = new RegExp("(?<![\\wÀ-ú])([NS])\\s*" + ANGULO + "\\s*([EWOL])(?![\\wà-ú])", "gi");
    var achado = null;
    todos(re, linha).forEach(function (m) {
      if (depoisDeAngulo(linha, m.index)) return;
      var r = graus(m, 2);
      var az = r == null ? null : azimuteDeRumo(m[1] + m[5], r);
      if (az != null) achado = { ini: m.index, fim: m.index + m[0].length, az: az };
    });
    return achado;
  }

  /** O último azimute da linha que não é latitude nem longitude (sem "-" antes e sem N/S/E/W/O/L depois). */
  function azimuteNaLinha(linha) {
    var re = new RegExp(ANGULO, "g");
    var achado = null;
    todos(re, linha).forEach(function (m) {
      var antes = linha.substring(0, m.index).replace(/\s+$/, "");
      var depois = linha.substring(m.index + m[0].length).replace(/^\s+/, "");
      if (/-$/.test(antes) || /^[NSEWOL](?![a-zà-ú])/i.test(depois)) return;
      var az = graus(m, 1);
      if (az == null || az >= 360) return;
      achado = { ini: m.index, fim: m.index + m[0].length, az: az };
    });
    return achado;
  }

  /**
   * Tabela de vértices com colunas "Azimute" (ou "Rumo") e "Distância (m)", como a do SIGEF: a
   * unidade vem só no cabeçalho. Vale só depois de um cabeçalho que tenha as duas palavras. Em
   * cada linha, o ângulo é o último que não é latitude ou longitude; a distância é o primeiro
   * número depois dele.
   */
  function ladosDeTabela(texto) {
    texto = normalizar(texto);
    var out = [], dentro = false, pos = 0;
    texto.split("\n").forEach(function (linha) {
      var inicio = pos;
      pos += linha.length + 1;
      if (RE_CABECALHO_TABELA.test(linha)) { dentro = true; return; }
      if (!dentro) return;
      var a = azimuteNaLinha(linha), r = rumoNaLinha(linha), deRumo = false;
      if (r && (!a || r.ini > a.ini)) { a = r; deRumo = true; }
      if (!a) return;
      var md = RE_NUMERO.exec(linha.substring(a.fim));
      if (!md) return;
      var d = numeroMetrico(md[1]);
      if (d == null || d <= 0 || d > 100000) return;
      var l = lado(a.az, d, deRumo, inicio + a.ini, linha.trim());
      l.faixa = [inicio, inicio + linha.length];
      out.push(l);
    });
    return out;
  }

  /**
   * Tabela simples sem cabeçalho, uma linha por vértice, com as colunas separadas por ";",
   * tabulação ou "|": "V1; 120°15'30"; 85,40" ou "V2; S 12° W; 230,5". Linha solta separada só por
   * espaço não vale (pode ser qualquer texto).
   */
  function ladosDeLinhas(texto) {
    texto = normalizar(texto);
    var out = [], pos = 0;
    texto.split("\n").forEach(function (linha) {
      var inicio = pos;
      pos += linha.length + 1;
      if (!/[;\t|]/.test(linha)) return;
      var cel = linha.split(/[;\t|]/).map(function (c) { return c.trim(); }).filter(function (c) { return c !== ""; });
      if (cel.length < 2) return;
      for (var i = 0; i < cel.length - 1; i++) {
        var c = cel[i], az = null, deRumo = false;
        var r = rumoNaLinha(c);
        if (r && r.ini === 0 && r.fim >= c.replace(/\s+$/, "").length) { az = r.az; deRumo = true; }
        else {
          var m = new RegExp("^" + ANGULO + "$").exec(c);
          if (m) az = graus(m, 1);
        }
        if (az == null || az >= 360) continue;
        var dm = /^(\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?|\d+(?:[.,]\d{1,3})?)\s*(?:m|metros)?$/i.exec(cel[i + 1]);
        if (!dm) continue;
        var d = numeroMetrico(dm[1]);
        if (d == null || d <= 0 || d > 100000) continue;
        var l = lado(az, d, deRumo, inicio, linha.trim());
        l.faixa = [inicio, inicio + linha.length];
        out.push(l);
        return;
      }
    });
    return out;
  }

  // ------------------------------------------------------------------ poligonal

  /** Soma os lados no plano UTM a partir de (E, N). O último ponto calculado não repete o primeiro. */
  function percorrer(partidaE, partidaN, ls) {
    var pontos = [[partidaE, partidaN]], e = partidaE, n = partidaN, perimetro = 0;
    ls.forEach(function (l) {
      var rad = l.azimuteGraus * Math.PI / 180;
      e += l.distanciaM * Math.sin(rad);
      n += l.distanciaM * Math.cos(rad);
      perimetro += l.distanciaM;
      pontos.push([e, n]);
    });
    var erro = Math.hypot(e - partidaE, n - partidaN);
    return {
      vertices: pontos.slice(0, -1),
      chegada: pontos[pontos.length - 1],
      lados: ls,
      perimetroM: perimetro,
      erroFechamentoM: erro,
      /** Precisão relativa 1:N; nula quando o fechamento é exato (N infinito). */
      precisaoRelativa: erro > 1e-6 ? perimetro / erro : null,
      areaM2: areaPlana(pontos.slice(0, -1))
    };
  }

  /** Área do anel no plano (fórmula de Gauss, "shoelace"), em m². */
  function areaPlana(v) {
    var s = 0;
    for (var i = 0; i < v.length; i++) {
      var a = v[i], b = v[(i + 1) % v.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }

  /** Lados que se cruzam (vértice fora de ordem, lado trocado, azimute lido errado). */
  function ladosQueSeCruzam(v) {
    var n = v.length, out = [];
    function orient(p, q, r) { var x = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return Math.abs(x) < 1e-9 ? 0 : (x > 0 ? 1 : -1); }
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue; // vizinhos dividem um vértice
        var a = v[i], b = v[(i + 1) % n], c = v[j], d = v[(j + 1) % n];
        if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) out.push([i, j]);
      }
    }
    return out;
  }

  /** Critério desta página para o fechamento (não é norma: ver os limites na página). */
  function qualidadeFechamento(p) {
    if (p.erroFechamentoM < 0.01) return { nivel: "ok", texto: "Fecha: a diferença é de arredondamento (menos de 1 cm)." };
    var n = Math.floor(p.precisaoRelativa + 1e-6); // 1:N truncado, como no quadro de resultado e no app
    if (n >= 5000) return { nivel: "ok", texto: "Fechamento bom: 1:" + inteiro(n) + "." };
    if (n >= 1000) return { nivel: "atencao", texto: "Fechamento fraco (1:" + inteiro(n) + "): comum em memorial antigo. Confira o desenho no original antes de usar." };
    return {
      nivel: "ruim",
      texto: "Fechamento ruim (1:" + inteiro(n) + ", " + metros(p.erroFechamentoM) + "): o último lado não volta ao ponto de partida. " +
        "Costuma ser lado que faltou, azimute ou distância lido errado, ou rumo com quadrante trocado. Confira lado a lado no original."
    };
  }


  // ------------------------------------------------------------------ diagnóstico do fechamento

  function vetor(az, d) { var a = az * Math.PI / 180; return [d * Math.sin(a), d * Math.cos(a)]; }
  function azimuteDe(v) { return (Math.atan2(v[0], v[1]) * 180 / Math.PI + 360) % 360; }
  function difAngulo(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

  /** Rumo por quadrante a partir do azimute: { q1: "N"|"S", r: graus, q2: "E"|"W" }. */
  function rumoDe(az) {
    az = ((az % 360) + 360) % 360;
    if (az <= 90) return { q1: "N", r: az, q2: "E" };
    if (az <= 180) return { q1: "S", r: 180 - az, q2: "E" };
    if (az <= 270) return { q1: "S", r: az - 180, q2: "W" };
    return { q1: "N", r: 360 - az, q2: "W" };
  }
  function rumoTexto(az) { var q = rumoDe(az); return q.q1 + " " + dms(q.r) + " " + q.q2; }
  function anguloTexto(l, az) { return l.deRumo ? "rumo " + rumoTexto(az) : "azimute " + dms(az); }

  /**
   * Variações de um número como ele é escrito: um dígito trocado, dois vizinhos invertidos, um
   * dígito a mais ou a menos. São os erros de digitação e de leitura mais comuns.
   */
  function variacoesDigitos(s) {
    var out = {}, dig = "0123456789";
    function poe(v, como) { if (v !== s && v !== "" && !(v in out)) out[v] = como; }
    for (var i = 0; i < s.length; i++) {
      if (!/\d/.test(s[i])) continue;
      for (var k = 0; k < 10; k++) if (dig[k] !== s[i]) poe(s.slice(0, i) + dig[k] + s.slice(i + 1), "um dígito trocado");
      if (i + 1 < s.length && /\d/.test(s[i + 1]) && s[i] !== s[i + 1]) poe(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2), "dois dígitos invertidos");
      poe(s.slice(0, i) + s.slice(i + 1), "um dígito a mais no texto");
      for (k = 0; k < 10; k++) poe(s.slice(0, i) + dig[k] + s.slice(i), "um dígito faltando no texto");
    }
    return out;
  }

  /** Ângulos vizinhos de um ângulo em graus, minutos e segundos, campo a campo. */
  function variacoesAngulo(graus, max) {
    var tot = Math.round(graus * 3600), g = Math.floor(tot / 3600), m = Math.floor((tot % 3600) / 60), sg = tot % 60, out = [];
    function poe(gg, mm, ss, como) {
      if (gg >= max || mm >= 60 || ss >= 60 || gg < 0) return;
      var v = gg + mm / 60 + ss / 3600;
      if (Math.abs(v - graus) > 1e-9) out.push({ v: v, como: como });
    }
    var vg = variacoesDigitos(String(g)), vm = variacoesDigitos(String(m).padStart(2, "0")), vs = variacoesDigitos(String(sg).padStart(2, "0"));
    Object.keys(vg).forEach(function (x) { poe(Number(x), m, sg, vg[x] + " nos graus"); });
    Object.keys(vm).forEach(function (x) { if (x.length === 2) poe(g, Number(x), sg, vm[x] + " nos minutos"); });
    Object.keys(vs).forEach(function (x) { if (x.length === 2) poe(g, m, Number(x), vs[x] + " nos segundos"); });
    if (m !== sg) poe(g, sg, m, "minutos e segundos trocados");
    return out;
  }

  /**
   * Por que a poligonal não fecha. O vetor de fechamento (da chegada do último lado até a partida)
   * é comparado com hipóteses de um erro só: lado que faltou, lado lido a mais, um dígito errado
   * na distância ou no ângulo, quadrante de rumo trocado ou sentido invertido. Uma hipótese vale
   * quando, corrigida, a poligonal passa a fechar bem (1:5.000 ou melhor, o critério da página).
   * São hipóteses para conferir no original, nunca correção automática.
   */
  function diagnosticar(pol) {
    var w = [pol.chegada[0] - pol.vertices[0][0], pol.chegada[1] - pol.vertices[0][1]];
    var erro = Math.hypot(w[0], w[1]), per = pol.perimetroM, achados = [];
    if (erro < 0.01) return null;
    function aceita(res, perDepois) { return res < erro / 3 && (res < 0.05 || perDepois / res >= 5000); }
    function nome(i) { return pol.nomes ? pol.nomes[i] + " → " + pol.nomes[(i + 1) % pol.vertices.length] : "lado " + (i + 1); }
    pol.lados.forEach(function (l, i) {
      var s = vetor(l.azimuteGraus, l.distanciaM);
      function testa(az, d, tipo, como) {
        var s2 = vetor(az, d), r = Math.hypot(w[0] - s[0] + s2[0], w[1] - s[1] + s2[1]), perDepois = per - l.distanciaM + d;
        if (aceita(r, perDepois)) achados.push({ tipo: tipo, lado: i, nome: nome(i), como: como, original: { az: l.azimuteGraus, d: l.distanciaM },
          proposta: { az: az, d: d }, residuo: r, precisaoDepois: r > 1e-6 ? perDepois / r : null, deRumo: l.deRumo });
      }
      // Lado lido a mais (repetido, ou um número que não era lado).
      var rx = Math.hypot(w[0] - s[0], w[1] - s[1]);
      if (aceita(rx, per - l.distanciaM)) achados.push({ tipo: "extra", lado: i, nome: nome(i), como: "lado lido a mais ou repetido",
        original: { az: l.azimuteGraus, d: l.distanciaM }, residuo: rx, precisaoDepois: rx > 1e-6 ? (per - l.distanciaM) / rx : null, deRumo: l.deRumo });
      // Distância com dígito errado.
      var casas = Math.abs(l.distanciaM * 100 - Math.round(l.distanciaM * 100)) > 1e-6 ? 3 : 2;
      var vd = variacoesDigitos(l.distanciaM.toFixed(casas));
      Object.keys(vd).forEach(function (x) {
        if (/^\./.test(x) || /\.$/.test(x) || (x.split(".").length > 2)) return;
        var d = Number(x);
        if (d > 0 && isFinite(d)) testa(l.azimuteGraus, d, "distancia", vd[x]);
      });
      // Ângulo com dígito errado (no rumo, o ângulo do rumo; no azimute, o azimute).
      if (l.deRumo) {
        var q = rumoDe(l.azimuteGraus);
        variacoesAngulo(q.r, 91).forEach(function (v) {
          if (v.v > 90) return;
          var az = azimuteDeRumo(q.q1 + q.q2, v.v);
          if (az != null) testa(az, l.distanciaM, "angulo", v.como);
        });
        ["NE", "SE", "SW", "NW"].forEach(function (qq) {
          if (qq === q.q1 + q.q2) return;
          var az = azimuteDeRumo(qq, q.r);
          if (az != null && difAngulo(az, l.azimuteGraus) > 1e-6) testa(az, l.distanciaM, "quadrante", "quadrante trocado");
        });
      } else {
        variacoesAngulo(l.azimuteGraus, 360).forEach(function (v) { testa(v.v, l.distanciaM, "angulo", v.como); });
        testa((l.azimuteGraus + 180) % 360, l.distanciaM, "sentido", "sentido invertido (180°)");
      }
    });
    // Melhor hipótese por lado e tipo, da que fecha melhor para a pior.
    achados.sort(function (a, b) { return a.residuo - b.residuo; });
    // Só as que fecham quase tão bem quanto a melhor: uma hipótese que deixa 2 m de erro não
    // concorre com outra que deixa 3 cm.
    var vistos = {}, hipoteses = [], teto = achados.length ? Math.max(0.05, 10 * achados[0].residuo) : 0;
    achados.forEach(function (h) {
      var k = h.lado + ":" + h.tipo;
      if (!vistos[k] && h.residuo <= teto) { vistos[k] = true; hipoteses.push(h); }
    });
    var faltante = { az: azimuteDe([-w[0], -w[1]]), d: erro };
    return { erroM: erro, faltante: faltante, hipoteses: hipoteses.slice(0, 4), outras: Math.max(0, hipoteses.length - 4) };
  }

  /** Frase de uma hipótese do diagnóstico, com o efeito no fechamento. */
  function textoHipotese(h) {
    var l = { deRumo: h.deRumo }, efeito = h.precisaoDepois ? "o fechamento passa a " + metros(h.residuo) + " (1:" + inteiro(Math.floor(h.precisaoDepois)) + ")" : "a poligonal fecha exato";
    if (h.tipo === "extra") return "Lado " + h.nome + " (" + anguloTexto(l, h.original.az) + ", " + decimal(h.original.d, 2) + " m) pode ter sido lido a mais ou estar repetido: sem ele, " + efeito + ".";
    if (h.tipo === "distancia") return "Lado " + h.nome + ": com " + decimal(h.proposta.d, 2) + " m em vez de " + decimal(h.original.d, 2) + " m (" + h.como + "), " + efeito + ".";
    return "Lado " + h.nome + ": com " + anguloTexto(l, h.proposta.az) + " em vez de " + anguloTexto(l, h.original.az) + " (" + h.como + "), " + efeito + ".";
  }

  // ------------------------------------------------------------------ memorial por coordenadas

  /** Distância máxima, em caracteres, entre duas coordenadas da mesma tabela ou memorial (a mesma do app). */
  var SALTO_MAXIMO = 420;

  /** Todas as coordenadas do texto, na ordem, em E/N do fuso informado e em lat/long. */
  function coordenadasDoTexto(t, fuso) {
    var lista = candidatosUtm(t).map(function (c) { c.tipo = "utm"; return c; })
      .concat(candidatosGeo(t).map(function (c) { c.tipo = "geo"; return c; }))
      .sort(function (a, b) { return a.ini - b.ini; });
    var out = [];
    lista.forEach(function (c) {
      if (out.length && c.ini < out[out.length - 1].fim) return; // o mesmo trecho lido por dois padrões
      var x = { ini: c.ini, fim: c.fim, tipo: c.tipo, txt: c.txt.replace(/\s+/g, " ").trim() };
      if (c.tipo === "geo") { var u = projetar(c.lat, c.lon, fuso, true); x.e = u.e; x.n = u.n; x.lat = c.lat; x.lon = c.lon; }
      else { var g = inverter(c.e, c.n, fuso, true); x.e = c.e; x.n = c.n; x.lat = g[0]; x.lon = g[1]; }
      out.push(x);
    });
    return out;
  }

  /**
   * Vértices seguidos, com pouco texto entre eles (tabela ou memorial), viram uma sequência, como
   * em ExtratorDocumento.sequencias do app: o vértice que volta ao inicial fecha o anel e não entra
   * duas vezes; o mesmo ponto em UTM e em grau, lado a lado, conta uma vez; sem voltar ao inicial,
   * só 4 vértices ou mais viram polígono. Fica a sequência mais longa.
   */
  function sequenciaDeCoordenadas(cs) {
    var grupos = [];
    cs.forEach(function (x) {
      var g = grupos[grupos.length - 1], u = g && g[g.length - 1];
      var salto = u ? x.ini - u.fim : 0, d = u ? Math.hypot(x.e - u.e, x.n - u.n) : 0;
      if (u && salto >= -5 && salto <= SALTO_MAXIMO && d < 30000) {
        if (d < 1 && salto < 80 && x.tipo !== u.tipo) return;
        // O mesmo ponto repetido logo em seguida ("Partida: E..., N..." e depois a linha V1 da
        // tabela) é um vértice só; fica o segundo, que costuma trazer o nome.
        if (d < 1 && x.tipo === u.tipo) { g[g.length - 1] = x; return; }
        g.push(x);
      } else grupos.push([x]);
    });
    var melhor = null;
    grupos.forEach(function (g) {
      var fechado = g.length >= 4 && Math.hypot(g[0].e - g[g.length - 1].e, g[0].n - g[g.length - 1].n) < 1;
      var vs = fechado ? g.slice(0, -1) : g;
      if (vs.length < 3 || (!fechado && vs.length < 4)) return;
      if (!melhor || vs.length > melhor.vertices.length) melhor = { vertices: vs, fechado: fechado };
    });
    return melhor;
  }

  var RE_CODIGO_SIGEF = /\b[A-Z0-9]{3,4}-[MPV]-\d{1,6}\b/g;

  /** Nome do vértice de uma coordenada: código do SIGEF, "vértice V2" ou a 1ª coluna da linha da tabela. */
  function rotuloDaCoordenada(t, c, fimAnterior) {
    var trecho = t.substring(Math.max(fimAnterior || 0, c.ini - 200), c.ini);
    var sig = todos(RE_CODIGO_SIGEF, trecho);
    if (sig.length) return sig[sig.length - 1][0];
    var rot = todos(RE_ROTULO, trecho);
    if (rot.length && rot[rot.length - 1][1].length <= 16) return rot[rot.length - 1][1];
    var linha = t.lastIndexOf("\n", c.ini - 1) + 1;
    if (linha >= (fimAnterior || 0)) {
      var cel = t.substring(linha, c.ini).replace(/^[\s|]+/, "").split(/[\s;|\t]+/)[0];
      if (cel && /^[A-Za-z]{0,6}-?[A-Za-z0-9-]*\d$/.test(cel) && cel.length <= 16) return cel;
    }
    return null;
  }

  /** Poligonal das coordenadas: o lado de cada vértice ao seguinte, com azimute de quadrícula e distância no plano UTM. */
  function poligonalDeCoordenadas(seq) {
    var vs = seq.vertices.map(function (c) { return [c.e, c.n]; }), per = 0;
    var ls = vs.map(function (a, i) {
      var b = vs[(i + 1) % vs.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      per += d;
      var l = lado(azimuteDe([b[0] - a[0], b[1] - a[1]]), d, false, seq.vertices[i].ini, seq.vertices[i].txt);
      l.faixa = [seq.vertices[i].ini, seq.vertices[i].fim];
      return l;
    });
    return { vertices: vs, chegada: vs[0], lados: ls, perimetroM: per, erroFechamentoM: null, precisaoRelativa: null,
      areaM2: areaPlana(vs), fonte: "coordenadas", fechadoNoTexto: seq.fechado };
  }

  /**
   * Vértice com dígito trocado (N 7.800.100 lido como 7.808.100) faz o contorno "ir e voltar": os
   * dois lados que tocam nele somam muito mais que a ligação direta entre os vizinhos. Mesma regra
   * de ConferenciaPoligonal.conferir, no app.
   */
  function verticesForaDoLugar(vs) {
    var n = vs.length, out = [];
    if (n < 4) return out;
    for (var i = 0; i < n; i++) {
      var a = vs[(i - 1 + n) % n], v = vs[i], b = vs[(i + 1) % n];
      var ida = Math.hypot(v[0] - a[0], v[1] - a[1]) + Math.hypot(b[0] - v[0], b[1] - v[1]), direto = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (ida - direto > 500 && ida > 5 * Math.max(direto, 1)) out.push({ i: i, ida: ida });
    }
    return out;
  }

  // ------------------------------------------------------------------ UTM (GRS80 = SIRGAS 2000)

  var A = 6378137.0, F = 1 / 298.257222101, K0 = 0.9996, FE = 500000, FN = 10000000;
  var E2 = 2 * F - F * F, EP2 = E2 / (1 - E2);
  function rad(g) { return g * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }

  function zonaDe(lon) { return Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1)); }
  function meridianoCentral(z) { return (z - 1) * 6 - 180 + 3; }

  /** Série de Snyder (USGS PP 1395), a mesma do app (Utm.kt). */
  function projetar(lat, lon, zona, sul) {
    zona = zona || zonaDe(lon);
    if (sul == null) sul = lat < 0;
    var la = rad(lat), lo = rad(lon), lo0 = rad(meridianoCentral(zona));
    var s = Math.sin(la), c = Math.cos(la), t0 = Math.tan(la);
    var n = A / Math.sqrt(1 - E2 * s * s), t = t0 * t0, cc = EP2 * c * c, a1 = (lo - lo0) * c;
    var m = A * ((1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 * E2 * E2 / 256) * la -
      (3 * E2 / 8 + 3 * E2 * E2 / 32 + 45 * E2 * E2 * E2 / 1024) * Math.sin(2 * la) +
      (15 * E2 * E2 / 256 + 45 * E2 * E2 * E2 / 1024) * Math.sin(4 * la) -
      (35 * E2 * E2 * E2 / 3072) * Math.sin(6 * la));
    var e = FE + K0 * n * (a1 + (1 - t + cc) * Math.pow(a1, 3) / 6 + (5 - 18 * t + t * t + 72 * cc - 58 * EP2) * Math.pow(a1, 5) / 120);
    var no = K0 * (m + n * t0 * (a1 * a1 / 2 + (5 - t + 9 * cc + 4 * cc * cc) * Math.pow(a1, 4) / 24 +
      (61 - 58 * t + t * t + 600 * cc - 330 * EP2) * Math.pow(a1, 6) / 720));
    if (sul) no += FN;
    return { e: e, n: no, zona: zona, sul: sul };
  }

  function inverter(e, no, zona, sul) {
    if (sul == null) sul = true;
    var x = e - FE, y = no - (sul ? FN : 0);
    var e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    var mu = (y / K0) / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 * E2 * E2 / 256));
    var p1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) +
      (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) +
      (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var s = Math.sin(p1), c = Math.cos(p1), tp = Math.tan(p1);
    var c1 = EP2 * c * c, t1 = tp * tp, n1 = A / Math.sqrt(1 - E2 * s * s), r1 = A * (1 - E2) / Math.pow(1 - E2 * s * s, 1.5);
    var d = x / (n1 * K0);
    var lat = p1 - (n1 * tp / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * Math.pow(d, 4) / 24 +
      (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * Math.pow(d, 6) / 720);
    var lon = rad(meridianoCentral(zona)) + (d - (1 + 2 * t1 + c1) * Math.pow(d, 3) / 6 +
      (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * Math.pow(d, 5) / 120) / c;
    return [deg(lat), deg(lon)];
  }

  /** Caixa de MG com folga de ~20 km: só para escolher fuso e avisar, nunca para descartar ponto. */
  function emMg(lat, lon) { return lat >= -23.1 && lat <= -14 && lon >= -51.3 && lon <= -39.6; }
  function noBrasil(lat, lon) { return lat >= -34 && lat <= 6 && lon >= -74.5 && lon <= -33; }

  // ------------------------------------------------------------------ datum, fuso e partida

  var RE_DATUM = /\b(SIRGAS\s*-?\s*2000|SAD\s*-?\s*69|C[óo]rrego\s+Alegre|WGS\s*-?\s*84)\b/gi;

  function datumCitado(texto) {
    var conta = {};
    todos(RE_DATUM, texto).forEach(function (m) {
      var v = m[0].toUpperCase().replace(/[\s-]/g, "");
      var k = v.indexOf("SIRGAS") === 0 ? "SIRGAS 2000" : v.indexOf("SAD") === 0 ? "SAD 69" : v.indexOf("WGS") === 0 ? "WGS 84" : "Córrego Alegre";
      conta[k] = (conta[k] || 0) + 1;
    });
    var melhor = null;
    Object.keys(conta).forEach(function (k) { if (!melhor || conta[k] > conta[melhor]) melhor = k; });
    return melhor;
  }

  var RE_FUSO = /\b(?:fuso|zona|zone|mc)\s*(?:utm)?\s*[:=]?\s*(1[89]|2[0-5])\s*([KLMks])?\b|\b(1[89]|2[0-5])\s?([KLMklm])\b(?=[^\n]{0,40}(?:\d{3}[. ]?\d{3}))/gi;

  /** Fuso escrito no texto. "Meridiano Central nº 45 WGr" (frase dos memoriais do INCRA) também define o fuso. */
  function fusoCitado(texto) {
    var mc = /meridiano\s+central\s*(?:n[°o.]?\s*)?[:=]?\s*(-?\s*\d{2})\s*°?\s*([WO])?/i.exec(texto);
    if (mc) {
      var g = Number(mc[1].replace(/[\s-]/g, ""));
      if ((g - 3) % 6 === 0 && g >= 33 && g <= 75) return zonaDe(-g);
    }
    var conta = {};
    todos(RE_FUSO, texto).forEach(function (m) { var z = Number(m[1] || m[3]); conta[z] = (conta[z] || 0) + 1; });
    var melhor = null;
    Object.keys(conta).forEach(function (k) { if (melhor == null || conta[k] > conta[melhor]) melhor = k; });
    return melhor == null ? null : Number(melhor);
  }

  var NUM = "(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d{6,7}(?:[.,]\\d+)?)";
  var PADROES_UTM = [
    // E 612.000,00 m e N 7.795.000,00 m  |  E=612000.00; N=7795000.00  |  X: 612000 Y: 7795000
    // (o par pode quebrar de linha: texto tirado de PDF quebra onde a página quebrou)
    { re: new RegExp("\\b(?:E|X|Este|Leste)\\s*(?:\\(m\\))?\\s*[:=]?\\s*" + NUM + "\\s*m?\\b[^\\d]{0,25}?\\b(?:N|Y|Norte)\\s*(?:\\(m\\))?\\s*[:=]?\\s*" + NUM, "g"), norteAntes: false },
    { re: new RegExp("\\b(?:N|Y|Norte)\\s*(?:\\(m\\))?\\s*[:=]?\\s*" + NUM + "\\s*m?\\b[^\\d]{0,25}?\\b(?:E|X|Este|Leste)\\s*(?:\\(m\\))?\\s*[:=]?\\s*" + NUM, "g"), norteAntes: true },
    // 612.000,00 mE e 7.795.000,00 mN
    { re: new RegExp(NUM + "\\s*m\\s?E\\b[^\\d\\n]{0,15}?" + NUM + "\\s*m\\s?N\\b", "g"), norteAntes: false },
    { re: new RegExp(NUM + "\\s*m\\s?N\\b[^\\d\\n]{0,15}?" + NUM + "\\s*m\\s?E\\b", "g"), norteAntes: true }
  ];
  /** Par solto (linha de tabela "P1  612.000,00  7.795.000,00"): só com palavra de coordenada no texto. */
  var RE_UTM_NU = new RegExp("(?<![\\d.,/-])" + NUM + "\\s*[;|\\t ]\\s*" + NUM + "(?![\\d/-])", "g");

  function candidatosUtm(t) {
    var out = [];
    PADROES_UTM.forEach(function (p) {
      todos(p.re, t).forEach(function (m) {
        var e = numeroMetrico(m[p.norteAntes ? 2 : 1]), n = numeroMetrico(m[p.norteAntes ? 1 : 2]);
        if (e == null || n == null) return;
        if (e >= 100000 && e <= 900000 && n >= 6000000 && n <= 10000000) out.push({ ini: m.index, fim: m.index + m[0].length, e: e, n: n, txt: m[0] });
      });
    });
    if (/\butm\b|coordenada|\bfuso\b|\bE\s*\(m\)|\bN\s*\(m\)|easting|northing/i.test(t)) {
      todos(RE_UTM_NU, t).forEach(function (m) {
        var a = numeroMetrico(m[1]), b = numeroMetrico(m[2]);
        if (a == null || b == null) return;
        var e = a, n = b;
        if (a > 1000000) { e = b; n = a; }
        if (!(e >= 100000 && e <= 900000 && n >= 6000000 && n <= 10000000)) return;
        var fim = m.index + m[0].length;
        if (out.some(function (o) { return o.ini < fim && m.index < o.fim; })) return; // já lido por um padrão com rótulo
        out.push({ ini: m.index, fim: m.index + m[0].length, e: e, n: n, txt: m[0] });
      });
    }
    return out;
  }

  var DMS = "(-\\s?)?(\\d{1,2})\\s*°\\s*(\\d{1,2})\\s*'\\s*(\\d{1,2}(?:[.,]\\d+)?)\\s*\"?\\s*([NSWOEL])?(?![a-zà-ú])";
  function dmsValor(m, i) {
    var v = Number(m[i + 1]) + Number(m[i + 2]) / 60 + num(m[i + 3]) / 3600;
    var h = (m[i + 4] || "").toUpperCase();
    if (m[i] || h === "S" || h === "W" || h === "O") v = -v;
    return { v: v, h: h, sinal: !!m[i] };
  }

  /** Latitude e longitude: grau decimal ("-19.123456, -44.123456") ou grau-minuto-segundo. */
  function candidatosGeo(t) {
    var out = [];
    var reDms = new RegExp(DMS + "[\\s,;/|]*(?:e\\s+)?(?:long(?:itude)?\\.?\\s*[:=]?\\s*)?" + DMS, "gi");
    todos(reDms, t).forEach(function (m) {
      var a = dmsValor(m, 1), b = dmsValor(m, 6);
      if (!(a.sinal || a.h) || !(b.sinal || b.h)) return; // sem sinal nem hemisfério pode ser azimute
      var lat = a.v, lon = b.v;
      if (/[WOEL]/.test(a.h) || /[NS]/.test(b.h) || (!a.h && !b.h && Math.abs(a.v) > Math.abs(b.v))) { lat = b.v; lon = a.v; }
      if (noBrasil(lat, lon)) out.push({ ini: m.index, fim: m.index + m[0].length, lat: lat, lon: lon, txt: m[0] });
    });
    // "N -16.81452 m e E -45.10942 m" (certidões com memorial do SIGEF): grau decimal com rótulo N/E e um "m" que sobrou.
    var reRotulo = /\b(N|E|[Ll]at(?:itude)?|[Ll]ong(?:itude)?)\s*[:=]?\s*(-\s?\d{1,3}[.,]\d{4,})\s*°?(?:\s*m(?![a-df-zà-ú]))?[^\d-]{0,14}?\b(N|E|[Ll]at(?:itude)?|[Ll]ong(?:itude)?)\s*[:=]?\s*(-\s?\d{1,3}[.,]\d{4,})(?:\s*°)?(?:\s*m\b)?/g;
    todos(reRotulo, t).forEach(function (m) {
      var a = num(m[2].replace(/\s/g, "")), b = num(m[4].replace(/\s/g, "")), primeiroLat = /^(n|lat)/i.test(m[1]);
      if (primeiroLat === /^(n|lat)/i.test(m[3])) return;
      var lat = primeiroLat ? a : b, lon = primeiroLat ? b : a;
      if (noBrasil(lat, lon)) out.push({ ini: m.index, fim: m.index + m[0].length, lat: lat, lon: lon, txt: m[0] });
    });
    var reDec = /(?<![\d.,])(-\s?\d{1,2}[.,]\d{4,})\s*°?\s*[,;/|]?\s*(?:e\s+|long(?:itude)?\.?\s*[:=]?\s*)?(-\s?\d{2}[.,]\d{4,})\s*°?(?!\d)/gi;
    todos(reDec, t).forEach(function (m) {
      var a = num(m[1].replace(/\s/g, "")), b = num(m[2].replace(/\s/g, ""));
      var lat = Math.abs(a) <= Math.abs(b) ? a : b, lon = lat === a ? b : a;
      if (noBrasil(lat, lon)) out.push({ ini: m.index, fim: m.index + m[0].length, lat: lat, lon: lon, txt: m[0] });
    });
    return out;
  }

  /**
   * Coordenada de partida: a primeira do texto, UTM ou geográfica. Com UTM sem fuso escrito, o
   * fuso é deduzido entre 22, 23 e 24 pelo que põe o ponto em MG, e marcado como deduzido.
   */
  function partidaDoTexto(t, fusoDoc) {
    var cands = candidatosUtm(t).map(function (c) { c.tipo = "utm"; return c; })
      .concat(candidatosGeo(t).map(function (c) { c.tipo = "geo"; return c; }))
      .sort(function (a, b) { return a.ini - b.ini; });
    var c = cands[0];
    if (!c) return null;
    var avisos = [];
    if (c.tipo === "geo") {
      var z = fusoDoc || zonaDe(c.lon);
      var u = projetar(c.lat, c.lon, z, true);
      return { e: u.e, n: u.n, fuso: z, origem: "geo", lat: c.lat, lon: c.lon, ini: c.ini, txt: c.txt, avisos: avisos, fusoDeduzido: false };
    }
    var fuso = fusoDoc, deduzido = false;
    if (!fuso) {
      var mg = [22, 23, 24].filter(function (zz) { var g = inverter(c.e, c.n, zz, true); return emMg(g[0], g[1]); });
      fuso = mg[0] || 23; // como o app (ExtratorDocumento.coordenadasUtm): o primeiro de 22, 23, 24 que põe o ponto em MG
      deduzido = true;
      avisos.push(mg.length === 1
        ? "Fuso não escrito no texto: " + fuso + " deduzido (é o único que põe o ponto em MG). Confira."
        : mg.length > 1
          ? "Fuso não escrito no texto, e o ponto cabe em MG nos fusos " + mg.join(" e ") + ". Escolha o fuso certo."
          : "Fuso não escrito no texto e o ponto não cai em MG em nenhum fuso: escolha o fuso.");
    }
    return { e: c.e, n: c.n, fuso: fuso, origem: "utm", ini: c.ini, txt: c.txt, avisos: avisos, fusoDeduzido: deduzido };
  }

  var RE_ROTULO = /(?:\bv[ée]rtices?|\bmarcos?|\bpontos?|\bat[ée](?:\s+(?:o|ao))?(?:\s+(?:v[ée]rtice|marco|ponto))?)\s+(?:denominado\s+|n[°ºo.]\s*)?([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\d|[A-Z]{1,3}-?\d+|\d{1,3})(?![\wà-ú])/g;

  /** Nome de cada vértice: o último citado antes do ângulo do lado que sai dele. */
  function rotulos(t, ls, partida) {
    var achados = todos(RE_ROTULO, t).map(function (m) { return { ini: m.index, nome: m[1] }; });
    var tabela = ls.length && ls[0].trecho && /[;\t|]|^\S+\s{2,}/.test(ls[0].trecho);
    return ls.map(function (l, i) {
      if (tabela) {
        var cel = l.trecho.split(/[;\t|]|\s{2,}/).map(function (c) { return c.trim(); }).filter(Boolean)[0];
        if (cel && /^[A-Za-z]{0,6}-?[A-Za-z0-9-]*\d$/.test(cel) && cel.length <= 16) return cel;
      }
      var limite = l.posicao, antes = null;
      achados.forEach(function (a) { if (a.ini < limite && (i === 0 || a.ini > (ls[i - 1].posicao || -1))) antes = a.nome; });
      if (i === 0 && !antes && partida) achados.forEach(function (a) { if (a.ini < partida.ini + 5) antes = a.nome; });
      return antes && antes.length <= 16 ? antes : null;
    });
  }

  var RE_AREA_ESCRITA = /(?<![\wÀ-ú])[áÁaA]rea(?![\wà-ú])[^\d\n]{0,60}?([\d.,]+\s*(?:ha|hectares?|m²|m2))(?![\wà-ú])/gi;

  // ------------------------------------------------------------------ texto vindo de PDF ou de imagem

  /**
   * Pedaços de texto com posição (linhas do OCR ou trechos do PDF) remontados em linhas da página,
   * como OrdemLinhas.montar no app: mesma altura = mesma linha, da esquerda para a direita. Numa
   * tabela escaneada cada coluna costuma vir num bloco; assim o vértice volta a ficar com o E, o N,
   * o azimute e a distância dele. Cada pedaço: { texto, x0, x1, y0, y1 }, com y crescendo para
   * baixo. Entre pedaços da mesma linha: nada (encostados), um espaço, ou três espaços (coluna).
   */
  function montarLinhas(pedacos) {
    var v = pedacos.filter(function (p) { return p.texto && p.texto.trim(); }).map(function (p) {
      return { texto: p.texto.trim(), x0: p.x0, x1: p.x1, cy: (p.y0 + p.y1) / 2, h: Math.max(1, p.y1 - p.y0) };
    }).sort(function (a, b) { return a.cy - b.cy; });
    var linhas = [];
    v.forEach(function (p) {
      var atual = linhas[linhas.length - 1];
      if (atual) {
        var refY = atual.reduce(function (s, q) { return s + q.cy; }, 0) / atual.length;
        var refH = atual.reduce(function (s, q) { return s + q.h; }, 0) / atual.length;
        // Mesma linha: o centro vertical cai dentro de metade da altura típica da linha.
        if (Math.abs(p.cy - refY) <= refH * 0.5) { atual.push(p); return; }
      }
      linhas.push([p]);
    });
    return linhas.map(function (l) {
      l.sort(function (a, b) { return a.x0 - b.x0; });
      var s = l[0].texto;
      for (var k = 1; k < l.length; k++) {
        var a = l[k - 1], b = l[k], vao = b.x0 - a.x1, h = (a.h + b.h) / 2;
        s += (vao < 0.12 * h ? "" : vao < 1.2 * h ? " " : "   ") + b.texto;
      }
      return s;
    }).join("\n");
  }

  /**
   * Linhas do OCR (cada uma com as palavras e a posição delas) em pedaços para montarLinhas, sem o
   * carimbo da margem: o texto vertical na lateral da certidão ("Documento assinado no Assinador…")
   * vira letras soltas no fim (ou no começo) de cada linha ("124°   2" no lugar de "124°"). Conta
   * como carimbo a palavra curta (até 3 letras), longe da vizinha (mais de 1,5 altura de letra) e
   * na faixa de 15% da borda; e só quando isso se repete em 5 linhas ou mais, como faz um carimbo.
   * Entre as palavras que ficam: um espaço, ou três quando o vão é de coluna de tabela.
   */
  function pedacosDoOcr(linhas, largura) {
    var ls = linhas.map(function (l) {
      return (l.words || []).filter(function (w) { return w.text && w.text.trim(); })
        .map(function (w) { return { texto: w.text.trim(), x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1 }; })
        .sort(function (a, b) { return a.x0 - b.x0; });
    });
    function altura(ws) { return ws.reduce(function (s, w) { return s + (w.y1 - w.y0); }, 0) / ws.length; }
    var fim = [], inicio = [];
    ls.forEach(function (ws, k) {
      if (ws.length < 3) return;
      var h = altura(ws), u = ws[ws.length - 1], p = ws[0];
      if (u.texto.length <= 3 && u.x0 > 0.85 * largura && u.x0 - ws[ws.length - 2].x1 > 1.5 * h) fim.push(k);
      if (p.texto.length <= 3 && p.x1 < 0.15 * largura && ws[1].x0 - p.x1 > 1.5 * h) inicio.push(k);
    });
    if (fim.length >= 5) fim.forEach(function (k) { ls[k].pop(); });
    if (inicio.length >= 5) inicio.forEach(function (k) { ls[k].shift(); });
    var out = [];
    ls.forEach(function (ws, k) {
      if (!ws.length) {
        var l = linhas[k];
        if (!(l.words || []).length && l.text && l.text.trim()) out.push({ texto: l.text.replace(/\s+$/, ""), x0: l.bbox.x0, x1: l.bbox.x1, y0: l.bbox.y0, y1: l.bbox.y1 });
        return;
      }
      var h = altura(ws), s = ws[0].texto;
      for (var i = 1; i < ws.length; i++) s += (ws[i].x0 - ws[i - 1].x1 > 1.2 * h ? "   " : " ") + ws[i].texto;
      out.push({ texto: s, x0: ws[0].x0, x1: ws[ws.length - 1].x1,
        y0: Math.min.apply(null, ws.map(function (w) { return w.y0; })), y1: Math.max.apply(null, ws.map(function (w) { return w.y1; })) });
    });
    return out;
  }

  /**
   * Correções conservadoras do texto que vem do OCR, antes de ler os lados: o grau lido como "º",
   * "o", "O" ou "*" logo antes dos minutos; o apóstrofo dos minutos lido como "/" ou "|"; letra O ou
   * o entre algarismos (zero); o apóstrofo dos minutos que sumiu ("119°2516.52"" → 119°25'16.52"); l ou I entre
   * algarismos (um); "rn" no lugar de "m" depois de número; o quadrante colado no "e" seguinte
   * ("15" We distância" → "15" W e distância"). Nada além disso: o resto a pessoa
   * confere no texto, e o diagnóstico do fechamento aponta o dígito trocado.
   */
  function limparOcr(t) {
    return String(t || "")
      .replace(/(\d{1,3})\s?[º°oO*]\s?(?=\d{1,2}\s?['’´`])/g, "$1°")
      .replace(/(\d{1,3})\s?[º°oO*]\s?(\d{1,2})\s?[\/|]\s?(?=\d{1,2}(?:[.,]\d+)?\s?["”'’]{1,2})/g, "$1°$2'")
      .replace(/(\d{1,3})\s?[º°]\s?([0-5]\d)([0-5]\d[.,]\d+)\s?(?=["”])/g, "$1°$2'$3")
      .replace(/(?<=\d)[Oo](?=\d|[.,]\d)/g, "0")
      .replace(/(?<=\d[.,]\d{0,2})[Oo](?![\wà-ú])/g, "0")
      .replace(/(?<=\d)[lI](?=\d)/g, "1")
      .replace(/(\d)\s?rn\b/g, "$1 m")
      .replace(/(\d\s?["”'’°]\s?)([EWOL])(e)(?=\s)/g, "$1$2 $3")
      .replace(/[ \t]+$/gm, "");
  }

  /**
   * As linhas "— página 2 de 6 (…) —" que a leitura do PDF põe entre as páginas viram espaços do
   * mesmo tamanho: um lado que começa numa página e termina na outra continua inteiro, e as
   * posições no texto não mudam (as marcas da página caem no lugar certo).
   */
  var RE_MARCADOR_PAGINA = /^[-—] página \d+ de \d+(?: \([^)\n]*\))? [-—][ \t]*$/gm; // o "—" vira "-" na normalização
  function semMarcadores(t) { return t.replace(RE_MARCADOR_PAGINA, function (m) { return " ".repeat(m.length); }); }

  // ------------------------------------------------------------------ análise completa

  /**
   * Lê o texto e monta tudo: lados, partida, fuso, datum, poligonal e conferências.
   * `opcoes` pode trazer:
   * - { e, n, fuso } para trocar a partida e o fuso lidos do texto;
   * - { fonte: "azimute" | "coordenadas" } quando o texto tem as duas leituras;
   * - { correcoes: [{ lado, az, d } | { lado, remover: true }] } para testar uma hipótese do
   *   diagnóstico sem mudar o texto.
   */
  function analisar(texto, opcoes) {
    opcoes = opcoes || {};
    var visto = normalizar(texto), t = semMarcadores(visto);
    var r = { texto: visto, lados: lados(t), datum: datumCitado(t), fusoTexto: fusoCitado(t), avisos: [], conferencias: [], correcoes: [] };
    r.partidaLida = partidaDoTexto(t, r.fusoTexto);
    var p = r.partidaLida ? { e: r.partidaLida.e, n: r.partidaLida.n, fuso: r.partidaLida.fuso } : {};
    if (opcoes.e != null && opcoes.n != null) { p.e = opcoes.e; p.n = opcoes.n; }
    if (opcoes.fuso) p.fuso = opcoes.fuso;
    r.partida = p.e != null && p.n != null && p.fuso ? p : null;
    if (r.partidaLida && opcoes.e == null) r.avisos = r.avisos.concat(r.partidaLida.avisos);

    if (r.datum === "SAD 69" || r.datum === "Córrego Alegre") {
      r.avisos.push("O texto cita " + r.datum + ". A página trata a coordenada como SIRGAS 2000, sem converter: em MG a diferença " +
        "chega a dezenas de metros. Converta a coordenada de partida (ProGriD, do IBGE) antes de usar.");
    }

    // Correções de teste (hipóteses do diagnóstico): mudam só o cálculo, nunca o texto.
    (opcoes.correcoes || []).forEach(function (c) {
      var l = r.lados[c.lado];
      if (!l) return;
      if (c.remover) { r.correcoes.push({ lado: c.lado, remover: true, original: l }); return; }
      var novo = lado(c.az != null ? c.az : l.azimuteGraus, c.d != null ? c.d : l.distanciaM, l.deRumo, l.posicao, l.trecho);
      novo.corrigido = { az: l.azimuteGraus, d: l.distanciaM };
      novo.faixa = l.faixa;
      r.correcoes.push({ lado: c.lado, original: l, novo: novo });
      r.lados[c.lado] = novo;
    });
    var removidos = r.correcoes.filter(function (c) { return c.remover; }).map(function (c) { return c.lado; });
    if (removidos.length) r.lados = r.lados.filter(function (_, i) { return removidos.indexOf(i) < 0; });

    // As duas leituras possíveis: lados (azimute ou rumo e distância) e coordenadas de cada vértice.
    var fuso = p.fuso || (r.partidaLida && r.partidaLida.fuso);
    r.sequencia = fuso ? sequenciaDeCoordenadas(coordenadasDoTexto(t, fuso)) : null;
    r.fontes = [];
    if (r.lados.length >= 3 && r.partida) r.fontes.push("azimute");
    if (r.sequencia) r.fontes.push("coordenadas");
    if (!r.fontes.length) {
      r.erro = r.lados.length >= 3 ? "Não achei a coordenada de partida no texto. Preencha E, N e o fuso abaixo." :
        r.lados.length ? "Só " + r.lados.length + " lado(s) reconhecido(s): são precisos pelo menos 3, ou a coordenada de cada vértice." :
          "Nenhum lado reconhecido. Cada lado precisa de azimute (ex.: 120°15'30\") ou rumo (ex.: N 45°30' E) e de distância em metros; " +
          "ou cole a tabela com a coordenada de cada vértice.";
      return r;
    }
    r.fonte = r.fontes.indexOf(opcoes.fonte) >= 0 ? opcoes.fonte : r.fontes[0];
    var escritas = todos(RE_AREA_ESCRITA, t).map(function (m) { return { valor: m[1].trim(), m2: areaEmM2(m[1]) }; }).filter(function (x) { return x.m2; });

    function montar(fonte) {
      var pol;
      if (fonte === "azimute") {
        pol = percorrer(p.e, p.n, r.lados);
        pol.fonte = "azimute";
        var nomes = rotulos(t, r.lados, r.partidaLida);
      } else {
        pol = poligonalDeCoordenadas(r.sequencia);
        nomes = r.sequencia.vertices.map(function (c, i) { return rotuloDaCoordenada(t, c, i ? r.sequencia.vertices[i - 1].fim : 0); });
      }
      var usados = {};
      pol.nomes = pol.vertices.map(function (_, i) {
        var nome = nomes[i];
        if (!nome || usados[nome]) nome = "V" + (i + 1);
        usados[nome] = true;
        return nome;
      });
      pol.geo = pol.vertices.map(function (v) { return inverter(v[0], v[1], fuso, true); });
      pol.fuso = fuso;
      pol.qualidade = fonte === "azimute" ? qualidadeFechamento(pol) : pol.fechadoNoTexto
        ? { nivel: "ok", texto: "Memorial por coordenadas: o texto volta ao vértice inicial, e o polígono fecha como está escrito." }
        : { nivel: "info", texto: "Memorial por coordenadas: o texto não repete o vértice inicial; a página fechou o polígono ligando o último vértice ao primeiro." };
      return pol;
    }
    var pol = montar(r.fonte);
    // Sem escolha da pessoa e com as duas leituras: se os lados não fecham e as coordenadas conferem
    // com a área escrita (ou voltam ao vértice inicial), o desenho sai das coordenadas. Acontece na
    // certidão que copia o memorial do SIGEF com a distância de algum lado trocada.
    r.trocouFonte = null;
    if (!opcoes.fonte && r.fontes.length === 2 && r.fonte === "azimute" && pol.qualidade.nivel !== "ok") {
      var co = montar("coordenadas");
      var confere = function (q) { return escritas.some(function (x) { return Math.abs(x.m2 - q.areaM2) <= 0.02 * x.m2; }); };
      if (confere(co) || (!escritas.length && co.fechadoNoTexto)) {
        r.trocouFonte = { erroM: pol.erroFechamentoM, precisao: pol.precisaoRelativa, areaConfere: confere(co) };
        r.fonte = "coordenadas";
        pol = co;
      }
    }
    r.poligonal = pol;
    if (r.correcoes.length && pol.fonte === "azimute") pol.correcaoDeTeste = "Correção só para teste aplicada em " + r.correcoes.length + " lado(s): o texto original é diferente.";
    if (r.fontes.length === 2) r.outra = montar(r.fonte === "azimute" ? "coordenadas" : "azimute");

    var c = r.conferencias;
    c.push({ nivel: pol.qualidade.nivel === "ruim" || pol.qualidade.nivel === "atencao" ? "atencao" : pol.qualidade.nivel, texto: pol.qualidade.texto });
    if (r.trocouFonte) {
      c.push({ nivel: "atencao", texto: "Desenho pelas coordenadas dos vértices: pelos lados (azimute e distância) o polígono não fecha (" +
        metros(r.trocouFonte.erroM) + " de erro), e as coordenadas " + (r.trocouFonte.areaConfere ? "conferem com a área escrita." : "voltam ao vértice inicial.") +
        " Alguma distância ou azimute do texto não bate com as coordenadas: confira na matrícula. Para ver a leitura pelos lados, troque abaixo." });
    }
    if (r.correcoes.length) {
      r.correcoes.forEach(function (k) {
        var trecho = k.original.trecho || "", nomeLado = "lado " + (trecho ? "lido como \u201c" + (trecho.length > 70 ? trecho.slice(0, 70) + "…" : trecho) + "\u201d" : "nº " + (k.lado + 1));
        c.push({ nivel: "atencao", texto: k.remover
          ? "Correção só para teste: o " + nomeLado + " (" + anguloTexto(k.original, k.original.azimuteGraus) + ", " + decimal(k.original.distanciaM, 2) + " m) saiu do cálculo. O texto não mudou: confira no original."
          : "Correção só para teste no " + nomeLado + ": " + anguloTexto(k.novo, k.novo.azimuteGraus) + " e " + decimal(k.novo.distanciaM, 2) + " m, no lugar de " +
            anguloTexto(k.original, k.original.azimuteGraus) + " e " + decimal(k.original.distanciaM, 2) + " m. O texto não mudou: confira no original." });
      });
    }
    if (r.outra) {
      var az = r.fonte === "azimute" ? pol : r.outra, co = r.fonte === "azimute" ? r.outra : pol;
      if (az.vertices.length === co.vertices.length) {
        var maior = 0, k = 0;
        az.vertices.forEach(function (v, i) { var d = Math.hypot(v[0] - co.vertices[i][0], v[1] - co.vertices[i][1]); if (d > maior) { maior = d; k = i; } });
        c.push({ nivel: "info", texto: "O texto traz os lados e também a coordenada de cada vértice. Comparados vértice a vértice, a maior diferença é de " +
          metros(maior) + " (" + co.nomes[k] + ")." });
        // Lado a lado: a distância escrita contra a que sai das coordenadas (folga de 1 m e 2%, o arredondamento da coordenada).
        var difs = [];
        az.lados.forEach(function (l, i) {
          var dc = co.lados[i].distanciaM;
          if (Math.abs(l.distanciaM - dc) > 1 + 0.02 * dc) difs.push({ i: i, escrita: l.distanciaM, coord: dc });
        });
        if (difs.length) {
          var nome = function (i) { return co.nomes[i] + "–" + co.nomes[(i + 1) % co.nomes.length]; };
          c.push({ nivel: "atencao", texto: difs.length + " de " + az.lados.length + " distâncias escritas não batem com as coordenadas dos vértices: " +
            difs.slice(0, 4).map(function (x) { return nome(x.i) + " com " + decimal(x.escrita, 2) + " m no texto e " + decimal(x.coord, 2) + " m pelas coordenadas"; }).join("; ") +
            (difs.length > 4 ? "; e mais " + (difs.length - 4) : "") + "." });
        }
      } else {
        c.push({ nivel: "atencao", texto: "O texto traz " + az.lados.length + " lados e " + co.vertices.length + " vértices com coordenada: as duas leituras não batem. Confira no original." });
      }
    }
    if (pol.fonte === "coordenadas") {
      verticesForaDoLugar(pol.vertices).forEach(function (x) {
        c.push({ nivel: "atencao", texto: pol.nomes[x.i] + " parece fora do lugar: o contorno vai " + metros(x.ida / 2) + " até ele e volta. Confira o número desse vértice no original." });
      });
    }
    var cruz = ladosQueSeCruzam(pol.vertices);
    if (cruz.length) {
      c.push({ nivel: "atencao", texto: "Os lados se cruzam (" + cruz.slice(0, 3).map(function (x) { return pol.nomes[x[0]] + " e " + pol.nomes[x[1]]; }).join("; ") +
        "). Costuma ser lado fora de ordem, quadrante de rumo trocado ou azimute lido errado." });
    }
    if (pol.fonte === "azimute" && r.lados.some(function (l) { return l.deRumo; })) c.push({ nivel: "info", texto: "Rumos convertidos em azimute pelo quadrante (NE, SE, SW, NW)." });
    if (escritas.length && pol.areaM2 > 0) {
      var perto = escritas.reduce(function (a, b) { return Math.abs(b.m2 - pol.areaM2) < Math.abs(a.m2 - pol.areaM2) ? b : a; });
      var dif = Math.abs(perto.m2 - pol.areaM2) / pol.areaM2;
      c.push(dif <= 0.02 ? { nivel: "ok", texto: "Confere com a área escrita no texto: " + perto.valor + "." }
        : dif <= 0.10 ? { nivel: "info", texto: "Perto da área escrita no texto, " + perto.valor + ": diferença de " + decimal(dif * 100, 1) + "%." }
          : { nivel: "atencao", texto: "A área calculada não bate com a escrita no texto (" + perto.valor + "): diferença de " + decimal(dif * 100, 0) + "%." });
    }
    if (!pol.geo.some(function (g) { return emMg(g[0], g[1]); })) c.push({ nivel: "atencao", texto: "A área cai fora de Minas Gerais. Confira o fuso e o datum." });
    if (pol.fonte === "azimute" && pol.qualidade.nivel !== "ok") r.diagnostico = diagnosticar(pol);
    return r;
  }

  // ------------------------------------------------------------------ formatos

  function decimal(v, casas) { return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }); }
  function inteiro(v) { return Math.round(v).toLocaleString("pt-BR"); }
  function metros(v) { return v >= 1000 ? decimal(v / 1000, 3) + " km" : decimal(v, 2) + " m"; }
  function dms(az) {
    var tot = Math.round(az * 3600);
    tot = ((tot % 1296000) + 1296000) % 1296000;
    var g = Math.floor(tot / 3600), m = Math.floor((tot % 3600) / 60), s = tot % 60;
    return g + "°" + String(m).padStart(2, "0") + "'" + String(s).padStart(2, "0") + '"';
  }

  /** "Fechamento: 0,42 m em 1.234,56 m de perímetro (1:2.939)" — como no app. */
  function resumoFechamento(p) {
    if (p.erroFechamentoM == null) return "Memorial por coordenadas: " + decimal(p.perimetroM, 2) + " m de perímetro, sem erro de fechamento a calcular";
    var rel = p.precisaoRelativa ? " (1:" + inteiro(Math.floor(p.precisaoRelativa + 1e-6)) + ")" : " (fecha exato)";
    return "Fechamento: " + decimal(p.erroFechamentoM, 2) + " m em " + decimal(p.perimetroM, 2) + " m de perímetro" + rel;
  }

  // ------------------------------------------------------------------ exportação

  function anelGeo(pol, horario) {
    var anel = pol.geo.map(function (g) { return [g[1], g[0]]; });
    var s = 0;
    for (var i = 0; i < anel.length; i++) { var a = anel[i], b = anel[(i + 1) % anel.length]; s += (b[0] - a[0]) * (b[1] + a[1]); }
    var ehHorario = s > 0;
    if (ehHorario !== horario) anel.reverse();
    anel.push(anel[0]);
    return anel;
  }

  function propriedades(pol, nome) {
    return {
      nome: nome, fonte: pol.fonte === "coordenadas" ? "memorial descritivo (coordenadas dos vértices)" : "memorial descritivo (azimute/rumo e distância)", datum: "SIRGAS 2000",
      fuso_utm: pol.fuso + "S", vertices: pol.vertices.length,
      area_ha: +(pol.areaM2 / 10000).toFixed(4), perimetro_m: +pol.perimetroM.toFixed(2),
      erro_fechamento_m: pol.erroFechamentoM == null ? null : +pol.erroFechamentoM.toFixed(3),
      precisao_relativa: pol.erroFechamentoM == null ? "não se aplica" : pol.precisaoRelativa ? "1:" + Math.floor(pol.precisaoRelativa + 1e-6) : "exato",
      correcao_de_teste: pol.correcaoDeTeste || null,
      aviso: "Desenho reconstruído do memorial. Confira no SIG e no original. Não substitui levantamento nem georreferenciamento certificado."
    };
  }

  /** Lado geométrico de cada vértice ao seguinte (o último fecha no primeiro), no plano UTM. */
  function ladosGeometricos(pol) {
    var v = pol.vertices;
    return v.map(function (a, i) { var b = v[(i + 1) % v.length]; return { az: azimuteDe([b[0] - a[0], b[1] - a[1]]), d: Math.hypot(b[0] - a[0], b[1] - a[1]) }; });
  }

  function dataHoje() { var d = new Date(); return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear(); }

  /**
   * CSV dos vértices para planilha: ";" entre colunas e vírgula decimal (Excel em português), com
   * BOM para os acentos. E e N sem ponto de milhar, para importar no SIG como número.
   */
  function csv(pol) {
    var lg = ladosGeometricos(pol), f = function (v, c) { return v.toFixed(c).replace(".", ","); };
    // Campo com ";" ou aspas vai entre aspas, com as aspas dobradas (RFC 4180): o azimute 30" tem aspas.
    function campo(v) { v = String(v); return /[;"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var linhas = ["vertice;e_m;n_m;latitude;longitude;azimute_ate_o_proximo;azimute_graus_decimais;distancia_ate_o_proximo_m"];
    pol.vertices.forEach(function (v, i) {
      linhas.push([campo(pol.nomes[i]), f(v[0], 3), f(v[1], 3), f(pol.geo[i][0], 8), f(pol.geo[i][1], 8), campo(dms(lg[i].az)), f(lg[i].az, 6), f(lg[i].d, 2)].join(";"));
    });
    return "﻿" + linhas.join("\r\n") + "\r\n";
  }

  /**
   * DXF R12 (AC1009), que todo CAD e o QGIS abrem: o polígono fechado na camada POLIGONO, um ponto
   * por vértice em VERTICES e o nome em NOMES, em metros no UTM do fuso (Autodesk, DXF Reference).
   */
  function dxf(pol, nome) {
    var v = pol.vertices, xs = v.map(function (p) { return p[0]; }), ys = v.map(function (p) { return p[1]; });
    var diag = Math.hypot(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys));
    var h = Math.max(0.5, +(diag / 150).toFixed(2)), out = [];
    function g(c, val) { out.push(String(c), String(val)); }
    function xy(p) { g(10, p[0].toFixed(3)); g(20, p[1].toFixed(3)); g(30, "0.0"); }
    g(999, semAcento("Memorial em poligono - " + nome + " - SIRGAS 2000 UTM " + pol.fuso + "S - oanalistaambiental.com/memorial-geo.html"));
    g(0, "SECTION"); g(2, "HEADER"); g(9, "$ACADVER"); g(1, "AC1009");
    g(9, "$EXTMIN"); xy([Math.min.apply(null, xs), Math.min.apply(null, ys)]);
    g(9, "$EXTMAX"); xy([Math.max.apply(null, xs), Math.max.apply(null, ys)]);
    g(0, "ENDSEC");
    g(0, "SECTION"); g(2, "ENTITIES");
    g(0, "POLYLINE"); g(8, "POLIGONO"); g(66, 1); g(10, "0.0"); g(20, "0.0"); g(30, "0.0"); g(70, 1);
    v.forEach(function (p) { g(0, "VERTEX"); g(8, "POLIGONO"); xy(p); });
    g(0, "SEQEND"); g(8, "POLIGONO");
    v.forEach(function (p, i) {
      g(0, "POINT"); g(8, "VERTICES"); xy(p);
      g(0, "TEXT"); g(8, "NOMES"); g(10, (p[0] + h / 2).toFixed(3)); g(20, (p[1] + h / 2).toFixed(3)); g(30, "0.0"); g(40, h); g(1, semAcento(pol.nomes[i]));
    });
    g(0, "ENDSEC"); g(0, "EOF");
    return out.join("\r\n") + "\r\n";
  }

  /**
   * Memorial em texto, com a coordenada de cada vértice, no formato que esta página lê de volta.
   * Sai do cálculo: não é memorial de levantamento.
   */
  function memorialTexto(pol, nome) {
    var lg = ladosGeometricos(pol), n = pol.vertices.length;
    function coord(i) { return "N " + decimal(pol.vertices[i][1], 2) + " m e E " + decimal(pol.vertices[i][0], 2) + " m"; }
    var cab = ["MEMORIAL DESCRITIVO RECONSTRUÍDO — " + nome,
      "Gerado em " + dataHoje() + " pela página www.oanalistaambiental.com/memorial-geo.html, a partir do texto colado. " +
        "Não é memorial de levantamento: confira com o original e no SIG.",
      "Sistema: SIRGAS 2000, projeção UTM, fuso " + pol.fuso + " S (meridiano central " + Math.abs(meridianoCentral(pol.fuso)) + "° W). " +
        "Azimutes de quadrícula e distâncias no plano UTM.",
      "Área: " + decimal(pol.areaM2 / 10000, 4) + " ha. Perímetro: " + decimal(lg.reduce(function (s, l) { return s + l.d; }, 0), 2) + " m."];
    if (pol.fonte === "azimute" && pol.erroFechamentoM >= 0.01) {
      var o = pol.lados[n - 1];
      // Sem "azimute ... m" nesta frase: a página relê o texto, e ela não pode virar lado.
      cab.push("O memorial original não fecha (" + resumoFechamento(pol) + "). Aqui o último lado foi recalculado do último vértice ao inicial; " +
        "no original ele tem ângulo de " + (o.deRumo ? rumoTexto(o.azimuteGraus) : dms(o.azimuteGraus)) + " e comprimento de " + decimal(o.distanciaM, 2) + " (em metros).");
    }
    if (pol.correcaoDeTeste) cab.push("ATENÇÃO: " + pol.correcaoDeTeste);
    var partes = ["Inicia-se a descrição deste perímetro no vértice " + pol.nomes[0] + ", de coordenadas " + coord(0)];
    for (var i = 0; i < n; i++) {
      var prox = (i + 1) % n;
      partes.push("deste, segue com azimute de " + dms(lg[i].az) + " e distância de " + decimal(lg[i].d, 2) + " m até o vértice " + pol.nomes[prox] +
        (prox === 0 ? ", ponto inicial da descrição deste perímetro" : ", de coordenadas " + coord(prox)));
    }
    return cab.join("\n") + "\n\n" + partes.join("; ") + ".\n";
  }

  /** GeoJSON (RFC 7946): longitude e latitude em graus, anel externo anti-horário. */
  function geojson(pol, nome) {
    var feats = [{ type: "Feature", properties: propriedades(pol, nome), geometry: { type: "Polygon", coordinates: [anelGeo(pol, false).map(function (c) { return [+c[0].toFixed(8), +c[1].toFixed(8)]; })] } }];
    pol.geo.forEach(function (g, i) {
      feats.push({ type: "Feature", properties: { vertice: pol.nomes[i], e: +pol.vertices[i][0].toFixed(3), n: +pol.vertices[i][1].toFixed(3) },
        geometry: { type: "Point", coordinates: [+g[1].toFixed(8), +g[0].toFixed(8)] } });
    });
    return JSON.stringify({ type: "FeatureCollection", name: nome, features: feats }, null, 1);
  }

  function xml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  /** KML 2.2 (OGC): o polígono e os vértices numa pasta. */
  function kml(pol, nome) {
    var pr = propriedades(pol, nome);
    var coords = anelGeo(pol, false).map(function (c) { return c[0].toFixed(8) + "," + c[1].toFixed(8) + ",0"; }).join(" ");
    var desc = "Área: " + decimal(pol.areaM2 / 10000, 4) + " ha. Perímetro: " + decimal(pol.perimetroM, 2) + " m. " + resumoFechamento(pol) +
      ". SIRGAS 2000, UTM " + pol.fuso + "S. " + pr.aviso;
    var pts = pol.geo.map(function (g, i) {
      return "<Placemark><name>" + xml(pol.nomes[i]) + "</name><styleUrl>#v</styleUrl><Point><coordinates>" + g[1].toFixed(8) + "," + g[0].toFixed(8) + ",0</coordinates></Point></Placemark>";
    }).join("\n");
    return '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>' + xml(nome) + "</name>\n" +
      '<Style id="p"><LineStyle><color>ff2a45a8</color><width>2.5</width></LineStyle><PolyStyle><color>402a45a8</color></PolyStyle></Style>\n' +
      '<Style id="v"><IconStyle><scale>0.6</scale></IconStyle><LabelStyle><scale>0.7</scale></LabelStyle></Style>\n' +
      "<Placemark><name>" + xml(nome) + "</name><description>" + xml(desc) + '</description><styleUrl>#p</styleUrl>\n<Polygon><outerBoundaryIs><LinearRing><coordinates>' +
      coords + "</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>\n<Folder><name>Vértices</name>\n" + pts + "\n</Folder>\n</Document>\n</kml>\n";
  }

  /** WKT da projeção (estilo ESRI, que o QGIS e o ArcGIS leem): SIRGAS 2000 / UTM fuso NN S. */
  function prj(fuso) {
    return 'PROJCS["SIRGAS_2000_UTM_Zone_' + fuso + 'S",GEOGCS["GCS_SIRGAS_2000",DATUM["D_SIRGAS_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],' +
      'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],' +
      'PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",' + meridianoCentral(fuso).toFixed(1) + '],PARAMETER["Scale_Factor",0.9996],' +
      'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
  }
  /** Código EPSG do SIRGAS 2000 / UTM fuso S (31978 = 18S … 31985 = 25S). */
  function epsg(fuso) { return 31960 + fuso; }

  /**
   * Shapefile (ESRI Shapefile Technical Description, 1998): um polígono (tipo 5), em metros no
   * UTM do fuso, anel externo no sentido horário. Devolve { shp, shx, dbf, prj } (Uint8Array).
   */
  function shapefile(pol, nome) {
    var anel = pol.vertices.slice();
    var s = 0;
    for (var i = 0; i < anel.length; i++) { var a = anel[i], b = anel[(i + 1) % anel.length]; s += (b[0] - a[0]) * (b[1] + a[1]); }
    if (s < 0) anel.reverse(); // horário
    anel.push(anel[0]);
    var xs = anel.map(function (p) { return p[0]; }), ys = anel.map(function (p) { return p[1]; });
    var bb = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
    var conteudo = 4 + 32 + 4 + 4 + 4 + 16 * anel.length; // bytes do registro (sem o cabeçalho de 8)
    var tamShp = 100 + 8 + conteudo, tamShx = 100 + 8;

    function cabecalho(dv, tam) {
      dv.setInt32(0, 9994, false);
      dv.setInt32(24, tam / 2, false);
      dv.setInt32(28, 1000, true);
      dv.setInt32(32, 5, true);
      dv.setFloat64(36, bb[0], true); dv.setFloat64(44, bb[1], true); dv.setFloat64(52, bb[2], true); dv.setFloat64(60, bb[3], true);
    }
    var shp = new ArrayBuffer(tamShp), d = new DataView(shp);
    cabecalho(d, tamShp);
    var o = 100;
    d.setInt32(o, 1, false); d.setInt32(o + 4, conteudo / 2, false); o += 8;
    d.setInt32(o, 5, true); o += 4;
    bb.forEach(function (v) { d.setFloat64(o, v, true); o += 8; });
    d.setInt32(o, 1, true); d.setInt32(o + 4, anel.length, true); d.setInt32(o + 8, 0, true); o += 12;
    anel.forEach(function (p) { d.setFloat64(o, p[0], true); d.setFloat64(o + 8, p[1], true); o += 16; });

    var shx = new ArrayBuffer(tamShx), dx = new DataView(shx);
    cabecalho(dx, tamShx);
    dx.setInt32(100, 50, false); dx.setInt32(104, conteudo / 2, false);

    return { shp: new Uint8Array(shp), shx: new Uint8Array(shx), dbf: dbf(pol, nome), prj: bytesAscii(prj(pol.fuso)) };
  }

  function semAcento(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?"); }
  function bytesAscii(s) { var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0x7f; return u; }

  /** DBF (dBase III) com uma linha: nome, área, perímetro, erro de fechamento e fuso. ASCII sem acento. */
  function dbf(pol, nome) {
    var campos = [
      ["NOME", "C", 60, 0, semAcento(nome)],
      ["AREA_HA", "N", 16, 4, (pol.areaM2 / 10000).toFixed(4)],
      ["PERIM_M", "N", 14, 2, pol.perimetroM.toFixed(2)],
      ["ERRO_M", "N", 10, 3, pol.erroFechamentoM == null ? "" : pol.erroFechamentoM.toFixed(3)],
      ["PREC_REL", "N", 12, 0, pol.precisaoRelativa ? String(Math.floor(pol.precisaoRelativa)) : "0"],
      ["VERTICES", "N", 6, 0, String(pol.vertices.length)],
      ["FUSO", "C", 4, 0, pol.fuso + "S"],
      ["DATUM", "C", 12, 0, "SIRGAS 2000"],
      ["FONTE", "C", 12, 0, pol.fonte === "coordenadas" ? "COORDENADAS" : "AZIMUTE"],
      ["TESTE", "C", 3, 0, pol.correcaoDeTeste ? "SIM" : "NAO"]
    ];
    var tamReg = 1 + campos.reduce(function (s, c) { return s + c[2]; }, 0);
    var tamCab = 32 + 32 * campos.length + 1;
    var buf = new Uint8Array(tamCab + tamReg + 1), dv = new DataView(buf.buffer);
    var hoje = new Date();
    buf[0] = 0x03; buf[1] = hoje.getFullYear() - 1900; buf[2] = hoje.getMonth() + 1; buf[3] = hoje.getDate();
    dv.setUint32(4, 1, true); dv.setUint16(8, tamCab, true); dv.setUint16(10, tamReg, true);
    buf[29] = 0x00;
    campos.forEach(function (c, i) {
      var o = 32 + 32 * i;
      for (var k = 0; k < c[0].length; k++) buf[o + k] = c[0].charCodeAt(k);
      buf[o + 11] = c[1].charCodeAt(0); buf[o + 16] = c[2]; buf[o + 17] = c[3];
    });
    buf[tamCab - 1] = 0x0d;
    var o = tamCab;
    buf[o++] = 0x20;
    campos.forEach(function (c) {
      var v = String(c[4]);
      v = c[1] === "N" ? v.slice(0, c[2]).padStart(c[2], " ") : v.slice(0, c[2]).padEnd(c[2], " ");
      for (var k = 0; k < c[2]; k++) buf[o + k] = v.charCodeAt(k) & 0x7f;
      o += c[2];
    });
    buf[o] = 0x1a;
    return buf;
  }

  var TAB_CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u) { var c = 0xffffffff; for (var i = 0; i < u.length; i++) c = TAB_CRC[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  /** ZIP sem compressão (método 0, "stored"), que qualquer descompactador e o QGIS abrem. */
  function zip(arquivos) {
    var agora = new Date();
    var hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
    var data = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
    var locais = [], centrais = [], desloc = 0;
    arquivos.forEach(function (a) {
      var nome = bytesAscii(semAcento(a.nome)), dados = a.dados, crc = crc32(dados);
      var l = new Uint8Array(30 + nome.length), dl = new DataView(l.buffer);
      dl.setUint32(0, 0x04034b50, true); dl.setUint16(4, 20, true); dl.setUint16(10, hora, true); dl.setUint16(12, data, true);
      dl.setUint32(14, crc, true); dl.setUint32(18, dados.length, true); dl.setUint32(22, dados.length, true); dl.setUint16(26, nome.length, true);
      l.set(nome, 30);
      var c = new Uint8Array(46 + nome.length), dc = new DataView(c.buffer);
      dc.setUint32(0, 0x02014b50, true); dc.setUint16(4, 20, true); dc.setUint16(6, 20, true); dc.setUint16(12, hora, true); dc.setUint16(14, data, true);
      dc.setUint32(16, crc, true); dc.setUint32(20, dados.length, true); dc.setUint32(24, dados.length, true); dc.setUint16(28, nome.length, true);
      dc.setUint32(42, desloc, true);
      c.set(nome, 46);
      locais.push(l, dados); centrais.push(c);
      desloc += l.length + dados.length;
    });
    var tamCentral = centrais.reduce(function (s, c) { return s + c.length; }, 0);
    var fim = new Uint8Array(22), df = new DataView(fim.buffer);
    df.setUint32(0, 0x06054b50, true); df.setUint16(8, arquivos.length, true); df.setUint16(10, arquivos.length, true);
    df.setUint32(12, tamCentral, true); df.setUint32(16, desloc, true);
    var partes = locais.concat(centrais, [fim]);
    var total = partes.reduce(function (s, p) { return s + p.length; }, 0), out = new Uint8Array(total), k = 0;
    partes.forEach(function (p) { out.set(p, k); k += p.length; });
    return out;
  }

  /** Os quatro arquivos do shapefile num .zip. */
  function shapefileZip(pol, nome, base) {
    var s = shapefile(pol, nome);
    base = base || "memorial";
    return zip([{ nome: base + ".shp", dados: s.shp }, { nome: base + ".shx", dados: s.shx }, { nome: base + ".dbf", dados: s.dbf }, { nome: base + ".prj", dados: s.prj }]);
  }

  return {
    normalizar: normalizar, numeroMetrico: numeroMetrico, numeroBr: numeroBr, areaEmM2: areaEmM2,
    azimuteDeRumo: azimuteDeRumo, lados: lados, ladosDoTexto: ladosDoTexto, ladosDeTabela: ladosDeTabela, ladosDeLinhas: ladosDeLinhas,
    lado: lado, percorrer: percorrer, areaPlana: areaPlana, ladosQueSeCruzam: ladosQueSeCruzam, qualidadeFechamento: qualidadeFechamento,
    zonaDe: zonaDe, meridianoCentral: meridianoCentral, projetar: projetar, inverter: inverter, emMg: emMg,
    datumCitado: datumCitado, fusoCitado: fusoCitado, partidaDoTexto: partidaDoTexto, analisar: analisar,
    diagnosticar: diagnosticar, textoHipotese: textoHipotese, rumoTexto: rumoTexto, variacoesDigitos: variacoesDigitos,
    coordenadasDoTexto: coordenadasDoTexto, sequenciaDeCoordenadas: sequenciaDeCoordenadas, verticesForaDoLugar: verticesForaDoLugar,
    montarLinhas: montarLinhas, pedacosDoOcr: pedacosDoOcr, limparOcr: limparOcr, semMarcadores: semMarcadores,
    decimal: decimal, inteiro: inteiro, metros: metros, dms: dms, resumoFechamento: resumoFechamento,
    geojson: geojson, kml: kml, csv: csv, dxf: dxf, memorialTexto: memorialTexto, prj: prj, epsg: epsg, shapefile: shapefile, shapefileZip: shapefileZip, zip: zip, crc32: crc32
  };
});
