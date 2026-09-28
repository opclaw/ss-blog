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
    var btn = $('[data-scan-run]', root);
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
      /* «вспышка» прогона снимается, но карточки остаются в реестре (on) — иначе правая
         колонка выглядит пустой и незаконченной, на что и жаловался владелец */
      finds.forEach(function (f) { f.classList.remove('active'); open(f, false); });
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
        /* главную находку показываем сразу — читателю не нужно угадывать, куда нажимать */
        var first = machine.filter(function (f) { return f.classList.contains('high'); })[0] || machine[0];
        if (first) { activate(first.dataset.n); open(first, true); }
      }, reduce ? 0 : 400 + machine.length * 420));
    }
    if (btn) btn.addEventListener('click', run);
    /* Реестр полный с самого начала: читатель видит все находки, включая ту,
       которую ИИ не нашёл (её добавил человек). Кнопка лишь перезапускает подсветку. */
    finds.forEach(function (f) { f.classList.add('on'); });
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



  /* ---------- Budget: конфигуратор бюджета ---------- */
  $$('[data-kit="budget"]').forEach(function (root) {
    root.classList.add('kit-js');
    var groups = $$('[data-bg]', root), total = $('[data-btotal]', root);
    var verdict = $('[data-bverdict]', root), extra = $('[data-bextra]', root), extraRow = $('[data-bextra-row]', root);
    function money(n) { return Number(n).toLocaleString('ru-RU'); }
    function pick(gr) {
      var b = $('[data-bopt][aria-pressed="true"]', gr);
      return b ? { id: b.dataset.bopt, min: +b.dataset.min, max: +b.dataset.max } : { id: '', min: 0, max: 0 };
    }
    // порядок правил должен совпадать с серверным рендером в Budget.astro,
    // иначе цифры по умолчанию и после первого клика разойдутся
    function verdictFor(p, i) {
      if (p === 'p-hard') return 'Даже многосистемную задачу начинаем с одного участка: пилот покажет эффект до больших вложений.';
      if (i === 'i-all') return 'Масштабирование идёт этапами: каждый следующий процесс — после доказанного эффекта предыдущего.';
      if (i === 'i-multi') return 'Сначала пилот на одном процессе, потом тиражирование по отделам.';
      return 'Типовой путь: бесплатный аудит, пилот 2–4 недели, решение по цифрам замера.';
    }
    function upd() {
      var v = {};
      groups.forEach(function (gr) { v[gr.dataset.bg] = pick(gr); });
      var put = function (k, val) { var el = $('[data-brow="' + k + '"]', root); if (el) el.textContent = val; };
      put('pilot', money(v.pilot.min) + ' – ' + money(v.pilot.max) + ' ₽');
      put('impl', money(v.impl.min) + ' – ' + money(v.impl.max) + ' ₽');
      put('support', money(v.support.min) + ' – ' + money(v.support.max) + ' ₽/мес');
      if (total) total.textContent = money(v.pilot.min + v.impl.min);
      var bmax = $('[data-bmax]', root);
      if (bmax) bmax.textContent = money(v.pilot.max + v.impl.max);
      if (verdict) verdict.textContent = verdictFor(v.pilot.id, v.impl.id);
      if (extraRow) extraRow.hidden = !(extra && extra.checked);
    }
    groups.forEach(function (gr) {
      $$('[data-bopt]', gr).forEach(function (b) {
        b.addEventListener('click', function () {
          $$('[data-bopt]', gr).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          b.setAttribute('aria-pressed', 'true');
          upd();
        });
      });
    });
    if (extra) extra.addEventListener('change', upd);
    upd();
  });

  /* ---------- ROI: окупаемость, эффект за год и график по месяцам ---------- */
  $$('[data-kit="roi"]').forEach(function (root) {
    root.classList.add('kit-js');
    var inputs = $$('input[data-i]', root), bars = $$('[data-roi-bar]', root);
    var paybackEl = $('[data-roi-payback]', root), rankEl = $('[data-roi-rank]', root);
    var capEl = $('[data-roi-cap]', root), fromEl = $('[data-roi-from]', root), toEl = $('[data-roi-to]', root);
    var zeroLine = $('.kit-roi-zero', root);
    var CH = { x0: 30, x1: 308, yt: 12, yb: 108, w: 13 };
    function money(n, dig) { return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: dig || 0, minimumFractionDigits: 0 }); }
    /* порядок правил тот же, что в Roi.astro — иначе вердикт до и после первого клика разойдётся */
    function rankFor(net, payback) {
      if (net <= 0) return ['Экономия не покрывает сопровождение: при таких вводных проект не окупается.', 'is-none'];
      if (payback <= 4) return ['До 4 месяцев — делать: пилот возвращает вложения с запасом.', 'is-go'];
      if (payback <= 9) return ['4–9 месяцев — обсуждаемо: усиливаем сценарий или масштаб.', 'is-check'];
      return ['Больше 9 месяцев — не делаем: ищем другой процесс или другой масштаб.', 'is-stop'];
    }
    function upd() {
      var v = {};
      inputs.forEach(function (i) {
        v[i.dataset.i] = +i.value;
        var o = $('output[data-o="' + i.dataset.i + '"]', root);
        if (o) o.textContent = money(+i.value) + (i.dataset.unit || '');
      });
      var hours = v.tasks * v.min / 60, proc = hours * v.rate, save = proc * v.p / 100;
      var net = save - v.sup, payback = net > 0 ? v.cost / net : null;
      var year = net * 12 - v.cost, roi = (year / v.cost) * 100;
      var put = function (k, val) { var el = $('[data-roi-row="' + k + '"]', root); if (el) el.textContent = val; };
      put('hours', money(hours, 1)); put('proc', money(proc)); put('save', money(save));
      put('sup', money(v.sup)); put('year', money(year)); put('roi', money(roi, 1));
      if (paybackEl) paybackEl.textContent = payback !== null ? money(payback, 1) : '—';
      root.classList.toggle('is-none', net <= 0);
      if (rankEl) { var r = rankFor(net, payback === null ? 99 : payback); rankEl.textContent = r[0]; rankEl.className = 'kit-roi-rank ' + r[1]; }
      /* график: 13 столбиков — месяц 0 это вложения, дальше накопительный эффект */
      var vals = [], m;
      for (m = 0; m <= 12; m++) vals.push(m * net - v.cost);
      var lo = Math.min.apply(null, vals.concat([0])), hi = Math.max.apply(null, vals.concat([0]));
      var yOf = function (x) { return CH.yb - (CH.yb - CH.yt) * (x - lo) / ((hi - lo) || 1); };
      var xOf = function (i) { return CH.x0 + (CH.x1 - CH.x0) * i / 12; };
      bars.forEach(function (b) {
        var i = +b.dataset.roiBar, val = vals[i] || 0;
        b.setAttribute('x', (xOf(i) - CH.w / 2).toFixed(1));
        b.setAttribute('y', (val >= 0 ? yOf(0) : yOf(val)).toFixed(1));
        b.setAttribute('height', Math.max(1, yOf(0) - yOf(val)).toFixed(1));
        b.setAttribute('class', 'kit-roi-bar ' + (val >= 0 ? 'is-pos' : 'is-neg'));
      });
      if (zeroLine) { var zy = yOf(0).toFixed(1); zeroLine.setAttribute('y1', zy); zeroLine.setAttribute('y2', zy); }
      if (capEl) capEl.textContent = payback !== null && payback <= 12 ? 'окупаемость ≈ ' + money(payback, 1) + ' мес'
        : net > 0 ? 'за 12 месяцев пилот не окупается' : 'проект не окупается: экономия меньше сопровождения';
      if (fromEl) fromEl.textContent = 'вложения на старте: ' + money(v.cost) + ' ₽';
      if (toEl) toEl.textContent = 'через 12 месяцев: ' + (year >= 0 ? '+' : '−') + money(Math.abs(year)) + ' ₽';
    }
    inputs.forEach(function (i) { i.addEventListener('input', upd); });
    upd();
  });

  /* ---------- Замер «до и после»: полосы растут, когда блок видно ---------- */
  $$('[data-kit="aba"]').forEach(function (root) {
    root.classList.add('kit-js');
    onView(root, function () { root.classList.add('in'); });
  });

  /* ---------- Checklist: отметки → шкала и вердикт ---------- */
  $$('[data-kit="check"]').forEach(function (root) {
    root.classList.add('kit-js');
    var boxes = $$('input[data-c]', root), bar = $('[data-cbar]', root), verdict = $('[data-cverdict]', root);
    var count = $('[data-ccount]', root);
    // пороги читаем из data-атрибутов элементов легенды: раньше текст разбирался парсингом
    // textContent, и любое изменение вёрстки (например, перенос строк) ломало вердикт —
    // он залипал на первом уровне и не менялся при отметках.
    var levels = $$('[data-cl]', root).map(function (el) {
      return { from: +el.dataset.cl, text: el.dataset.verdict || ('уровень ' + el.dataset.cl), el: el };
    }).sort(function (a, b) { return a.from - b.from; });
    function upd() {
      var n = boxes.filter(function (b) { return b.checked; }).length;
      if (bar) bar.style.width = Math.round(n / boxes.length * 100) + '%';
      if (count) count.innerHTML = 'Отмечено <b>' + n + '</b> из ' + boxes.length;
      if (verdict && levels.length) {
        var cur = levels[0];
        levels.forEach(function (l) { if (n >= l.from) cur = l; });
        verdict.textContent = n === 0 ? 'Отметьте пункты — покажем вердикт' : cur.text;
        levels.forEach(function (l) { l.el.classList.toggle('on', n > 0 && l === cur); });
        root.classList.toggle('is-ready', n >= (levels[levels.length - 1] && levels[levels.length - 1].from || 99));
      }
    }
    boxes.forEach(function (b) { b.addEventListener('change', upd); });
    upd();
  });


  /* ---------- Timeline: этапы процесса ---------- */
  $$('[data-kit="timeline"]').forEach(function (root) {
    root.classList.add('kit-js');
    var items = $$('.kit-tl li', root);
    function show(i) {
      items.forEach(function (li, k) {
        var on = k === i;
        li.classList.toggle('on', on);
        var btn = $('.kit-tl-btn', li);
        if (btn) btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
    }
    items.forEach(function (li, i) {
      var btn = $('.kit-tl-btn', li);
      if (btn) btn.addEventListener('click', function () { show(i); });
    });
    show(0);
  });

  /* ---------- Sources: как собран ответ модели ---------- */
  $$('[data-kit="sources"]').forEach(function (root) {
    root.classList.add('kit-js');
    var btns = $$('.kit-src-btn', root), parts = $$('.kit-src-f', root);
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var on = !b.classList.contains('on');
        btns.forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
        parts.forEach(function (p) { p.classList.remove('hl'); });
        root.classList.toggle('hl', on);
        if (on) {
          b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
          var key = b.dataset.src;
          parts.forEach(function (p) { if (p.dataset.from === key) p.classList.add('hl'); });
        }
      });
    });
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
