/* Contact form dropdowns: each native <select> in the enquiry form gets a list styled like the phone-code dropdown
   (styles: css/form-select.css), on every device.
   The <select> stays in the form, hidden, and remains the source of truth: the form sends its value, the page's own
   script keeps reading and changing it (Bedrooms disabled for Land/Offices, form.reset() after sending, the WhatsApp
   fallback text), and every pick fires its 'input' and 'change' events. The button mirrors it: value, disabled state.
   Keyboard (WAI-ARIA select-only combobox): Enter/Space/Alt+Down/arrows open; arrows, Home/End, PageUp/PageDown move;
   typing jumps to a matching option; Enter/Space pick; Esc closes; Tab closes. A tap or click outside closes. */
(function () {
  'use strict';
  var form = document.getElementById('enquiry');
  if (!form || !document.addEventListener) return;
  var selects = form.querySelectorAll('.field select');
  if (!selects.length) return;
  var current = null;                                      // the open dropdown, if any (one at a time)

  Array.prototype.forEach.call(selects, function (sel, n) {
    var label = sel.id ? form.querySelector('label[for="' + sel.id + '"]') : null;
    var wrap = document.createElement('div'), btn = document.createElement('button');
    var pop = document.createElement('div'), list = document.createElement('ul');
    var uid = 'fs' + n, at = -1, typed = '', typedAt = 0;

    wrap.className = 'fs';
    btn.type = 'button'; btn.className = 'fs-btn'; btn.id = uid + '-btn';
    btn.setAttribute('role', 'combobox'); btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', uid + '-list');
    pop.className = 'fs-pop'; pop.hidden = true;
    list.className = 'fs-list'; list.id = uid + '-list'; list.setAttribute('role', 'listbox'); list.tabIndex = -1;
    if (label) {
      if (!label.id) label.id = uid + '-label';
      btn.setAttribute('aria-labelledby', label.id); list.setAttribute('aria-labelledby', label.id);
      // the label points at the hidden <select>: send its clicks to the button instead
      label.addEventListener('click', function (e) { e.preventDefault(); if (!btn.disabled) btn.focus(); });
    }
    Array.prototype.forEach.call(sel.options, function (o, i) {
      var li = document.createElement('li');
      li.id = uid + '-o' + i; li.setAttribute('role', 'option'); li.setAttribute('data-i', i);
      li.textContent = o.text;
      if (o.disabled) li.setAttribute('aria-disabled', 'true');
      list.appendChild(li);
    });
    sel.parentNode.insertBefore(wrap, sel);
    pop.appendChild(list);
    wrap.appendChild(sel); wrap.appendChild(btn); wrap.appendChild(pop);
    sel.classList.add('fs-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');

    function sync() {                                      // button and list follow the <select>
      var o = sel.options[sel.selectedIndex];
      btn.textContent = o ? o.text : '';
      btn.disabled = sel.disabled;
      Array.prototype.forEach.call(list.children, function (li, i) { li.setAttribute('aria-selected', i === sel.selectedIndex ? 'true' : 'false'); });
      if (sel.disabled) close(false);
    }
    function usable(i) { var o = sel.options[i]; return o && !o.disabled; }
    function activate(i) {                                 // highlight an option and keep it in view inside the list
      var items = list.children;
      if (!items.length) return;
      i = Math.max(0, Math.min(i, items.length - 1));
      if (items[at]) items[at].classList.remove('is-active');
      at = i; items[at].classList.add('is-active');
      btn.setAttribute('aria-activedescendant', items[at].id);
      var top = items[at].offsetTop, bottom = top + items[at].offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }
    function move(step) {                                  // next usable option in a direction
      for (var i = at + step; i >= 0 && i < list.children.length; i += step) if (usable(i)) return activate(i);
    }
    function open() {
      if (sel.disabled || !pop.hidden) return;
      if (current) current.close(false);
      current = api;
      pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
      activate(sel.selectedIndex < 0 ? 0 : sel.selectedIndex);
      if (pop.scrollIntoView) pop.scrollIntoView({ block: 'nearest' });   // a list opened low on the screen comes into view
    }
    function close(back) {
      if (pop.hidden) return;
      pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.removeAttribute('aria-activedescendant');
      if (list.children[at]) list.children[at].classList.remove('is-active');
      if (current === api) current = null;
      if (back) btn.focus();
    }
    function pick(i) {
      if (!usable(i)) return;
      if (i !== sel.selectedIndex) {
        sel.selectedIndex = i;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      sync(); close(true);
    }
    function typeahead(ch) {                               // jump to the next option starting with what was typed
      var now = Date.now();
      typed = now - typedAt > 600 ? ch : typed + ch; typedAt = now;
      var q = typed.toLowerCase(), n = list.children.length, from = typed.length > 1 ? at : at + 1;
      for (var k = 0; k < n; k++) {
        var i = (from + k + n) % n;
        if (usable(i) && sel.options[i].text.toLowerCase().indexOf(q) === 0) return activate(i);
      }
    }
    var api = { close: close };

    btn.addEventListener('click', function () { pop.hidden ? open() : close(true); });
    btn.addEventListener('keydown', function (e) {
      var k = e.key, closed = pop.hidden;
      if (closed) {
        if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); open(); }
        else if (k === 'Home' || k === 'End') { e.preventDefault(); open(); activate(k === 'Home' ? 0 : list.children.length - 1); }
        else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { open(); typeahead(k); }
        return;
      }
      if (k === 'ArrowDown') { e.preventDefault(); if (e.altKey) return; move(1); }
      else if (k === 'ArrowUp') { e.preventDefault(); if (e.altKey) return pick(at); move(-1); }
      else if (k === 'Home') { e.preventDefault(); activate(0); }
      else if (k === 'End') { e.preventDefault(); activate(list.children.length - 1); }
      else if (k === 'PageDown') { e.preventDefault(); activate(at + 10); }
      else if (k === 'PageUp') { e.preventDefault(); activate(at - 10); }
      else if (k === 'Enter' || (k === ' ' && Date.now() - typedAt > 600)) { e.preventDefault(); pick(at); }
      else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (k === 'Tab') close(false);
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); typeahead(k); }
    });
    // mouse: keep focus on the button while choosing; touch scrolling of the list is left alone
    pop.addEventListener('mousedown', function (e) { e.preventDefault(); });
    list.addEventListener('click', function (e) {
      var li = e.target.closest ? e.target.closest('[role="option"]') : null;
      if (li) pick(+li.getAttribute('data-i'));
    });
    document.addEventListener('pointerdown', function (e) { if (!pop.hidden && !wrap.contains(e.target)) close(false); });

    sel.addEventListener('change', sync);
    form.addEventListener('reset', function () { setTimeout(sync, 0); });
    if (window.MutationObserver) new MutationObserver(sync).observe(sel, { attributes: true, attributeFilter: ['disabled'] });
    sync();
  });
})();
