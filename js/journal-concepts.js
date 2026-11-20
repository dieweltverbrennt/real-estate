/* Journal design concepts - ?journal=editorial | ?journal=minimal | ?journal=architecture on the English Journal index
   (blog/). PREVIEW ONLY. Loaded only with the parameter, by the loader before </head> of blog/index.html (which also sets
   html[data-journal], hides the current listing and requests css/journal-concepts.css). Builds the chosen concept from
   the page's own article cards - link, photograph (same files and srcset), date, short title, description and the full
   headline from each card's aria-label - so no content is invented. Separate from the earlier A/B/C previews
   (js/journal-preview.js). Once a direction is chosen: build it as static markup and delete the preview files.
   Shared rule for all three: every photograph is shown whole, at its own proportions (width/height from the img);
   nothing is cropped, stretched or clipped. Preview only: &demo=N repeats the articles to show the page with N. */
(function () {
  'use strict';
  var html = document.documentElement, v = html.getAttribute('data-journal');
  if (!/^(editorial|minimal|architecture)$/.test(v || '')) return;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function add(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
  function txt(root, sel) { var e = root.querySelector(sel); return e ? e.textContent.trim() : ''; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function build() {
    var main = document.querySelector('main');
    var cards = [].slice.call(document.querySelectorAll('.bl-card'));
    if (!main || !cards.length || main.querySelector('.jx')) return;
    var intro = document.querySelector('.bl-in');
    var head = {
      eyebrow: intro ? txt(intro, '.bl-eyebrow') : '', title: intro ? txt(intro, '.bl-h1') : '', lede: intro ? txt(intro, '.bl-lede') : ''
    };
    var A = cards.map(function (a) {
      var label = a.getAttribute('aria-label') || '', colon = label.indexOf(':'), im = a.querySelector('img');
      var w = +im.getAttribute('width'), h = +im.getAttribute('height');
      return {
        href: a.getAttribute('href'), label: label, title: txt(a, '.bl-c-title'), ex: txt(a, '.bl-c-ex'), date: txt(a, '.bl-c-date'),
        deck: colon > 0 ? label.slice(colon + 1).trim() : '', pic: a.querySelector('picture'), ar: w && h ? w / h : 1.5
      };
    });
    var demo = +((location.search.match(/[?&]demo=(\d+)/) || [])[1] || 0), src = A;
    if (demo > A.length) { src = []; for (var d = 0; d < Math.min(demo, 120); d++) src.push(A[d % A.length]); }
    var L = src.map(function (a, i) { var o = {}; for (var k in a) o[k] = a[k]; o.no = pad(i + 1); return o; });
    var month = (L[0].date.match(/^([A-Za-z]+)\s.*?(\d{4})$/) || []).slice(1).join(' ');
    var count = L.length + (L.length === 1 ? ' guide' : ' guides');

    // a fresh copy of an article's picture, with the layout's own sizes
    function pic(a, sizes, eager) {
      var p = a.pic.cloneNode(true);
      [].forEach.call(p.querySelectorAll('source, img'), function (s) { if (s.getAttribute('sizes')) s.setAttribute('sizes', sizes); });
      var img = p.querySelector('img');
      if (eager) { img.loading = 'eager'; img.setAttribute('fetchpriority', 'high'); }
      return p;
    }
    function photo(a, cls, sizes, eager) { return add(el('span', 'jx-pic' + (cls ? ' ' + cls : '')), pic(a, sizes, eager)); }
    function link(a, cls) {
      var l = el('a', cls);
      l.href = a.href;
      l.setAttribute('aria-label', a.label);
      l.style.setProperty('--ar', a.ar.toFixed(4));
      return l;
    }
    // a row in which every photograph has the same height: each card's width is in proportion to its photograph.
    // 'slots' keeps a short row at the height of a full one (the space it leaves stays at the end of the row).
    function jrow(cls, items, slots, make) {
      var row = el('div', 'jx-row ' + cls), sum = 0;
      items.forEach(function (a) { var c = make(a); c.style.flexGrow = a.ar.toFixed(4); sum += a.ar; add(row, c); });
      if (slots > items.length) {
        var sp = el('span', 'jx-spacer'), f = (slots - items.length) * 1.5;
        sp.setAttribute('aria-hidden', 'true'); sp.style.flexGrow = f.toFixed(4); sum += f; add(row, sp);
      }
      row.style.setProperty('--sum', sum.toFixed(4));
      return row;
    }
    // split m cards into rows of at most 'max', as evenly as possible (9 -> 3,3,3; 5 -> 3,2; 7 -> 4,3)
    function plan(m, max) {
      var r = Math.ceil(m / max), base = Math.floor(m / r), extra = m % r, out = [];
      for (var i = 0; i < r; i++) out.push(base + (i < extra ? 1 : 0));
      return out;
    }

    var sec = el('section', 'jv jx jx-' + v), g = el('div', 'grid');
    sec.appendChild(g);

    if (v === 'editorial') {   // ---- 1. Editorial magazine: The Front Page -------------------------------------------
      add(g, add(el('header', 'je-plate'),
        el('h1', 'je-title', head.title),
        el('p', 'je-lede', head.lede)));

      var front = el('div', 'je-front'), lead = L[0];
      add(front, add(link(lead, 'je-lead'),
        photo(lead, 'je-lead-pic', '(max-width:700px) calc(100vw - 32px), (max-width:1023px) 92vw, 44vw', true),
        add(el('span', 'je-lead-txt'),
          add(el('span', 'je-kick'), el('span', null, lead.date)),
          el('h2', 'je-lead-h', lead.title),
          lead.deck ? el('span', 'je-deck', lead.deck) : null,
          el('span', 'je-ex', lead.ex))));
      var also = L.slice(1, 3);
      if (also.length) {
        var col = el('div', 'je-also');
        also.forEach(function (a) {
          add(col, add(link(a, 'je-sc'),
            photo(a, '', '(max-width:700px) 40vw, (max-width:1023px) 46vw, 22vw', true),
            add(el('span', 'je-sc-txt'), el('span', 'je-date', a.date), el('h3', 'je-sc-h', a.title), el('span', 'je-ex', a.ex))));
        });
        add(front, col);
      }
      var briefs = L.slice(3, 6);
      if (briefs.length) {
        var ol = el('ol', 'je-brief-list');
        briefs.forEach(function (a) {
          add(ol, add(el('li'), add(link(a, 'je-bi'),
            photo(a, 'je-bi-pic', '(max-width:700px) 40vw, (max-width:1023px) 20vw, 10vw', true),
            el('h3', 'je-bi-h', a.title), el('span', 'je-ex', a.ex), el('span', 'je-date', a.date))));
        });
        add(front, add(el('div', 'je-brief'), ol));
      }
      add(g, front);

      var more = L.slice(6);
      if (more.length) {
        add(g, el('div', 'je-sec'));   // the double rule that opens the further guides
        var rows = el('div', 'je-rows'), at = 0;
        // where each photograph is framed in its 16:10 frame (object-position): the subject and the architecture kept in view
        var FOCUS = {
          'blog-creek-harbour': '42% 50%',                                // skyline with the Burj and the creek towers
          'case02-jumeirah-islands-villa-redevelopment': '50% 62%',       // the villa facade, pool and loungers
          'blog-bay-sunset': '50% 45%',                                   // the tower cluster
          'blog-marina-render': '50% 50%',                                // already 16:10
          'blog-marina-tower': '50% 35%', 'blog-marina-view': '50% 55%'   // if they ever appear here
        };
        // rows of four cards of exactly equal width (four equal columns); a shorter last row keeps the same column width
        for (; at < more.length; at += 4) {
          var row4 = el('div', 'je-row');
          more.slice(at, at + 4).forEach(function (a) {
            var ph = photo(a, '', '(max-width:700px) 40vw, (max-width:1023px) 46vw, 24vw');
            var file = (ph.querySelector('img').getAttribute('src') || '').split('/').pop();
            Object.keys(FOCUS).forEach(function (k) { if (file.indexOf(k) === 0) ph.style.setProperty('--fp', FOCUS[k]); });
            add(row4, add(link(a, 'je-card'),
              ph,
              add(el('span', 'je-card-txt'), el('span', 'je-date', a.date), el('h3', 'je-card-h', a.title), el('span', 'je-ex', a.ex))));
          });
          add(rows, row4);
        }
        add(g, rows);
      }

    } else if (v === 'minimal') {   // ---- 2. Minimal luxury: Quiet - a three-column grid with variable spans ---------
      add(g, add(el('header', 'jm-head'),
        el('h1', 'jm-title', head.title),
        el('p', 'jm-lede', head.lede)));
      var S1 = '(max-width:700px) calc(100vw - 32px), (max-width:1023px) 46vw, 30vw';
      var S2 = '(max-width:700px) calc(100vw - 32px), (max-width:1023px) 92vw, 62vw';
      var more = function () { return add(el('span', 'jm-more'), el('span', null, 'Read the guide'), el('span', 'jm-arr', '→')); };
      // a tile: photograph, caption, and "Read the guide" at the foot of the tile. A feature (2 columns) opens with its
      // headline and deck, then the photograph; a wide tile has the photograph across two columns, the caption beside it.
      var mcard = function (a, kind, eager) {
        var c = link(a, 'jm-card is-' + kind);
        var meta = el('span', 'jm-date', a.date);
        if (kind === 'feat') {
          return add(c, add(el('span', 'jm-feat-head'), meta, el('h2', 'jm-h', a.title), a.deck ? el('span', 'jm-deck', a.deck) : null),
            photo(a, '', S2, eager), add(el('span', 'jm-foot'), el('span', 'jm-ex', a.ex), more()));
        }
        if (kind === 'wide') {
          return add(c, photo(a, '', S2, eager),
            add(el('span', 'jm-cap'), meta, el('h2', 'jm-h', a.title), a.deck ? el('span', 'jm-deck', a.deck) : null, el('span', 'jm-ex', a.ex), more()));
        }
        return add(c, photo(a, '', S1, eager), add(el('span', 'jm-cap'), meta, el('h3', 'jm-h', a.title), el('span', 'jm-ex', a.ex), more()));
      };
      // rows of three guides on the three-column grid: A feature (cols 1-2) + two stacked (col 3) · B three across ·
      // C two stacked (col 1) + feature (cols 2-3) · B three across - then again. One or two left over: wide tiles.
      var flow = el('div', 'jm-grid'), at = 0, k = 0, CYC = ['a', 'b', 'c', 'b'], wide = 0;
      while (at < L.length) {
        var left = L.length - at, first = at === 0, t = CYC[k++ % CYC.length];
        if (left < 3) {
          add(flow, add(el('div', 'jm-row jm-w' + (wide++ % 2 ? ' is-flip' : '')), mcard(L[at], 'wide', first)));
          at += 1; continue;
        }
        var row = el('div', 'jm-row jm-' + t), part = L.slice(at, at + 3);
        if (t === 'b') part.forEach(function (a) { add(row, mcard(a, 'one', first)); });
        else {
          // the feature: the newest guide in the first row; further down, the guide whose photograph best balances the two
          // tiles stacked beside it (estimated from the photographs' proportions), so the tiles fill their row evenly
          var f = 0;
          if (!first) {
            var best = 1e9;
            part.forEach(function (a, i) {
              var o = part.filter(function (b, j) { return j !== i; });
              var d = Math.abs(2.18 / a.ar + 0.77 - (1 / o[0].ar + 1 / o[1].ar + 1.17));
              if (d < best - 0.01) { best = d; f = i; }
            });
          }
          var rest = part.filter(function (b, j) { return j !== f; });
          add(row, mcard(part[f], 'feat', first), mcard(rest[0], 'one', first), mcard(rest[1], 'one', first));
        }
        add(flow, row);
        at += 3;
      }
      add(g, flow);

    } else {   // ---- 3. Architecture & design publication: The Index -------------------------------------------------
      // the masthead stays in view on the left; on the right, the guides as a calm sequence of plates - the photograph
      // large and whole, the caption beneath it in two parts (date and title | deck, description, link). No numbering.
      var side = add(el('aside', 'jr-side'),
        el('p', 'jr-eyebrow', head.eyebrow),
        el('h1', 'jr-title', head.title),
        el('p', 'jr-lede', head.lede));
      var plates = el('div', 'jr-plates');
      L.forEach(function (a, i) {
        add(plates, add(link(a, 'jr-plate' + (i === 0 ? ' is-lead' : '')),
          photo(a, 'jr-pl-pic', '(max-width:1023px) calc(100vw - 32px), 58vw', i < 2),
          add(el('span', 'jr-pl-cap'),
            add(el('span', 'jr-pl-l'), el('span', 'jr-pl-date', a.date), el('h2', 'jr-pl-h', a.title)),
            add(el('span', 'jr-pl-r'),
              a.deck ? el('span', 'jr-pl-deck', a.deck) : null,
              el('span', 'jr-pl-ex', a.ex),
              add(el('span', 'jr-more'), el('span', null, 'Read the guide'), el('span', 'jr-arr', '→'))))));
      });
      add(g, side, plates);
    }

    main.insertBefore(sec, main.firstChild);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
