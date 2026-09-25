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
    // реестр: открыто максимум одно объяснение, итоговая строка появилась
    if (finds.filter((x) => x.classList.contains('open')).length > 1) errs.push('scan: открыто больше одной находки');
    if (!root.querySelector('.kit-scan-sum')) errs.push('scan: нет строки-итога');
    if (!root.classList.contains('scanned')) errs.push('scan: после прогона нет отметки scanned');
    // клик по находке раскрывает объяснение и переключает aria-expanded
    const closed = finds.filter((x) => !x.classList.contains('open'))[0];
    const closedHead = closed.querySelector('.kit-find-head');
    if (!closedHead) errs.push('scan: у находки нет кнопки-заголовка');
    else {
      if (closedHead.getAttribute('aria-expanded') !== 'false') errs.push('scan: у закрытой находки aria-expanded не false');
      closedHead.click();
      if (!closed.classList.contains('open')) errs.push('scan: клик по находке не раскрывает объяснение');
      if (closedHead.getAttribute('aria-expanded') !== 'true') errs.push('scan: aria-expanded не переключается');
      if (finds.filter((x) => x.classList.contains('open')).length !== 1) errs.push('scan: одновременно открыто несколько объяснений');
      const note = closed.querySelector('.kit-find-note');
      if (!note || !note.textContent.trim()) errs.push('scan: у находки пустое объяснение');
    }
    // клик по подсвеченному пункту в договоре выделяет и раскрывает соответствующую находку
    const r = root.querySelector('.kit-risk.on'); r.click();
    const active = root.querySelector('.kit-finds li.active');
    if (!active) errs.push('scan: клик по пункту не выделяет находку');
    else if (!active.classList.contains('open')) errs.push('scan: клик по пункту не раскрывает объяснение');
    // «что ИИ не увидел» — отдельная находка человека
    const hb = root.querySelector('[data-scan-human]');
    if (hb) {
      if (hb.hidden) errs.push('scan: кнопка «что ИИ не увидел» не появилась');
      hb.click();
      const h = finds.filter((x) => x.classList.contains('human'))[0];
      if (!h || !h.classList.contains('on')) errs.push('scan: находка человека не открылась');
      else if (!h.classList.contains('open')) errs.push('scan: находка человека не раскрыта');
    }
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
