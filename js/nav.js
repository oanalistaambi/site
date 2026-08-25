(function () {
  var burger = document.querySelector(".nav__burger");
  var links = document.querySelector(".nav__links");
  if (!burger || !links) return;

  function closeMenu() {
    links.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    links.classList.add("is-open");
    burger.setAttribute("aria-expanded", "true");
  }

  burger.addEventListener("click", function () {
    var isOpen = links.classList.contains("is-open");
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  links.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", closeMenu);
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 840) closeMenu();
  });
})();
