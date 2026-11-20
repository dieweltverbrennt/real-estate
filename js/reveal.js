/* Scroll reveal - every page. The standard effect is variant A (css/reveal.css): content emerges almost imperceptibly
   as it reaches the viewport - a soft fade with a few pixels of rise, quick and smooth. No library.

   - Content that is already on screen (or above it) when the page loads is shown as it is, without animating, so
     nothing is painted, hidden and faded in again; everything further down reveals as it reaches the viewport.
   - One IntersectionObserver reveals elements as they come ~3% into the viewport; things that enter together follow
     in reading order at short, shrinking intervals (0, 30, 53, 69 ... ms, ~0.1s at most). A second one resets an
     element once it has left through the bottom edge, so scrolling back down plays it again, while scrolling up never
     animates anything in from the top. The contact form is revealed as one unit by a third observer, while it is still
     ~20% of a screen below the viewport, with a very short fade.
   - Never touched: the header, navigation, footer, the homepage hero (scroll-controlled video) and the Method section.
   - Without JavaScript, IntersectionObserver or with reduced motion nothing is hidden or moved (see css/reveal.css).

   PREVIEW (homepages only, temporary): ?anim=b and ?anim=c show variants B and C of the homepage sections 3-7 for
   comparison - the loader before </head> of each homepage sets html[data-anim] and requests css/anim-preview.css.
   ?anim=a or no parameter is the standard A. To retire the previews: delete css/anim-preview.css, the loader line and
   the parts marked "B/C preview" below. */
