/**
 * Проверка нумерации рисунков: в каждой статье «Рис. 1…N» идут по порядку и без повторов.
 * Ловит регресс после любых переносов фигур по тексту.
 *
 * Запуск: LD_LIBRARY_PATH=/tmp/al2023/lib node tools/audit-numbering.mjs
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
const exe = await chromium.executablePath();
const pages = sitePages();
let bad = 0;
for (const pg of pages) {
  const b = await pw.launch({ executablePath: exe, args: chromium.args, headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`${process.env.BASE || 'http://127.0.0.1:4321'}/${pg}`, { waitUntil: 'load' });
  await p.waitForTimeout(200);
  const nums = await p.evaluate(() => {
    const text = document.querySelector('.bl-text') || document.body;
    return [...text.querySelectorAll('figure figcaption')].map((c) => {
      const m = c.textContent.match(/Рис\.?\s*(\d+)/i);
      return m ? +m[1] : null;
    }).filter((x) => x !== null);
  });
  const sorted = [...nums].sort((a, b) => a - b);
  const ok = JSON.stringify(nums) === JSON.stringify(sorted) && new Set(nums).size === nums.length;
  if (!ok) { bad++; console.log(`✗ ${pg}: ${nums.join(', ')}`); }
  else console.log(`✓ ${pg}: ${nums.join(', ') || '—'}`);
  await b.close();
}
console.log(`\nнарушений нумерации: ${bad}`);
process.exit(bad ? 1 : 0);
