(function () {
  var burger = document.querySelector(".nav__burger");
  var links = document.querySelector(".nav__links");
  if (!burger || !links) return;

  function closeMenu() {
    links.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
  }

  burger.addEventListener("click", function () {
    var open = !links.classList.contains("is-open");
    links.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // Submenus: no celular abrem com toque; no computador também abrem com o mouse (CSS).
  links.querySelectorAll(".dd__btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var dd = btn.parentElement;
      var open = !dd.classList.contains("is-open");
      links.querySelectorAll(".dd.is-open").forEach(function (o) {
        o.classList.remove("is-open");
        o.querySelector(".dd__btn").setAttribute("aria-expanded", "false");
      });
      dd.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  document.addEventListener("click", function (e) {
    if (!links.contains(e.target) && !burger.contains(e.target)) {
      links.querySelectorAll(".dd.is-open").forEach(function (o) { o.classList.remove("is-open"); });
    }
  });

  links.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", closeMenu);
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 980) closeMenu();
  });
})();
