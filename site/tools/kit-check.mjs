// Проверка интерактива блога: на каждой странице с data-kit нажимаем всё, как читатель.
//   node tools/kit-check.mjs [dist]
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const dist = process.argv[2] || 'dist';
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && files.push(p); } })(dist);
const kitJs = fs.readFileSync(path.join(dist, 'blog-assets/kit.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0, pages = 0;

for (const f of files.sort()) {
  const raw = fs.readFileSync(f, 'utf8');
  if (!raw.includes('data-kit=')) continue;
  pages++;
  const rel = path.relative(dist, f);
  const errs = [], ok = [];
  const html = raw.replace(/<script[^>]*mc\.yandex[\s\S]*?<\/script>/, '').replace(/<script[^>]*src="\/[^"]+"[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://smartsolutions.today/' + rel,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
      w.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { setTimeout(() => this.cb([{ isIntersecting: true, target: el }]), 0); } disconnect() {} unobserve() {} };
      w.scrollTo = () => {};
      w.navigator.clipboard = { writeText: () => Promise.resolve() };
    } });
  const w = dom.window, d = w.document;
  w.addEventListener('error', (e) => errs.push('JS: ' + e.message));
  try { w.eval(kitJs); } catch (e) { errs.push('kit.js: ' + e.message); }
  await sleep(20);

  for (const root of d.querySelectorAll('[data-kit="scan"]')) {
    const finds = [...root.querySelectorAll('.kit-finds li')], machine = finds.filter((x) => !x.classList.contains('human'));
    root.querySelector('[data-scan-run]').click();
    await sleep(400 + machine.length * 420 + 100);
    const on = machine.filter((x) => x.classList.contains('on')).length;
    const lit = root.querySelectorAll('.kit-risk.on').length;
    if (on !== machine.length || lit !== machine.length) errs.push(`scan: подсвечено ${lit}, находок ${on} из ${machine.length}`);
    const hb = root.querySelector('[data-scan-human]');
    if (hb) { if (hb.hidden) errs.push('scan: кнопка «что ИИ не увидел» не появилась'); hb.click(); if (!finds.some((x) => x.classList.contains('human') && x.classList.contains('on'))) errs.push('scan: находка человека не открылась'); }
    const r = root.querySelector('.kit-risk.on'); r.click();
    if (!root.querySelector('.kit-finds li.active')) errs.push('scan: клик по пункту не выделяет находку');
    ok.push(`scan ${machine.length}+${finds.length - machine.length}`);
  }
  for (const root of d.querySelectorAll('[data-kit="tabs"]')) {
    const tabs = [...root.querySelectorAll('[role=tab]')], panels = [...root.querySelectorAll('[role=tabpanel]')];
    if (panels.filter((p) => !p.hidden).length !== 1) errs.push('tabs: видна не одна панель');
    tabs.at(-1).click();
    if (panels.at(-1).hidden || !panels[0].hidden) errs.push('tabs: переключение не работает');
    ok.push(`tabs ${tabs.length}`);
  }
  for (const root of d.querySelectorAll('[data-kit="matrix"]')) {
    const note = root.querySelector('.kit-matrix-note'), chips = [...root.querySelectorAll('.kit-chip')];
    chips.at(-1).click();
    if (note.textContent.trim() !== chips.at(-1).querySelector('small').textContent.trim()) errs.push('matrix: объяснение не показалось');
    ok.push(`matrix ${chips.length}`);
  }
  for (const root of d.querySelectorAll('[data-kit="calc"]')) {
    const out = root.querySelector('[data-r]'), before = out.textContent, inp = root.querySelector('input[data-i]');
    if (!/[1-9]/.test(before)) errs.push('calc: итог нулевой при значениях по умолчанию');
    inp.value = inp.max; inp.dispatchEvent(new w.Event('input'));
    if (out.textContent === before) errs.push('calc: итог не меняется от ползунка');
    ok.push(`calc ${before}→${out.textContent}`);
  }
  for (const root of d.querySelectorAll('[data-kit="prompt"]')) {
    root.querySelector('button').click(); await sleep(5);
    if (root.querySelector('button').textContent !== 'скопировано') errs.push('prompt: копирование не сработало');
    ok.push('prompt');
  }
  if (errs.length) bad++;
  console.log(`${errs.length ? '✗' : '✓'} ${rel.padEnd(44)} ${ok.join(' · ')}${errs.length ? '\n    ' + errs.join('\n    ') : ''}`);
  w.close();
}
console.log(bad ? `\nИнтерактив: ошибки на ${bad} стр.` : `\nИнтерактив: OK (${pages} стр.)`);
process.exit(bad ? 1 : 0);
