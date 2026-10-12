/**
 * Проверка страницы 404 и её поиска по сайту.
 *
 * Страница 404 — это интерактив, который легко «сломать молча»: поиск живёт на
 * отдельном файле-индексе (dist/search-index.json), подсказка «возможно, вы искали»
 * зависит от адреса в строке браузера, а без JavaScript страница обязана остаться рабочей.
 * Поэтому кроме статичных проверок разметки здесь прогоняются сценарии в jsdom:
 *
 *   1. разметка: noindex + follow, нет canonical, один H1, ни одна страница сайта
 *      не ссылается на /404.html, самой 404 нет в sitemap;
 *   2. индекс: одна запись на каждую страницу сборки (кроме 404 и подтверждений поисковиков);
 *   3. поиск: запросы «кадры», «продажи», «гео» находят свои страницы, все найденные
 *      ссылки ведут на существующие страницы;
 *   4. «возможно, вы искали»: опечатка в адресе (/blog/ii-dlya-prodazhi.html) даёт
 *      подсказку со ссылкой на /blog/ii-dlya-prodazh.html;
 *   5. адрес из строки браузера виден и попадает в письмо «сообщить о битой ссылке»;
 *   6. деградация: если индекс не отдаётся, поиск отключается, но страница работает;
 *   7. без JavaScript: поиск скрыт, маршруты и контакты на месте.
 *
 * Запуск (из site/):  node tools/check-404.mjs [dist]
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const distDir = process.argv[2] || 'dist';
const errors = [];
const checks = [];
const ok = (name) => checks.push(name);
const fail = (name, why) => { errors.push(`${name}: ${why}`); };

const page404 = path.join(distDir, '404.html');
if (!fs.existsSync(page404)) {
  console.error(`✗ нет ${page404} — сначала сборка (npm run build)`);
  process.exit(1);
}
const html = fs.readFileSync(page404, 'utf8');

const indexPath = path.join(distDir, 'search-index.json');
if (!fs.existsSync(indexPath)) {
  console.error(`✗ нет ${indexPath} — индекс собирается командой: node tools/make-search-index.mjs`);
  process.exit(1);
}
const indexRaw = fs.readFileSync(indexPath, 'utf8');
const index = JSON.parse(indexRaw);

/* --- 1. разметка страницы --- */
function staticChecks() {
  if (!/<meta name="robots" content="noindex, follow">/.test(html)) fail('разметка', 'нет noindex + follow');
  else ok('noindex + follow');

  if (/rel="canonical"/.test(html)) fail('разметка', 'на 404 выведен canonical — он бессмыслен, ссылки на неё быть не должно');
  else ok('canonical отсутствует');

  const h1 = html.match(/<h1\b[^>]*>/g) || [];
  if (h1.length !== 1) fail('разметка', `H1 — ${h1.length} шт., нужен ровно один`);
  else ok('один H1');

  const sitemap = path.join(distDir, 'sitemap.xml');
  const sitemapText = fs.existsSync(sitemap) ? fs.readFileSync(sitemap, 'utf8') : '';
  if (/404\.html/.test(sitemapText)) fail('разметка', '404.html попала в sitemap.xml');
  else ok('404 отсутствует в sitemap.xml');

  const linkedFrom = [];
  for (const file of walk(distDir)) {
    const rel = path.relative(distDir, file).split(path.sep).join('/');
    if (rel === '404.html') continue;
    if (/href="[^"]*404\.html/.test(fs.readFileSync(file, 'utf8'))) linkedFrom.push(rel);
  }
  if (linkedFrom.length) fail('разметка', `на /404.html ссылаются страницы: ${linkedFrom.join(', ')}`);
  else ok('на 404.html никто не ссылается');
}

/* --- 2. индекс: одна запись на страницу сборки --- */
const SERVICE = /^(404\.html|(google|yandex)[\w-]*\.html)$/;
function urlOf(file) {
  const posix = path.relative(distDir, file).split(path.sep).join('/');
  if (posix === 'index.html') return '/';
  if (posix.endsWith('/index.html')) return '/' + posix.slice(0, -'index.html'.length);
  return '/' + posix;
}
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.html') && !SERVICE.test(entry.name)) out.push(full);
  }
  return out;
}
function indexChecks() {
  const pages = walk(distDir).map(urlOf).sort();
  const indexed = index.pages.map((p) => p.u).sort();
  const missing = pages.filter((u) => !indexed.includes(u));
  const extra = indexed.filter((u) => !pages.includes(u));
  if (missing.length) fail('индекс', `нет страниц: ${missing.join(', ')}`);
  if (extra.length) fail('индекс', `лишние адреса: ${extra.join(', ')}`);
  if (!missing.length && !extra.length) ok(`индекс: ${indexed.length} страниц = все страницы сборки`);
  for (const p of index.pages) {
    if (!p.t || !p.u) { fail('индекс', `запись без названия или адреса: ${JSON.stringify(p)}`); break; }
  }
}

/* --- браузерные сценарии --- */
function load(url, { withFetch = true, withScripts = true } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => fail('консоль', e.message.split('\n')[0]));
  const dom = new JSDOM(html, {
    url,
    runScripts: withScripts ? 'dangerously' : 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      if (withFetch) {
        window.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(indexRaw)) });
      }
    },
  });
  return dom;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
}

