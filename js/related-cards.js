/* "Related" / "From the Journal" band (css/related-cards.css). Its cards scroll natively when they do not all fit
   (swipe, trackpad, snap points); the arrows move by one view of whole cards and dim at either end; the progress line
   follows the position; when everything fits (a pair on a desktop or tablet) the band is marked .is-static and shows
   no controls. Works left-to-right and right-to-left. Without the script the cards still scroll by swipe.
   The same behaviour drives other card rows that keep their own markup and styles: a section marked [data-rc] whose
   row is marked [data-rc-rail] (the investment cases' "Related Case Studies", a carousel on phones only). */
(function () {
  'use strict';
  var d = document;
  var rtl = d.documentElement.dir === 'rtl';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init(sec) {
    var rail = sec.querySelector('.rc-list, [data-rc-rail]');
    var prev = sec.querySelector('.rc-arrow[data-dir=prev]');
    var next = sec.querySelector('.rc-arrow[data-dir=next]');
    var bar = sec.querySelector('.rc-prog i');
    if (!rail || !prev || !next) return;

    // one view: as many whole cards as fit, at least one
    function step() {
      var li = rail.firstElementChild;
      if (!li) return rail.clientWidth;
      var g = parseFloat(getComputedStyle(rail).columnGap) || 0;
      var card = li.getBoundingClientRect().width + g;
      return Math.max(1, Math.floor((rail.clientWidth + g + 1) / card)) * card;
    }
    function update() {
      var max = rail.scrollWidth - rail.clientWidth, x = Math.abs(rail.scrollLeft);
      sec.classList.toggle('is-static', max <= 2);
      prev.disabled = x <= 2;
      next.disabled = x >= max - 2;
      if (bar) {
        bar.style.setProperty('--w', Math.min(100, rail.clientWidth / rail.scrollWidth * 100).toFixed(2) + '%');
        bar.style.setProperty('--p', max > 0 ? Math.min(1, x / max).toFixed(4) : 0);
      }
    }
    function move(dir) {
      rail.scrollBy({ left: step() * dir * (rtl ? -1 : 1), behavior: reduce ? 'auto' : 'smooth' });
    }
    prev.addEventListener('click', function () { move(-1); });
    next.addEventListener('click', function () { move(1); });
    var rq = 0;
    rail.addEventListener('scroll', function () {
      if (rq) return;
      rq = requestAnimationFrame(function () { rq = 0; update(); });
    }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('load', update);
    update();
  }

  function start() { [].forEach.call(d.querySelectorAll('.rc-sec, [data-rc]'), init); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
})();
