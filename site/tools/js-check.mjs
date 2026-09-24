import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs'; import path from 'path';
const distDir = process.argv[2] || "dist";
const files = []; (function walk(d){ for (const f of fs.readdirSync(d)) { const p = path.join(d,f); fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && !/google|yandex/.test(f) && files.push(p); } })(distDir);
const scriptJs = fs.readFileSync(path.join(distDir,'script.js'),'utf8');
let bad = 0;
for (const f of files.sort()) {
  const rel = path.relative(distDir, f);
  const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message.split('\n')[0])); vc.on('error', e => errors.push(String(e)));
  let html = fs.readFileSync(f,'utf8').replace(/<script[^>]*mc\.yandex[\s\S]*?<\/script>/,'').replace(/<script[^>]*src="\/script\.js"[^>]*><\/script>/,'');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://smartsolutions.today/' + rel, virtualConsole: vc, beforeParse(w){ w.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){} }); w.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} }; w.scrollTo = () => {}; } });
  const w = dom.window;
  w.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener(){}, addListener(){} }));
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  try { w.eval(scriptJs); } catch (e) { errors.push('script.js: ' + e.message); }
  w.dispatchEvent(new w.Event('load')); w.dispatchEvent(new w.Event('scroll'));
  // интерактив: бургер открывает меню
  const d = w.document, burger = d.getElementById('navBurger'), mm = d.getElementById('mobileMenu');
  const checks = [];
  if (burger && mm) { burger.click(); checks.push(mm.classList.contains('open') ? 'burger✓' : 'burger✗'); if (!mm.classList.contains('open')) errors.push('бургер не открывает меню'); burger.click(); }
  const q = d.querySelector('.faq-question'); if (q) { q.click(); const ok = q.parentElement.classList.contains('open'); checks.push(ok ? 'faq✓' : 'faq✗'); if (!ok) errors.push('FAQ не раскрывается'); }
  await new Promise(r => setTimeout(r, 50));
  if (errors.length) bad++;
  console.log((errors.length ? '✗ ' : '✓ ') + rel.padEnd(48) + checks.join(' ') + (errors.length ? '\n    ' + [...new Set(errors)].join('\n    ') : ''));
  w.close();
}
console.log(bad ? `\nОшибки JS на ${bad} стр.` : '\nОшибок JS нет');