(function () {
  'use strict';
  var html = document.documentElement;
  if (!('IntersectionObserver' in window)) return;
  var v = /^[bc]$/.test(html.getAttribute('data-anim') || '') ? html.getAttribute('data-anim') : 'a';
  if (v === 'a') html.classList.add('rv-a');

  // [selector, kind, trigger]: kind picks the treatment in the CSS (h = heading, img = picture frame, form = the contact
  // form, rule = hairline, anything else = a block of content); trigger (optional) is the ancestor whose position
  // decides instead of the element's own.
  var HOME = [   // homepage sections 3-7 (#founder, #build, .perspectives, #case-studies, #contact)
    ['#founder .fd-frame', 'img'], ['#founder .fd-text > .label', 't'], ['#fd-title', 'h'], ['#founder .fd-role', 't'],
    ['#founder .fd-text > .body', 't'], ['#founder .fd-data > dt, #founder .fd-data > dd', 'item'],
    ['#build .bd-frame', 'img'], ['#bd-title', 'h'], ['#build .bd-item', 'item'],
    // a hairline follows its row (at zero width it can sit just outside a phone screen and never count as visible)
    ['#build .bd-item > .rule', 'rule', '.bd-item'],
    // the perspective cards become a horizontal swipe row below 1024px: they follow the row, not their own position
    ['.perspectives .pv-head > .label', 't'], ['#pv-title', 'h'], ['.perspectives .pv-card', 'card', '.perspectives .pv-row'],
    ['#case-studies .cs-sec-title', 'h'], ['#case-studies .cs-hp-sub', 't'], ['#case-studies .cs-card', 'card'],
    ['#case-studies .cs-hp-below', 't']
  ];
  var CONTACT = [['#ct-title', 'h'], ['#contact .ct-head > p', 't'], ['#contact .ct-routes > a', 'item']];
  var PAGES = [
    // service pages (luxury villas, joint venture, bulk, off-market, villa development)
    ['.pg-head > *', 't'], ['.pg-sec-head', 't'], ['.pg-list > li', 'item'], ['.pg-prose > *', 't'],
    ['.jv-close-body > *', 't'], ['.vl-cmp-card', 'card'], ['.vl-ul > li', 'item'], ['.vl-note', 't'],
    ['.vl-faq > *', 'item'], ['.vl-related', 't'], ['.pg-slots > li', 'card'],
    // journal: index and articles
    ['.bl-in > *', 't'], ['.bl-cards > *', 'card'], ['.bl-bread', 't'], ['.bl-art-head > *', 't'], ['.bl-d-fig', 'img'],
    ['.bl-body > *', 't'], ['.bl-rel', 't'], ['.bl-author', 't'], ['.bl-cta-in', 't'],
    // journal index, editorial layout (css/journal.css): the rail moves as one row, the rest block by block
    ['.jr-feat', 't'], ['.jr-head', 't'], ['.jr-latest .jr-rail', 't'], ['.jr-mh', 't'], ['.jr-mlist > li', 'item'],
    ['.jr-ex-grid > *', 'card'],
    // investment case studies: index and case pages
    ['.cs-in > *', 't'], ['.cs-grid-sec .cs-card', 'card'], ['.cs-bread', 't'], ['.cs-d-fig', 'img'], ['.cs-d-head', 't'],
    ['.cs-stats > *', 'item'], ['.cs-sec > *', 't'], ['.cs-exp', 't'], ['.cs-rel-h', 'h'], ['.cs-rel .cs-card', 'card'],
    ['.cs-cta-in', 't'],
    // privacy and cookie policies (the only pages whose <main> has no id - the others are main#top, whose sections
    // include the homepage hero and Method, which must never be touched)
    ['main:not([id]) > .pv-short', 't'], ['main:not([id]) > section[id] > *', 't']
  ];
  var TARGETS = v === 'a'
    ? HOME.concat(CONTACT, [['#contact .ct-form', 'form']], PAGES)
    // B/C preview: the homepage sections only; they animate the form row by row
    : HOME.concat(CONTACT, [['#contact .ct-form > :not(.hp):not(#f-status):not(#f-wa)', 'item']]);

  var STEP = { b: 120, c: 110 }[v];            // B/C preview: ms between elements that enter together
  var MAX_STAGGER = v === 'b' ? 8 : 6;

  // B/C preview - C sets headings line by line: words are wrapped (inline-block, clipped) and each learns its line
  // number. Right-to-left scripts and Japanese/Chinese rise as one block instead (an inline-block per word would
  // reorder embedded Latin words in RTL text, and CJK has no spaces to split on).
  var blockMode = html.dir === 'rtl' || /^(ja|zh)/i.test(html.lang || '');
  var splitHeads = [];
  function splitWords(h) {
    var walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT), nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var frag = document.createDocumentFragment();
      // ASCII whitespace only, so no-break spaces stay unbreakable
      node.nodeValue.split(/([ \t\n\r\f]+)/).forEach(function (part) {
        if (!part) return;
        if (/^[ \t\n\r\f]+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        var w = document.createElement('span'), i = document.createElement('span');
        w.className = 'rv-w'; i.className = 'rv-wi'; i.textContent = part;
        w.appendChild(i); frag.appendChild(w);
      });
      node.parentNode.replaceChild(frag, node);
    });
    splitHeads.push(h);
  }
  function wrapBlock(h) {
    var b = document.createElement('span');
    b.className = 'rv-b';
    while (h.firstChild) b.appendChild(h.firstChild);
    h.appendChild(b);
    h.classList.add('rv-hb');
  }
  function measureLines() {
    splitHeads.forEach(function (h) {
      var top = null, line = -1;
      [].forEach.call(h.querySelectorAll('.rv-w'), function (w) {
        var t = w.offsetTop;
        if (top === null || t > top + 4) { line++; top = t; }
        w.style.setProperty('--rv-l', line);
      });
    });
  }

  function settle(el) {        // apply a state without its transition (off-screen resets, content already in view)
    el.classList.add('rv-now');
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.remove('rv-now'); }); });
  }

  function init() {
    var triggers = [], groups = new Map();   // trigger element -> the elements it reveals
    TARGETS.forEach(function (t) {
      [].forEach.call(document.querySelectorAll(t[0]), function (el) {
        if (el.hasAttribute('data-rv')) return;
        // never inside another revealed block (it would move twice) - except a hairline, which follows its row
        if (t[1] !== 'rule' && el.parentElement.closest('[data-rv]')) return;
        var trig = (t[2] && el.parentElement.closest(t[2])) || el;
        // A: what is already on screen or above it when the page loads stays exactly as it is (no animation, no flash)
        if (v === 'a' && trig.getBoundingClientRect().top < window.innerHeight * 0.97) {
          el.setAttribute('data-rv', t[1]);
          el.classList.add('rv-now', 'rv-in');
          requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.remove('rv-now'); }); });
        } else {
          el.setAttribute('data-rv', t[1]);
          if (t[1] === 'h' && v === 'c') (blockMode ? wrapBlock : splitWords)(el);   // B/C preview
        }
        if (!groups.has(trig)) { groups.set(trig, []); triggers.push(trig); }
        groups.get(trig).push(el);
      });
    });
    if (splitHeads.length) {   // B/C preview
      measureLines();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureLines);
      var rt;
      window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(measureLines, 150); }, { passive: true });
    }

    // content the visitor has already scrolled past (a reload further down, a #contact link) is simply there
    triggers.forEach(function (trig) {
      if (trig.getBoundingClientRect().bottom <= 0) groups.get(trig).forEach(function (el) { settle(el); el.classList.add('rv-in'); });
    });

    var reveal = new IntersectionObserver(function (entries) {
      var batch = [];
      entries.forEach(function (e) {
        if (e.isIntersecting) groups.get(e.target).forEach(function (el) { if (!el.classList.contains('rv-in')) batch.push(el); });
      });
      batch.sort(function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
      batch.forEach(function (el, i) {
        // A: short, shrinking intervals (0, 30, 53, 69 ... ms, ~0.1s at most) so a group appears almost at once;
        // B/C preview: even steps
        var d = v === 'a' ? Math.round(120 * (1 - Math.pow(0.75, Math.min(i, MAX_STAGGER)))) : Math.min(i, MAX_STAGGER) * STEP;
        el.style.setProperty('--rv-d', d + 'ms');
        el.classList.add('rv-in');
      });
    }, { rootMargin: v === 'a' ? '0px 0px -3% 0px' : '0px 0px -10% 0px', threshold: 0 });

    var reset = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var bottom = e.rootBounds ? e.rootBounds.bottom : window.innerHeight;
        if (!e.isIntersecting && e.boundingClientRect.top >= bottom) {
          groups.get(e.target).forEach(function (el) {
            if (!el.classList.contains('rv-in')) return;
            settle(el);
            el.classList.remove('rv-in');
            el.style.setProperty('--rv-d', '0ms');
          });
        }
      });
    }, { threshold: 0 });

    // the contact form (A) starts while it is still ~20% of a screen below the viewport, without a stagger delay
    var early = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && !e.target.classList.contains('rv-in')) {
          e.target.style.setProperty('--rv-d', '0ms');
          e.target.classList.add('rv-in');
        }
      });
    }, { rootMargin: '0px 0px 20% 0px', threshold: 0 });

    triggers.forEach(function (trig) {
      (trig.getAttribute('data-rv') === 'form' ? early : reveal).observe(trig);
      if (v !== 'b') reset.observe(trig);       // B/C preview: B plays once per visit
    });
    html.classList.add('rv-ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
