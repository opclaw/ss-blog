/**
 * Индекс для поиска по сайту: собирается из готовой сборки (site/dist).
 *
 * Нужен странице 404: человек попал на несуществующий адрес — пусть найдёт нужное
 * поиском, не уходя в поисковик. Данные берутся из того, что реально собралось,
 * поэтому новая статья попадает в индекс сама, руками ничего вести не надо.
 *
 * Что попадает в индекс по каждой странице:
 *   u — адрес, t — title (без «— Smart Solutions»), h — H1,
 *   d — meta description, w — заголовки H2 (для поиска по темам внутри статьи),
 *   s — раздел сайта, k — тип (статья / услуга / кейс / раздел).
 *
 * Запуск: node tools/make-search-index.mjs [dist] [--check]
 *   без аргументов пишет dist/search-index.json;
 *   --check только проверяет, что индекс соответствует сборке (код 1, если устарел).
 *
 * В обычной сборке запускается сам: package.json → "build": astro build && node tools/make-search-index.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const DIST = path.resolve(ROOT, args.find((a) => !a.startsWith('--')) || 'dist');
const OUT = path.join(DIST, 'search-index.json');
/** служебные страницы и подтверждения поисковиков в поиск не берём */
const SKIP = /^(404\.html|(google|yandex)[\w-]*\.html)$/;
/** заголовков H2 у статьи бывает 12–14; в индекс кладём срез — иначе файл пухнет */
const H2_LIMIT = 200;

/**
 * Слова, которыми страницу ищут, но которых нет в тексте буквально: латинские
 * сокращения в заголовках против русской раскладки запроса (Wordstat: «гео продвижение»,
 * «ии агент», «срм»). Пишутся руками — тут их немного, и каждое нужно обосновать.
 */
const ALIASES = {
  '/blog/geo-optimizaciya.html': 'гео продвижение в нейросетях ответы алисы',
  '/blog/ii-v-crm.html': 'срм битрикс24 amocrm интеграция',
  '/blog/ii-dlya-hr.html': 'эйчар кадры рекрутинг подбор персонала',
  '/ai.html': 'искусственный интеллект нейросети аудит пилот',
  '/ai-agenty.html': 'ии агент нейросетевой агент разработка',
};

const SECTION = [
  [/^\/$/, 'Главная', 'раздел'],
  [/^\/services\.html$/, 'Услуги', 'раздел'],
  [/^\/ai\.html$/, 'AI-направление', 'раздел'],
  [/^\/(ai-agenty|avtomatizaciya-prodazh|ii-assistent-dlya-sajta)\.html$/, 'ИИ-услуги', 'услуга'],
  [/^\/cases\//, 'Кейсы', 'кейс'],
  [/^\/blog\/$/, 'Блог', 'раздел'],
  [/^\/blog\//, 'Блог', 'статья'],
];

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'",
  mdash: '—', ndash: '–', laquo: '«', raquo: '»', hellip: '…', times: '×', deg: '°',
  minus: '−', middot: '·', bull: '•', rarr: '→', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
};

function decode(text) {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if (code.startsWith('#')) {
      const num = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function textOf(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function urlOf(rel) {
  const posix = rel.split(path.sep).join('/');
  if (posix === 'index.html') return '/';
  if (posix.endsWith('/index.html')) return '/' + posix.slice(0, -'index.html'.length);
  return '/' + posix;
}

function label(url) {
  for (const [re, section, kind] of SECTION) if (re.test(url)) return { s: section, k: kind };
  return { s: 'Страница', k: 'страница' };
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.html') && !SKIP.test(entry.name)) out.push(full);
  }
  return out;
}

function build() {
  const pages = [];
  for (const file of walk(DIST).sort()) {
    const html = fs.readFileSync(file, 'utf8');
    const url = urlOf(path.relative(DIST, file));
    const title = decode((/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').trim())
      .replace(/\s*[—–-]\s*Smart Solutions\s*$/i, '')
      .trim();
    const h1 = textOf(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '');
    const desc = decode(/<meta\b[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html)?.[1] || '').trim();
    // заголовки разделов собираем по границе: обрезать посреди слова в подсказке некрасиво
    const h2 = [];
    let h2Length = 0;
    for (const line of [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => textOf(m[1]))) {
      if (!line || line.length >= 120) continue;
      if (h2Length + line.length > H2_LIMIT) break;
      h2.push(line);
      h2Length += line.length + 3;
    }
    if (!title && !h1) continue; // битая страница: в индексе ей не место
    pages.push({ u: url, t: title || h1, h: h1, d: desc, w: h2.join(' · '), a: ALIASES[url] || '', ...label(url) });
  }
  return { build: new Date().toISOString().slice(0, 10), pages };
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error(`Нет каталога ${DIST} — сначала соберите сайт: npm run build`);
    process.exit(1);
  }
  const index = build();
  const json = JSON.stringify(index) + '\n';
  const size = Buffer.byteLength(json, 'utf8');
  const kinds = {};
  for (const p of index.pages) kinds[p.k] = (kinds[p.k] || 0) + 1;
  const summary = Object.entries(kinds).map(([k, n]) => `${k}: ${n}`).join(', ');

  if (CHECK) {
    const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (old === json) {
      console.log(`Поисковый индекс актуален: ${index.pages.length} страниц (${summary})`);
      return;
    }
    console.error(`Поисковый индекс устарел — запустите: node tools/make-search-index.mjs ${path.relative(ROOT, DIST) || 'dist'}`);
    process.exit(1);
  }

  fs.writeFileSync(OUT, json, 'utf8');
  console.log(`Поисковый индекс: ${index.pages.length} страниц (${summary}), ${(size / 1024).toFixed(1)} КБ → ${path.relative(ROOT, OUT)}`);
}

main();
