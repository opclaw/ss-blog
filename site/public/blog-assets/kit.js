/* Smart Solutions — библиотека интерактива блога (kit).
   Компоненты находятся по data-kit="scan|tabs|matrix|calc|prompt".
   Без JS разметка показывает статичную версию; скрипт добавляет .kit-js и поведение. */
(function () {
  'use strict';
  var d = document;
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || d).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function onView(el, fn) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { io.disconnect(); fn(); } }, { threshold: 0.3 });
    io.observe(el);
  }

  /* ---------- DocScan ---------- */
  $$('[data-kit="scan"]').forEach(function (root) {
    root.classList.add('kit-js');
    var risks = $$('.kit-risk', root), finds = $$('.kit-finds li', root);
    var btn = $('[data-scan-run]', root), human = $('[data-scan-human]', root), count = $('[data-scan-count]', root);
    var timers = [], done = false;
    function activate(n) {
      risks.forEach(function (r) { r.classList.toggle('active', r.dataset.n === n); });
      finds.forEach(function (f) { f.classList.toggle('active', f.dataset.n === n); });
    }
    function reset() {
      timers.forEach(clearTimeout); timers = [];
      root.classList.remove('scanning');
      risks.forEach(function (r) { r.classList.remove('on', 'active'); r.removeAttribute('tabindex'); });
      finds.forEach(function (f) { f.classList.remove('on', 'active'); });
      if (count) count.textContent = '0';
    }
    function run() {
      reset(); void root.offsetWidth; root.classList.add('scanning');
      var machine = finds.filter(function (f) { return !f.classList.contains('human'); });
      machine.forEach(function (f, i) {
        timers.push(setTimeout(function () {
          var r = risks.filter(function (x) { return x.dataset.n === f.dataset.n; })[0];
          if (r) { r.classList.add('on'); r.setAttribute('tabindex', '0'); }
          f.classList.add('on');
          if (count) count.textContent = String(i + 1);
        }, reduce ? 0 : 400 + i * 420));
      });
      timers.push(setTimeout(function () { done = true; if (btn) btn.textContent = 'Проверить ещё раз'; if (human) human.hidden = false; }, reduce ? 0 : 400 + machine.length * 420));
    }
    if (human) human.hidden = true;
    if (btn) btn.addEventListener('click', run);
    if (human) human.addEventListener('click', function () {
      finds.filter(function (f) { return f.classList.contains('human'); }).forEach(function (f) { f.classList.add('on'); activate(f.dataset.n); });
      human.hidden = true;
    });
    finds.forEach(function (f) { f.addEventListener('click', function () { if (f.classList.contains('on')) activate(f.dataset.n); }); });
    risks.forEach(function (r) {
      function go() { if (r.classList.contains('on')) activate(r.dataset.n); }
      r.addEventListener('click', go);
      r.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    reset();
    if (root.hasAttribute('data-autorun')) onView(root, function () { if (!done) run(); });
  });

  /* ---------- Tabs ---------- */
  $$('[data-kit="tabs"]').forEach(function (root) {
    root.classList.add('kit-js');
    var tabs = $$('.kit-tabs-bar button', root), panels = $$('.kit-panel', root);
    function sel(i, focus) {
      tabs.forEach(function (t, j) { t.setAttribute('aria-selected', j === i); t.tabIndex = j === i ? 0 : -1; });
      panels.forEach(function (p, j) { p.hidden = j !== i; });
      if (focus) tabs[i].focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { sel(i); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); sel((i + 1) % tabs.length, true); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); sel((i - 1 + tabs.length) % tabs.length, true); }
      });
    });
    sel(0);
  });

  /* ---------- Matrix ---------- */
  $$('[data-kit="matrix"]').forEach(function (root) {
    root.classList.add('kit-js');
    var chips = $$('.kit-chip', root), note = $('.kit-matrix-note', root);
    var first = note ? note.textContent : '';
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        var on = c.getAttribute('aria-pressed') !== 'true';
        chips.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        c.setAttribute('aria-pressed', String(on));
        if (note) note.textContent = on ? ($('small', c) || {}).textContent || '' : first;
      });
    });
  });

  /* ---------- Calc ---------- */
  $$('[data-kit="calc"]').forEach(function (root) {
    root.classList.add('kit-js');
    var inputs = $$('input[data-i]', root), outs = $$('[data-r]', root);
    var names = inputs.map(function (i) { return i.dataset.i; });
    var fns = outs.map(function (o) { return new Function(names.join(','), 'return (' + o.dataset.expr + ');'); });
    function fmt(n, dig) { return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: dig || 0, minimumFractionDigits: 0 }); }
    function upd() {
      var v = inputs.map(function (i) { var o = $('output[data-o="' + i.dataset.i + '"]', root); if (o) o.textContent = fmt(+i.value) + (i.dataset.unit || ''); return +i.value; });
      outs.forEach(function (o, k) { var x = Math.max(0, fns[k].apply(null, v)); o.textContent = fmt(x, +(o.dataset.dig || 0)); });
    }
    inputs.forEach(function (i) { i.addEventListener('input', upd); });
    upd();
  });

  /* ---------- Prompt ---------- */
  $$('[data-kit="prompt"]').forEach(function (root) {
    root.classList.add('kit-js');
    var b = $('button', root), pre = $('pre', root);
    if (!b || !pre) return;
    b.addEventListener('click', function () {
      var t = pre.textContent;
      var ok = function () { b.textContent = 'скопировано'; b.classList.add('done'); setTimeout(function () { b.textContent = 'копировать'; b.classList.remove('done'); }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, ok); else ok();
    });
  });
})();