async function searchChecks() {
  const dom = load('https://smartsolutions.today/zabytaya-stranica.html');
  await tick();
  const w = dom.window;
  const d = w.document;
  const input = d.getElementById('e404-input');

  if (!input || d.getElementById('e404-search').hidden) fail('разметка', 'поиск не раскрылся (скрыт атрибутом hidden)');
  else ok('поиск раскрыт скриптом');

  const pathBox = d.getElementById('e404-path');
  if (pathBox.hidden || !/zabytaya-stranica/.test(d.getElementById('e404-path-value').textContent)) {
    fail('адрес', 'запрошенный адрес не показан');
  } else ok('показан запрошенный адрес');

  const report = d.getElementById('e404-report');
  if (!report || !/^mailto:/.test(report.getAttribute('href')) || !/zabytaya-stranica/.test(decodeURIComponent(report.getAttribute('href')))) {
    fail('отчёт', 'ссылка «сообщить о битой ссылке» без адреса страницы');
  } else ok('письмо о битой ссылке содержит адрес');

  const expect = [
    ['кадры', '/blog/ii-dlya-hr.html'],
    ['продажи', '/blog/ii-dlya-prodazh.html'],
    ['гео', '/blog/geo-optimizaciya.html'],
    ['стоимость внедрения', '/blog/skolko-stoit-vnedrenie-ii.html'],
  ];
  for (const [query, wanted] of expect) {
    type(input, query);
    const links = [...d.getElementById('e404-results').querySelectorAll('a')].map((a) => a.getAttribute('href'));
    if (!links.length) fail('поиск', `запрос «${query}» — ничего не найдено`);
    else if (!links.includes(wanted)) fail('поиск', `запрос «${query}» — нет ${wanted} (нашлось: ${links.slice(0, 4).join(', ')})`);
    else ok(`поиск «${query}» → ${wanted}`);
  }

  type(input, 'кадры');
  const status = d.getElementById('e404-status').textContent;
  if (!/Найдено/.test(status)) fail('поиск', `состояние не сообщает о количестве результатов: «${status}»`);
  else ok('результаты объявляются через role=status');

  type(input, 'еуыефваыва');
  if (d.getElementById('e404-empty').hidden) fail('поиск', 'пустая выдача не показала подсказку «ничего не нашлось»');
  else ok('пустая выдача сообщает об этом');

  type(input, 'ии');
  const found = [...d.getElementById('e404-results').querySelectorAll('a')].map((a) => a.getAttribute('href'));
  const broken = found.filter((h) => h && h.startsWith('/') && !fs.existsSync(path.join(distDir, h === '/' ? 'index.html' : h.slice(1))));
  if (broken.length) fail('поиск', `результаты ведут на несуществующие адреса: ${broken.join(', ')}`);
  else ok(`ссылки из поиска существуют (${found.length} шт. на запрос «ии»)`);

  w.close();
}

async function typoChecks() {
  const dom = load('https://smartsolutions.today/blog/ii-dlya-prodazhi.html');
  await tick();
  const d = dom.window.document;
  const suggest = d.getElementById('e404-suggest');
  const links = [...suggest.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  if (suggest.hidden) fail('подсказка', 'опечатка в адресе не дала блока «возможно, вы искали»');
  else if (!links.includes('/blog/ii-dlya-prodazh.html')) fail('подсказка', `в подсказке нет /blog/ii-dlya-prodazh.html (есть: ${links.join(', ')})`);
  else ok('«возможно, вы искали» → /blog/ii-dlya-prodazh.html');
  dom.window.close();
}

async function degradeChecks() {
  const dom = load('https://smartsolutions.today/blog/ii-dlya-prodazhi.html', { withFetch: false });
  await tick();
  const d = dom.window.document;
  const input = d.getElementById('e404-input');
  if (!input.disabled) fail('деградация', 'без индекса поиск остался включённым');
  else ok('без индекса поиск отключается');
  if (!/недоступен/i.test(d.getElementById('e404-search-hint').textContent)) fail('деградация', 'подсказка не сообщает о недоступности поиска');
  else ok('подсказка сообщает о недоступности поиска');
  if (!d.querySelectorAll('.e404-card').length) fail('деградация', 'маршруты на странице пропали');
  else ok('маршруты на странице остались');
  dom.window.close();
}

function noJsChecks() {
  const dom = load('https://smartsolutions.today/blog/ii-dlya-prodazhi.html', { withScripts: false });
  const d = dom.window.document;
  if (!d.getElementById('e404-search').hidden) fail('без JS', 'поиск показан без JavaScript — он не работает');
  else ok('без JS поиск скрыт');
  const links = [...d.querySelectorAll('.e404-block a')].map((a) => a.getAttribute('href'));
  if (links.length < 8) fail('без JS', `статичных маршрутов всего ${links.length}`);
  else ok(`без JS работает ${links.length} маршрутов`);
  const broken = links.filter((h) => h && h.startsWith('/') && !h.includes('#') && !fs.existsSync(path.join(distDir, h.slice(1))));
  if (broken.length) fail('без JS', `маршруты ведут в никуда: ${broken.join(', ')}`);
  dom.window.close();
}

staticChecks();
indexChecks();
await searchChecks();
await typoChecks();
await degradeChecks();
noJsChecks();

console.log('Проверка страницы 404:');
for (const c of checks) console.log(`  ✓ ${c}`);
if (errors.length) {
  console.log(`\nОШИБКИ (${errors.length}):`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`\nИТОГ: OK (проверок: ${checks.length})`);
