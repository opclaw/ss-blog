/**
 * Текст внутри фигур: не вылезает ли подпись за границы трапеции, рамки или круга.
 * Жалоба владельца 2026-09-28: «фраза не помещается в секцию» в воронках и в шапках статей.
 *
 * Запуск: LD_LIBRARY_PATH=/tmp/al2023/lib node tools/audit-figtext.mjs [--only slug] [--json /tmp/audit-figtext.json]
 */
import fs from 'node:fs';
import { sitePages } from './pages.mjs';
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
const JSON_OUT = getArg('--json', '/tmp/audit-figtext.json');
const ONLY = getArg('--only', '');

// Внутри какой фигуры лежит текст: берём ближайшую фигуру, центр которой выше центра текста
// не более чем на 120px и которая горизонтально накрывает текст.
const SCAN = `(() => {
  const out = [];
  const figs = [...document.querySelectorAll('svg.fig-svg, [data-hero] svg')];
  for (const svg of figs) {
    const paths = [...svg.querySelectorAll('polygon')].map((p) => ({ kind: 'polygon', pts: p.getAttribute('points').trim().split(/\\s+/).map((s) => s.split(',').map(Number)), el: p }));
    const rects = [...svg.querySelectorAll('rect')].map((r) => ({ kind: 'rect', x: +r.getAttribute('x') || 0, y: +r.getAttribute('y') || 0, w: +r.getAttribute('width') || 0, h: +r.getAttribute('height') || 0, el: r }));
    const circles = [...svg.querySelectorAll('circle')].map((c) => ({ kind: 'circle', cx: +c.getAttribute('cx') || 0, cy: +c.getAttribute('cy') || 0, r: +c.getAttribute('r') || 0, el: c }));
    const shapes = [...paths, ...rects, ...circles].filter((s) => (s.kind !== 'rect' || (s.w > 40 && s.h > 20)) && (s.kind !== 'circle' || s.r > 10));
    const widthAt = (s, y) => {
      if (s.kind === 'rect') return y >= s.y && y <= s.y + s.h ? [s.x, s.x + s.w] : null;
      if (s.kind === 'circle') { const dy = Math.abs(y - s.cy); return dy >= s.r ? null : [s.cx - Math.sqrt(s.r * s.r - dy * dy), s.cx + Math.sqrt(s.r * s.r - dy * dy)]; }
      const top = s.pts[0][1], bottom = s.pts[3] ? s.pts[3][1] : s.pts[2][1];
      if (y < top - 0.5 || y > bottom + 0.5) return null;
      const t = bottom === top ? 0 : (y - top) / (bottom - top);
      const topW = [s.pts[0][0], s.pts[1][0]].sort((a, b) => a - b);
      const botW = [(s.pts[3] || s.pts[2])[0], (s.pts[2] || s.pts[3])[0]].sort((a, b) => a - b);
      return [topW[0] + (botW[0] - topW[0]) * t, topW[1] + (botW[1] - topW[1]) * t];
    };
    for (const t of svg.querySelectorAll('text')) {
      const txt = (t.textContent || '').trim();
      if (!txt) continue;
      let b; try { b = t.getBBox(); } catch (e) { continue; }
      if (!b.width) continue;
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      // ищем фигуру, накрывающую центр текста
      const host = shapes
        .map((s) => ({ s, w: widthAt(s, cy) }))
        .filter((x) => x.w && cx >= x.w[0] - 1 && cx <= x.w[1] + 1)
        .sort((a, b2) => (b2.w[1] - b2.w[0]) - (a.w[1] - a.w[0]))[0];
      if (!host) continue;                       // текст на свободном поле — не наша забота
      const [l, r] = host.w;
      const overL = l - b.x, overR = (b.x + b.width) - r;
      if (overL > 2 || overR > 2) {
        out.push({ фигура: host.s.kind, текст: txt.slice(0, 46), вылезаетСлева: Math.round(overL), вылезаетСправа: Math.round(overR), ширинаТекста: Math.round(b.width), доступноШирины: Math.round(r - l) });
      }
    }
  }
  return out;
})()`;

let exePath = null;
async function withBrowser(fn) {
  if (!exePath) exePath = await chromium.executablePath();
  const browser = await pw.launch({ executablePath: exePath, args: chromium.args, headless: true });
  try { return await fn(browser); } finally { try { await browser.close(); } catch (e) {} }
}

const pages = sitePages().filter((p) => (ONLY ? p.includes(ONLY) : true));

const report = { at: new Date().toISOString(), pages: [] };
let total = 0;
for (const page of pages) {
  try {
    const res = await withBrowser(async (browser) => {
      const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await p.goto(`${BASE}/${page}`, { waitUntil: 'load', timeout: 30000 });
      await p.waitForTimeout(500);
      await p.evaluate(async () => { const st = innerHeight; for (let y = 0; y < document.body.scrollHeight; y += st) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } scrollTo(0, 0); });
      await p.waitForTimeout(200);
      const d = await p.evaluate(SCAN);
      await p.close();
      return d;
    });
    total += res.length;
    report.pages.push({ page, problems: res });
    if (res.length) for (const x of res) console.log(`${page}: «${x.текст}» — вылезает слева ${x.вылезаетСлева}px, справа ${x.вылезаетСправа}px (текст ${x.ширинаТекста}, доступно ${x.доступноШирины})`);
  } catch (e) {
    console.log(`${page}: ошибка ${String(e.message).slice(0, 70)}`);
    report.pages.push({ page, error: String(e.message).slice(0, 120) });
  }
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
}
console.log(total ? `\nИТОГО: текстов за границами фигур — ${total}; отчёт ${JSON_OUT}` : `\nИТОГО: текст не вылезает за фигуры; отчёт ${JSON_OUT}`);
