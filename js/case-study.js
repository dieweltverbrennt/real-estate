/* Investment case-study pages: fits the main photograph under the title on portrait phones and tablets, so the title and
   the whole photograph are on the first screen together (see css/case-study.css; on wider screens the layout needs no
   script). Sets --cs-fit on .cs-d-fig = the screen height left below the point where the photograph starts, minus
   --cs-gap. Measured on load, when fonts have loaded (the title may rewrap) and when the window width changes; a change
   of height alone is ignored on touch screens (the address bar showing and hiding while scrolling must not resize the
   picture) but followed on desktop (resizing the window). */
(function () {
  'use strict';
  var fig = document.querySelector('.cs-d-fig');
  if (!fig) return;
  var touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  var lastW = 0, lastH = 0;

  function fit() {
    var cs = getComputedStyle(fig);
    var top = fig.getBoundingClientRect().top + window.pageYOffset;
    var gap = parseFloat(cs.getPropertyValue('--cs-gap')) || 28;
    var h = window.innerHeight - top - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - gap;
    fig.style.setProperty('--cs-fit', Math.max(120, Math.floor(h)) + 'px');
    lastW = window.innerWidth; lastH = window.innerHeight;
  }
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  window.addEventListener('load', fit);
  var t;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastW && (touch || window.innerHeight === lastH)) return;
    clearTimeout(t); t = setTimeout(fit, 120);
  }, { passive: true });
})();
