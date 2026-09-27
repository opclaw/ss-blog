/**
 * Аудит фигур блога: контраст, выход элементов за рамку, поведение зума, мобильная прокрутка.
 *
 * Запуск (нужен локальный сервер: ./node_modules/.bin/astro preview --port 4321):
 *   LD_LIBRARY_PATH=/tmp/al2023/lib node tools/audit-figures.mjs \
 *     --base http://127.0.0.1:4321 --shots /tmp/audit-shots --json /tmp/audit-figures.json
 *
 * Проверяет: (1) фон оверлея и токены листа, (2) контраст каждого <text> относительно
 * эффективного фона (с учётом заливки ближайшей фигуры), (3) вылет подписей за viewBox,
 * (4) мобильный режим (390px): прокрутка .fig-scroll, бейдж увеличения, отсутствие обрезки.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// playwright-core и @sparticuz/chromium живут вне репозитория (тяжёлые бинарники).
// Указываем каталог через PW_DIR, по умолчанию /tmp/pw2.
const PW_DIR = process.env.PW_DIR || '/tmp/pw2';
const req = createRequire(pathToFileURL(path.join(PW_DIR, 'package.json')));
const pwMod = await import(pathToFileURL(req.resolve('playwright-core')).href);
const chromium = (await import(pathToFileURL(req.resolve('@sparticuz/chromium')).href)).default;
const pw = pwMod.chromium || pwMod.default?.chromium;

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const BASE = getArg('--base', 'http://127.0.0.1:4321');
const SHOTS = getArg('--shots', '/tmp/audit-shots');
const JSON_OUT = getArg('--json', '/tmp/audit-figures.json');
const MAX_SLUGS = parseInt(getArg('--max', '0'), 10);

fs.mkdirSync(SHOTS, { recursive: true });

const CONTRAST_JS = `(() => {
  const parse = (c) => {
    const m = String(c).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  const effBg = (el, base) => {
    let node = el;
    while (node && node.nodeType === 1) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.02) return bg.a >= 0.999 ? bg : over(bg, base);
      node = node.parentElement;
    }
    return base;
  };
  const base = parse(getComputedStyle(document.querySelector('.fig-overlay--paper') || document.body).backgroundColor) || { r: 250, g: 250, b: 247, a: 1 };
  const texts = [...document.querySelectorAll('.fig-overlay .fig-svg text')];
  const rows = texts.map((t) => {
    const cs = getComputedStyle(t);
    const fill = parse(cs.fill) || { r: 0, g: 0, b: 0, a: 1 };
    const bg = effBg(t, base);
    const fg = fill.a >= 0.999 ? fill : over(fill, bg);
    return {
      text: (t.textContent || '').trim().slice(0, 40),
      cls: t.getAttribute('class') || '',
      fill: cs.fill,
      bg: 'rgb(' + Math.round(bg.r) + ', ' + Math.round(bg.g) + ', ' + Math.round(bg.b) + ')',
      ratio: +ratio(fg, bg).toFixed(2),
      size: cs.fontSize,
    };
  });
  // вылет элементов за viewBox
  let overflow = [];
  const svg = document.querySelector('.fig-overlay .fig-svg');
  if (svg) {
    const vb = svg.viewBox.baseVal;
    svg.querySelectorAll('text').forEach((t) => {
      try {
        const bb = t.getBBox();
        if (bb.x + bb.width > vb.width + 2 || bb.x < -2 || bb.y < -2 || bb.y + bb.height > vb.height + 2) {
          overflow.push({ text: (t.textContent || '').trim().slice(0, 30), right: +(bb.x + bb.width).toFixed(1), bottom: +(bb.y + bb.height).toFixed(1), vbW: vb.width, vbH: vb.height });
        }
      } catch (e) {}
    });
  }
  return { texts: rows, overflow, minRatio: rows.length ? Math.min(...rows.map((r) => r.ratio)) : null, count: rows.length };
})()`;

const MOBILE_ZOOM_JS = `(() => {
  const ov = document.querySelector('.fig-overlay--paper');
  if (!ov) return { err: 'нет оверлея' };
  const svg = ov.querySelector('.fig-svg');
  const hint = getComputedStyle(ov, '::after').content || '';
  return {
    overlayBg: getComputedStyle(ov).backgroundColor,
    svgW: Math.round(svg.getBoundingClientRect().width),
    viewportW: window.innerWidth,
    pannable: ov.scrollWidth > ov.clientWidth + 2,
    startAtLeft: ov.scrollLeft < 8,
    hint: hint.replace(/["']/g, '').slice(0, 40),
    caption: (ov.querySelector('.fig-overlay-caption') || {}).textContent || '',
  };
})()`;

const MOBILE_JS = `(() => {
  const out = [];
  document.querySelectorAll('.fig').forEach((fig, i) => {
    const wrap = fig.querySelector('.fig-scroll');
    const svg = fig.querySelector('.fig-svg');
    // схема считается доступной, если её можно прокрутить ИЛИ она клемпится с бейджем «увеличить»
    const clip = fig.classList.contains('fig-clip');
    const badge = !!fig.querySelector('.fig-zoom-badge');
    out.push({
      i,
      scrollable: wrap ? wrap.scrollWidth > wrap.clientWidth + 4 : false,
      scrollW: wrap ? wrap.scrollWidth : null,
      clientW: wrap ? wrap.clientWidth : null,
      badge,
      clipped: clip,
      minWidth: svg && svg.style.minWidth ? svg.style.minWidth : null,
      ok: !clip || badge,
    });
  });
  const page = { docW: document.documentElement.scrollWidth, winW: window.innerWidth };
  page.overflow = page.docW > page.winW + 2;
  return { figures: out, page };
})()`;

const slugs = fs
  .readdirSync('/home/user/ss-blog/site/dist/blog')
  .filter((f) => f.endsWith('.html') && f !== 'index.html')
  .map((f) => f.replace('.html', ''))
  .sort();
if (MAX_SLUGS) slugs.length = Math.min(slugs.length, MAX_SLUGS);

let exePath = null;
async function withBrowser(fn) {
  // headless-shell в песочнице периодически падает — поднимаем процесс на каждую статью
  if (!exePath) exePath = await chromium.executablePath();
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const browser = await pw.launch({ executablePath: exePath, args: chromium.args, headless: true });
    try {
      return await fn(browser);
    } catch (e) {
      lastErr = e;
      console.log(`  (попытка ${attempt} сорвалась: ${String(e.message).slice(0, 60)})`);
    } finally {
      try { await browser.close(); } catch (e) {}
    }
  }
  throw lastErr;
}

const report = { base: BASE, at: new Date().toISOString(), articles: [] };

for (const slug of slugs) {
  const entry = { slug, figures: [], problems: [] };
  try {
    await withBrowser(async (browser) => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${BASE}/blog/${slug}.html`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(300);
      const n = await page.$$eval('.fig-svg', (els) => els.length);
      entry.figuresTotal = n;
      for (let i = 0; i < n; i++) {
        const figEntry = { i, ok: true };
        await page.$$eval('.fig-svg', (els, idx) => els[idx].scrollIntoView({ block: 'center' }), i);
        await page.waitForTimeout(120);
        await page.$$eval('.fig-svg', (els, idx) => {
          els[idx].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }, i);
        await page.waitForTimeout(450);
        const data = await page.evaluate(CONTRAST_JS);
        figEntry.overlayBg = await page.evaluate(() => {
          const ov = document.querySelector('.fig-overlay');
          return ov ? getComputedStyle(ov).backgroundColor : null;
        });
        figEntry.contrast = data;
        if (data.minRatio !== null && data.minRatio < 4.5) figEntry.ok = false;
        if (data.overflow.length) figEntry.ok = false;
        if (figEntry.overlayBg !== 'rgb(250, 250, 247)') entry.problems.push(`fig${i}: фон оверлея ${figEntry.overlayBg}`);
        const shot = path.join(SHOTS, `${slug}-fig${i}.png`);
        try {
          await page.screenshot({ path: shot, fullPage: false });
          figEntry.shot = shot;
        } catch (e) {
          figEntry.shotError = String(e.message).slice(0, 80);
        }
        if (!figEntry.ok) {
          figEntry.lowContrast = data.texts.filter((t) => t.ratio < 4.5);
          entry.problems.push(
            `fig${i}: контраст ${data.minRatio}${data.overflow.length ? `, вылет: ${data.overflow.map((o) => o.text).join('; ')}` : ''}`
          );
        }
        entry.figures.push(figEntry);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);
      // мобильное увеличение последней схемы: крупнее экрана + панорама + старт с начала
      const hasFig = await page.evaluate(() => document.querySelectorAll('.fig-svg').length > 0);
      if (hasFig) {
      await page.evaluate(() => {
        const el = document.querySelectorAll('.fig-svg');
        el[el.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
      await page.waitForTimeout(500);
      const mz = await page.evaluate(MOBILE_ZOOM_JS);
      entry.mobileZoom = mz;
      if (mz && !mz.err) {
        if (mz.overlayBg !== 'rgb(250, 250, 247)') entry.problems.push(`мобильный зум: фон ${mz.overlayBg}`);
        if (!mz.pannable) entry.problems.push(`мобильный зум: схема не крупнее экрана (${mz.svgW} ≤ ${mz.viewportW})`);
        if (!mz.startAtLeft) entry.problems.push('мобильный зум: открывается не с начала схемы');
        if (!mz.hint) entry.problems.push('мобильный зум: нет подсказки о панораме');
      } else entry.problems.push('мобильный зум: оверлей не открылся');
      await page.evaluate(() => { const ov = document.querySelector('.fig-overlay'); if (ov) ov.remove(); });
      }
      const mob = await page.evaluate(MOBILE_JS);
      entry.mobile = mob.figures;
      entry.mobilePage = mob.page;
      entry.mobileOk = mob.figures.every((m) => m.ok) && !mob.page.overflow;
      if (mob.page.overflow) entry.problems.push(`мобильный режим: страница шире экрана (${mob.page.docW} > ${mob.page.winW})`);
      if (mob.figures.some((m) => !m.ok)) entry.problems.push('мобильный режим: схема обрезана без бейджа увеличения');
      try { await page.close(); } catch (e) {}
    });
  } catch (e) {
    entry.error = String(e.message).slice(0, 200);
    entry.problems.push('исключение: ' + entry.error);
  }
  report.articles.push(entry);
  const bad = entry.problems.length;
  console.log(`${slug}: фигур ${entry.figuresTotal ?? '?'} | проблем ${bad}${bad ? ' → ' + entry.problems.join(' | ') : ''}`);
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
}

try { await browser.close(); } catch (e) {}
fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
const totalProblems = report.articles.reduce((s, a) => s + a.problems.length, 0);
console.log(`\nИТОГ: статей ${report.articles.length}, проблем ${totalProblems}; отчёт ${JSON_OUT}`);
