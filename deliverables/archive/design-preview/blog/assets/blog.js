// Прогресс чтения, подсветка оглавления, копирование промптов, фильтр блога
(function () {
  var bar = document.querySelector('.progress');
  var art = document.querySelector('.prose');
  var links = [].slice.call(document.querySelectorAll('.toc a[href^="#"]'));
  var heads = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });

  function onScroll() {
    if (bar && art) {
      var r = art.getBoundingClientRect();
      var p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
      bar.style.width = (p * 100) + '%';
    }
    var cur = -1;
    heads.forEach(function (h, i) { if (h && h.getBoundingClientRect().top < 140) cur = i; });
    links.forEach(function (a, i) { a.classList.toggle('on', i === cur); });
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  document.querySelectorAll('.prompt button').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.closest('.prompt').querySelector('pre').innerText;
      navigator.clipboard.writeText(t).then(function () {
        b.textContent = 'Скопировано'; setTimeout(function () { b.textContent = 'Копировать'; }, 1600);
      });
    });
  });

  // Фильтр на главной блога
  var chips = document.querySelectorAll('.chip');
  var search = document.querySelector('.search');
  var cards = document.querySelectorAll('[data-cat]');
  var cat = 'all';
  function filter() {
    var q = (search && search.value || '').toLowerCase().trim(), shown = 0;
    cards.forEach(function (c) {
      var ok = (cat === 'all' || c.dataset.cat === cat) && (!q || c.textContent.toLowerCase().indexOf(q) > -1);
      c.style.display = ok ? '' : 'none'; if (ok) shown++;
    });
    document.querySelectorAll('[data-group]').forEach(function (g) {
      g.style.display = g.querySelector('[data-cat]:not([style*="none"])') ? '' : 'none';
    });
    var e = document.querySelector('.empty'); if (e) e.style.display = shown ? 'none' : 'block';
  }
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      chips.forEach(function (x) { x.classList.remove('on'); }); c.classList.add('on');
      cat = c.dataset.f; filter();
    });
  });
  if (search) search.addEventListener('input', filter);
})();
