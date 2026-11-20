/* BITOQU Journal index - behaviour for the editorial layout (css/journal.css), identical on all 19 language versions.
   1. Category filter: the buttons in .jr-nav (and the sections index in "Explore the Journal") choose a category. "All"
      shows the editorial page (Featured, Latest, Must Read, Explore); any other category hides those four sections and
      lists only that category's stories, built from the <template id="jr-tpl"> that holds one card per published
      article with its category (data-cat), date (data-date) and Journal order (data-seq). Newest first; equal dates
      keep the Journal order. The choice is kept in the address (#finance-mortgages), so it can be shared and Back
      returns to the previous view.
      Pagination: "Explore the Journal" (and a category's list) shows a page at a time (data-per on the grid); Next
      page / Previous page below the grid change it, return to the top of the section and keep the category. The page
      goes into the address with the category (#page-2, #finance-mortgages/page-2).
   2. Latest rail: native horizontal scroll with snap points (touch and trackpads), arrow buttons move one card,
      a progress line follows the scroll position. Works left-to-right and right-to-left.
   3. Navigation: a soft edge where more categories are off-screen (phones), and the bar is marked .is-stuck while it
      is pinned under the site header (its hairline then runs the full width).
   4. Subscribe dialog (#jr-sm, opened by the Subscribe button in the masthead): see initSubscribe() below.
   Without JavaScript the editorial page is complete and every article is linked; only filtering and the Subscribe
   dialog need the script. */
