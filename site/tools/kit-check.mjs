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
  // страховка: кит в разметке без подключённых ассетов молча не работает (так был мёртв
  // чек-лист в статье «Что такое ИИ-агент» — скрипт просто не подключался к странице)
  const missing = [];
  if (!raw.includes('blog-assets/kit.js')) missing.push('kit.js');
  if (!raw.includes('blog-assets/kit.css')) missing.push('kit.css');
  if (missing.length) { bad++; console.log(`✗ ${path.relative(dist, f).padEnd(44)} не подключены: ${missing.join(', ')} — интерактив мёртв`); continue; }
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
    // реестр должен быть полным сразу (видимость считает audit-layout в реальном браузере)
    if (root.querySelector('[data-scan-human]')) errs.push('scan: осталась скрытая кнопка «что ИИ не увидел»');
    if (!root.querySelector('[data-human-line]') && finds.some((x) => x.classList.contains('human')))
      errs.push('scan: есть находка «вне текста», но нет строки, объясняющей её роль');
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
    // находка человека в реестре с самого начала; клик по ней раскрывает объяснение
    const h = finds.filter((x) => x.classList.contains('human'))[0];
    if (h) {
      if (h.classList.contains('open')) errs.push('scan: объяснение человека раскрыто до клика');
      h.querySelector('.kit-find-head').click();
      if (!h.classList.contains('open')) errs.push('scan: клик по находке человека не раскрывает объяснение');
      const note = h.querySelector('.kit-find-note');
      if (!note || !note.textContent.trim()) errs.push('scan: у находки человека пустое объяснение');
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
  for (const root of d.querySelectorAll('[data-kit="budget"]')) {
    const groups = [...root.querySelectorAll('[data-bg]')];
    const total = root.querySelector('[data-btotal]');
    if (!groups.length || !total) { errs.push('budget: нет групп или итога'); continue; }
    const toNum = (v) => parseInt(String(v).replace(/[^\d]/g, ''), 10);
    if (!/\d/.test(total.textContent)) errs.push('budget: итог пустой при выборе по умолчанию');
    // в каждой группе выбор ровно один, а итог обязан пересчитаться
    const seen = new Set();
    for (const gr of groups) {
      const chips = [...gr.querySelectorAll('[data-bopt]')];
      chips.at(-1).click();
      if (chips.at(-1).getAttribute('aria-pressed') !== 'true') errs.push('budget: aria-pressed не встал на выбранный вариант');
      if (chips.filter((c) => c.getAttribute('aria-pressed') === 'true').length !== 1) errs.push('budget: в группе выбрано не одно значение');
      seen.add(total.textContent);
    }
    if (seen.size < 2) errs.push('budget: итог не меняется от выбора вариантов');
    // итог = пилот + внедрение, строка сопровождения = выбранной вилке
    const pickOf = (id) => root.querySelector('[data-bg="' + id + '"] [data-bopt][aria-pressed="true"]');
    const p = pickOf('pilot'), i = pickOf('impl'), sup = pickOf('support');
    const expect = +p.dataset.min + +i.dataset.min;
    if (toNum(total.textContent) !== expect) errs.push(`budget: итог не равен сумме пилота и внедрения (${total.textContent} против ${expect})`);
    const bmax = root.querySelector('[data-bmax]');
    if (!bmax) errs.push('budget: нет верхней границы бюджета');
    else if (toNum(bmax.textContent) !== +p.dataset.max + +i.dataset.max) errs.push('budget: верхняя граница не равна сумме максимумов пилота и внедрения');
    const supRow = root.querySelector('[data-brow="support"]');
    if (!supRow || toNum(supRow.textContent.split('–')[0]) !== +sup.dataset.min) errs.push(`budget: строка сопровождения не соответствует выбору (${supRow ? supRow.textContent.trim() : 'нет строки'} против ${sup.dataset.min})`);
    // галочка про время команды добавляет строку в план и снимается обратно
    const extra = root.querySelector('[data-bextra]'), row = root.querySelector('[data-bextra-row]');
    if (extra && row) {
      extra.checked = true; extra.dispatchEvent(new w.Event('change'));
      if (row.hidden) errs.push('budget: строка про время команды не появляется');
      extra.checked = false; extra.dispatchEvent(new w.Event('change'));
      if (!row.hidden) errs.push('budget: строка про время команды не скрывается');
    } else errs.push('budget: нет галочки про время команды');
    // ссылка на расчёт окупаемости ведёт к существующему блоку этой же статьи
    const link = root.querySelector('.kit-budget-next a');
    if (!link) errs.push('budget: нет ссылки на расчёт окупаемости');
    else if (link.getAttribute('href').startsWith('#') && !d.getElementById(link.getAttribute('href').slice(1)))
      errs.push('budget: ссылка на расчёт ведёт в никуда');
    ok.push(`budget ${groups.length} группы · ${total.textContent.trim()}`);
  }
  for (const root of d.querySelectorAll('[data-kit="timeline"]')) {
    const items = [...root.querySelectorAll('.kit-tl li')], btns = items.map((li) => li.querySelector('.kit-tl-btn'));
    if (!items.length) { errs.push('timeline: нет этапов'); continue; }
    if (items.filter((li) => li.classList.contains('on')).length !== 1) errs.push('timeline: открыт не один этап');
    btns.at(-1).click();
    if (!items.at(-1).classList.contains('on') || items[0].classList.contains('on')) errs.push('timeline: клик по этапу не переключает');
    if (btns.at(-1).getAttribute('aria-expanded') !== 'true') errs.push('timeline: aria-expanded не обновляется');
    if (!root.classList.contains('kit-js')) errs.push('timeline: нет класса kit-js — CSS не скроет неактивные этапы');
    if (items.filter((li) => li.classList.contains('on')).length !== 1) errs.push('timeline: активных этапов не один после клика');
    if (items.some((li) => !li.querySelector('.kit-tl-body') || !li.querySelector('.kit-tl-body').textContent.trim()))
      errs.push('timeline: у этапа пустое описание');
    ok.push(`timeline ${items.length} этапов`);
  }
  for (const root of d.querySelectorAll('[data-kit="sources"]')) {
    const btns = [...root.querySelectorAll('.kit-src-btn')], parts = [...root.querySelectorAll('.kit-src-f')];
    if (!btns.length || !parts.length) { errs.push('sources: нет источников или фраз'); continue; }
    if (parts.some((p) => !p.querySelector('sup'))) errs.push('sources: у фразы нет номера источника');
    const counts = {};
    parts.forEach((p) => { counts[p.dataset.from] = (counts[p.dataset.from] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const b = btns.find((x) => x.dataset.src === top[0]);
    b.click();
    if (!root.classList.contains('hl')) errs.push('sources: подсветка не включилась');
    if (b.getAttribute('aria-pressed') !== 'true') errs.push('sources: aria-pressed не выставлен');
    const hl = parts.filter((p) => p.classList.contains('hl')).length;
    if (hl !== top[1]) errs.push(`sources: подсвечено ${hl} фраз, у источника ${top[1]}`);
    const noSrc = parts.filter((p) => p.dataset.from === 'own').length;
    if (!noSrc) errs.push('sources: нет фразы без источника (догадка модели)');
    b.click();
    if (root.classList.contains('hl')) errs.push('sources: подсветка не снимается повторным кликом');
    ok.push(`sources ${btns.length - 1} источников · ${hl} фраз у одного`);
  }
  for (const root of d.querySelectorAll('[data-kit="check"]')) {
    const boxes = [...root.querySelectorAll('input[data-c]')], verdict = root.querySelector('[data-cverdict]');
    if (!boxes.length || !verdict) { errs.push('check: нет пунктов или вердикта'); continue; }
    const before = verdict.textContent.trim();
    boxes.forEach((b) => { b.checked = true; b.dispatchEvent(new w.Event('change')); });
    if (verdict.textContent.trim() === before) errs.push('check: вердикт не меняется от отметок');
    const bar = root.querySelector('[data-cbar]');
    if (bar && bar.style.width !== '100%') errs.push(`check: шкала не заполнилась (${bar.style.width || 'пусто'})`);
    ok.push(`check 0→${boxes.length}`);
  }
  for (const root of d.querySelectorAll('[data-kit="funnel"]')) {
    const now = root.querySelector('[data-fr="now"]'), fast = root.querySelector('[data-fr="fast"]'), lbl = root.querySelector('[data-flbl]');
    if (!now || !fast || !lbl) { errs.push('funnel: нет строк результата'); continue; }
    const before = { now: now.textContent, fast: fast.textContent, lbl: lbl.textContent };
    const inp = root.querySelector('input[data-fn="t"]');
    inp.value = inp.max; inp.dispatchEvent(new w.Event('input'));
    if (now.textContent === before.now) errs.push('funnel: итог не меняется от ползунка скорости ответа');
    if (lbl.textContent === before.lbl) errs.push('funnel: подпись скорости ответа не обновляется');
    if (parseFloat(fast.textContent.replace(/\s/g, '').replace(',', '.')) <= parseFloat(now.textContent.replace(/\s/g, '').replace(',', '.')))
      errs.push('funnel: «за 1 минуту» не больше текущего результата');
    ok.push(`funnel ${before.now}→${now.textContent}`);
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
