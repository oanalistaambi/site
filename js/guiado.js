/* Modo guiado das ferramentas federais (O Analista Ambiental).
   Um passo por tela, cartões de toque, barra de progresso, cartão-resultado e o "Kit do consultor federal".
   Não tem regra nenhuma: cada página continua calculando com as próprias funções; aqui só muda a apresentação.
   Gamificação leve e SEM quiz: selo ao concluir, kit com 4 selos e confete discreto. */
(function (raiz) {
  "use strict";

  var reduz = function () { try { return raiz.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  /* ---------------- Kit do consultor federal (localStorage sempre em try/catch) ---------------- */
  var CHAVE_KIT = "kit-consultor-federal-v1";
  var ICONES = {
    imovel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    tcfa: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.1 1.7 2.8 2.1 2.9.9 2.9 2.1-1.3 2.1-2.9 2.1c-1.3 0-2.4-.5-2.9-1.5M12 6.2v1.6M12 16.2v1.6"/></svg>',
    rio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s6 6.4 6 10.6A6 6 0 0 1 6 13.6C6 9.4 12 3 12 3z"/></svg>',
    agenda: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3"/></svg>',
    ctf: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 3h6v3H9zM8.5 12.5l2.3 2.3 4.7-4.7"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>'
  };
  var FERRAMENTAS = [
    { id: "imovel", selo: "Imóvel diagnosticado", nome: "Imóvel rural", href: "calculadora-imovel-rural-car.html" },
    { id: "tcfa", selo: "TCFA calculada", nome: "TCFA do Ibama", href: "calculadora-tcfa-ibama.html" },
    { id: "rio", selo: "Rio identificado", nome: "Rio federal ou estadual", href: "rio-federal-ou-estadual.html" },
    { id: "agenda", selo: "Agenda do cliente montada", nome: "Calendário de obrigações", href: "calendario-obrigacoes-federais.html" },
    { id: "ctf", selo: "Atividade enquadrada", nome: "Enquadramento no CTF/APP", href: "enquadramento-ctf-app-ibama.html" }
  ];
  /* A chave do armazenamento continua a v1: o selo novo ("ctf") só se soma aos que a pessoa já tinha. */
  var kit = {
    ler: function () { try { var o = JSON.parse(raiz.localStorage.getItem(CHAVE_KIT) || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } },
    marcar: function (id) {
      var o = kit.ler(), novo = !o[id];
      if (novo) { o[id] = new Date().toISOString().slice(0, 10); try { raiz.localStorage.setItem(CHAVE_KIT, JSON.stringify(o)); } catch (e) { /* sem armazenamento: a página segue igual */ } }
      return novo;
    },
    /* desenha o kit; prefixo = caminho até a pasta artigos/ ("" dentro dela, "artigos/" no hub) */
    desenhar: function (alvo, prefixo, atual) {
      var o = kit.ler(), n = FERRAMENTAS.filter(function (f) { return o[f.id]; }).length, total = FERRAMENTAS.length;
      alvo.innerHTML = "";
      alvo.classList.add("g-kit");
      var t = el("p", "g-kit__t"); t.innerHTML = "<b>Kit do consultor federal</b> <span>" + n + " de " + total + " ferramentas usadas</span>";
      var barra = el("div", "g-kit__barra"); barra.setAttribute("aria-hidden", "true"); var i = el("i"); i.style.width = (n / total * 100) + "%"; barra.appendChild(i);
      var lista = el("ul", "g-kit__selos");
      FERRAMENTAS.forEach(function (f) {
        var li = el("li"), a = el("a", "g-selo" + (o[f.id] ? " is-on" : "") + (f.id === atual ? " is-atual" : ""));
        a.href = (prefixo || "") + f.href;
        a.setAttribute("aria-label", f.selo + (o[f.id] ? ": conquistado" : ": ainda não") + ". Abrir " + f.nome);
        a.innerHTML = '<span class="g-selo__ico">' + ICONES[f.id] + '</span><span class="g-selo__t">' + f.selo + "</span>";
        li.appendChild(a); lista.appendChild(li);
      });
      alvo.appendChild(t); alvo.appendChild(barra); alvo.appendChild(lista);
      if (n === total) alvo.appendChild(el("p", "g-kit__fim", "Kit completo: as cinco ferramentas federais já passaram pela sua mão."));
      return n;
    },
    FERRAMENTAS: FERRAMENTAS
  };

  /* Modo completo ("Ver tudo de uma vez"): o selo acende também, sem confete nem pop-up.
     Só uma linha discreta perto do resultado (aria-live polite), e só na primeira vez. */
  var modoAtual = null, avisados = {};
  kit.noCompleto = function (id, ancora) {
    if (modoAtual !== "completo") return false;
    var novo = kit.marcar(id);
    if (!novo || avisados[id] || !ancora || !ancora.parentNode) return novo;
    avisados[id] = true;
    var f = FERRAMENTAS.filter(function (x) { return x.id === id; })[0];
    var p = el("p", "g-kit-aviso"); p.setAttribute("role", "status"); p.setAttribute("aria-live", "polite");
    ancora.parentNode.insertBefore(p, ancora.nextSibling);
    /* o texto entra depois da região viva existir, para o leitor de tela anunciar */
    setTimeout(function () { p.textContent = "Selo do kit: " + f.selo + " ✓"; }, 60);
    return true;
  };

  /* ---------------- confete discreto (desligado com prefers-reduced-motion) ---------------- */
  function celebrar(alvo) {
    if (reduz() || !alvo) return;
    var cores = ["var(--accent)", "var(--focus)", "var(--ochre)", "var(--accent-bright)"], caixa = el("div", "g-confete");
    caixa.setAttribute("aria-hidden", "true");
    for (var k = 0; k < 26; k++) {
      var p = el("i");
      p.style.left = (6 + Math.random() * 88) + "%";
      p.style.background = cores[k % cores.length];
      p.style.animationDelay = (Math.random() * 0.25) + "s";
      p.style.setProperty("--dx", (Math.random() * 120 - 60).toFixed(0) + "px");
      p.style.setProperty("--rot", (Math.random() * 540 - 270).toFixed(0) + "deg");
      caixa.appendChild(p);
    }
    alvo.appendChild(caixa);
    setTimeout(function () { caixa.remove(); }, 1900);
  }

  /* ---------------- copiar e compartilhar ---------------- */
  function copiar(texto, status) {
    var ok = function () { status.textContent = "Copiado. Cole no WhatsApp ou no e-mail."; };
    var reserva = function () {
      var ta = el("textarea"); ta.value = texto; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); ok(); } catch (e) { status.textContent = "Selecione o texto e copie."; }
      ta.remove();
    };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok, reserva); else reserva(); } catch (e) { reserva(); }
  }

  /* ---------------- cartões de toque ---------------- */
  /* opcoes: [{v, t, d, ico}]; multi: vários ao mesmo tempo; aoEscolher(v, ligado) */
  function cartoes(alvo, cfg) {
    var longo = cfg.compacto && cfg.opcoes.some(function (o) { return String(o.t).length > 12; });
    var grupo = el("div", "g-cartoes" + (cfg.compacto ? " g-cartoes--compacto" : "") + (longo ? " g-cartoes--longo" : ""));
    grupo.setAttribute("role", "group");
    if (cfg.rotulo) grupo.setAttribute("aria-label", cfg.rotulo);
    var botoes = [];
    cfg.opcoes.forEach(function (o) {
      var b = el("button", "g-cartao"); b.type = "button"; b.dataset.v = o.v;
      var ligado = cfg.multi ? !!(cfg.valor && cfg.valor(o.v)) : cfg.valor === o.v;
      b.setAttribute("aria-pressed", ligado ? "true" : "false");
      b.innerHTML = (o.ico ? '<span class="g-cartao__ico" aria-hidden="true">' + o.ico + "</span>" : "") +
        '<span class="g-cartao__t"><b></b>' + (o.d ? "<small></small>" : "") + '</span><span class="g-cartao__ok" aria-hidden="true">' + ICONES.ok + "</span>";
      b.querySelector("b").textContent = o.t; if (o.d) b.querySelector("small").textContent = o.d;
      b.addEventListener("click", function () {
        if (cfg.multi) {
          var on = b.getAttribute("aria-pressed") !== "true";
          b.setAttribute("aria-pressed", on ? "true" : "false");
          cfg.aoEscolher(o.v, on);
        } else {
          botoes.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
          cfg.aoEscolher(o.v, true);
        }
      });
      botoes.push(b); grupo.appendChild(b);
    });
    alvo.appendChild(grupo);
    return grupo;
  }

  /* espelho: campo do modo guiado <-> campo do formulário completo (o formulário completo é quem calcula) */
  function espelho(guiado, original, paraOriginal, doOriginal) {
    guiado.value = doOriginal ? doOriginal(original.value) : original.value;
    var passa = function () {
      original.value = paraOriginal ? paraOriginal(guiado.value) : guiado.value;
      original.dispatchEvent(new Event("input", { bubbles: true }));
      original.dispatchEvent(new Event("change", { bubbles: true }));
    };
    guiado.addEventListener("input", passa);
    guiado.addEventListener("change", passa);
    return guiado;
  }
  /* "4,1570" -> "4.1570" para um input type=number; e o contrário para mostrar */
  var paraNumero = function (v) { var s = String(v || "").trim().replace(/\s/g, ""); if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", "."); return s; };
  var deNumero = function (v) { return String(v || "").replace(".", ","); };

  function campo(alvo, cfg) {
    var w = el("label", "g-campo"); w.appendChild(el("span", "g-campo__r", cfg.rotulo));
    var i;
    if (cfg.select) { i = el("select"); }
    else { i = el("input"); i.type = cfg.type || "text"; if (cfg.inputmode) i.inputMode = cfg.inputmode; if (cfg.placeholder) i.placeholder = cfg.placeholder; i.autocomplete = "off"; }
    if (cfg.id) i.id = cfg.id;
    if (cfg.list) i.setAttribute("list", cfg.list);
    w.appendChild(i);
    if (cfg.dica) w.appendChild(el("span", "g-campo__d", cfg.dica));
    alvo.appendChild(w);
    return i;
  }

  /* ---------------- alternância entre os modos ---------------- */
  /* cfg: { antes: elemento antes do qual entra a barra de modos, guiado: painel, completo: [elementos do modo completo] } */
  function modos(cfg) {
    var barra = el("div", "g-modos"); barra.setAttribute("role", "group"); barra.setAttribute("aria-label", "Como usar a ferramenta");
    var bG = el("button", "g-modos__b", "Modo guiado"), bC = el("button", "g-modos__b", "Ver tudo de uma vez");
    bG.type = bC.type = "button";
    bG.insertAdjacentHTML("afterbegin", '<span aria-hidden="true">✦ </span>');
    barra.appendChild(bG); barra.appendChild(bC);
    cfg.antes.parentNode.insertBefore(barra, cfg.antes);
    function aplica(m, doUsuario) {
      var g = m !== "completo";
      modoAtual = g ? "guiado" : "completo";
      bG.setAttribute("aria-pressed", g ? "true" : "false"); bC.setAttribute("aria-pressed", g ? "false" : "true");
      cfg.guiado.hidden = !g;
      cfg.completo.forEach(function (x) { x.hidden = g; });
      document.documentElement.classList.toggle("g-on", g);
      if (doUsuario) { try { history.replaceState(null, "", g ? location.pathname + location.search : "#completo"); } catch (e) { /* ok */ } }
      if (cfg.aoTrocar) cfg.aoTrocar(g ? "guiado" : "completo");
    }
    bG.addEventListener("click", function () { aplica("guiado", true); });
    bC.addEventListener("click", function () { aplica("completo", true); });
    aplica(/^#completo/.test(location.hash) ? "completo" : "guiado", false);
    return { ir: function (m) { aplica(m, true); } };
  }

  /* ---------------- o assistente (um passo por tela) ---------------- */
  /* cfg: { id, titulo, passos:[{titulo, ajuda, montar(corpo, ctl), valida()->"" ou mensagem, pular()->bool, botao}],
            exemplos:[{rotulo, aplicar(ctl)}], resultado(corpo, ctl) -> {resumoVoz} , aoIrParaCompleto() } */
  function assistente(painel, cfg) {
    painel.classList.add("g-painel");
    painel.innerHTML = "";
    var topo = el("div", "g-topo");
    var prog = el("p", "g-prog"); prog.id = cfg.id + "-prog";
    var trilho = el("div", "g-trilho"); trilho.setAttribute("role", "progressbar"); trilho.setAttribute("aria-valuemin", "0");
    trilho.setAttribute("aria-labelledby", prog.id);
    var enche = el("i"); trilho.appendChild(enche);
    topo.appendChild(prog); topo.appendChild(trilho);
    var palco = el("div", "g-palco");
    var erro = el("p", "g-erro"); erro.setAttribute("role", "alert"); erro.hidden = true;
    var nav = el("div", "g-nav");
    var bVolta = el("button", "g-btn g-btn--volta", "Voltar"); bVolta.type = "button";
    var bVai = el("button", "g-btn g-btn--vai", "Avançar"); bVai.type = "button";
    nav.appendChild(bVolta); nav.appendChild(bVai);
    var voz = el("div", "g-sr"); voz.setAttribute("aria-live", "polite"); voz.setAttribute("aria-atomic", "true");
    painel.appendChild(topo); painel.appendChild(palco); painel.appendChild(erro); painel.appendChild(nav); painel.appendChild(voz);

    var atual = 0, noResultado = false, mexeu = false, ocupado = false;
    var visiveis = function () { return cfg.passos.filter(function (p) { return !(p.pular && p.pular()); }); };
    function prox(i, dir) { var j = i + dir; while (j >= 0 && j < cfg.passos.length && cfg.passos[j].pular && cfg.passos[j].pular()) j += dir; return j; }
    function mostraErro(m) { erro.textContent = m || ""; erro.hidden = !m; }

    var ctl = {
      avancar: function () { vai(); },
      voltar: function () { volta(); },
      ir: function (i) { atual = i; noResultado = false; desenha(); },
      resultado: function () { mostraResultado(); },
      erro: mostraErro,
      refazer: function () { desenha(); },
      ocupado: function (s, txt) { ocupado = s; bVai.disabled = s; bVai.innerHTML = s ? '<span class="g-spin" aria-hidden="true"></span>' + (txt || "Aguarde…") : rotuloVai(); },
      painel: painel
    };
    function rotuloVai() { var p = cfg.passos[atual]; return p.botao || (prox(atual, 1) >= cfg.passos.length ? "Ver o resultado" : "Avançar"); }

    function cabecalho(texto, pct) {
      prog.textContent = texto; enche.style.width = pct + "%";
      trilho.setAttribute("aria-valuemax", "100"); trilho.setAttribute("aria-valuenow", String(Math.round(pct)));
    }
    function entra(sec) {
      palco.innerHTML = ""; palco.appendChild(sec);
      if (!reduz()) { sec.classList.add("g-entra"); }
      if (mexeu) { var h = sec.querySelector("h2,h3"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } painel.scrollIntoView({ block: "nearest", behavior: reduz() ? "auto" : "smooth" }); }
    }
    function desenha() {
      mostraErro(""); noResultado = false;
      if (cfg.passos[atual].pular && cfg.passos[atual].pular()) { var j = prox(atual, 1); atual = j < cfg.passos.length ? j : prox(atual, -1); }
      var vis = visiveis(), pos = vis.indexOf(cfg.passos[atual]) + 1, p = cfg.passos[atual];
      cabecalho("Passo " + pos + " de " + vis.length, ((pos - 1) / vis.length) * 100 + 4);
      var sec = el("section", "g-passo"), h = el("h2", "g-passo__t", p.titulo);
      sec.appendChild(h);
      if (p.ajuda) sec.appendChild(el("p", "g-passo__a", p.ajuda));
      var corpo = el("div", "g-passo__c"); sec.appendChild(corpo);
      if (atual === 0 && cfg.exemplos && cfg.exemplos.length) {
        var ex = el("div", "g-exemplos"); ex.appendChild(el("span", "g-exemplos__r", "Exemplo pronto, um toque:"));
        cfg.exemplos.forEach(function (e) {
          var b = el("button", "g-ex", e.rotulo); b.type = "button";
          b.addEventListener("click", function () { mexeu = true; e.aplicar(ctl); });
          ex.appendChild(b);
        });
        sec.appendChild(ex);
      }
      p.montar(corpo, ctl);
      bVolta.hidden = pos <= 1; bVolta.textContent = "Voltar";
      bVai.hidden = false; bVai.disabled = false; bVai.innerHTML = rotuloVai();
      entra(sec);
    }
    function vai() {
      if (ocupado) return;
      if (noResultado) { mexeu = true; atual = 0; desenha(); return; }
      mexeu = true;
      var p = cfg.passos[atual], m = p.valida ? p.valida() : "";
      if (m) { mostraErro(m); return; }
      if (p.aoSair) { var r = p.aoSair(ctl); if (r === false) return; }
      var j = prox(atual, 1);
      if (j >= cfg.passos.length) mostraResultado(); else { atual = j; desenha(); }
    }
    function volta() {
      mexeu = true;
      if (noResultado) { noResultado = false; desenha(); return; }
      var j = prox(atual, -1); if (j >= 0) { atual = j; desenha(); }
    }
    function mostraResultado() {
      mostraErro(""); mexeu = true;
      var sec = el("section", "g-passo g-res");
      var out = cfg.resultado(sec, ctl);
      if (out === false) return; // a página mostrou um erro e ficou no passo
      noResultado = true;
      cabecalho("Pronto!", 100);
      bVolta.hidden = false; bVolta.textContent = "Voltar e ajustar";
      bVai.innerHTML = "Recomeçar"; bVai.disabled = false;
      entra(sec);
      if (out && out.voz) { voz.textContent = ""; setTimeout(function () { voz.textContent = out.voz; }, 60); }
    }
    bVai.addEventListener("click", vai);
    bVolta.addEventListener("click", volta);
    painel.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.isComposing) return;
      var t = e.target, tag = (t.tagName || "").toLowerCase();
      if (tag === "button" || tag === "a" || tag === "textarea" || tag === "select") return;
      if (tag === "input" && (t.type === "checkbox" || t.type === "radio")) return;
      e.preventDefault(); vai();
    });
    desenha();
    return ctl;
  }

  /* ---------------- cartão-resultado ---------------- */
  /* cfg: { ferramenta, titulo, numeros:[{rotulo, valor, sub, fonte, tom, barra(0..1), extra(Node)}], antes(Node), depois(Node),
            limite(HTML), resumo(fn->texto), botoes:[{rotulo, acao}] } */
  /* medalha do kit no alto do resultado; marca o selo (a não ser com semSelo) */
  function medalha(id, semSelo) {
    var f = FERRAMENTAS.filter(function (x) { return x.id === id; })[0];
    var novo = semSelo ? false : kit.marcar(id);
    var selo = el("div", "g-medalha" + (novo && !reduz() ? " is-nova" : ""));
    selo.hidden = !!semSelo;
    selo.innerHTML = '<span class="g-medalha__ico" aria-hidden="true">' + ICONES[id] + '</span><span><small>' + (novo ? "Selo conquistado" : "Selo do kit") + "</small><b></b></span>";
    selo.querySelector("b").textContent = f.selo;
    return { el: selo, novo: novo, f: f };
  }
  function cartaoResultado(alvo, cfg) {
    var md = medalha(cfg.ferramenta, cfg.semSelo), f = md.f, novo = md.novo;
    var cab = el("div", "g-res__cab");
    cab.appendChild(md.el);
    var h = el("h2", "g-passo__t", cfg.titulo); cab.appendChild(h);
    alvo.appendChild(cab);
    if (cfg.antes) alvo.appendChild(cfg.antes);
    var grade = el("div", "g-nums");
    (cfg.numeros || []).forEach(function (n) {
      var c = el("div", "g-num" + (n.tom ? " g-num--" + n.tom : "") + (n.largo ? " g-num--largo" : ""));
      c.appendChild(el("span", "g-num__r", n.rotulo));
      var v = el("b", "g-num__v"); v.textContent = n.valor; c.appendChild(v);
      if (n.sub) c.appendChild(el("span", "g-num__s", n.sub));
      if (n.barra != null) { var br = el("div", "g-barra"); br.setAttribute("aria-hidden", "true"); var i = el("i"); br.appendChild(i); c.appendChild(br); (function (i, w) { setTimeout(function () { i.style.width = Math.max(2, Math.min(100, w * 100)) + "%"; }, 40); })(i, n.barra); }
      if (n.extra) c.appendChild(n.extra);
      if (n.fonte) c.appendChild(el("span", "g-num__f", "Fonte: " + n.fonte));
      grade.appendChild(c);
    });
    alvo.appendChild(grade);
    if (cfg.depois) alvo.appendChild(cfg.depois);
    if (cfg.limite) { var lim = el("div", "g-limite"); lim.innerHTML = cfg.limite; alvo.appendChild(lim); }
    var ac = el("div", "g-acoes");
    var status = el("span", "g-status"); status.setAttribute("role", "status");
    if (cfg.resumo) {
      var bc = el("button", "btn btn--solid", "Copiar resumo para o cliente"); bc.type = "button";
      bc.addEventListener("click", function () { copiar(cfg.resumo(), status); });
      ac.appendChild(bc);
      if (navigator.share) {
        var bs = el("button", "btn btn--ghost", "Compartilhar"); bs.type = "button";
        bs.addEventListener("click", function () { navigator.share({ title: f.nome + " · O Analista Ambiental", text: cfg.resumo() }).catch(function () { /* cancelou */ }); });
        ac.appendChild(bs);
      }
    }
    (cfg.botoes || []).forEach(function (b) { var x = el("button", "btn btn--ghost", b.rotulo); x.type = "button"; x.addEventListener("click", function () { b.acao(status); }); ac.appendChild(x); });
    ac.appendChild(status);
    alvo.appendChild(ac);
    var k = el("div"); kit.desenhar(k, "", cfg.ferramenta); alvo.appendChild(k);
    if (novo) setTimeout(function () { celebrar(alvo); }, 80);
    return alvo;
  }

  raiz.Guiado = { assistente: assistente, modos: modos, cartoes: cartoes, campo: campo, espelho: espelho, paraNumero: paraNumero, deNumero: deNumero,
                  cartaoResultado: cartaoResultado, medalha: medalha, kit: kit, celebrar: celebrar, copiar: copiar, el: el, ICONES: ICONES };
})(window);
