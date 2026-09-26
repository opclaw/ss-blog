#!/usr/bin/env python3
"""Перенос статьи v6 (deliverables/archive/design-preview/blog/*.html) в Astro.

Прототип v6 переехал в архив: deliverables/archive/design-preview/ (боевой код — site/src).

Шапка, мобильное меню, прогресс, «наверх» и контакты берутся из общих компонентов сайта.
Из v6 остаются светлый лист статьи (<main class="bl-sheet">), его стили и интерактив.

  python3 tools/port_v6.py            # из site/
"""
import json, re
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
PREV = SITE.parent / 'deliverables' / 'archive' / 'design-preview' / 'blog'
ASSETS_OUT = SITE / 'public' / 'blog-assets'

# ---------- CSS ----------
css = (PREV / 'assets' / 'article-v6.css').read_text(encoding='utf-8')
lines = css.split('\n')

def drop_block(lines, start_pat, end_pat):
    """Удаляет строки от start_pat до end_pat включительно."""
    s = next(i for i, l in enumerate(lines) if re.search(start_pat, l))
    e = next(i for i in range(s, len(lines)) if re.search(end_pat, lines[i]))
    return lines[:s] + lines[e + 1:]

lines = drop_block(lines, r'^\.bl-skip\{', r'^\s*body\.menu-open')   # skip, прогресс, шапка, мобильное меню
if lines and lines[0].strip() == '}':
    pass
# закрывающая скобка @media(max-width:1000px) после body.menu-open
i = next(i for i, l in enumerate(lines) if l.startswith('/* ГЕРОЙ'))
while i > 0 and lines[i - 1].strip() in ('', '}'):
    i -= 1
    if lines[i].strip() == '}':
        del lines[i]
        break
lines = [l for l in lines if not re.match(r'^\.bl-(cta|contacts|urg|top)\b', l)]
lines = [l for l in lines if not re.match(r'^@media \(max-width:(860|480)px\)\{\.bl-contacts', l)]
lines = [l for l in lines if not l.startswith('::selection') and not re.match(r'^/\* (прогресс|ШАПКА|ФИНАЛ)', l)]
css = '\n'.join(lines)
css = css.replace('body.bl{margin:0;', '.bl-sheet{')
css = css.replace('.bl a{color:inherit}', '.bl-sheet a{color:inherit}')
css = css.replace('body.bl{font-size:17px}', '.bl-sheet{font-size:17px}')
css = css.replace('html{scroll-behavior:smooth;scroll-padding-top:84px;-webkit-text-size-adjust:100%}',
                  'html{scroll-padding-top:84px}')
css = re.sub(r'^\*\{box-sizing:border-box\}\n', '', css, flags=re.M)
# переменные листа — только внутри листа, чтобы не перебить --fg/--green сайта (логотип, подвал, контакты)
css = css.replace(':root{', '.bl-sheet{', 1)
assert ':root' not in css
css = css.replace('@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}', '@media (prefers-reduced-motion:reduce){.bl-sheet *{animation:none!important;transition:none!important}')
css = css.replace('/* Smart Solutions — статья блога v6.',
                  '/* Smart Solutions — статья блога (лист v6) внутри общего каркаса сайта.\n'
                  '   Шапка, меню, контакты и подвал — из styles.css сайта. Префикс bl-.')
css += '''
/* стыковка с каркасом сайта */
.bl-page .nav{background:rgba(8,8,13,.92);border-bottom-color:var(--border)}
.bl-text ul,.bl-text ol{margin:0 0 1.1em}
.bl-text li{margin:0 0 .45em}
.bl-page .section-cta{margin-top:0}
.bl-page .bl-hero{padding-top:64px}
'''
for bad in ('bl-nav', 'bl-mobile', 'bl-burger', 'bl-cta', 'bl-top', 'body.bl'):
    assert bad not in css, bad
# защита: ни одно правило листа не должно действовать за его пределами
def selectors(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S); out = []; i = 0
    while True:
        j = t.find('{', i)
        if j < 0: return out
        sel = t[i:j].strip(); depth = 1; k = j + 1
        while depth:
            depth += {'{': 1, '}': -1}.get(t[k], 0); k += 1
        if sel.startswith(('@media', '@supports')): out += selectors(t[j + 1:k - 1])
        elif not sel.startswith('@keyframes'): out += [x.strip() for x in sel.split(',')]
        i = k
leak = sorted({x for x in selectors(css) if not re.match(r'^(\.bl-|\.ha-|html$|from$|to$|\d)', x)})
assert not leak, f'правила вне листа статьи: {leak}'
ASSETS_OUT.mkdir(parents=True, exist_ok=True)
(ASSETS_OUT / 'article.css').write_text(css, encoding='utf-8')

