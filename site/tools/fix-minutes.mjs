// Время чтения: единый источник для шапки статьи и строки «осталось ~N мин».
//
// article.js считает минуты сам: words / 180 по textContent .bl-text. Число в разметке
// (проп minutes={N}) живёт отдельно и от текста отстаёт: на 19 статьях из 21 шапка без JS
// говорила одно, а скрипт показывал другое. Здесь считается ровно тот же объём текста, что
// в браузере (jsdom даёт тот же textContent, сверено с Chromium на всех 21 статье).
//
//   node tools/fix-minutes.mjs dist            — переписать числа в dist под текст
//   node tools/fix-minutes.mjs dist --check    — только проверить (ненулевой выход при расхождении)
//   node tools/fix-minutes.mjs dist --json dist/minutes.json  — выгрузить отчёт
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const dist = process.argv[2] || 'dist';
const check = process.argv.includes('--check');
const jsonIdx = process.argv.indexOf('--json');
const jsonOut = jsonIdx > 0 ? process.argv[jsonIdx + 1] : path.join(dist, 'minutes.json');

// та же форма слова, что в article.js: «11 минут», но «21 минута»
function minWord(n) {
  const a = n % 100, b = n % 10;
  if (a > 10 && a < 20) return 'минут';
  if (b === 1) return 'минута';
  if (b > 1 && b < 5) return 'минуты';
  return 'минут';
}

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    if (f === 'minutes.json') continue;
    const p = path.join(d, f);
    fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && files.push(p);
  }
})(dist);

const report = {};
let bad = 0, fixed = 0, touched = 0;

for (const f of files.sort()) {
  const raw = fs.readFileSync(f, 'utf8');
  if (!raw.includes('data-readmin')) continue;
  const dom = new JSDOM(raw);
  const text = dom.window.document.querySelector('.bl-text');
  if (!text) continue;
  touched++;
  const words = text.textContent.split(/\s+/).filter(Boolean).length;
  const want = Math.max(1, Math.round(words / 180));
  const rel = path.relative(dist, f);
  report[rel] = { words, minutes: want };

  const m = raw.match(/(<span data-readmin>~)(\d+)( [а-яё]+)( чтения<\/span>)/);
  if (!m) { console.log(`✗ ${rel}: не нашли разметку «~N минут чтения»`); bad++; continue; }
  const shown = +m[2];
  if (shown === want) continue;
  if (check) {
    console.log(`✗ ${rel}: в разметке ${shown} мин, по тексту ${want} мин (${words} слов) — поправьте minutes={${want}}`);
    bad++;
  } else {
    const next = raw.replace(m[0], m[1] + want + ' ' + minWord(want) + m[4]);
    fs.writeFileSync(f, next);
    console.log(`· ${rel}: ${shown} → ${want} мин (${words} слов)`);
    fixed++;
  }
}

if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
console.log(check
  ? (bad ? `\nВремя чтения: расхождений ${bad} из ${touched}` : `\nВремя чтения: OK — совпадает на ${touched} стр.`)
  : `\nВремя чтения: обновлено ${fixed} из ${touched} стр.`);
process.exit(bad ? 1 : 0);
