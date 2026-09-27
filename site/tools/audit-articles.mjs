/**
 * Аудит статьи целиком: первая секция, таблицы, интерактивные киты, оглавление, FAQ.
 *
 * Запуск (нужен локальный сервер ./node_modules/.bin/astro preview --port 4321):
 *   LD_LIBRARY_PATH=/tmp/al2023/lib node tools/audit-articles.mjs \
 *     --base http://127.0.0.1:4321 --shots /tmp/audit-shots --json /tmp/audit-articles.json
 *
 * Что проверяет:
 *  1. Первая секция: единственный h1, лид, hero-схема, первый экран (скриншот 1440×900).
 *  2. Таблицы: обёртка .bl-table-wrap, прокрутка на мобильном, пустые ячейки, шапка, вылет за экран.
 *  3. Интерактив: каждый кит отвечает на действия (клик/ввод) и не роняет консоль.
 *  4. Оглавление: все ссылки ведут на существующие id.
 *  5. FAQ: <details>/<summary>, раскрывается.
 *  6. Растровых картинок в статьях быть не должно.
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
const SHOTS = getArg('--shots', '/tmp/audit-shots');
const JSON_OUT = getArg('--json', '/tmp/audit-articles.json');
const ONLY = getArg('--only', '');
fs.mkdirSync(SHOTS, { recursive: true });


const KIT_CONTRAST_JS = `(() => {
  const parse = (c) => { const m = String(c).match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  const base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const effBg = (el) => { let n = el, acc = null;
    while (n && n.nodeType === 1) { const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a > 0.02) { acc = acc ? over(acc, bg) : bg; if (bg.a >= 0.999) return acc; } n = n.parentElement; }
    return acc && acc.a >= 0.999 ? acc : over(acc || base, base); };
  const out = [];
  document.querySelectorAll('.kit').forEach((k, ki) => {
    const leaf = [...k.querySelectorAll('*')].filter((e) => {
      const txt = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
      return txt.length > 1 && getComputedStyle(e).visibility !== 'hidden' && e.offsetParent !== null;
    });
    const bad = [];
    for (const e of leaf) {
      const cs = getComputedStyle(e);
      const fill = parse(cs.color); if (!fill) continue;
      const bg = effBg(e);
      const fg = fill.a >= 0.999 ? fill : over(fill, bg);
      const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const r = ratio(fg, bg);
      if (r < (large ? 3 : 4.5)) bad.push({ text: e.textContent.trim().slice(0, 30), color: cs.color, bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')', size: cs.fontSize, ratio: +r.toFixed(2) });
    }
    out.push({ i: ki, cls: k.className, minRatio: bad.length ? Math.min(...bad.map((b) => b.ratio)) : null, bad: bad.slice(0, 4), count: bad.length });
  });
  return out;
})()`;

const STRUCTURE_JS = `(() => {
  const out = {};
  const h1s = [...document.querySelectorAll('.bl-sheet h1')];
  out.h1 = { count: h1s.length, text: h1s[0] ? h1s[0].textContent.trim().slice(0, 80) : null, size: h1s[0] ? getComputedStyle(h1s[0]).fontSize : null };
  const lead = document.querySelector('.bl-intro') || document.querySelector('.bl-sheet h1 ~ p:not(.bl-meta)');
  out.lead = { exists: !!lead, len: lead ? lead.textContent.trim().length : 0 };
  out.hero = !!document.querySelector('.bl-sheet .ha, .bl-sheet svg.ha, .bl-hero svg, .bl-sheet .hero-art');
  const body = document.querySelector('.bl-sheet');
  out.raster = body ? { img: body.querySelectorAll('img').length, picture: body.querySelectorAll('picture').length } : { img: 0, picture: 0 };
  // таблицы
  out.tables = [...document.querySelectorAll('.bl-sheet table')].map((t, i) => {
    const wrap = t.closest('.bl-table-wrap, .kit-table-wrap');
    const rows = [...t.querySelectorAll('tr')];
    const cells = rows.flatMap((r) => [...r.querySelectorAll('th,td')]);
    return {
      i,
      rows: rows.length,
      cols: rows[0] ? rows[0].querySelectorAll('th,td').length : 0,
      header: !!t.querySelector('th'),
      emptyCells: cells.filter((c) => !c.textContent.trim() && c.tagName === 'TD').length,
      inWrap: !!wrap,
      minWidth: getComputedStyle(t).minWidth,
      wider: t.scrollWidth > (wrap ? wrap.clientWidth : t.clientWidth) + 2,
    };
  });
  out.kits = [...document.querySelectorAll('.kit')].map((k) => ({
    cls: k.className,
    buttons: k.querySelectorAll('button').length,
    inputs: k.querySelectorAll('input,select,textarea').length,
    links: k.querySelectorAll('a').length,
  }));
  out.faq = { items: document.querySelectorAll('.bl-sheet details').length, summaries: document.querySelectorAll('.bl-sheet details > summary').length };
  const toc = [...document.querySelectorAll('.article-toc a, .bl-toc a')];
  out.toc = {
    links: toc.length,
    broken: toc.filter((a) => { const id = (a.getAttribute('href') || '').replace('#', ''); return id && !document.getElementById(id); }).map((a) => a.getAttribute('href')),
  };
  const cta = document.querySelector('.bl-sheet a[href*="ai.html"], .bl-sheet a[href="#contact"], .bl-sheet a[href*="tel:"]');
  out.cta = cta ? { text: cta.textContent.trim().slice(0, 40), href: cta.getAttribute('href') } : null;
  out.height = document.body.scrollHeight;
  return out;
})()`;

const INTERACT_JS = `(() => {
  const results = [];
  const kits = [...document.querySelectorAll('.kit')];
  return { kits: kits.map((k, i) => ({ i, cls: k.className })) };
})()`;

let exePath = null;
async function withBrowser(fn) {
  // headless-shell периодически падает — поднимаем процесс на каждую статью
  if (!exePath) exePath = await chromium.executablePath();
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const browser = await pw.launch({ executablePath: exePath, args: chromium.args, headless: true });
    try {
      return await fn(browser);
    } catch (e) {
      lastErr = e;
      console.log(`  (попытка ${attempt} сорвалась: ${String(e.message).slice(0, 50)})`);
    } finally {
      try { await browser.close(); } catch (e) {}
    }
  }
  throw lastErr;
}
const report = { base: BASE, at: new Date().toISOString(), articles: [] };

const slugs = fs
  .readdirSync('/home/user/ss-blog/site/dist/blog')
  .filter((f) => f.endsWith('.html') && f !== 'index.html')
  .map((f) => f.replace('.html', ''))
  .filter((s) => (ONLY ? s.includes(ONLY) : true))
  .sort();

for (const slug of slugs) {
  const entry = { slug, problems: [] };
  const consoleErrors = [];
  try {
   await withBrowser(async (browser) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // сетевой шум песочницы (внешние домены вроде Метрики) не считаем дефектом страницы
      if (/ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|net::|favicon/i.test(t)) return;
      consoleErrors.push(t.slice(0, 120));
    });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 120)));
    try {
    await page.goto(`${BASE}/blog/${slug}.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(500);
    entry.structure = await page.evaluate(STRUCTURE_JS);
    const st = entry.structure;

    // 1. первая секция
    if (st.h1.count !== 1) entry.problems.push(`h1: найдено ${st.h1.count}`);
    if (!st.lead.exists || st.lead.len < 80) entry.problems.push(`лид: ${st.lead.exists ? st.lead.len + ' знаков' : 'нет'}`);
    if (st.raster.img || st.raster.picture) entry.problems.push('в статье есть растровая картинка');
    const shot = path.join(SHOTS, `first-${slug}.png`);
    await page.screenshot({ path: shot });
    entry.firstScreenShot = shot;

    // 2. таблицы
    st.tables.forEach((t) => {
      if (!t.inWrap) entry.problems.push(`таблица ${t.i}: нет обёртки (не прокрутится на телефоне)`);
      if (!t.header) entry.problems.push(`таблица ${t.i}: нет <th>`);
      if (t.emptyCells) entry.problems.push(`таблица ${t.i}: пустых ячеек ${t.emptyCells}`);
      if (t.cols < 2) entry.problems.push(`таблица ${t.i}: колонок ${t.cols}`);
    });

    // 3. интерактив: каждый кит должен отвечать на действие
    entry.interactive = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const kits = [...document.querySelectorAll('.kit')];
      for (let i = 0; i < kits.length; i++) {
        const k = kits[i];
        const before = k.innerText.replace(/\s+/g, ' ').trim();
        const beforeClasses = k.className;
        let acted = 0;
        // кликаем по кнопкам (без ссылок)
        const btns = [...k.querySelectorAll('button')].slice(0, 3);
        for (const b of btns) { try { b.click(); acted++; await wait(120); } catch (e) {} }
        // двигаем ползунки/числа
        const inputs = [...k.querySelectorAll('input')].slice(0, 3);
        for (const inp of inputs) {
          try {
            if (inp.type === 'range' || inp.type === 'number') {
              const min = parseFloat(inp.min || '0'), max = parseFloat(inp.max || '100'), step = parseFloat(inp.step || '1');
              inp.value = String(min + step * 2 <= max ? min + step * 2 : max);
            } else if (inp.type === 'checkbox' || inp.type === 'radio') {
              inp.checked = !inp.checked;
            } else {
              inp.value = inp.value ? inp.value + '' : 'тест';
            }
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            acted++;
            await wait(150);
          } catch (e) {}
        }
        await wait(700);
        const after = k.innerText.replace(/\s+/g, ' ').trim();
        out.push({
          i,
          cls: k.className,
          acted,
          responds: before !== after || k.className !== beforeClasses,
          sample: (before.slice(0, 60) + ' → ' + after.slice(0, 60)),
        });
      }
      return out;
    });
    entry.interactive.forEach((k) => {
      if (k.acted === 0) entry.problems.push(`${k.cls}: нет ни кнопок, ни полей`);
      else if (!k.responds) entry.problems.push(`${k.cls}: не отвечает на действия`);
    });

    // 3b. контраст текста внутри каждого кита (включая тёмные блоки)
    entry.kitContrast = await page.evaluate(KIT_CONTRAST_JS);
    entry.kitContrast.forEach((k) => {
      if (k.minRatio !== null && k.minRatio < 4.5) {
        entry.problems.push(`${k.cls}: низкий контраст ${k.minRatio}:1 («${k.bad[0] ? k.bad[0].text : ''}» ${k.bad[0] ? k.bad[0].color : ''} на ${k.bad[0] ? k.bad[0].bg : ''})`);
      }
    });

    // 4. доступность кнопок: имя у кнопки
    const nameless = await page.evaluate(() =>
      [...document.querySelectorAll('.bl-sheet button')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label')).length
    );
    if (nameless) entry.problems.push(`кнопок без доступного имени: ${nameless}`);

    // 5. FAQ
    if (st.faq.items && st.faq.items !== st.faq.summaries) entry.problems.push('FAQ: details без summary');
    if (!st.faq.items) entry.problems.push('FAQ: ни одного раскрывающегося вопроса');

    // 6. оглавление
    if (st.toc.links && st.toc.broken.length) entry.problems.push(`оглавление: битые ссылки ${st.toc.broken.join(', ')}`);

    // 7. мобильный: страница не шире экрана, таблицы прокручиваются
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const mob = await page.evaluate(() => {
      const wrap = [...document.querySelectorAll('.bl-table-wrap')];
      return {
        docW: document.documentElement.scrollWidth,
        winW: window.innerWidth,
        tablesScroll: wrap.map((w) => w.scrollWidth > w.clientWidth + 2),
      };
    });
    entry.mobile = mob;
    if (mob.docW > mob.winW + 2) entry.problems.push(`мобильный: страница шире экрана (${mob.docW} > ${mob.winW})`);
    if (st.tables.length && mob.tablesScroll.some((s) => !s)) entry.problems.push('мобильный: таблица не прокручивается вбок');

    if (consoleErrors.length) entry.problems.push(`ошибки консоли: ${consoleErrors.slice(0, 2).join(' | ')}`);
    } finally { try { await page.close(); } catch (e) {} }
   });
  } catch (e) {
    entry.problems.push('исключение: ' + String(e.message).slice(0, 200));
  }
  entry.consoleErrors = consoleErrors;
  report.articles.push(entry);
  const bad = entry.problems.length;
  console.log(`${slug}: ${bad ? '⚠ ' + bad + ' → ' + entry.problems.join(' | ') : 'ок'}`);
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
}
const total = report.articles.reduce((s, a) => s + a.problems.length, 0);
const kits = report.articles.reduce((s, a) => s + (a.structure ? a.structure.kits.length : 0), 0);
const tables = report.articles.reduce((s, a) => s + (a.structure ? a.structure.tables.length : 0), 0);
console.log(`\nИТОГ: статей ${report.articles.length}, китов ${kits}, таблиц ${tables}, проблем ${total}; отчёт ${JSON_OUT}`);
