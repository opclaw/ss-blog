// ===== Smart Solutions — Main Script =====

(function () {
  'use strict';

  /* Определялась внутри блока курсорного свечения; когда блок убрали, ссылки на неё
     остались (наклон карточек, магнитные кнопки) и скрипт падал с ReferenceError,
     обрывая всё, что инициализируется ниже: счётчики, FAQ, раскрытие рисунков. */
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // ===== PRELOADER =====
  window.addEventListener('load', () => {
    const preloader = document.getElementById('preloader');
    if (!preloader) return;
    preloader.classList.add('hidden');
    setTimeout(() => { preloader.style.display = 'none'; }, 600);
  });

  // ===== SCROLL PROGRESS =====
  const scrollProgress = document.getElementById('scrollProgress');

  function updateScrollProgress() {
    if (!scrollProgress) return;
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    scrollProgress.style.width = `${progress}%`;
  }

  // ===== BACK TO TOP =====
  const backToTop = document.getElementById('backToTop');

  function updateBackToTop() {
    if (!backToTop) return;
    backToTop.classList.toggle('visible', window.scrollY > 500);
  }

  if (backToTop) {
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ===== NAVBAR =====
  const nav = document.getElementById('nav');
  const burger = document.getElementById('navBurger');
  const mobileMenu = document.getElementById('mobileMenu');

  function onScroll() {
    updateScrollProgress();
    updateBackToTop();
    nav.classList.toggle('scrolled', window.scrollY > 50);
    updateActiveNav();
    updateParallax();
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile menu
  burger.addEventListener('click', () => {
    const isOpen = burger.classList.contains('active');
    burger.classList.toggle('active');
    mobileMenu.classList.toggle('open');
    document.body.classList.toggle('menu-open');
    burger.setAttribute('aria-expanded', String(!isOpen));
  });

  document.querySelectorAll('.mobile-link').forEach((link) => {
    link.addEventListener('click', () => {
      burger.classList.remove('active');
      mobileMenu.classList.remove('open');
      document.body.classList.remove('menu-open');
      burger.setAttribute('aria-expanded', 'false');
    });
  });

  // ===== SCROLL SPY =====
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = [];

  navLinks.forEach((link) => {
    const id = link.getAttribute('href').replace('#', '');
    const section = document.getElementById(id);
    if (section) sections.push({ id, el: section, link });
  });

  function updateActiveNav() {
    const scrollPos = window.scrollY + 120;
    let activeId = '';
    sections.forEach((s) => {
      if (s.el.offsetTop <= scrollPos) activeId = s.id;
    });
    navLinks.forEach((link) => link.classList.remove('active'));
    if (activeId) {
      const al = document.querySelector('.nav-link[href="#' + activeId + '"]');
      if (al) al.classList.add('active');
    }
  }

  // ===== PARALLAX =====
  const heroGlow1 = document.querySelector('.hero-glow-1');
  const heroGlow2 = document.querySelector('.hero-glow-2');

  function updateParallax() {
    const scrollY = window.scrollY;
    if (heroGlow1) heroGlow1.style.transform = `translateY(${scrollY * 0.15}px)`;
    if (heroGlow2) heroGlow2.style.transform = `translateY(${scrollY * 0.1}px)`;
  }

  // ===== STAGGER REVEAL =====
  const staggerObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('[data-stagger-item]').forEach((item, i) => {
          setTimeout(() => item.classList.add('stagger-visible'), i * 100);
        });
        staggerObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-stagger]').forEach((el) => {
    staggerObserver.observe(el);
  });

  // ===== SECTION REVEAL =====
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.section:not(.section-hero)').forEach((section) => {
    section.classList.add('reveal');
    revealObserver.observe(section);
  });

  // Hero animations
  document.querySelectorAll('.fade-in').forEach((el) => {
    setTimeout(() => el.classList.add('visible'), 100);
  });

  // ===== 3D TILT =====
  if (!isTouchDevice) {
    document.querySelectorAll('.tilt').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -4;
        const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 4;
        card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(800px) rotateX(0) rotateY(0) translateY(0)';
      });
    });
  }

  // ===== MAGNETIC BUTTONS =====
  if (!isTouchDevice) {
    document.querySelectorAll('.btn-primary').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translate(0, 0)';
      });
    });
  }

  // ===== COUNTUP =====
  function formatNumber(num, separator) {
    if (!separator) return String(num);
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  }

  function animateCountup(el) {
    const target = parseInt(el.getAttribute('data-countup'));
    const prefix = el.getAttribute('data-prefix') || '';
    const suffix = el.getAttribute('data-suffix') || '';
    const separator = el.getAttribute('data-separator') || '';
    const duration = 1800;
    let startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(target * ease);
      el.textContent = prefix + formatNumber(current, separator) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const countupObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCountup(entry.target);
        countupObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-countup]').forEach((el) => {
    countupObserver.observe(el);
  });

  // ===== FAQ ACCORDION =====
  document.querySelectorAll('.faq-question').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const isOpen = item.classList.contains('open');
      const answer = item.querySelector('.faq-answer');

      // Close all
      document.querySelectorAll('.faq-item').forEach((el) => {
        el.classList.remove('open');
        el.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
        el.querySelector('.faq-answer').style.maxHeight = null;
      });

      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        answer.style.maxHeight = `${answer.scrollHeight}px`;
      }
    });
  });

  // ===== ANIMATED CHECKS =====
  const checkObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('check-visible');
        checkObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('.animated-check').forEach((el) => {
    checkObserver.observe(el);
  });

  // ===== MARQUEE PAUSE ON HOVER =====
  const marquee = document.getElementById('marquee');
  if (marquee) {
    const track = marquee.querySelector('.marquee-track');
    marquee.addEventListener('mouseenter', () => { track.style.animationPlayState = 'paused'; });
    marquee.addEventListener('mouseleave', () => { track.style.animationPlayState = 'running'; });
  }

  // ===== SMOOTH SCROLL =====
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ===== КЕЙС В ГЕРОЕ: график роста и переключатель метрик =====
  const heroCase = document.querySelector('.hero-case');
  if (heroCase) {
    var CH = { x0: 12, x1: 308, top: 14, bottom: 104 };
    var labelEl = heroCase.querySelector('.hero-case-label');
    var deltaEl = heroCase.querySelector('.hero-case-delta');
    var nowEl = heroCase.querySelector('.hero-case-now');
    var wasEl = heroCase.querySelector('.hero-case-was b');
    var causeEl = heroCase.querySelector('.hero-case-cause');
    var chartEl = heroCase.querySelector('.hero-case-chart');
    var trendEl = heroCase.querySelector('.hero-case-trend');
    var areaEl = heroCase.querySelector('.hero-case-area');
    var dotWas = heroCase.querySelector('.hero-case-dot--was');
    var dotNow = heroCase.querySelector('.hero-case-dot--now');
    var caseTabs = Array.prototype.slice.call(heroCase.querySelectorAll('.hero-case-tab'));
    var shownValue = null;

    function caseFmt(v, f) {
      if (f === 'dec1') return (Math.round(v * 10) / 10).toFixed(1);
      if (f === 'pct') return Math.round(v) + '%';
      return Math.round(v).toLocaleString('ru-RU');
    }
    function caseY(v, max) { return CH.bottom - (v / max) * (CH.bottom - CH.top); }

    function tweenNum(from, to, f, dur, finalText) {
      var t0 = null;
      function step(t) {
        if (t0 === null) t0 = t;
        var k = Math.min((t - t0) / dur, 1);
        var e = 1 - Math.pow(1 - k, 3);
        // в конце ставим точный текст из разметки: у «5 000+» плюс теряется
        // при пересчёте, а он часть числа
        nowEl.textContent = k < 1 ? caseFmt(from + (to - from) * e, f) : finalText;
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    function drawChart(was, now) {
      var max = Math.max(was, now);
      var y0 = caseY(was, max);
      var y1 = caseY(now, max);
      trendEl.setAttribute('d', 'M ' + CH.x0 + ' ' + y0 + ' L ' + CH.x1 + ' ' + y1);
      areaEl.setAttribute('d', 'M ' + CH.x0 + ' ' + y0 + ' L ' + CH.x1 + ' ' + y1 +
                               ' L ' + CH.x1 + ' ' + CH.bottom + ' L ' + CH.x0 + ' ' + CH.bottom + ' Z');
      dotWas.setAttribute('cy', y0);
      dotNow.setAttribute('cy', y1);
      chartEl.classList.remove('is-drawing');
      void chartEl.getBoundingClientRect(); // перезапуск анимации
      chartEl.classList.add('is-drawing');
    }

    function selectMetric(tab) {
      var was = parseFloat(tab.getAttribute('data-was'));
      var now = parseFloat(tab.getAttribute('data-now'));
      var f = tab.getAttribute('data-format');
      caseTabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      labelEl.textContent = tab.getAttribute('data-label');
      deltaEl.textContent = tab.getAttribute('data-delta');
      wasEl.textContent = tab.getAttribute('data-was-text');
      chartEl.setAttribute('aria-label', tab.getAttribute('data-label') + ': с ' +
        tab.getAttribute('data-was-text') + ' до ' + tab.getAttribute('data-now-text'));
      // первый раз число просто ставим, дальше — пересчитываем от текущего
      if (shownValue === null) nowEl.textContent = tab.getAttribute('data-now-text');
      else tweenNum(shownValue, now, f, 900, tab.getAttribute('data-now-text'));
      shownValue = now;
      drawChart(was, now);
      causeEl.textContent = tab.getAttribute('data-cause');
      causeEl.classList.remove('is-in');
      void causeEl.offsetWidth;
      causeEl.classList.add('is-in');
    }

    caseTabs.forEach(function (t) {
      t.addEventListener('click', function () { selectMetric(t); });
    });
    selectMetric(caseTabs[0]);
  }

  // ===== ФИГУРЫ: узкие вписываем, широкие — тап-увеличение =====
  function updateFigureFits() {
    if (!window.matchMedia('(max-width: 640px)').matches) return;
    const READABLE_SCALE = 0.73; // 11px → ~8px
    document.querySelectorAll('.fig').forEach((fig) => {
      const svg = fig.querySelector('.fig-svg');
      if (!svg || !svg.viewBox || !svg.viewBox.baseVal) return;
      if (!svg.dataset.origW) svg.dataset.origW = svg.viewBox.baseVal.width;
      const origW = parseFloat(svg.dataset.origW);
      const viewH = svg.viewBox.baseVal.height;
      let maxRight = 0;
      svg.querySelectorAll('rect,text,polygon,line,circle').forEach((el) => {
        try { const bb = el.getBBox(); maxRight = Math.max(maxRight, bb.x + bb.width); } catch (e) {}
      });
      if (!maxRight || !origW) return;
      const cw = fig.clientWidth;
      const contentAtReadable = maxRight * READABLE_SCALE;
      let badge = fig.querySelector('.fig-zoom-badge');
      if (contentAtReadable <= cw) {
        // влезает → обрезаем пустые поля, без увеличения
        svg.setAttribute('viewBox', '0 0 ' + (maxRight + 16) + ' ' + viewH);
        svg.dataset.fitW = String(maxRight + 16);
        svg.style.minWidth = '';
        fig.classList.remove('fig-clip');
        if (badge) badge.remove();
      } else {
        // не влезает → клип + бейдж «увеличить»
        svg.setAttribute('viewBox', '0 0 ' + origW + ' ' + viewH);
        svg.style.minWidth = (origW * READABLE_SCALE) + 'px';
        fig.classList.add('fig-clip');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'fig-zoom-badge';
          badge.textContent = '⤢';
          badge.setAttribute('aria-label', 'Увеличить');
          fig.appendChild(badge);
        }
      }
    });
  }
  window.addEventListener('resize', updateFigureFits);

  // ===== ТАП-УВЕЛИЧЕНИЕ ФИГУР =====
  // Фигура клонируется вместе со своим контекстом. Иначе схема, нарисованная для светлого листа
  // статьи, попадает в тёмный оверлей без правил .bl-sheet: тёмные чернила оказываются на чёрном
  // фоне, светлые заливки — инверсными. Поэтому светлый лист переносим целиком (обёртка .bl-sheet),
  // а сам оверлей для статей делаем «печатным» — светлым, как лист.
  function openFigOverlay(svg) {
    const existing = document.querySelector('.fig-overlay');
    if (existing) existing.remove();
    const fromSheet = !!svg.closest('.bl-sheet');
    const overlay = document.createElement('div');
    overlay.className = 'fig-overlay' + (fromSheet ? ' fig-overlay--paper bl-sheet' : '');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Увеличенная схема');
    const close = document.createElement('button');
    close.className = 'fig-overlay-close';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Закрыть');
    const canvas = document.createElement('div');
    canvas.className = 'fig-overlay-canvas';
    const clone = svg.cloneNode(true);
    clone.classList.add('fig-svg');
    clone.removeAttribute('style');
    const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
    if (vb) {
      const w = svg.dataset.origW || svg.dataset.fitW || vb.width;
      clone.setAttribute('viewBox', '0 0 ' + w + ' ' + vb.height);
    }
    canvas.appendChild(clone);
    // Подпись снизу (берём из figcaption, если есть)
    const caption = document.createElement('div');
    caption.className = 'fig-overlay-caption';
    const srcFig = svg.closest('figure.fig');
    if (srcFig) {
      const cap = srcFig.querySelector('figcaption');
      if (cap) {
        const parts = Array.from(cap.querySelectorAll('span, b')).map((x) => x.textContent.trim()).filter(Boolean);
        caption.textContent = parts.length ? parts.join(' · ') : cap.textContent.trim();
      }
      if (!caption.textContent) caption.remove();
    }
    overlay.appendChild(canvas);
    overlay.appendChild(caption);
    overlay.appendChild(close);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    overlay.scrollLeft = 0;   // схема открывается с начала: верхний левый угол, а не «обрезанной» с середины
    overlay.scrollTop = 0;
    close.focus();
    const onKey = (e) => { if (e.key === 'Escape') closeFn(); };
    const closeFn = () => {
      overlay.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target === close || e.target === canvas) closeFn();
    });

    // Drag-to-pan увеличенной картинки
    let isDragging = false, startX = 0, startY = 0, scrollL = 0, scrollT = 0;
    clone.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX; startY = e.clientY;
      scrollL = overlay.scrollLeft; scrollT = overlay.scrollTop;
      clone.style.cursor = 'grabbing';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      overlay.scrollLeft = scrollL - (e.clientX - startX);
      overlay.scrollTop = scrollT - (e.clientY - startY);
    });
    window.addEventListener('mouseup', () => {
      isDragging = false;
      clone.style.cursor = 'grab';
    });

    // Свайп вниз для закрытия (мобильный)
    let touchStartY = 0;
    overlay.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    overlay.addEventListener('touchend', (e) => {
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (dy > 80 && overlay.scrollTop <= 0) closeFn();
    }, { passive: true });
  }
  document.querySelectorAll('.fig').forEach((fig) => {
    fig.addEventListener('click', (e) => {
      if (e.target.closest('.fig-svg') || e.target.closest('.fig-zoom-badge')) {
        openFigOverlay(fig.querySelector('.fig-svg'));
      }
    });
  });

  // ===== INIT =====
  updateActiveNav();
  onScroll();
  updateFigureFits();
  setTimeout(updateFigureFits, 600);
})();

