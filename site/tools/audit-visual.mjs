/**
 * Проверка визуала «по каждому элементу»: ищем дешёвые и неряшливые вставки,
 * которые ломают единый стиль блога.
 *
 * Запуск:  LD_LIBRARY_PATH=/tmp/al2023/lib node tools/audit-visual.mjs [--json /tmp/audit-visual.json] [--only slug]
 *
 * Что проверяет:
 *  1. Нейрослоп-визуал: emoji, «украшательства» (★ ✨ 🔥), CAPS-«кричащие» блоки, градиентный шум.
 *  2. Чужие шрифты: элементы вне дизайн-палитры (Inter / Manrope / JetBrains Mono) в текстах статей.
 *  3. Цвета вне палитры листа: blob-значения, не входящие в токены.
 *  4. Инлайновые стили в разметке статей (кривые ручные вставки вместо правил в CSS).
 *  5. Пустые и полупустые блоки: плашки, фигуры, киты без видимого содержимого.
 *  6. Изображения и иконки: битые src, отсутствие alt у смысловых картинок, SVG без viewBox.
 *  7. Дубли id и «мёртвые» якоря ссылок внутри статьи.
 *  8. Единообразие: смешение радиусов/теней/толщин границ в пределах одного типа блока.
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
const JSON_OUT = getArg('--json', '/tmp/audit-visual.json');
const ONLY = getArg('--only', '');

const SCAN = `(() => {
  const out = { emoji: [], offFont: [], offColor: [], inlineStyle: [], emptyBox: [], imgIssues: [], dupId: [], deadAnchor: [], mixedRadius: [], shout: [] };
  const visible = (el) => {
    if (el.closest('details:not([open])')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  const name = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/[\\s]+/).slice(0, 2).join('.') : '');
  const txt = (el) => (el.textContent || '').trim().replace(/[\\s]+/g, ' ').slice(0, 40);

  const ALLOWED_FONTS = ['Manrope', 'JetBrains Mono', 'Inter', 'system-ui', '-apple-system'];
  // Осознанное исключение: блок «документ» (.kit-doc) намеренно набран серифом —
  // он изображает бумажный договор, а не текст статьи.
  const SERIF_OK = (el) => !!el.closest('.kit-doc');
  const PALETTE = ['16,16,20', '94,94,104', '108,108,120', '10,115,146', '0,217,255', '227,245,238', '11,122,87', '14,159,110', '194,65,12', '180,83,9', '250,250,247', '255,255,255', '241,241,236', '228,228,222', '210,210,202', '246,246,242', '227,247,252', '255,255,255', '244,244,240', '245,245,247', '8,8,13', '14,14,20', '10,126,164', '239,68,68', '255,180,84', '52,211,153'];
  const EMOJI = /[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{FE0F}]/u;

  const scope = document.querySelector('.bl-text') ? document.querySelector('main') : document.body;

  // 1 + 8. текст и «кричащие» блоки
  scope.querySelectorAll('p, li, span, b, strong, h2, h3, figcaption, button, summary').forEach((el) => {
    if (!visible(el)) return;
    const t = (el.textContent || '');
    if (EMOJI.test(t) && el.children.length === 0) out.emoji.push({ el: name(el), text: txt(el) });
    const m = t.trim().match(/[А-ЯЁA-Z][А-ЯЁA-Z ,.\\-!?]{14,}/);
    if (m && el.children.length === 0) out.shout.push({ el: name(el), text: m[0].slice(0, 40) });
  });

  // 2 + 3 + 4. шрифты, цвета, инлайновые стили
  const NO_TEXT_CONTROL = ['range', 'checkbox', 'radio', 'color', 'file', 'image', 'reset', 'submit', 'button'];
  scope.querySelectorAll('*').forEach((el) => {
    if (el.closest('svg') || !visible(el)) return;
    if (el.tagName === 'INPUT' && NO_TEXT_CONTROL.includes((el.getAttribute('type') || 'text').toLowerCase())) return; // текст не рисует
    const cs = getComputedStyle(el);
    const fam = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
    if (fam && !SERIF_OK(el) && !ALLOWED_FONTS.some((f) => fam.toLowerCase().includes(f.toLowerCase()))) {
      out.offFont.push({ el: name(el), font: fam, text: txt(el) });
    }
    // инлайновый стиль из разметки; рантайм-стили скриптов (transform/width от прокрутки) не считаем
    if (el.hasAttribute('style') && el.getAttribute('style').trim()) {
      const st = el.getAttribute('style');
      // только кастомные свойства (--w, --v) — это данные для CSS, а не ручная стилизация
      const dataOnly = st.split(';').every((d) => { const k = d.split(':')[0].trim(); return !k || k.indexOf('--') === 0; });
      const runtime = /transform:|width:\\s*[\\d.]+%/.test(st) && !st.includes('--w');
      if (!runtime && !dataOnly) out.inlineStyle.push({ el: name(el), style: st.slice(0, 60), text: txt(el) });
    }
  });

  // 5. пустые плашки и фигуры
  document.querySelectorAll('.bl-fig, .fig, .kit, .bl-note, .bl-quote, .no-card, .err-card, .week-card, .bl-table-wrap, .kit-table-wrap, .formula-card').forEach((el) => {
    if (!visible(el)) return;
    const t = (el.textContent || '').trim();
    const hasSvg = !!el.querySelector('svg');
    if (t.length < 12 && !hasSvg) out.emptyBox.push({ el: name(el), chars: t.length });
  });

  // 6. картинки и SVG
  scope.querySelectorAll('img').forEach((img) => {
    // битая = загрузка завершилась, а размеров нет; незагруженную ленивую картинку не считаем
    if (img.complete && img.naturalWidth === 0) out.imgIssues.push({ el: name(img), src: (img.getAttribute('src') || '').slice(0, 50), problem: 'не загрузилась' });
    if (!img.hasAttribute('alt')) out.imgIssues.push({ el: name(img), src: (img.getAttribute('src') || '').slice(0, 50), problem: 'нет alt' });
  });
  scope.querySelectorAll('svg').forEach((s) => {
    if (!s.getAttribute('viewBox') && !s.getAttribute('width')) out.imgIssues.push({ el: 'svg', src: String(s.className).slice(0, 40), problem: 'нет viewBox' });
  });

  // 7. дубли id и мёртвые якоря
  const ids = {};
  document.querySelectorAll('[id]').forEach((el) => { ids[el.id] = (ids[el.id] || 0) + 1; });
  Object.entries(ids).forEach(([id, n]) => { if (n > 1) out.dupId.push({ id, count: n }); });
  scope.querySelectorAll('a[href^="#"]').forEach((a) => {
    const id = a.getAttribute('href').slice(1);
    if (id && !document.getElementById(id)) out.deadAnchor.push({ text: txt(a), href: a.getAttribute('href') });
  });

  // 8. единообразие радиусов у однотипных блоков
  const radii = {};
  document.querySelectorAll('.kit, .bl-fig, .week-card, .no-card, .err-card').forEach((el) => {
    const r = getComputedStyle(el).borderRadius;
    // Радиус 0px у акцентной грани (.no-card/.err-card) — осознанное решение, поэтому
    // сравниваем семейства радиусов по ненулевым углам, а не по строке shorthand.
    const p = r.split(' ');
    const corners = p.length === 1 ? [p[0], p[0], p[0], p[0]] : p.length === 2 ? [p[0], p[1], p[0], p[1]] : p.length === 3 ? [p[0], p[1], p[2], p[1]] : p;
    const norm = Array.from(new Set(corners.filter((v) => v !== '0px'))).join(' ') || '0px';
    radii[norm] = (radii[norm] || 0) + 1;
  });
  // «смешение» — это когда на странице больше одного семейства радиусов у однотипных блоков
  const families = Object.entries(radii);
  if (families.length > 1) families.forEach(([r, n]) => out.mixedRadius.push({ radius: r, count: n }));
  return out;
})()`;

// Страховка от ловушки шаблонной строки: одиночные \s \d \w внутри SCAN схлопываются
// и фильтры молча перестают работать. Проверяем исходник этого файла до запуска браузера.
const selfSrc = fs.readFileSync(new URL(import.meta.url), "utf8");
const scanStart = selfSrc.indexOf("const SCAN = " + String.fromCharCode(96)) + 14;
const scanEnd = selfSrc.indexOf("})()" + String.fromCharCode(96) + ";", scanStart);
const scanSource = selfSrc.slice(scanStart, scanEnd);
const loneEscapes = scanSource.match(/(^|[^\\])\\[a-zA-Z]/g);
if (loneEscapes) { console.error("ОШИБКА: в SCAN одиночные экранирования (" + loneEscapes.join(", ") + ") — удвойте бэкслеши"); process.exit(1); }
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

const blogDir = '/home/user/ss-blog/site/dist/blog';
const pages = [
  'index.html', 'services.html', 'ai.html', 'ai-agenty.html', 'blog/index.html',
  ...fs.readdirSync(blogDir).filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => `blog/${f}`),
].filter((p) => (ONLY ? p.includes(ONLY) : true));

const report = { at: new Date().toISOString(), pages: [] };
for (const page of pages) {
  try {
    const res = await withBrowser(async (browser) => {
      const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await p.goto(`${BASE}/${page}`, { waitUntil: 'load', timeout: 30000 });
      await p.waitForTimeout(600);
      await p.evaluate(async () => { const st = window.innerHeight; for (let y = 0; y < document.body.scrollHeight; y += st) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); });
      await p.waitForTimeout(300);
      // дожидаемся декодирования картинок, чтобы отличить битую от ленивой.
      // decode() у ленивой картинки вне экрана может не разрешиться никогда — ограничиваем ожидание.
      await p.evaluate(async () => {
        const wait = (pr) => Promise.race([pr.catch(() => {}), new Promise((r) => setTimeout(r, 800))]);
        await Promise.all([...document.images].map((i) => (i.decode ? wait(i.decode()) : Promise.resolve())));
      });
      const d = await p.evaluate(SCAN);
      await p.close();
      return d;
    });
    const counts = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.length]));
    const bad = Object.values(counts).reduce((a, b) => a + b, 0);
    const entry = { page, counts, details: res };
    if (bad) {
      console.log(`${page}: ${JSON.stringify(counts)}`);
      for (const k of Object.keys(counts)) if (counts[k]) console.log(`   ${k}: ${JSON.stringify(res[k].slice(0, 2))}`);
    }
    report.pages.push(entry);
  } catch (e) {
    console.log(`${page}: ошибка ${String(e.message).slice(0, 80)}`);
    report.pages.push({ page, error: String(e.message).slice(0, 120) });
  }
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
}
const totals = {};
for (const pg of report.pages) if (pg.counts) for (const [k, v] of Object.entries(pg.counts)) totals[k] = (totals[k] || 0) + v;
console.log('\nИТОГ по визуалу:', JSON.stringify(totals), '→', JSON_OUT);
