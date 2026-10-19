/* Lista de espera da Rota 2.0 + resumo semanal do Radar.
   Componente único: qualquer página coloca <div data-lista></div> e carrega este arquivo.
   Opcional: data-padrao="rota", "radar" ou "rota,radar" (o que já vem marcado).
   Opcional: data-opcoes="federal,rota" (quais opções aparecem; sem ele, só "rota" e "radar"). */
(function () {
  // FormSubmit (grátis, sem cadastro): cada inscrição chega por e-mail ao dono. O primeiro envio manda um
  // e-mail de ativação para o DESTINO; o dono clica uma vez em "Activate". Se o serviço falhar, cai no mailto.
  const ENDPOINT = "https://formsubmit.co/ajax/contato@oanalistaambiental.com";

  const DESTINO = "contato@oanalistaambiental.com";
  const ASSUNTO = "Lista de espera";
  const OPCOES = [
    { id: "rota", rotulo: "Lista de espera da Rota 2.0" },
    { id: "radar", rotulo: "Resumo semanal do Radar" },
    { id: "federal", rotulo: "Turma fundadora da Rota Federal" }
  ];

  function el(tag, attrs, filhos) {
    const e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "texto") e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { e.appendChild(f); });
    return e;
  }

  function montar(raiz) {
    const padrao = (raiz.getAttribute("data-padrao") || "rota,radar").split(",");
    const form = el("form", { "class": "lista__form", novalidate: "" });
    if (ENDPOINT) { form.setAttribute("action", ENDPOINT); form.setAttribute("method", "POST"); }

    const nome = el("input", { type: "text", name: "nome", id: "lista-nome", placeholder: "Seu nome (opcional)", autocomplete: "name" });
    const email = el("input", { type: "email", name: "email", id: "lista-email", placeholder: "seu@email.com", autocomplete: "email", required: "" });
    const mel = el("input", { type: "text", name: "_gotcha", tabindex: "-1", autocomplete: "off", "aria-hidden": "true", "class": "lista__mel" });

    const campos = el("fieldset", { "class": "lista__interesse" }, [el("legend", { texto: "Quero receber" })]);
    const mostrar = (raiz.getAttribute("data-opcoes") || "rota,radar").split(",");
    OPCOES.filter(function (o) { return mostrar.indexOf(o.id) !== -1; }).forEach(function (o) {
      const cx = el("input", { type: "checkbox", name: "interesse", value: o.rotulo });
      if (padrao.indexOf(o.id) !== -1) cx.checked = true;
      campos.appendChild(el("label", {}, [cx, el("span", { texto: o.rotulo })]));
    });

    const botao = el("button", { type: "submit", "class": "btn btn--solid", texto: "Quero entrar na lista" });
    const msg = el("p", { "class": "lista__msg", role: "status", "aria-live": "polite" });
    const nota = el("p", { "class": "lista__nota", texto: "Usamos seu e-mail só para avisar dos cursos e do Radar. Sem spam. O envio passa pelo serviço FormSubmit." });

    form.appendChild(el("label", { "class": "lista__rot", "for": "lista-nome", texto: "Nome" }));
    form.appendChild(nome);
    form.appendChild(el("label", { "class": "lista__rot", "for": "lista-email", texto: "E-mail (obrigatório)" }));
    form.appendChild(email);
    form.appendChild(mel);
    form.appendChild(campos);
    form.appendChild(botao);
    raiz.textContent = "";
    raiz.appendChild(form);
    raiz.appendChild(msg);
    raiz.appendChild(nota);

    function dados() {
      const marcados = Array.prototype.map.call(
        form.querySelectorAll('input[name="interesse"]:checked'), function (c) { return c.value; });
      return { nome: nome.value.trim(), email: email.value.trim(), interesse: marcados };
    }

    function abrirEmail(d) {
      const corpo = "Olá! Quero entrar na lista do O Analista Ambiental.\n\n" +
        "Nome: " + (d.nome || "(não informado)") + "\n" +
        "E-mail: " + d.email + "\n" +
        "Interesse: " + d.interesse.join("; ") + "\n";
      window.location.href = "mailto:" + DESTINO + "?subject=" + encodeURIComponent(ASSUNTO) +
        "&body=" + encodeURIComponent(corpo);
      msg.textContent = "Abrimos o seu aplicativo de e-mail com a mensagem pronta. Basta enviar. " +
        "Se nada abriu, escreva para " + DESTINO + ".";
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      msg.className = "lista__msg";
      const d = dados();
      if (!d.email || !email.checkValidity()) {
        msg.className = "lista__msg lista__msg--erro";
        msg.textContent = "Informe um e-mail válido.";
        email.focus();
        return;
      }
      if (!d.interesse.length) {
        msg.className = "lista__msg lista__msg--erro";
        msg.textContent = "Marque pelo menos uma opção.";
        return;
      }
      if (mel.value) return; // robô
      if (!ENDPOINT) { abrirEmail(d); return; }

      botao.disabled = true;
      const corpo = new FormData();
      corpo.append("nome", d.nome);
      corpo.append("email", d.email);
      corpo.append("interesse", d.interesse.join("; "));
      corpo.append("_subject", ASSUNTO);
      corpo.append("_template", "table");
      corpo.append("_captcha", "false");
      fetch(ENDPOINT, { method: "POST", body: corpo, headers: { Accept: "application/json" } })
        .then(function (r) {
          if (!r.ok) throw new Error("falha");
          form.reset();
          msg.textContent = "Pronto! Você está na lista. Obrigado.";
        })
        .catch(function () { abrirEmail(d); })
        .then(function () { botao.disabled = false; });
    });
  }

  function iniciar() {
    document.querySelectorAll("[data-lista]").forEach(montar);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