// ===== ai.html: collapse-портянка блога =====
function setupBlogList() {
  const list = document.querySelector('.blog-cols-collapsed');
  const btn = document.querySelector('.ai-blog-toggle');
  if (!btn) return;
  // Показывать/скрывать список (он изначально hidden)
  function sync() {
    const shown = list && !list.hasAttribute('hidden');
    btn.querySelector('.ai-blog-toggle-text').textContent = shown ? 'Скрыть ниши' : 'Показать все ниши';
    btn.querySelector('.ai-blog-toggle-count').textContent = shown ? '' : (list ? ` (${list.querySelectorAll('.blog-card').length})` : '');
  }
  sync();
  btn.addEventListener('click', () => {
    if (!list) return;
    if (list.hasAttribute('hidden')) list.removeAttribute('hidden');
    else list.setAttribute('hidden', '');
    sync();
  });
}

setupBlogList();


// ===== Статья: scrollspy для TOC слева =====
function setupArticleTOC() {
  const aside = document.querySelector('.article-aside-left');
  if (!aside) return;
  const tocLinks = aside.querySelectorAll('a[href^="#sec-"]');
  const headingMap = new Map();
  tocLinks.forEach(link => {
    const id = link.getAttribute('href').slice(1);
    const h = document.getElementById(id);
    if (h) headingMap.set(id, { link, h });
  });
  if (headingMap.size === 0) return;

  function updateActive() {
    const scrollPos = window.scrollY + 120;
    let activeId = null;
    headingMap.forEach((v, id) => {
      if (v.h.offsetTop <= scrollPos) activeId = id;
    });
    headingMap.forEach(v => v.link.classList.remove('active'));
    if (activeId) headingMap.get(activeId).link.classList.add('active');
  }
  window.addEventListener('scroll', updateActive, { passive: true });
  window.addEventListener('resize', updateActive);
  updateActive();
}
setupArticleTOC();