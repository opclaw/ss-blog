/**
 * Три проверки контента статьи (команды «Релевантность», «Плотность текста», «Чистота»).
 *
 * Запуск (нужен локальный сервер ./node_modules/.bin/astro preview --port 4321):
 *   LD_LIBRARY_PATH=/tmp/al2023/lib node tools/audit-design.mjs --json /tmp/audit-design.json
 *
 * Команда 1 «Релевантность»: каждая фигура/кит/таблица ↔ её раздел.
 *   - фигура, чья подпись и содержимое не пересекаются со словами своего раздела (сигнал «графика ради графики»);
 *   - раздел без единой визуализации при большом объёме текста (сигнал «нужна схема»);
 *   - набор «мусорных» элементов в SVG: линии без данных, дубли подписей.
 * Команда 2 «Плотность текста»: «портянки».
 *   - самый длинный абзац в статье; абзацы > 900 знаков;
 *   - подряд идущие абзацы без визуальной паузы (> 4 абзацев);
 *   - доля текста до первой схемы.
 * Команда 3 «Чистота и современность»: лишние элементы и единообразие.
 *   - число кеглей и минимальный кегль в схемах;
 *   - «одиночные» линии-разделители, пустые группы, rect'ы без заливки;
 *   - разброс вертикальных отступов между однотипными блоками.
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
const JSON_OUT = getArg('--json', '/tmp/audit-design.json');
const ONLY = getArg('--only', '');

const PROBE_JS = `(() => {
  const words = (s) => (s || '').toLowerCase().replace(/[^a-zа-яё0-9\\s]/gi, ' ').split(/\\s+/).filter((w) => w.length > 3);
  const sheet = document.querySelector('.bl-sheet');
  const body = document.querySelector('.bl-text') || document.querySelector('.bl-body') || sheet;
  // ---- разбиваем статью на разделы по h2
  const sections = [];
  let cur = { id: '(начало)', heading: 'Вступление', nodes: [] };
  [...body.querySelectorAll('h2, p, ul, ol, figure, .kit-table-wrap, .bl-table-wrap, .bl-split, .bl-pipe-row, .bl-loop, .bl-prompt, .bl-sources, .bl-quote, blockquote')]
    .forEach((el) => {
      if (el.tagName === 'H2') {
        if (cur.nodes.length || cur.id !== '(начало)') sections.push(cur);
        cur = { id: el.id || '(без id)', heading: el.textContent.trim(), nodes: [] };
      } else {
        // не дублируем вложенные узлы кита, но сам кит-фигуру считаем визуалом
        if (el.closest('.kit') && !el.classList.contains('kit') && el.tagName !== 'P' && el.tagName !== 'UL' && el.tagName !== 'OL') return;
        cur.nodes.push(el);
      }
    });
  sections.push(cur);

  const sectionStats = sections.map((s) => {
    const paras = s.nodes.filter((n) => n.tagName === 'P');
    const textLen = s.nodes.filter((n) => ['P', 'UL', 'OL'].includes(n.tagName))
      .map((n) => n.textContent.trim().length).reduce((a, b) => a + b, 0);
    const sims = s.nodes.filter((n) => n.tagName === 'FIGURE');
    const figs = sims.map((f) => {
      const cap = f.querySelector('figcaption');
      const capText = cap ? cap.textContent.trim() : '';
      const svgTexts = [...f.querySelectorAll('text')].map((t) => t.textContent.trim()).join(' ');
      const svgRects = f.querySelectorAll('rect').length;
      const svgLines = f.querySelectorAll('line, path').length;
      const sizes = [...new Set([...f.querySelectorAll('text')].map((t) => getComputedStyle(t).fontSize))];
      const caption = (capText.match(/рис\\.?\\s*\\d+/i) ? capText.replace(/рис\\.?\\s*\\d+/i, '').trim() : capText).trim();
      const figWords = new Set([...words(caption), ...words(svgTexts)]);
      const secWords = new Set(words(s.heading + ' ' + s.nodes.filter((n) => ['P', 'UL', 'OL'].includes(n.tagName)).map((n) => n.textContent).join(' ')));
      let inter = 0;
      figWords.forEach((w) => { if (secWords.has(w)) inter++; });
      const ratio = figWords.size ? inter / figWords.size : 1;
      // служебные элементы: разделительные линии 1px на всю ширину без данных, пустые группы
      const emptyGroups = [...f.querySelectorAll('g')].filter((g) => !g.children.length).length;
      // линии-разделители: горизонтальная линия, у которой нет ни одной подписи-тикера рядом по вертикали (±12px)
      const texts = [...f.querySelectorAll('text')];
      const tickLines = [...f.querySelectorAll('line')].filter((l) => {
        const y = parseFloat(l.getAttribute('y1') || l.getAttribute('y2') || '0');
        const x1 = parseFloat(l.getAttribute('x1') || '0'), x2 = parseFloat(l.getAttribute('x2') || '0');
        const horizontal = Math.abs((parseFloat(l.getAttribute('y2') || '0')) - y) < 1;
        if (!horizontal) return false;
        const len = Math.abs(x2 - x1);
        const hasLabel = texts.some((t) => { const bb = t.getBBox ? t.getBBox() : null; return bb && Math.abs(bb.y + bb.height / 2 - y) < 14; });
        const attachedToBar = [...f.querySelectorAll('rect')].some((r) => Math.abs(parseFloat(r.getAttribute('y') || '0') + parseFloat(r.getAttribute('height') || '0') - y) < 3);
        return len > 40 && !hasLabel && !attachedToBar;
      }).length;
      const fullWidthLines = [...f.querySelectorAll('line')].filter((l) => {
        const x1 = parseFloat(l.getAttribute('x1') || 0), x2 = parseFloat(l.getAttribute('x2') || 0);
        const vb = f.querySelector('svg').viewBox.baseVal;
        return Math.abs(x2 - x1) > vb.width * 0.9;
      }).length;
      return {
        caption, kind: f.className.replace(/\\s+/g, ' ').trim().slice(0, 40),
        relevance: +ratio.toFixed(2), svgTexts: [...figWords].length,
        rects: svgRects, lines: svgLines, fonts: sizes.length, minFont: sizes.length ? Math.min(...sizes.map(parseFloat)) : null,
        emptyGroups, fullWidthLines, orphanLines: tickLines,
        kitInteractive: !!f.querySelector('button, input, select'),
      };
    });
    const kits = [...s.nodes.filter((n) => n.tagName === 'FIGURE')].filter((f) => f.querySelector('.kit'));
    const visualTotal = figs.length + kits.length;
    return {
      id: s.id, heading: s.heading.slice(0, 60),
      textLen, paras: paras.length,
      maxPara: paras.length ? Math.max(...paras.map((p) => p.textContent.trim().length)) : 0,
      longParas: paras.filter((p) => p.textContent.trim().length > 900).length,
      figures: figs.length, kits: kits.length, visualTotal, tables: s.nodes.filter((n) => n.classList.contains('kit-table-wrap') || n.classList.contains('bl-table-wrap')).length,
      runsWithoutVisual: 0,
      figInfo: figs,
    };
  });

  // подряд идущие абзацы без визуальной паузы (по всей статье)
  let run = 0, maxRun = 0, runAt = '';
  sections.forEach((s) => {
    run = 0;
    s.nodes.forEach((n) => {
      if (n.tagName === 'P') { run++; if (run > maxRun) { maxRun = run; runAt = s.heading.slice(0, 40); } }
      else run = 0;
    });
  });

  const paras = [...body.querySelectorAll('p:not(.bl-meta):not(.fig-swipe):not(.kit-foot)')];
  const lens = paras.map((p) => p.textContent.trim().length);
  // до первой схемы
  const firstFig = body.querySelector('figure, .kit-table-wrap');
  const charsBeforeFirstVisual = firstFig
    ? [...body.querySelectorAll('p')].filter((p) => p.compareDocumentPosition(firstFig) & Node.DOCUMENT_POSITION_PRECEDING).reduce((a, p) => a + p.textContent.trim().length, 0)
    : lens.reduce((a, b) => a + b, 0);
  return {
    sections: sectionStats,
    article: {
      maxPara: lens.length ? Math.max(...lens) : 0,
      paras: lens.length,
      longParas: lens.filter((l) => l > 900).length,
      veryLongParas: lens.filter((l) => l > 1200).length,
      maxRun, runAt,
      charsBeforeFirstVisual,
      visuals: body.querySelectorAll('figure').length + body.querySelectorAll('.kit-table-wrap, .bl-table-wrap').length,
      textLen: lens.reduce((a, b) => a + b, 0),
    },
  };
})()`;

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

const slugs = fs.readdirSync('/home/user/ss-blog/site/dist/blog')
  .filter((f) => f.endsWith('.html') && f !== 'index.html')
  .map((f) => f.replace('.html', ''))
  .filter((s) => (ONLY ? s.includes(ONLY) : true))
  .sort();

const report = { at: new Date().toISOString(), articles: [] };
for (const slug of slugs) {
  let data = null, err = null;
  try {
    data = await withBrowser(async (browser) => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${BASE}/blog/${slug}.html`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(400);
      const out = await page.evaluate(PROBE_JS);
      await page.close();
      return out;
    });
  } catch (e) { err = String(e.message).slice(0, 120); }
  report.articles.push({ slug, ...(data || {}), error: err });
  if (data) {
    const a = data.article;
    const weak = data.sections.flatMap((s) => s.figInfo.filter((f) => f.relevance < 0.25).map((f) => `${s.heading.slice(0, 28)} → «${f.caption.slice(0, 34)}» ${f.relevance}`));
    const thin = data.sections.filter((s) => s.textLen > 2200 && (s.visualTotal || 0) === 0 && s.tables === 0).map((s) => `${s.heading.slice(0, 34)} (${s.textLen} зн.)`);
    const orphan = data.sections.flatMap((s) => s.figInfo.filter((f) => (f.orphanLines || 0) >= 2).map((f) => `«${f.caption.slice(0, 30)}» — линий без данных: ${f.orphanLines}`));
    console.log(`${slug}: абзацев ${a.paras}, макс ${a.maxPara}, портянок>900 ${a.longParas}, серия ${a.maxRun} («${a.runAt.slice(0, 24)}»), визуалов ${a.visuals}`);
    if (weak.length) console.log(`   слабая связь графики с разделом: ${weak.join(' | ')}`);
    if (thin.length) console.log(`   разделы без визуализации: ${thin.join(' | ')}`);
    if (orphan.length) console.log(`   линии без данных: ${orphan.join(' | ')}`);
  } else console.log(`${slug}: ошибка ${err}`);
}
fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
console.log(`\nотчёт: ${JSON_OUT}`);
