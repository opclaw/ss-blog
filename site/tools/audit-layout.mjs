/**
 * Аудит вёрстки: переполнения, наезды элементов на текст, обрезанный текст, ложные лупы зума.
 *
 * Запуск (нужен сервер: ./node_modules/.bin/astro preview --port 4321):
 *   LD_LIBRARY_PATH=/tmp/al2023/lib node tools/audit-layout.mjs \
 *     --base http://127.0.0.1:4321 --json /tmp/audit-layout.json [--only blog/]
 *
 * Что проверяет на каждом разрешении (1440, 1280, 1024, 768, 390):
 *  1. Переполнение по горизонтали: элемент выходит за правый/левый край родителя или окна.
 *  2. Обрезанный текст: у элемента с текстом scrollWidth > clientWidth при overflow:hidden/clip.
 *  3. Наезды: два текстовых блока накладываются друг на друга (пересечение площадей).
 *  4. Ложная лупа: у элемента курсор zoom-in, но клик по нему не открывает увеличение.
 *  5. Текст вне своей плашки: подпись выходит за границы карточки/фигуры.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const PW_DIR = process.env.PW_DIR || '/tmp/pw2';
const req = createRequire(pathToFileURL(path.join(PW_DIR, 'package.json')));
const pwMod = await import(pathToFileURL(req.resolve('playwright-core')).href);
const chromium = (await import(pathToFileURL(req.resolve('@sparticuz/chromium')).href)).default;
const pw = pwMod.chromium || pwMod.default?.chromium;

const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = getArg('--base', 'http://127.0.0.1:4321');
const JSON_OUT = getArg('--json', '/tmp/audit-layout.json');
const ONLY = getArg('--only', '');

const SCAN = `(() => {
  const out = { overflow: [], clipped: [], overlaps: [], zoomAffordance: [], outsideCard: [], contrast: [], tableLook: [], brokenKit: [] };
  const vw = window.innerWidth;
  // элемент реально виден: не в закрытом details, не скрыт стилями и не срезан прокруткой/клипом предка
  const visible = (el) => {
    if (el.closest('details:not([open])')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    // если предок обрезает (overflow hidden/clip/auto со нулевой высотой) и элемент вне видимой части — он не виден
    let n = el.parentElement;
    while (n && n !== document.body) {
      const pcs = getComputedStyle(n);
      if (pcs.overflow !== 'visible' || pcs.overflowY !== 'visible') {
        const pr = n.getBoundingClientRect();
        const interY = Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top);
        const interX = Math.min(r.right, pr.right) - Math.max(r.left, pr.left);
        if (pr.height <= 1 || pr.width <= 1 || interY < 4 || interX < 4) return false;
      }
      n = n.parentElement;
    }
    return true;
  };
  const lum = (c) => {
    const m = c.match(/[0-9.]+/g); if (!m) return null;
    const [r, g, b, a] = m.map(Number);
    if (a !== undefined && a < 1) return null; // прозрачный фон — считаем по родителю ниже
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const parse = (c) => { const m = c.match(/[0-9.]+/g); return m ? m.map(Number) : null; };
  // эффективный фон: смешиваем полупрозрачные слои с фоном предков
  const effBg = (el) => { let n = el; while (n) { const c = getComputedStyle(n).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)') { const l = lum(c); if (l !== null) return l; } n = n.parentElement; } return null; };
  const effBgRgb = (el) => {
    const layers = []; let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && !(c[3] === 0)) layers.push(c);
      if (c && (c[3] === undefined || c[3] >= 1)) break;
      n = n.parentElement;
    }
    let acc = [255, 255, 255];
    for (const c of layers.reverse()) { const a = c[3] === undefined ? 1 : c[3]; acc = [acc[0] + (c[0] - acc[0]) * a, acc[1] + (c[1] - acc[1]) * a, acc[2] + (c[2] - acc[2]) * a]; }
    return lum('rgb(' + acc.map((v) => Math.round(v)).join(',') + ')');
  };
  const ratio = (l1, l2) => { const a = Math.max(l1, l2), b = Math.min(l1, l2); return (a + 0.05) / (b + 0.05); };
  const isText = (el) => {
    const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    return t.length > 2 && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
  };
  const name = (el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/[\s]+/).slice(0, 2).join('.') : '');
  const describe = (el) => (el.textContent || '').trim().replace(/[\s]+/g, ' ').slice(0, 45);

  // 1 + 5. переполнения и выход за плашку
  document.querySelectorAll('main *, header *, footer *').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') return;
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    if (el.closest('svg')) return; // геометрия внутри SVG-схем: законно выходит за колонку (свайп)
    if (r.right > vw + 2 || r.left < -2) {
      // исключаем элементы внутри горизонтально прокручиваемых контейнеров (это законно)
      let n = el.parentElement, scrollable = false;
      while (n) { const p = getComputedStyle(n); if (p.overflowX === 'auto' || p.overflowX === 'scroll') { scrollable = true; break; } n = n.parentElement; }
      if (!scrollable) out.overflow.push({ el: name(el), text: describe(el), left: Math.round(r.left), right: Math.round(r.right), vw });
    }
    const card = el.closest('.week-card, .kit, .bl-fig, .fig, .bl-table-wrap, .kit-table-wrap, .bl-split, .bl-loop, .bl-prompt, .bl-sources, .bl-quote, .bl-note, .bl-split, .author-card, .week-card');
    if (card && isText(el) && el !== card && !el.closest('svg') && !el.closest('.fig-clip, .bl-table-wrap, .kit-table-wrap, .bl-pipe-scroll, .ag-table-wrap, .kit-tabs-bar')) {
      const cr = card.getBoundingClientRect();
      if (r.right > cr.right + 3 || r.left < cr.left - 3) {
        out.outsideCard.push({ el: name(el), text: describe(el), card: name(card), over: Math.round(Math.max(r.right - cr.right, cr.left - r.left)) });
      }
    }
  });

  // 2. обрезанный текст
  document.querySelectorAll('main *, header *, footer *').forEach((el) => {
    if (!isText(el)) return;
    const cs = getComputedStyle(el);
    if (cs.overflow === 'hidden' || cs.overflow === 'clip' || cs.overflowX === 'hidden') {
      const deco = ['::before', '::after'].some((ps) => { const p2 = getComputedStyle(el, ps); return p2.content !== 'none' && p2.position === 'absolute'; });
      if (!deco && el.scrollWidth > el.clientWidth + 3 && el.clientHeight <= el.scrollHeight + 3) {
        out.clipped.push({ el: name(el), text: describe(el), sw: el.scrollWidth, cw: el.clientWidth });
      }
    }
    // однострочные элементы с nowrap, у которых текст не влез
    if (cs.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 3) {
      out.clipped.push({ el: name(el), text: describe(el), sw: el.scrollWidth, cw: el.clientWidth, nowrap: true });
    }
  });

  // 3. наезды текстовых блоков (без вложенных пар)
  const textEls = [...document.querySelectorAll('main p, main li, main h1, main h2, main h3, main td, main th, main figcaption, main button, main .kit-cap, main span')]
    .filter(isText).filter((el) => {
      const cs = getComputedStyle(el);
      return visible(el) && cs.display !== 'inline' && cs.position !== 'absolute' && cs.position !== 'fixed' && !el.closest('svg') && el.getBoundingClientRect().width > 8;
    });
  const rects = textEls.map((el) => ({ el, r: el.getBoundingClientRect() }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const x = Math.max(0, Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left));
      const y = Math.max(0, Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top));
      const inter = x * y;
      if (inter < 40) continue;
      const smaller = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
      if (inter / smaller > 0.35) {
        out.overlaps.push({ a: name(a.el), b: name(b.el), textA: describe(a.el), textB: describe(b.el), share: +(inter / smaller).toFixed(2) });
      }
    }
  }
  // 4. ложная лупа: курсор zoom-in, но нет зум-цели
  document.querySelectorAll('*').forEach((el) => {
    if (getComputedStyle(el).cursor !== 'zoom-in') return;
    // увеличение реально открывается кликом по .fig-svg (script.js) и по .fig-zoom-badge
    let zoomable = el.classList.contains('fig-svg') || el.classList.contains('fig-zoom-badge');
    if (!zoomable) { const fig = el.closest('.fig'); zoomable = !!(fig && fig.querySelector('.fig-svg') && el !== fig.querySelector('figcaption')); }
    if (!zoomable) out.zoomAffordance.push({ el: name(el), text: describe(el), cls: String(el.className).slice(0, 50) });
  });

  // контраст текста (WCAG AA): 4.5 обычный / 3.0 крупный
  document.querySelectorAll('main p, main li, main h1, main h2, main h3, main h4, main td, main th, main span, main figcaption, header a, footer a, main a, main button').forEach((el) => {
    if (!isText(el) || !visible(el) || el.closest('svg')) return;
    const cs = getComputedStyle(el);
    const fg = lum(cs.color); if (fg === null) return;
    const bg = effBg(el); if (bg === null) return;
    const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const cr = ratio(fg, bg);
    if (cr < need) out.contrast.push({ el: name(el), text: describe(el), color: cs.color, size: Math.round(size), bold, ratio: +cr.toFixed(2), need });
  });

  // «таблицу видно»: у шапки фон отличим от ячеек и есть границы
  document.querySelectorAll('table').forEach((t) => {
    const th = t.querySelector('th'), td = t.querySelector('td');
    if (!th || !td) return;
    const thL = effBgRgb(th); const tdL = effBgRgb(td);
    const borders = ['borderBottomWidth', 'borderLeftWidth'].map((k) => parseFloat(getComputedStyle(td)[k]) || 0);
    const thBorder = parseFloat(getComputedStyle(th).borderBottomWidth) || 0;
    const ok = thL !== null && tdL !== null && borders.some((b) => b > 0)
      && (Math.abs(thL - tdL) > 0.02 || thBorder > 0);
    if (!ok) out.tableLook.push({ text: describe(t), thBg: getComputedStyle(th).backgroundColor, tdBg: getComputedStyle(td).backgroundColor, borders, thL, tdL, diff: (thL !== null && tdL !== null) ? +(Math.abs(thL - tdL)).toFixed(3) : null });
  });
  // интерактив: у каждого кита с кнопками кнопка должна что-то менять
  document.querySelectorAll('[data-kit]').forEach((root) => {
    const btns = [...root.querySelectorAll('button')];
    if (!btns.length) return;
    // подпись состояния: классы, aria-expanded, скрытость — так видно реакцию на клик
    // в снимок входят и aria-pressed/aria-selected, значения полей и текст: иначе рабочие
    // киты (например .kit-matrix, где клик меняет aria-pressed и подпись) выглядят «сломанными»
    const snap = () => [...root.querySelectorAll('*')].map((el) => el.className + '|' + (el.getAttribute('aria-expanded') || '') + '|' + (el.getAttribute('aria-pressed') || '') + '|' + (el.getAttribute('aria-selected') || '') + '|' + getComputedStyle(el).display + '|' + getComputedStyle(el).opacity + '|' + (el.value === undefined ? '' : el.value) + '|' + (el.textContent || '').trim().slice(0, 120)).join(';');
    const b0 = snap();
    let changed = false;
    for (const b of btns.slice(0, 3)) {
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (snap() !== b0) { changed = true; break; }
    }
    if (!changed && btns.length > 1) out.brokenKit.push({ kit: root.className.split(' ').slice(0, 2).join(' '), buttons: btns.length });
  });

  // живой арт в шапке: шаги, подписи, точки, реакция на нажатие
  const hero = document.querySelector('[data-hero]');
  if (hero) {
    const steps = [...hero.querySelectorAll('.h-step')];
    const hsAll = [...hero.querySelectorAll('[data-hs]')];
    const uniq = new Set(hsAll.map((x) => x.dataset.hs));
    const dots = [...hero.querySelectorAll('.bl-hero-dot')];
    if (uniq.size !== dots.length) out.hero = { steps: steps.length, dots: dots.length, uniqueSteps: uniq.size, problem: 'steps ' + uniq.size + ' vs dots ' + dots.length };
    const cap = hero.querySelector('[data-hero-cap]');
    const r0 = { steps: steps.length, dots: dots.length };
    if (!steps.length || !dots.length || !cap) out.hero = { ...r0, problem: 'нет шагов/точек/подписи' };
    else {
      const before = cap.textContent.trim();
      const onBefore = steps.findIndex((x) => x.classList.contains('h-on'));
      // кликаем по НЕактивному шагу: клик по уже активному ничего не меняет и даёт
      // ложное «подпись не меняется» (автопрокрутка могла уже перевести арт на последний шаг)
      const target = steps.find((x) => !x.classList.contains('h-on')) || steps[0];
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const after = cap.textContent.trim();
      const on = steps.filter((x) => x.classList.contains('h-on')).length;
      const onAfter = steps.findIndex((x) => x.classList.contains('h-on'));
      out.hero = { ...r0, подписьМеняется: (before !== after || onBefore !== onAfter) && after.length > 10, активных: on,
        точкиСинхронны: dots.filter((d) => d.classList.contains('on')).length === on };
    }
    // каждый шаг должен нести свою подпись
    const emptyNotes = steps.filter((x) => !(x.dataset.note || '').trim()).length;
    if (emptyNotes) out.hero.emptyNotes = emptyNotes;
  }
  return out;
})()`;

// самопроверка: шаблон SCAN должен компилироваться (иначе тихие ложные результаты)
try { new Function(SCAN); } catch (e) { console.error('ОШИБКА: SCAN не компилируется —', e.message); process.exit(1); }

let exePath = null;
async function withBrowser(fn) {
  if (!exePath) exePath = await chromium.executablePath();
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const browser = await pw.launch({ executablePath: exePath, args: chromium.args, headless: true });
    try { return await fn(browser); } catch (e) { lastErr = e; } finally { try { await browser.close(); } catch (e) {} }
  }
  throw lastErr;
}

const pages = ['index.html', 'services.html', 'ai.html', 'ai-agenty.html', 'blog/index.html',
  ...fs.readdirSync('/home/user/ss-blog/site/dist/blog').filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => `blog/${f}`),
  ...fs.readdirSync('/home/user/ss-blog/site/dist/cases').map((f) => `cases/${f}`)];
const list = pages.filter((p) => (ONLY ? p.includes(ONLY) : true));
const viewports = [
  { w: 1440, h: 900, name: 'desktop' },
  { w: 1024, h: 800, name: 'laptop' },
  { w: 768, h: 900, name: 'tablet' },
  { w: 390, h: 844, name: 'phone' },
];

const report = { at: new Date().toISOString(), pages: [] };
const pageScroll = `({ x: document.documentElement.scrollWidth - document.documentElement.clientWidth })`;
for (const page of list) {
  const entry = { page, viewports: {} };
  for (const vp of viewports) {
    try {
      const res = await withBrowser(async (browser) => {
        const p = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
        await p.goto(`${BASE}/${page}`, { waitUntil: 'load', timeout: 30000 });
        await p.waitForTimeout(500);
        // полная прокрутка, чтобы сработали reveal-анимации и загрузились отложенные блоки
        await p.evaluate(async () => {
          const step = window.innerHeight;
          for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
          window.scrollTo(0, 0);
        });
        await p.waitForTimeout(400);
        const data = await p.evaluate(SCAN);
        const px = await p.evaluate(pageScroll);
        data.pageScrollX = px.x;
        await p.close();
        return data;
      });
      const counts = Object.fromEntries(Object.entries(res).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
      if (res.hero) {
        const hp = [];
        if (res.hero.problem) hp.push(res.hero.problem);
        if (!res.hero.подписьМеняется) hp.push('подпись не меняется при нажатии');
        if (!res.hero.точкиСинхронны) hp.push('точки не синхронны со шагами');
        if (res.hero.emptyNotes) hp.push(`шагов без подписи: ${res.hero.emptyNotes}`);
        if (hp.length) { counts.heroProblems = hp.length; res.hero.problems = hp; }
        else counts.heroProblems = 0;
      }
      entry.viewports[vp.name] = { counts, details: res };
      const bad = Object.values(counts).reduce((a, b) => a + b, 0) + (res.pageScrollX > 2 ? 1 : 0);
      if (bad) console.log(`${page} @${vp.name}: ${JSON.stringify(counts)}${res.pageScrollX > 2 ? ` ГОРИЗОНТАЛЬНАЯ_ПРОКРУТКА:${res.pageScrollX}px` : ''}`);
    } catch (e) {
      entry.viewports[vp.name] = { error: String(e.message).slice(0, 100) };
      console.log(`${page} @${vp.name}: ошибка ${String(e.message).slice(0, 60)}`);
    }
  }
  report.pages.push(entry);
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
}
const total = report.pages.reduce((s, p) => s + Object.values(p.viewports).reduce((a, v) => a + (v.counts ? Object.values(v.counts).reduce((x, y) => x + y, 0) : 0), 0), 0);
console.log(`\nИТОГ: страниц ${report.pages.length}, замечаний ${total}; отчёт ${JSON_OUT}`);
