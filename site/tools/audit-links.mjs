#!/usr/bin/env node
/**
 * Карта внутренних ссылок сайта (команда 2, проход 0).
 *
 * Строит граф ссылок из сборки site/dist и печатает:
 *   1) страницы-сироты (нет входящих ссылок из контента);
 *   2) глубину от «/» до каждой страницы (BFS по контенту);
 *   3) ссылки на несуществующие адреса и на /404.html;
 *   4) слабые анкоры («здесь», «подробнее», «читать» …);
 *   5) путь к деньгам: у каждой статьи — есть ли исходящая ссылка на /services.html,
 *      /ai.html, контакты или мессенджеры;
 *   6) для посадочных — сколько входящих ссылок (минимум 2 по заданию захода).
 *
 * Запуск:
 *   node site/tools/audit-links.mjs              # отчёт в консоль
 *   node site/tools/audit-links.mjs --json /tmp/links.json
 *   node site/tools/audit-links.mjs --md deliverables/LINKS-MAP-2026-10.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = process.env.DIST || path.join(ROOT, 'dist');

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const JSON_OUT = arg('--json');
const MD_OUT = arg('--md');

const VERIFY = /^(google|yandex)[\w-]*\.html$/;
const SERVICE = new Set(['404.html']);
const WEAK_ANCHORS = ['здесь', 'тут', 'подробнее', 'подробней', 'читать', 'далее', 'сюда', 'по ссылке', 'узнать больше', 'смотреть'];
const MONEY = [/^\/services\.html$/, /^\/ai\.html$/, /^#contacts$/, /^\/#contacts$/, /^\/index\.html$/, /^tel:/, /^mailto:/, /^https:\/\/t\.me\//, /^https:\/\/wa\.me\//];

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

// адрес страницы в терминах сайта: 'blog/index.html', 'services.html'
const pageId = (file) => path.relative(DIST, file).split(path.sep).join('/');

function normalizeHref(href, fromPage) {
  if (!href) return null;
  href = href.trim();
  if (/^(mailto:|tel:|javascript:)/i.test(href)) return href;
  if (/^https?:\/\//i.test(href)) return href; // внешние — вернём как есть, отфильтруем ниже
  if (href.startsWith('#')) return href;
  // относительный путь → абсолютный от корня сайта, затем к виду pageId (без ведущего слэша)
  let abs;
  if (href.startsWith('/')) abs = href.slice(1);
  else {
    const dir = path.posix.dirname(fromPage);
    abs = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, href));
  }
  if (abs.startsWith('..')) abs = abs.replace(/^(\.\.\/)+/, '');
  const [pathPart, frag] = abs.split('#');
  let clean = pathPart;
  if (clean === '' || clean.endsWith('/')) clean += 'index.html';
  clean = clean.replace(/\/index\.html$/, '/index.html');
  return frag ? `${clean}#${frag}` : clean;
}

const files = walk(DIST).filter((f) => !VERIFY.test(path.basename(f)));
const pages = files.map(pageId).sort();
const pageSet = new Set(pages);

const graph = new Map();     // page -> Set(targets) — только контент (без header/nav/footer)
const graphAll = new Map();  // page -> Set(targets) — все ссылки, включая хром
const incoming = new Map(pages.map((p) => [p, []]));
const broken = []; // {from, href, resolved}
const to404 = [];
const weak = []; // {from, anchor, href}
const external = [];

function extractLinks(html, rel) {
  const targets = new Set();
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const rawHref = m[1];
    const anchor = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^https?:\/\//i.test(rawHref)) {
      if (!rawHref.includes('smartsolutions.today')) external.push({ from: rel, href: rawHref });
      continue;
    }
    if (/^(mailto:|tel:)/i.test(rawHref)) continue;
    const resolved = normalizeHref(rawHref, rel);
    if (!resolved || resolved.startsWith('#')) continue;
    const pathPart = resolved.split('#')[0];
    if (pathPart === '404.html') { to404.push({ from: rel, href: rawHref }); continue; }
    targets.add(resolved);
    if (!pageSet.has(pathPart) && pathPart !== '') broken.push({ from: rel, href: rawHref, resolved: pathPart });
    if (WEAK_ANCHORS.includes(anchor.toLowerCase())) weak.push({ from: rel, anchor, href: rawHref });
  }
  return targets;
}

for (const rel of pages) {
  const html = fs.readFileSync(path.join(DIST, rel), 'utf8');
  const contentOnly = html
    .replace(/<head[\s\S]*?<\/head>/i, ' ')
    .replace(/<header[\s\S]*?<\/header>/i, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/i, ' ');
  graph.set(rel, extractLinks(contentOnly, rel));
  graphAll.set(rel, extractLinks(html, rel));
  for (const t of graphAll.get(rel)) {
    const p = t.split('#')[0];
    if (pageSet.has(p)) incoming.get(p).push(rel);
  }
}

// глубина от главной по всем ссылкам (включая подвал/меню — оттуда ходят люди)
const depth = new Map([['index.html', 0]]);
let queue = ['index.html'];
while (queue.length) {
  const next = [];
  for (const cur of queue) {
    for (const t of graphAll.get(cur) || []) {
      const p = t.split('#')[0];
      if (!pageSet.has(p) || depth.has(p)) continue;
      depth.set(p, depth.get(cur) + 1);
      next.push(p);
    }
  }
  queue = next;
}

// сироты: страница, на которую нигде нет ссылок (ни в контенте, ни в подвале)
const orphans = pages.filter((p) => p !== 'index.html' && (incoming.get(p) || []).length === 0);
const unreachable = pages.filter((p) => !depth.has(p));
const articles = pages.filter((p) => p.startsWith('blog/') && p !== 'blog/index.html');
const landings = ['ai-agenty.html', 'avtomatizaciya-prodazh.html', 'ii-assistent-dlya-sajta.html'];

const articleToMoney = new Map();
for (const a of articles) {
  const targets = [...(graph.get(a) || [])];
  const money = targets.filter((t) => MONEY.some((r) => r.test('/' + t.split('#')[0])));
  articleToMoney.set(a, money);
}

const report = {
  pages: pages.length,
  orphans,
  unreachable,
  weakAnchors: weak,
  broken,
  to404,
  depth: Object.fromEntries([...depth.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))),
  incoming: Object.fromEntries(pages.map((p) => [p, [...new Set(incoming.get(p) || [])]])),
  articlesWithoutMoney: [...articleToMoney.entries()].filter(([, m]) => m.length === 0).map(([a]) => a),
  landingIncoming: Object.fromEntries(landings.map((l) => [l, [...new Set(incoming.get(l) || [])]])),
};

// ---- печать ----
console.log(`Страниц: ${pages.length}`);
console.log(`\nСироты (0 входящих): ${orphans.length ? orphans.join(', ') : 'нет'}`);
console.log(`Недостижимые от главной: ${unreachable.length ? unreachable.join(', ') : 'нет'}`);
console.log(`\nГлубина от главной:`);
const byDepth = {};
for (const [p, d] of Object.entries(report.depth)) (byDepth[d] ||= []).push(p);
for (const d of Object.keys(byDepth).sort((x, y) => x - y)) {
  console.log(`  ${d} клик(ов): ${byDepth[d].length} стр.${d <= 1 ? ' — ' + byDepth[d].join(', ') : ''}`);
}
console.log(`\nСлабые анкоры: ${weak.length ? '' : 'нет'}`);
weak.slice(0, 10).forEach((w) => console.log(`  «${w.anchor}» → ${w.href} (на ${w.from})`));
console.log(`\nБитые ссылки: ${broken.length ? '' : 'нет'}`);
broken.slice(0, 10).forEach((b) => console.log(`  ${b.from} → ${b.href} (нет файла ${b.resolved})`));
console.log(`\nСсылки на /404.html: ${to404.length ? to404.map((x) => x.from).join(', ') : 'нет'}`);
console.log(`\nСтатей без ссылки в деньги: ${report.articlesWithoutMoney.length ? report.articlesWithoutMoney.join(', ') : 'нет'}`);
console.log(`\nВходящие ссылки на посадочные:`);
for (const [l, list] of Object.entries(report.landingIncoming)) console.log(`  ${l}: ${list.length} — ${list.slice(0, 8).join(', ')}`);

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
  console.log(`\njson: ${JSON_OUT}`);
}
if (MD_OUT) {
  const L = [];
  L.push('# Карта внутренних ссылок (автоматическая выгрузка)', '',
    `Источник: \`site/tools/audit-links.mjs\` по сборке \`site/dist\`. Страниц: ${pages.length}.`, '');
  L.push('## Сироты и достижимость', '',
    `- сироты: ${orphans.length ? orphans.join(', ') : 'нет'}`,
    `- недостижимые от главной: ${unreachable.length ? unreachable.join(', ') : 'нет'}`, '');
  L.push('## Глубина от главной', '');
  for (const d of Object.keys(byDepth).sort((x, y) => x - y)) {
    L.push(`- ${d} клик(ов): ${byDepth[d].join(', ')}`);
  }
  L.push('', '## Входящие ссылки на посадочные', '');
  for (const [l, list] of Object.entries(report.landingIncoming)) L.push(`- **${l}** (${list.length}): ${list.join(', ')}`);
  L.push('', '## Слабые анкоры', '');
  if (!weak.length) L.push('- нет');
  else for (const w of weak) L.push(`- «${w.anchor}» → ${w.href} (на ${w.from})`);
  L.push('', '## Битые ссылки и ссылки на 404', '');
  if (!broken.length && !to404.length) L.push('- нет');
  else { for (const b of broken) L.push(`- битая: ${b.from} → ${b.href}`); for (const t of to404) L.push(`- на 404: ${t.from} → ${t.href}`); }
  L.push('', '## Статьи без ссылки в деньги', '');
  L.push(report.articlesWithoutMoney.length ? report.articlesWithoutMoney.map((a) => `- ${a}`).join('\n') : '- нет');
  L.push('', '## Полный граф входящих', '');
  for (const [p, list] of Object.entries(report.incoming)) L.push(`- ${p}: ${list.length ? list.join(', ') : '—'}`);
  fs.writeFileSync(MD_OUT, L.join('\n') + '\n');
  console.log(`md: ${MD_OUT}`);
}