(function () {
  'use strict';
  var d = document, html = d.documentElement;
  var rtl = html.dir === 'rtl';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init() {
    var nav = d.querySelector('.jr-nav');
    if (!nav) return;
    var tabs = [].slice.call(nav.querySelectorAll('[data-jr-cat]'));
    var cats = {};
    tabs.forEach(function (t) { cats[t.getAttribute('data-jr-cat')] = t.textContent.trim(); });
    var eds = [].slice.call(d.querySelectorAll('[data-jr-ed]'));
    var res = d.getElementById('jr-results');
    var grid = res.querySelector('.jr-res-grid');
    var title = res.querySelector('.jr-h2');
    var empty = res.querySelector('.jr-empty');
    var status = d.getElementById('jr-status');
    var tpl = d.getElementById('jr-tpl');
    var all = [].slice.call(tpl.content.children).sort(function (a, b) {
      var da = a.getAttribute('data-date'), db = b.getAttribute('data-date');
      if (da !== db) return da < db ? 1 : -1;
      return (+a.getAttribute('data-seq')) - (+b.getAttribute('data-seq'));
    });
    var sc = nav.querySelector('.jr-nav-sc');
    var current = 'all';
    // pagination: Explore the Journal shows its cards a page at a time (data-per on the grid); a category's stories are
    // paged the same way. The page is kept in the address with the category (#page-2, #finance-mortgages/page-2).
    var exSec = d.querySelector('.jr-explore');
    var exGrid = exSec && exSec.querySelector('.jr-ex-grid');
    var exCards = exGrid ? [].slice.call(exGrid.children) : [];
    var page = 1;

    function headerBottom() {
      var h = d.getElementById('header');
      return h ? h.getBoundingClientRect().bottom : 0;
    }
    // when the visitor is further down the page, return to the point where the bar pins under the header, so the
    // chosen category starts right below it (the masthead above the bar never changes height)
    function toContent() {
      var y = nav.previousElementSibling.getBoundingClientRect().bottom + window.scrollY - headerBottom();
      if (window.scrollY > y + 1) window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    }
    function showTab(t) {   // keep the chosen category visible inside the swipeable bar
      if (!sc || sc.scrollWidth <= sc.clientWidth) return;
      var s = sc.getBoundingClientRect(), r = t.getBoundingClientRect(), pad = 40;
      if (r.left < s.left + pad) sc.scrollBy({ left: r.left - s.left - pad, behavior: reduce ? 'auto' : 'smooth' });
      else if (r.right > s.right - pad) sc.scrollBy({ left: r.right - s.right + pad, behavior: reduce ? 'auto' : 'smooth' });
    }

    function perPage(g) { return Math.max(1, parseInt(g && g.getAttribute('data-per'), 10) || 6); }
    function clampPage(n, total) { n = parseInt(n, 10) || 1; return n < 1 ? 1 : n > total ? total : n; }
    // the pager under a grid: hidden when everything fits on one page; Next hidden on the last page, Previous on the
    // first
    function setPager(sec, n, total) {
      var pg = sec && sec.querySelector('.jr-pager');
      if (!pg) return;
      pg.hidden = total <= 1;
      pg.querySelector('[data-jr-page=next]').hidden = n >= total;
      pg.querySelector('[data-jr-page=prev]').hidden = n <= 1;
    }
    // after a page change: back to the top of the section, just below the pinned category bar, and focus on its
    // heading (so keyboard and screen-reader users continue from the new page)
    function toSection(sec) {
      var head = sec.querySelector('.jr-head, .jr-res-head') || sec;
      // its place in the page from the layout, not from getBoundingClientRect: the scroll-reveal may still have the
      // heading moved a few pixels for its fade-in
      var top = 0;
      for (var el = head; el; el = el.offsetParent) top += el.offsetTop;
      var y = top - headerBottom() - nav.offsetHeight - 24;
      window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
      var h = sec.querySelector('.jr-h2');
      if (h) h.focus({ preventScroll: true });
    }
    function hashFor(cat, n) {
      if (cat === 'all') return n > 1 ? '#page-' + n : location.pathname + location.search;
      return '#' + cat + (n > 1 ? '/page-' + n : '');
    }

    // cat: the category ('all' for the editorial page); push: a new history entry; pg: the page; turning: the visitor
    // used the pager; quiet: no announcement (first load)
    function apply(cat, push, pg, turning, quiet) {
      if (!cats[cat] || cat === 'all') cat = 'all';
      current = cat;
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-jr-cat') === cat;
        t.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on) showTab(t);
      });
      var n, total, sec;
      if (cat === 'all') {
        eds.forEach(function (s) { s.hidden = false; });
        res.hidden = true;
        grid.textContent = '';
        setPager(res, 1, 1);
        // Explore the Journal: show this page's cards (the others stay in the page, hidden)
        var k = perPage(exGrid);
        total = Math.max(1, Math.ceil(exCards.length / k));
        n = clampPage(pg, total);
        exCards.forEach(function (c, i) { c.hidden = i < (n - 1) * k || i >= n * k; });
        setPager(exSec, n, total);
        sec = exSec;
      } else {
        var list = all.filter(function (c) { return c.getAttribute('data-cat') === cat; });
        var k2 = perPage(grid);
        total = Math.max(1, Math.ceil(list.length / k2));
        n = clampPage(pg, total);
        grid.textContent = '';
        var shown = list.slice((n - 1) * k2, n * k2);
        shown.forEach(function (c, i) {
          var el = c.cloneNode(true);
          el.style.setProperty('--i', i);
          grid.appendChild(el);
        });
        // the first story leads across the full width; the others fill rows without leaving a column empty
        var rest = shown.length - 1;
        grid.style.setProperty('--cols', rest % 3 === 0 ? 3 : rest % 2 === 0 || rest === 1 ? 2 : 3);
        title.textContent = cats[cat];
        empty.hidden = list.length > 0;
        grid.hidden = list.length === 0;
        eds.forEach(function (s) { s.hidden = true; });
        res.hidden = false;
        setPager(res, n, total);
        sec = res;
      }
      page = n;
      if (status && !quiet) {
        var pgEl = sec && sec.querySelector('.jr-pager');
        status.textContent = turning && pgEl
          ? pgEl.getAttribute('data-status').replace('{n}', n).replace('{t}', total)
          : cats[cat];
      }
      if (push) {
        try { history.pushState({ jr: cat, page: n }, '', hashFor(cat, n)); } catch (e) {}
      }
      if (turning) toSection(sec);
      else if (push) toContent();
      if (rail) requestAnimationFrame(updRail);
    }

    tabs.forEach(function (t) {
      t.addEventListener('click', function () { apply(t.getAttribute('data-jr-cat'), true, 1); });
    });
    [].forEach.call(d.querySelectorAll('[data-jr-go]'), function (b) {
      b.addEventListener('click', function () { apply(b.getAttribute('data-jr-go'), true, 1); });
    });
    [].forEach.call(d.querySelectorAll('.jr-pager [data-jr-page]'), function (b) {
      b.addEventListener('click', function () {
        apply(current, true, page + (b.getAttribute('data-jr-page') === 'next' ? 1 : -1), true);
      });
    });
    // #category, #page-2 or #category/page-2
    function fromHash(e, quiet) {
      var h = decodeURIComponent(location.hash.slice(1)), n = 1, m = /(?:^|\/)page-(\d+)$/.exec(h);
      if (m) { n = +m[1]; h = h.slice(0, m.index); }
      apply(h, false, n, false, quiet);
    }
    window.addEventListener('popstate', fromHash);
    window.addEventListener('hashchange', fromHash);

    // navigation bar: edge fades and pinned state
    function navFade() {
      if (!sc) return;
      var max = sc.scrollWidth - sc.clientWidth, x = Math.abs(sc.scrollLeft);
      var s = x > 2, e = x < max - 2;
      if (rtl) { var t = s; s = e; e = t; }   // the mask is painted left/right, not start/end
      sc.setAttribute('data-fade', max <= 2 ? '' : s && e ? 'both' : s ? 'start' : e ? 'end' : '');
    }
    function stuck() { nav.classList.toggle('is-stuck', nav.getBoundingClientRect().top <= headerBottom() + 0.5); }
    if (sc) {
      sc.addEventListener('scroll', navFade, { passive: true });
      // a mouse wheel scrolls the line sideways when it does not fit (and only then)
      sc.addEventListener('wheel', function (e) {
        var max = sc.scrollWidth - sc.clientWidth;
        if (max <= 2 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        var x = Math.abs(sc.scrollLeft), dir = (e.deltaY > 0 ? 1 : -1);
        if ((dir > 0 && x >= max - 1) || (dir < 0 && x <= 1)) return;   // at the end: let the page scroll
        e.preventDefault();
        sc.scrollLeft += e.deltaY * (rtl ? -1 : 1);
      }, { passive: false });
    }

    // Latest rail
    var latest = d.querySelector('.jr-latest');
    var rail = latest && latest.querySelector('.jr-rail');
    var prev = latest && latest.querySelector('[data-dir=prev]');
    var next = latest && latest.querySelector('[data-dir=next]');
    var bar = latest && latest.querySelector('.jr-prog i');
    // an arrow moves by a whole view of cards (as many as are fully visible, at least one): with five stories and about
    // four in view on desktop, one click reaches the end; on a phone, where one card fits, it moves card by card
    function step() {
      var li = rail.querySelector('li'), track = rail.querySelector('.jr-track'), cs = getComputedStyle(track);
      if (!li) return rail.clientWidth * 0.8;
      var g = parseFloat(cs.columnGap) || 0, pad = parseFloat(cs.paddingInlineStart) || 0;
      var card = li.getBoundingClientRect().width + g;
      var fit = Math.max(1, Math.floor((rail.clientWidth - pad * 2 + g) / card));
      return fit * card;
    }
    function updRail() {
      if (!rail || latest.hidden) return;
      var max = rail.scrollWidth - rail.clientWidth, x = Math.abs(rail.scrollLeft);
      latest.classList.toggle('is-static', max <= 2);
      if (prev) prev.disabled = x <= 2;
      if (next) next.disabled = x >= max - 2;
      if (bar) {
        bar.style.setProperty('--w', Math.min(100, rail.clientWidth / rail.scrollWidth * 100).toFixed(2) + '%');
        bar.style.setProperty('--p', max > 0 ? Math.min(1, x / max).toFixed(4) : 0);
      }
    }
    function move(dir) {
      var s = step() * dir * (rtl ? -1 : 1);
      rail.scrollBy({ left: s, behavior: reduce ? 'auto' : 'smooth' });
    }
    if (rail) {
      if (prev) prev.addEventListener('click', function () { move(-1); });
      if (next) next.addEventListener('click', function () { move(1); });
      var rq = 0;
      rail.addEventListener('scroll', function () {
        if (rq) return;
        rq = requestAnimationFrame(function () { rq = 0; updRail(); });
      }, { passive: true });
    }

    var sq = 0;
    window.addEventListener('scroll', function () {
      if (sq) return;
      sq = requestAnimationFrame(function () { sq = 0; stuck(); });
    }, { passive: true });
    window.addEventListener('resize', function () { navFade(); stuck(); updRail(); }, { passive: true });
    window.addEventListener('load', function () { navFade(); updRail(); });

    fromHash(null, true);   // the category and page in the address, or the first page of the editorial view
    navFade(); stuck(); updRail();
  }

  /* Subscribe dialog. Opens from the Subscribe button; closes with the close button, a click outside, Escape, or
     "Back to the Journal" after sending. While it is open the rest of the page is inert and does not scroll; focus
     moves into the dialog, Tab wraps inside it, and focus returns to Subscribe afterwards. The address is checked
     here first; errors show under the field and are announced, and follow the typing once shown.
     Sending: the same FormSubmit AJAX integration as the site's contact form (its endpoint is the form's action), but
     its own request: a JSON POST with the subject "New BITOQU Journal Subscription", the message
     "<address> подписался на обновления Журнала.", the address as `email` (FormSubmit's reply-to) and FormSubmit's
     spam trap `_honey`. The thank-you view appears only when FormSubmit answers with HTTP success and
     {"success":"true"} - its confirmation that it accepted the message for sending. Any other answer, a network
     failure or no answer within 20 seconds shows an error under the field (a separate one when FormSubmit reports too
     many requests) and leaves the address in place to try again. While a request is under way the button is
     disabled, so it cannot be sent twice. */
  function initSubscribe() {
    var root = d.getElementById('jr-sm');
    var trigger = d.querySelector('.jr-sub-btn');
    if (!root || !trigger) return;
    d.body.appendChild(root);   // out of <main>, so <main> and the header can be made inert while it is open
    var q = function (s) { return root.querySelector(s); };
    var dlg = q('.jr-sm-dlg'), form = q('.jr-sm-form'), input = q('.jr-sm-in'), err = q('.jr-sm-err'), go = q('.jr-sm-form .jr-sm-go');
    var ask = q('.jr-sm-ask'), done = q('.jr-sm-done'), doneH = q('#jr-sm-oh');
    var msgEmpty = form.getAttribute('data-e1'), msgInvalid = form.getAttribute('data-e2');
    var msgFail = form.getAttribute('data-fail'), msgRate = form.getAttribute('data-rate');
    var trap = form.querySelector('[name=_honey]');
    var SUBJECT = 'New BITOQU Journal Subscription';
    var MESSAGE = ' подписался на обновления Журнала.';   // follows the address in the notification
    var req = 0;   // the current request; a reply to an older one (the dialog was closed meanwhile) is ignored
    // one @; a local part without spaces or leading, trailing or double dots; domain labels; a top-level part of at
    // least two letters (Unicode letters allowed)
    var RE = /^(?!\.)(?!.*\.\.)[^\s@"(),:;<>[\]\\]+(?<!\.)@(?:[A-Za-z0-9¡-￿](?:[A-Za-z0-9¡-￿-]{0,61}[A-Za-z0-9¡-￿])?\.)+[A-Za-z¡-￿]{2,}$/;
    var last = null, timer = 0, inerted = [], downOut = false;

    function isOpen() { return !root.hidden && root.classList.contains('is-open'); }
    function focusables() {
      return [].filter.call(dlg.querySelectorAll('button,input'), function (e) { return !e.disabled && e.offsetParent !== null; });
    }
    function reset() {
      req++;
      form.reset(); err.textContent = ''; input.removeAttribute('aria-invalid');
      go.disabled = false; go.removeAttribute('aria-busy');
      ask.hidden = false; done.hidden = true;
      dlg.setAttribute('aria-labelledby', 'jr-sm-h'); dlg.setAttribute('aria-describedby', 'jr-sm-d');
    }
    function open() {
      if (!root.hidden) return;
      clearTimeout(timer);
      // focus returns to the control that opened it, or to Subscribe when nothing had focus (Safari does not focus a
      // button on click)
      last = d.activeElement && d.activeElement !== d.body && d.activeElement !== html ? d.activeElement : trigger;
      reset();
      root.hidden = false;
      inerted = [].filter.call(d.body.children, function (e) { return e !== root && !e.hasAttribute('inert') && e.tagName !== 'SCRIPT'; });
      inerted.forEach(function (e) { e.setAttribute('inert', ''); });
      html.classList.add('jr-sm-lock');
      void root.offsetWidth;   // start the fade from the closed state
      root.classList.add('is-open');
      // mouse and keyboard: straight to the field; touch: the dialog itself, so the keyboard does not cover it at once
      var fine = window.matchMedia && matchMedia('(pointer:fine)').matches;
      setTimeout(function () { (fine ? input : dlg).focus({ preventScroll: true }); }, reduce ? 0 : 60);
    }
    function close() {
      if (!isOpen()) return;
      root.classList.remove('is-open');
      inerted.forEach(function (e) { e.removeAttribute('inert'); }); inerted = [];
      html.classList.remove('jr-sm-lock');
      timer = setTimeout(function () { root.hidden = true; reset(); }, reduce ? 0 : 380);
      if (last && last.focus) last.focus({ preventScroll: true });
    }
    function check() {
      var v = input.value.trim();
      var msg = !v ? msgEmpty : RE.test(v) ? '' : msgInvalid;
      err.textContent = msg;
      if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
      return !msg;
    }

    trigger.addEventListener('click', open);
    q('.jr-sm-x').addEventListener('click', close);
    q('.jr-sm-back').addEventListener('click', close);
    // a click outside closes it - only when the press also started outside, so a text selection dragged out of the
    // field does not
    root.addEventListener('pointerdown', function (e) { downOut = !dlg.contains(e.target); });
    root.addEventListener('click', function (e) { if (downOut && !dlg.contains(e.target)) close(); downOut = false; });
    d.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        var f = focusables(); if (!f.length) return;
        var first = f[0], end = f[f.length - 1];
        if (e.shiftKey && (d.activeElement === first || d.activeElement === dlg || !dlg.contains(d.activeElement))) { e.preventDefault(); end.focus(); }
        else if (!e.shiftKey && (d.activeElement === end || !dlg.contains(d.activeElement))) { e.preventDefault(); first.focus(); }
      }
    });
    input.addEventListener('input', function () {
      if (input.hasAttribute('aria-invalid')) check();
      else if (err.textContent) err.textContent = '';   // a sending error clears once the visitor edits the address
    });
    function busy(on) {
      go.disabled = on;
      if (on) go.setAttribute('aria-busy', 'true'); else go.removeAttribute('aria-busy');
    }
    function thanks() {
      ask.hidden = true; done.hidden = false;
      dlg.setAttribute('aria-labelledby', 'jr-sm-oh'); dlg.setAttribute('aria-describedby', 'jr-sm-od');
      doneH.focus({ preventScroll: true });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (go.disabled) return;
      if (!check()) { input.focus(); return; }
      var mine = ++req;
      busy(true);
      var email = input.value.trim();
      var data = {
        email: email,
        message: email + MESSAGE,
        _subject: SUBJECT,
        _template: 'table',
        _honey: trap ? trap.value : ''
      };
      var ctl = window.AbortController ? new AbortController() : null;
      var limit = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : 0;
      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
        cache: 'no-store',
        signal: ctl ? ctl.signal : undefined
      }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          return { ok: r.ok && !!j && String(j.success) === 'true', status: r.status };
        });
      }).then(function (res) {
        if (mine !== req) return;
        if (res.ok) { thanks(); return; }
        err.textContent = res.status === 429 ? msgRate : msgFail;
        busy(false); input.focus();
      }).catch(function () {
        if (mine !== req) return;
        err.textContent = msgFail;
        busy(false); input.focus();
      }).then(function () { clearTimeout(limit); });
    });
  }

  function start() { init(); initSubscribe(); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();
})();