# ---------- JS ----------
js = (PREV / 'assets' / 'article-v6.js').read_text(encoding='utf-8')
s = js.index('  /* прогресс, наверх')
e = js.index('  /* запуск, когда блок')
head_js = r'''  /* оглавление и «осталось ~N мин» (прогресс, «наверх» и меню — script.js сайта) */
  var text=$('.bl-text'),left=$('#readLeft');
  var toc=$$('.bl-toc a[href^="#sec-"]').map(function(a){return {a:a,h:d.getElementById(a.hash.slice(1))}}).filter(function(x){return x.h});
  var total=text?Math.max(1,Math.round(text.textContent.split(/\s+/).length/180)):1;
  function onScroll(){
    var y=scrollY,act=null;
    toc.forEach(function(x){if(x.h.offsetTop<=y+120)act=x});toc.forEach(function(x){x.a.classList.toggle('active',x===act)});
    if(text&&left){var r=text.getBoundingClientRect(),p=Math.min(1,Math.max(0,-r.top/(r.height-innerHeight)));
    left.textContent=p>.97?'дочитано':'осталось ~'+Math.max(1,Math.round(total*(1-p)))+' мин'}
  }
  addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll);onScroll();

'''
js = js[:s] + head_js + js[e:]
assert 'navBurger' not in js and 'backToTop' not in js
(ASSETS_OUT / 'article.js').write_text(js, encoding='utf-8')

# ---------- страницы ----------
for src in sorted(PREV.glob('*.html')):
    if src.name == 'index.html':
        continue
    html = src.read_text(encoding='utf-8')
    title = re.search(r'<title>(.*?)</title>', html, re.S).group(1).strip()
    desc = re.search(r'<meta name="description" content="(.*?)"', html, re.S).group(1)
    lds = [m.strip() for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)]
    for ld in lds:
        json.loads(ld)
    main = re.search(r'<main class="bl-sheet" id="article">.*?</main>', html, re.S).group(0)
    # оглавление: без класса сайта article-aside-left — его стили (серый/голубой, скрытие) ломают светлый лист
    main = main.replace('class="bl-toc article-aside-left"', 'class="bl-toc"')
    # внутренние пометки «нужно от Олега» в публичный HTML не попадают (список — в REVIEW.md статьи)
    todos = re.findall(r'<div class="bl-todo">(.*?)</div>', main, re.S)
    main = re.sub(r'\s*<div class="bl-todo">.*?</div>', '', main, flags=re.S)
    main = main.replace('https://smartsolutions.today/', '/')
    main = main.replace('href="/index.html', 'href="/')
    main = main.replace('href="/blog/index.html"', 'href="/blog/"')
    # фигурные скобки в тексте — литералы для Astro
    main = main.replace('{', '&#123;').replace('}', '&#125;')
    slug = src.stem
    page = f'''---
// Статья блога (дизайн v6). Сгенерировано tools/port_v6.py из deliverables/archive/design-preview/blog/{src.name}; дальше правим здесь.
import Base from '../../layouts/Base.astro';
import ContactCards from '../../components/ContactCards.astro';
const jsonLd = {json.dumps(lds, ensure_ascii=False, indent=2)};
---
<Base
  title={{{json.dumps(title, ensure_ascii=False)}}}
  description={{{json.dumps(desc, ensure_ascii=False)}}}
  path="/blog/{slug}.html"
  ogType="article"
  jsonLd={{jsonLd}}
  active="ai"
  skipTo="#article"
  readProgress
  bodyClass="bl-page"
>
<link slot="head" rel="stylesheet" href="/blog-assets/article.css">
{main}

<section id="contacts" class="section section-cta">
  <div class="container">
    <div class="cta-content">
      <h2 class="cta-title">Разберём ваш процесс?</h2>
      <p class="text-secondary cta-subtitle">Честно скажем, окупится ли ИИ в вашем случае. Аудит бесплатный.</p>

      <ContactCards />

      <p class="cta-urgency">Берём ограниченное число внедрений одновременно — каждый пилот требует полного погружения.</p>
    </div>
  </div>
</section>
<Fragment slot="tail">
<script is:inline>
  (function () {{
    var bar = document.getElementById('readProgress');
    addEventListener('scroll', function () {{
      var h = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + '%';
    }}, {{ passive: true }});
  }})();
</script>
<script is:inline src="/blog-assets/article.js"></script>
</Fragment>
</Base>
'''
    out = SITE / 'src' / 'pages' / 'blog' / f'{slug}.astro'
    out.write_text(page, encoding='utf-8')
    print('✓', out.relative_to(SITE), '|', title)
    for t in todos: print('   todo:', re.sub(r'<[^>]+>', ' ', t).strip()[:160])
