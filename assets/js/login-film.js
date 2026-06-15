(function initLoginFilm() {
  "use strict";

  var root = document.querySelector("[data-login-film]");
  if (!root) return;

  var slides = Array.prototype.slice.call(root.querySelectorAll("[data-login-film-screen] img"));
  var dots = Array.prototype.slice.call(root.querySelectorAll("[data-login-film-dots] span"));
  var kicker = root.querySelector("[data-login-film-kicker]");
  var title = root.querySelector("[data-login-film-title]");
  var caption = root.querySelector(".brand-film-caption");

  if (!slides.length || !kicker || !title) return;

  var scenes = [
    { kicker: "Dashboard", title: "Your whole day, at a glance" },
    { kicker: "Planning", title: "Orchestrate the week, conflict-free" },
    { kicker: "Actuals", title: "Verified hours, ready for payroll" },
    { kicker: "Badge terminal", title: "Clock in in seconds, on any tablet" },
    { kicker: "Team", title: "Contracts and payroll, export-ready" }
  ];

  var current = 0;
  var prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function render(index) {
    current = index % slides.length;

    slides.forEach(function updateSlide(slide, slideIndex) {
      slide.classList.toggle("is-active", slideIndex === current);
    });

    dots.forEach(function updateDot(dot, dotIndex) {
      dot.classList.toggle("is-active", dotIndex === current);
    });

    kicker.textContent = scenes[current].kicker;
    title.textContent = scenes[current].title;

    if (caption && !prefersReducedMotion) {
      caption.classList.remove("is-changing");
      window.requestAnimationFrame(function restartAnimation() {
        caption.classList.add("is-changing");
      });
    }
  }

  render(0);

  if (!prefersReducedMotion && slides.length > 1) {
    window.setInterval(function advance() {
      render(current + 1);
    }, 4200);
  }
}());
