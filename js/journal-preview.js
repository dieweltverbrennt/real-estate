/* Journal index redesign previews - ?journal=a | ?journal=b | ?journal=c on the English Journal index (blog/). TEMPORARY.
   Loaded only when the parameter is present (by the loader before </head> of blog/index.html, which also sets
   html[data-journal], hides the current listing and requests css/journal-preview.css). Builds the chosen layout from
   the page's own article cards - link, photograph (same files and srcset), date, short title, excerpt and the full
   headline from each card's aria-label - so no content is invented. Once a direction is chosen: build it as static
   markup, then delete this file,
   css/journal-preview.css and the loader line. */
(function () {
  'use strict';
  var v = document.documentElement.getAttribute('data-journal');
  if (!/^[abc]$/.test(v || '')) return;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function add(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
  function txt(root, sel) { var e = root.querySelector(sel); return e ? e.textContent.trim() : ''; }

  function build() {
    var main = document.querySelector('main');
    var cardsEl = [].slice.call(document.querySelectorAll('.bl-card'));
    if (!main || !cardsEl.length || main.querySelector('.jv')) return;
    var intro = document.querySelector('.bl-in');
    var head = {
      eyebrow: intro ? txt(intro, '.bl-eyebrow') : '', title: intro ? txt(intro, '.bl-h1') : '', lede: intro ? txt(intro, '.bl-lede') : ''
    };
    var A = cardsEl.map(function (a, i) {
      var label = a.getAttribute('aria-label') || '';
      var colon = label.indexOf(':');
      return {
        n: i + 1, href: a.getAttribute('href'), label: label, title: txt(a, '.bl-c-title'), ex: txt(a, '.bl-c-ex'),
        date: txt(a, '.bl-c-date'), deck: colon > 0 ? label.slice(colon + 1).trim() : '',
        pic: a.querySelector('picture')
      };
    });
    var month = (A[0].date.match(/^([A-Za-z]+)\s.*?(\d{4})$/) || []).slice(1).join(' ');

    // a fresh copy of an article's picture, with the layout's own sizes
    function pic(a, sizes, eager) {
      var p = a.pic.cloneNode(true);
      [].forEach.call(p.querySelectorAll('source, img'), function (s) { if (s.getAttribute('sizes')) s.setAttribute('sizes', sizes); });
      var img = p.querySelector('img');
      if (eager) { img.loading = 'eager'; img.setAttribute('fetchpriority', 'high'); }
      return p;
    }
    function link(a, cls) {
      var l = el('a', cls);
      l.href = a.href;
      l.setAttribute('aria-label', a.label);
      return l;
    }
    function fig(a, cls, sizes, eager) { return add(el('div', 'jv-fig ' + (cls || '')), pic(a, sizes, eager)); }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    // preview only (B and C): &demo=N repeats the current articles, to check the layout with N articles
    function withDemo(list) {
      var n = +((location.search.match(/[?&]demo=(\d+)/) || [])[1] || 0), out = [];
      if (n <= list.length) return list;
      for (var d = 0; d < Math.min(n, 120); d++) out.push(list[d % list.length]);
      return out;
    }

    var sec = el('section', 'jv jv-' + v), g = el('div', 'grid');
    sec.appendChild(g);

    if (v === 'a') {   // ---- A. Featured stories + Latest stories -------------------------------------------------------
      // every article shows exactly: publication date, title, short description, image. All images are 3:2 frames
      // filled by the photograph; the few photographs of another format are framed on a chosen focal point.
      // preview only: &demo=N repeats the current articles to show the page with N articles (e.g. 20 or 50)
      var demo = +((location.search.match(/[?&]demo=(\d+)/) || [])[1] || 0);
      var L = A;
      if (demo > A.length) { L = []; for (var d = 0; d < Math.min(demo, 120); d++) L.push(A[d % A.length]); }
      // focal points for photographs that are not 3:2 (keep the tower top, the skyline and the marina in frame)
      var FOCUS = { 'blog-marina-tower': '50% 35%', 'blog-marina-view': '50% 40%' };
      var frame = function (a, cls, sizes, eager) {
        var f = fig(a, 'ja-win ' + cls, sizes, eager);
        var src = (f.querySelector('img').getAttribute('src') || '').split('/').pop();
        Object.keys(FOCUS).forEach(function (k) { if (src.indexOf(k) === 0) f.style.setProperty('--fp', FOCUS[k]); });
        return f;
      };

      // first screen: the Journal's introduction beside the two featured stories, so the heading, both titles and
      // their descriptions are visible on arrival
      var opening = el('div', 'ja-top');
      add(opening, add(el('header', 'ja-mast'),
        el('p', 'ja-eyebrow', head.eyebrow),
        el('h1', 'ja-title', head.title),
        el('p', 'ja-lede', head.lede)));
      var feature = function (a, cls, sizes) {
        return add(link(a, 'ja-feat-card ' + cls), frame(a, 'ja-feat-fig', sizes, true),
          el('p', 'jv-date', a.date), el('h2', 'ja-feat-h', a.title), el('p', 'jv-sf', a.ex));
      };
      add(opening, add(el('div', 'ja-feat'),
        feature(L[0], 'is-lead', '(max-width:700px) calc(100vw - 32px), (max-width:1199px) 56vw, 42vw'),
        L[1] ? feature(L[1], 'is-second', '(max-width:700px) calc(100vw - 32px), (max-width:1199px) 38vw, 28vw') : null));
      add(g, opening);

      // latest stories: every other article, newest first, in a regular grid that simply grows
      var rest = L.slice(2);
      if (rest.length) {
        add(g, add(el('div', 'ja-latest-head'), el('h2', 'ja-latest-h', 'Latest stories')));
        var grid = el('div', 'ja-grid');
        rest.forEach(function (a) {
          add(grid, add(link(a, 'ja-card'),
            frame(a, 'ja-card-fig', '(max-width:700px) 40vw, (max-width:1023px) 46vw, 30vw'),
            el('p', 'jv-date', a.date),
            el('h3', 'ja-card-h', a.title),
            el('p', 'jv-sf', a.ex)));
        });
        add(g, grid);
      }

    } else if (v === 'b') {   // ---- B. The Issue -----------------------------------------------------------------------
      // a magazine issue: a masthead with a folio line, the newest guide as the cover story (picture and text side by
      // side, sized so the whole picture and the headline are on the first screen), then every other guide as a numbered
      // contents entry - text beside an identical 3:2 picture plate - in two columns that simply grow.
      // Plates are all 3:2; a photograph of another shape is shown whole, the rest of the plate filled by a soft,
      // blurred enlargement of the same photograph, so nothing is cut off.
      // preview only: &demo=N repeats the current articles to show the page with N articles
      var L = withDemo(A);
      var plate = function (a, cls, sizes, eager) {
        var amb = add(el('span', 'jb-amb'), pic(a, sizes, false));
        amb.setAttribute('aria-hidden', 'true');
        amb.querySelector('img').alt = '';
        return add(el('span', 'jb-plate ' + cls), amb, add(el('span', 'jb-photo'), pic(a, sizes, eager)));
      };
      var c = L[0];
      add(g, add(el('header', 'jb-mast'),
        add(el('p', 'jb-folio'), el('span', null, head.eyebrow), el('span', null, month + ' · ' + L.length + ' guides')),
        el('h1', 'jb-title', head.title),
        el('p', 'jb-lede', head.lede)));
      add(g, add(link(c, 'jb-cover'),
        plate(c, 'jb-cover-fig', '(max-width:860px) calc(100vw - 32px), 58vw', true),
        add(el('span', 'jb-cover-txt'),
          add(el('span', 'jb-kick'), el('span', 'jb-kick-l', 'Cover story'), el('span', null, c.date)),
          el('h2', 'jb-cover-h', c.title),
          c.deck ? el('span', 'jb-cover-deck', c.deck) : null,
          el('span', 'jb-cover-ex', c.ex),
          add(el('span', 'jb-more'), el('span', null, 'Read the guide'), el('span', 'jb-arr', '→')))));
      if (L.length > 1) {
        add(g, add(el('div', 'jb-sec'), el('h2', 'jb-sec-h', 'More from the Journal'), el('span', 'jb-sec-n', (L.length - 1) + ' guides')));
        var toc = el('ol', 'jb-toc');
        L.slice(1).forEach(function (a, i) {
          add(toc, add(el('li'), add(link(a, 'jb-item'),
            add(el('span', 'jb-meta'), el('span', 'jb-no', pad(i + 2)), el('span', 'jv-date', a.date)),
            el('h3', 'jb-item-h', a.title),
            el('span', 'jb-item-ex', a.ex),
            plate(a, 'jb-thumb', '(max-width:700px) 40vw, (max-width:1099px) 40vw, 18vw'))));
        });
        add(g, toc);
      }

    } else {   // ---- C. The Gallery ---------------------------------------------------------------------------------------
      // an asymmetrical editorial grid: a centred introduction, then the guides in rows built from a fixed cycle of
      // four templates on a 12-column grid, alternating where the weight sits -
      //   6|3|3 (heavy left) · 5|7 (heavy right) · 7|5 (heavy left) · 3|3|6 (heavy right)
      // Every photograph is shown whole, at its own proportions (no frame, no cropping). Any articles left over at the
      // end take a two-card row on the matching side, or - a single one - a horizontal closing feature, so new
      // articles never break the composition. Phones: the large cards at full width, the small ones as compact rows
      // with the picture alternating sides.
      var W = withDemo(A);
      add(g, add(el('header', 'jc-head'),
        el('p', 'jc-eyebrow', head.eyebrow),
        el('h1', 'jc-title', head.title),
        el('p', 'jc-lede', head.lede)));
      add(g, add(el('p', 'jc-folio'), el('span', null, 'Catalogue'), el('span', null, month + ' · ' + W.length + ' guides')));
      var CYCLE = ['t1', 't2', 't3', 't4'];
      var ROLES = { t1: ['major', 'minor', 'minor'], t2: ['minor', 'major'], t3: ['major', 'minor'], t4: ['minor', 'minor', 'major'], solo: ['major'] };
      var SIZES = {
        major: '(max-width:700px) calc(100vw - 32px), (max-width:1023px) 92vw, 54vw',
        minor: '(max-width:700px) 44vw, (max-width:1023px) 46vw, 40vw'
      };
      var rows = el('div', 'jc-rows'), at = 0, k = 0, nMinor = 0;
      while (at < W.length) {
        var t = CYCLE[k % CYCLE.length], left = W.length - at, n = ROLES[t].length;
        if (left < n) { t = left === 1 ? 'solo' : (t === 't1' || t === 't3' ? 't3' : 't2'); n = left; }
        var row = el('div', 'jc-row jc-' + t);
        W.slice(at, at + n).forEach(function (a, j) {
          var idx = at + j, role = ROLES[t][j];
          var card = add(link(a, 'jc-card is-' + role + (idx === 0 ? ' is-lead' : '') + (role === 'minor' && nMinor++ % 2 ? ' is-flip' : '')),
            add(el('span', 'jc-pic'), pic(a, SIZES[role], k === 0)),
            add(el('span', 'jc-cap'),
              el('span', 'jc-no', 'No. ' + pad(idx + 1) + ' — ' + a.date),
              el('h2', 'jc-h', a.title),
              el('span', 'jc-sf', a.ex)));
          // the photograph's own proportions (from the img's width and height), for the 3:2 envelope in the CSS
          var im = card.querySelector('img'), w = +im.getAttribute('width'), h = +im.getAttribute('height');
          if (w && h) card.querySelector('.jc-pic').style.setProperty('--ar', (w / h).toFixed(4));
          add(row, card);
        });
        add(rows, row);
        at += n; k++;
      }
      add(g, rows);
    }
    main.insertBefore(sec, main.firstChild);
    document.documentElement.classList.add('jv-ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
