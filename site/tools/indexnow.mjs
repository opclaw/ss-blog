#!/usr/bin/env node
// Уведомление поисковых систем по протоколу IndexNow: Яндекс и Bing узнают об URL сразу,
// не дожидаясь планового обхода. Google IndexNow не поддерживает — для него sitemap + Search Console.
//
//   node tools/indexnow.mjs                 # сухой прогон: показывает, что будет отправлено
//   node tools/indexnow.mjs --send          # отправить все URL из dist/sitemap.xml
//   node tools/indexnow.mjs --send --url https://smartsolutions.today/blog/ii-dlya-prodazh.html
//
// Ключ лежит в public/<ключ>.txt (имя файла = ключ) и попадает в сборку вместе с остальными файлами.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.SITE_HOST || 'smartsolutions.today';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const YANDEX = 'https://yandex.com/indexnow';

const keyFile = readdirSync(join(ROOT, 'public')).find((f) => /^[0-9a-f]{16,128}\.txt$/.test(f));
if (!keyFile) {
  console.error('✗ Не найден файл ключа IndexNow в public/ (ожидается вида <ключ>.txt)');
  process.exit(1);
}
const key = readFileSync(join(ROOT, 'public', keyFile), 'utf8').trim();

const args = process.argv.slice(2);
const send = args.includes('--send');
const only = args.filter((a) => a.startsWith('http'));
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);

let urls = only;
if (!urls.length) {
  const sitemap = readFileSync(join(ROOT, 'dist/sitemap.xml'), 'utf8');
  urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}
if (limit) urls = urls.slice(0, limit);

if (!urls.length) {
  console.error('✗ Нет URL для отправки: пустой dist/sitemap.xml и не передан --url');
  process.exit(1);
}
const foreign = urls.filter((u) => !u.includes(HOST));
if (foreign.length) {
  console.error(`✗ URL не с этого хоста (${HOST}): ${foreign.slice(0, 3).join(', ')}`);
  process.exit(1);
}

const body = { host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList: urls };
console.log(`IndexNow: ${urls.length} URL → ${ENDPOINT}`);
console.log(`ключ: ${keyFile} · keyLocation: https://${HOST}/${keyFile}`);
if (!send) {
  console.log('Сухой прогон. Что уйдёт:');
  urls.slice(0, 10).forEach((u) => console.log('  ·', u));
  if (urls.length > 10) console.log(`  … и ещё ${urls.length - 10}`);
  console.log('\nОтправить по-настоящему: --send');
  process.exit(0);
}

async function post(endpoint, label) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    // 200 — принято, 202 — уже известно, 422 — ключ не подтверждён, 429 — слишком часто
    const ok = res.status === 200 || res.status === 202;
    console.log(`${ok ? '✓' : '✗'} ${label}: HTTP ${res.status}${ok ? '' : ' — ' + (await res.text()).slice(0, 300)}`);
    return ok;
  } catch (e) {
    console.error(`✗ ${label}: сеть недоступна (${e.message}). Запустите там, откуда виден прод.`);
    return false;
  }
}

const results = [await post(ENDPOINT, 'IndexNow (Яндекс, Bing и др.)')];
if (process.env.YANDEX_ONLY === '1') results.push(await post(YANDEX, 'Яндекс напрямую'));
process.exit(results.every(Boolean) ? 0 : 1);
