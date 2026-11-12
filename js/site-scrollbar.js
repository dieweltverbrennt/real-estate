/* Page scrollbar - "Minimal Bronze" (see css/site-scrollbar.css). Desktop with mouse/trackpad only (html.bq-sb, set in
   <head>). Native scrolling is untouched; this only draws the indicator and makes it draggable/clickable.
   Work while scrolling: none where CSS scroll-driven animations exist (the thumb's runner is moved 0-100% of its own height,
   plain keyframes the compositor can run without the main thread); otherwise one
   transform write per frame. Layout is read only on load, resize and page-height changes. The light/dark palette follows
   the hero (IntersectionObserver) and the header's own adaptive tone (MutationObserver) - no scroll handlers, no video or
   canvas access. */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root.classList.contains('bq-sb')) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var bar = document.createElement('div'); bar.className = 'bq-sb-bar'; bar.setAttribute('aria-hidden', 'true');
  var track = document.createElement('div'); track.className = 'bq-sb-track';
  var rail = document.createElement('div'); rail.className = 'bq-sb-rail';
  var thumb = document.createElement('div'); thumb.className = 'bq-sb-thumb'; thumb.appendChild(document.createElement('i'));
  var run = document.createElement('div'); run.className = 'bq-sb-run';         // as tall as the thumb's travel; moved 0-100%
  run.appendChild(thumb); track.appendChild(rail); bar.appendChild(track); bar.appendChild(run);
  document.body.appendChild(bar);

  // ---- geometry: read only when sizes change
  var TH = 56, max = 1, travel = 0;
  var sda = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()'));
  function measure() {
    var docH = Math.max(root.scrollHeight, document.body.scrollHeight);
    max = Math.max(1, docH - window.innerHeight);
    travel = Math.max(0, track.getBoundingClientRect().height - TH);
    bar.style.setProperty('--sb-th', TH + 'px');
    run.style.height = travel + 'px';
    if (!sda) paint();
  }
  var raf = 0;
  function paint() { raf = 0; run.style.transform = 'translateY(' + Math.min(1, Math.max(0, window.scrollY / max)) * travel + 'px)'; }
  if (!sda) window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
  window.addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  measure();

  // ---- drag the thumb / click the track (native scrolling does the rest)
  function to(y, smooth) { window.scrollTo({ top: Math.max(0, Math.min(max, y)), behavior: smooth && !reduce ? 'smooth' : 'auto' }); }
  var drag = null;
  thumb.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = { y: e.clientY, s: window.scrollY };
    thumb.setPointerCapture(e.pointerId); root.classList.add('bq-sb-drag');
  });
  thumb.addEventListener('pointermove', function (e) { if (drag && travel) to(drag.s + (e.clientY - drag.y) * max / travel, false); });
  function end() { if (drag) { drag = null; root.classList.remove('bq-sb-drag'); } }
  thumb.addEventListener('pointerup', end); thumb.addEventListener('pointercancel', end); thumb.addEventListener('lostpointercapture', end);
  track.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    var p = (e.clientY - track.getBoundingClientRect().top - TH / 2) / (travel || 1);
    to(Math.min(1, Math.max(0, p)) * max, true);
  });

  // ---- palette: champagne while the hero is behind the bar and the header shows light text (dark video), else bronze
  var hero = document.getElementById('hero'), header = document.getElementById('header'), onHero = false;
  function tone() {
    var dark = false;
    if (onHero && header && !header.classList.contains('is-solid')) {
      var hn = parseFloat(header.style.getPropertyValue('--hn'));
      dark = isNaN(hn) ? header.classList.contains('on-dark') : hn > 0.5;
    }
    bar.classList.toggle('is-dark', dark);
  }
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { onHero = en[0].isIntersecting; tone(); }, { rootMargin: '-50% 0px -50% 0px' }).observe(hero);
  }
  if (header && window.MutationObserver) new MutationObserver(function () { if (onHero) tone(); }).observe(header, { attributes: true, attributeFilter: ['style', 'class'] });

  bar.classList.add('is-ready');
})();
