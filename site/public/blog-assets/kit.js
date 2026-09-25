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

  /* ---------- DocScan: реестр находок + одно открытое объяснение ---------- */
  $$('[data-kit="scan"]').forEach(function (root) {
    root.classList.add('kit-js');
    var risks = $$('.kit-risk', root), finds = $$('.kit-finds li', root);
    var btn = $('[data-scan-run]', root), human = $('[data-scan-human]', root);
    var count = $('[data-scan-count]', root);
    var timers = [], done = false;

    function rowOf(n) { return finds.filter(function (f) { return f.dataset.n === n; })[0]; }
    function headOf(li) { return li ? $('.kit-find-head', li) : null; }

    /* одна открытая находка за раз: список остаётся реестром, а не портянкой */
    function open(li, on) {
      if (!li) return;
      var isOpen = on === undefined ? !li.classList.contains('open') : on;
      finds.forEach(function (f) {
        if (f === li) return;
        f.classList.remove('open');
        var h = headOf(f); if (h) h.setAttribute('aria-expanded', 'false');
      });
      li.classList.toggle('open', isOpen);
      var head = headOf(li); if (head) head.setAttribute('aria-expanded', String(isOpen));
    }
    function activate(n) {
      risks.forEach(function (r) { r.classList.toggle('active', r.dataset.n === n); });
      finds.forEach(function (f) { f.classList.toggle('active', f.dataset.n === n); });
    }
    function reset() {
      timers.forEach(clearTimeout); timers = [];
      /* aria-expanded появляется только со скриптом: без JS пояснения и так раскрыты */
      finds.forEach(function (f) { var h = headOf(f); if (h) h.setAttribute('aria-expanded', 'false'); });
      root.classList.remove('scanning', 'scanned');
      risks.forEach(function (r) { r.classList.remove('on', 'active'); r.removeAttribute('tabindex'); });
      finds.forEach(function (f) { f.classList.remove('on', 'active'); open(f, false); });
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
      timers.push(setTimeout(function () {
        done = true; root.classList.add('scanned');
        if (btn) btn.textContent = 'Проверить ещё раз';
        if (human) human.hidden = false;
        /* главную находку показываем сразу — читателю не нужно угадывать, куда нажимать */
        var first = machine.filter(function (f) { return f.classList.contains('high'); })[0] || machine[0];
        if (first) { activate(first.dataset.n); open(first, true); }
      }, reduce ? 0 : 400 + machine.length * 420));
    }
    if (human) human.hidden = true;
    if (btn) btn.addEventListener('click', run);
    if (human) human.addEventListener('click', function () {
      var h = finds.filter(function (f) { return f.classList.contains('human'); })[0];
      if (h) { h.classList.add('on'); activate(h.dataset.n); open(h, true); }
      human.hidden = true;
    });
    finds.forEach(function (li) {
      var head = headOf(li);
      if (head) head.addEventListener('click', function () {
        if (!li.classList.contains('on') && !li.classList.contains('human')) return;
        if (li.classList.contains('human')) li.classList.add('on');
        activate(li.dataset.n);
        open(li);
      });
    });
    risks.forEach(function (r) {
      function go() {
        if (!r.classList.contains('on')) return;
        var li = rowOf(r.dataset.n);
        activate(r.dataset.n);
        open(li, true);
        /* если реестр уехал за экран — подтягиваем строку, но без резких прыжков */
        if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
      }
      r.addEventListener('click', go);
      r.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
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


  /* ---------- Funnel: заявки → диалог → сделка ---------- */
  $$('[data-kit="funnel"]').forEach(function (root) {
    root.classList.add('kit-js');
    var inputs = $$('input[data-fn]', root);
    function alive(min, half) { return Math.pow(0.5, min / half); }
    function fmt(x, dig) { return Number(x).toLocaleString('ru-RU', { maximumFractionDigits: dig || 0, minimumFractionDigits: 0 }); }
    function upd() {
      var v = {};
      inputs.forEach(function (i) {
        v[i.dataset.fn] = +i.value;
        var o = $('output[data-fo="' + i.dataset.fn + '"]', root);
        if (o) o.textContent = fmt(+i.value);
      });
      var now = v.n * alive(v.t, v.half) * v.k / 100;
      var fast = v.n * alive(1, v.half) * v.k / 100;
      var diff = fast - now, money = diff * v.c;
      var put = function (k, val, dig) { var el = $('[data-fr="' + k + '"]', root); if (el) el.textContent = val; };
      put('now', fmt(now, 1)); put('fast', fmt(fast, 1));
      put('diff', '+' + fmt(diff, 1)); put('money', '+' + fmt(money));
      var lbl = $('[data-flbl]', root); if (lbl) lbl.textContent = fmt(v.t);
      var b1 = $('[data-fbar="now"]', root), b2 = $('[data-fbar="fast"]', root);
      if (b1) b1.style.width = Math.max(1, Math.round(alive(v.t, v.half) * 100)) + '%';
      if (b2) b2.style.width = Math.max(1, Math.round(alive(1, v.half) * 100)) + '%';
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
