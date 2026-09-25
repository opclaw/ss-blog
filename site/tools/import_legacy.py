#!/usr/bin/env python3
"""
Импорт статического сайта (legacy/version-4) в Astro-проект (site/).

Что делает:
  1. Каждую HTML-страницу превращает в src/pages/<тот же путь>.astro.
     Контент страницы переносится как есть; общие части заменяются компонентами:
       шапка → Nav, мобильное меню → MobileMenu, подвал → Footer,
       4 карточки контактов → ContactCards, <head> → layouts/Base.astro.
  2. Всё остальное (styles.css, script.js, картинки, логотипы, иконки, robots, sitemap,
     .htaccess, верификации поисковиков) копирует в public/ без изменений.
  3. Чинит найденные при сверке ошибки:
       - испорченный телефон tel:+792****9500 → tel:+79250909500;
       - относительные пути (../, index.html) → пути от корня (/…);
       - блок контактов без id → id="contacts" (пункт «Контакты» ведёт к нему на этой же странице).
  4. Печатает отчёт: что заменено, что не подошло под шаблон.

Запуск:  python3 tools/import_legacy.py        (из папки site/)
Повторный запуск перезаписывает src/pages и public/ — ручные правки там будут потеряны.
После первого импорта источником правды становится site/, а не legacy/.
"""
import json, os, re, shutil, sys
from pathlib import Path
from posixpath import normpath, join as pjoin, dirname

ROOT = Path(__file__).resolve().parent.parent          # site/
LEGACY = ROOT.parent / 'legacy' / 'version-4'
PAGES = ROOT / 'src' / 'pages'
PUBLIC = ROOT / 'public'

PAGE_FILES = ['index.html', 'services.html', 'ai.html'] \
    + sorted(str(p.relative_to(LEGACY)) for p in (LEGACY / 'cases').glob('*.html')) \
    + sorted(str(p.relative_to(LEGACY)) for p in (LEGACY / 'blog').glob('*.html'))

# не публикуем: не используется (CLAUDE.md) или внутренний документ
PUBLIC_EXCLUDE = {'send.php', 'business-strategy-2026.md', '.gitignore', '.DS_Store'}

NAV_LABEL_TO_KEY = {'Подход': 'approach', 'Проекты': 'projects', 'Процесс': 'process',
                    'Услуги': 'services', 'AI': 'ai', 'Контакты': 'contacts'}

report = {'closed_divs': [], 'fixed_tel': 0, 'rel_paths': 0, 'contacts_id_added': [], 'warnings': []}


def warn(page, msg):
    report['warnings'].append(f'{page}: {msg}')


def match_block(s, start, tag):
    """Индекс конца элемента <tag ...> начинающегося в start (с учётом вложенности)."""
    pat = re.compile(rf'<{tag}\b|</{tag}\s*>', re.I)
    depth = 0
    for m in pat.finditer(s, start):
        if m.group(0).startswith('</'):
            depth -= 1
            if depth == 0:
                return m.end()
        else:
            depth += 1
    raise ValueError(f'unclosed <{tag}> at {start}')


def cut_element(s, open_re, tag):
    m = re.search(open_re, s, re.S)
    if not m:
        return s, None
    end = match_block(s, m.start(), tag)
    return s[:m.start()] + s[end:], s[m.start():end]


def to_root(url, page_dir):
    """Относительный адрес → от корня сайта. Внешние, якоря, tel/mailto не трогаем."""
    if re.match(r'^(?:[a-z][a-z0-9+.-]*:|//|#|\{)', url, re.I) or url == '':
        return url
    if url.startswith('/'):
        path = url
    else:
        path, frag = (url.split('#', 1) + [''])[:2]
        q = ''
        if '?' in path:
            path, q = path.split('?', 1)
            q = '?' + q
        path = normpath(pjoin('/' + page_dir, path)) if path else '/' + page_dir + '/'
        path = path + q + (('#' + frag) if frag else '')
    # /index.html → / ; /blog/index.html → /blog/
    path = re.sub(r'(^|/)index\.html(?=$|[#?])', r'\1', path)
    return path


def rewrite_urls(html, page_dir):
    def rep(m):
        attr, q, url = m.group(1), m.group(2), m.group(3)
        new = to_root(url, page_dir)
        if new != url:
            report['rel_paths'] += 1
        return f'{attr}={q}{new}{q}'
    return re.sub(r'\b(href|src|xlink:href|poster)=(["\'])(.*?)\2', rep, html)


def astro_safe(html):
    """Инлайн-скрипты/стили — как есть (is:inline); фигурные скобки в тексте — сущностями."""
    out, pos = [], 0
    for m in re.finditer(r'<(script|style)\b([^>]*)>(.*?)</\1>', html, re.S | re.I):
        out.append(escape_braces(html[pos:m.start()]))
        tag, attrs, body = m.group(1), m.group(2), m.group(3)
        if 'is:inline' not in attrs:
            attrs = ' is:inline' + attrs
        out.append(f'<{tag}{attrs}>{body}</{tag}>')
        pos = m.end()
    out.append(escape_braces(html[pos:]))
    return ''.join(out)


def escape_braces(t):
    return t.replace('{', '&#123;').replace('}', '&#125;')


def attr(tag_html, name):
    m = re.search(rf'\b{name}="([^"]*)"', tag_html)
    return m.group(1) if m else None


def meta(head, key, val):
    m = re.search(rf'<meta\s+{key}="{re.escape(val)}"\s+content="([^"]*)"', head)
    return m.group(1) if m else None


def js(v):
    return json.dumps(v, ensure_ascii=False)


def import_page(rel):
    src = (LEGACY / rel).read_text(encoding='utf-8')
    page_dir = dirname(rel)                       # '' | 'blog' | 'cases'
    path = '/' + re.sub(r'(^|/)index\.html$', r'\1', rel)

    head = src[:src.index('</head>')]
    body = src[src.index('<body'):]
    body = body[body.index('>') + 1:]
    body = body[:body.rindex('</body>')]

    # ---------- <head>
    title = re.search(r'<title>(.*?)</title>', head, re.S).group(1).strip()
    desc = meta(head, 'name', 'description') or ''
    og_title = meta(head, 'property', 'og:title')
    og_desc = meta(head, 'property', 'og:description')
    og_type = meta(head, 'property', 'og:type') or 'website'
    og_image = meta(head, 'property', 'og:image')
    canonical = re.search(r'<link rel="canonical" href="([^"]*)"', head)
    if canonical and canonical.group(1).replace('https://smartsolutions.today', '') not in (path, path.rstrip('/') + '/index.html'):
        warn(rel, f'canonical {canonical.group(1)} не совпадает с адресом страницы {path}')
    json_ld = [m.strip() for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', head, re.S)]
    for i, ld in enumerate(json_ld):
        try:
            json.loads(ld)
        except Exception as e:
            warn(rel, f'JSON-LD #{i+1} не парсится: {e}')
    head_styles = re.findall(r'<style>.*?</style>', head, re.S)

    # ---------- служебные элементы перед шапкой
    nav_start = body.index('<nav class="nav"')
    pre = body[:nav_start]
    effects = 'id="preloader"' in pre
    read_progress = 'id="readProgress"' in pre
    skip = re.search(r'<a href="([^"]*)" class="skip-nav"', pre)
    skip_to = skip.group(1) if skip else '#main-content'
    leftover = re.sub(r'<!--.*?-->', '', pre, flags=re.S)
    for pat in [r'<div class="preloader".*?</div>\s*</div>|<div class="preloader"[^>]*>\s*<span[^>]*>.*?</span>\s*</div>',
                r'<a [^>]*class="skip-nav"[^>]*>.*?</a>', r'<div class="scroll-progress"[^>]*></div>',
                r'<div class="cursor-glow"[^>]*></div>', r'<div class="read-progress"><i[^>]*></i></div>']:
        leftover = re.sub(pat, '', leftover, flags=re.S)
    if leftover.strip():
        warn(rel, f'неизвестные элементы перед шапкой: {leftover.strip()[:120]}')

    # ---------- шапка + мобильное меню
    nav_end = match_block(body, nav_start, 'nav')
    nav_html = body[nav_start:nav_end]
    act = re.search(r'class="nav-link nav-link-active">([^<]+)<', nav_html)
    active = NAV_LABEL_TO_KEY.get(act.group(1).strip()) if act else None
    rest = body[nav_end:]
    mm = re.search(r'<div class="mobile-menu"', rest)
    if not mm:
        warn(rel, 'нет мобильного меню')
        content_start = 0
    else:
        between = re.sub(r'<!--.*?-->', '', rest[:mm.start()], flags=re.S).strip()
        if between:
            warn(rel, f'между шапкой и мобильным меню: {between[:100]}')
        mm_html = rest[mm.start():match_block(rest, mm.start(), 'div')]
        if 'mobile-menu-link' in mm_html:
            warn(rel, 'мобильное меню было на классах .mobile-menu-link (не стилизованы) — заменено стандартным')
        content_start = match_block(rest, mm.start(), 'div')
    rest = rest[content_start:]
    rest = re.sub(r'^\s*<!--[^>]*?-->', '', rest)  # хвостовой комментарий блока

    # ---------- подвал и хвост
    f = rest.find('<footer')
    if f < 0:
        warn(rel, 'нет подвала')
        content, tail = rest, ''
    else:
        content = rest[:f]
        content = re.sub(r'\s*<!-- =+ FOOTER =+ -->\s*$', '\n', content)
        tail = rest[match_block(rest, f, 'footer'):]
    tail = re.sub(r'\s*<!-- Back to top -->\s*', '\n', tail)
    tail = re.sub(r'<button class="back-to-top"[^>]*>.*?</button>', '', tail, flags=re.S)

    # ---------- исправления в контенте
    def fix(html):
        n = html.count('tel:+792****9500')
        report['fixed_tel'] += n
        html = html.replace('tel:+792****9500', 'tel:+79250909500')
        return html
    content, tail = fix(content), fix(tail)

    # незакрытые <div> внутри <article>: браузер закрывает их на </article>, Astro — нет.
    # Дописываем закрывающие теги там же, где их ставит браузер (визуально ничего не меняется).
    def close_divs(m):
        inner = m.group(2)
        missing = len(re.findall(r'<div\b', inner)) - len(re.findall(r'</div>', inner))
        if missing > 0:
            report['closed_divs'].append(f'{rel} (+{missing})')
            inner = inner.rstrip() + '\n' + '  </div>\n' * missing
        return m.group(1) + inner + m.group(3)
    content = re.sub(r'(<article\b[^>]*>)(.*?)(</article>)', close_divs, content, flags=re.S)

    # карточки контактов → компонент
    uses_cards = False
    g = re.search(r'<div class="contacts-grid">', content)
    if g:
        end = match_block(content, g.start(), 'div')
        block = content[g.start():end]
        expect = ['tel:+79250909500', 'https://t.me/olegkrechetov', 'https://wa.me/79250909500', 'mailto:ok@smartsolutions.today']
        if all(e in block for e in expect) and block.count('contact-card') == 4:
            content = content[:g.start()] + '<ContactCards />' + content[end:]
            uses_cards = True
        else:
            warn(rel, 'contacts-grid отличается от эталона — оставлен как есть')

    # блок контактов: id="contacts"
    cta = re.search(r'<section class="section section-cta"(?![^>]*\bid=)', content)
    if cta:
        content = content[:cta.start()] + '<section id="contacts" class="section section-cta"' + content[cta.end():]
        report['contacts_id_added'].append(rel)
    has_contacts = 'id="contacts"' in content
    if not has_contacts:
        warn(rel, 'на странице нет блока контактов (#contacts)')

    content = astro_safe(rewrite_urls(content, page_dir))
    tail = astro_safe(rewrite_urls(tail.strip(), page_dir))

    # ---------- сборка .astro
    depth = rel.count('/')
    up = '../' * (depth + 1)
    props = [f'title={{{js(title)}}}', f'description={{{js(desc)}}}', f'path="{path}"']
    if og_title and og_title != title: props.append(f'ogTitle={{{js(og_title)}}}')
    if og_desc and og_desc != desc: props.append(f'ogDescription={{{js(og_desc)}}}')
    if og_type != 'website': props.append(f'ogType="{og_type}"')
    if og_image and og_image != 'https://smartsolutions.today/images/og-cover.jpg': props.append(f'ogImage={{{js(og_image)}}}')
    if json_ld: props.append('jsonLd={jsonLd}')
    if active: props.append(f'active="{active}"')
    if skip_to != '#main-content': props.append(f'skipTo="{skip_to}"')
    if effects: props.append('effects')
    if read_progress: props.append('readProgress')
    if not has_contacts: props.append('hasContacts={false}')

    fm = [f"// Сгенерировано из legacy/version-4/{rel} (tools/import_legacy.py). Дальше правим здесь.",
          f"import Base from '{up}layouts/Base.astro';"]
    if uses_cards:
        fm.append(f"import ContactCards from '{up}components/ContactCards.astro';")
    if json_ld:
        fm.append('const jsonLd = [\n' + ',\n'.join('  ' + js(x) for x in json_ld) + '\n];')

    out = ['---', *fm, '---', f'<Base\n  ' + '\n  '.join(props) + '\n>']
    for st in head_styles:
        out.append(astro_safe(st.replace('<style>', '<style slot="head">', 1)))
    out.append(content.strip('\n'))
    if tail:
        out.append(f'<Fragment slot="tail">\n{tail}\n</Fragment>')
    out.append('</Base>\n')

    dst = PAGES / re.sub(r'\.html$', '.astro', rel)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text('\n'.join(out), encoding='utf-8')
    return rel, active, effects, read_progress, len(json_ld), uses_cards


def copy_public():
    if PUBLIC.exists():
        shutil.rmtree(PUBLIC)
    PUBLIC.mkdir(parents=True)
    pages = set(PAGE_FILES)
    n = 0
    for p in LEGACY.rglob('*'):
        if p.is_dir():
            continue
        rel = str(p.relative_to(LEGACY))
        if rel in pages or p.name in PUBLIC_EXCLUDE or rel.startswith('.claude'):
            continue
        dst = PUBLIC / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dst)
        n += 1
    return n


def main():
    if not LEGACY.exists():
        sys.exit(f'нет {LEGACY}')
    if PAGES.exists():
        shutil.rmtree(PAGES)
    rows = [import_page(rel) for rel in PAGE_FILES]
    n_public = copy_public()
    print(f'Страниц: {len(rows)}; файлов в public/: {n_public}')
    for r in rows:
        print(f'  {r[0]:48} active={r[1] or "-":9} effects={"Y" if r[2] else "-"} read={"Y" if r[3] else "-"} ld={r[4]} cards={"Y" if r[5] else "-"}')
    print(f"Исправлено tel:+792****9500 → {report['fixed_tel']} (в контенте; ещё в шапке/меню/подвале — через компоненты)")
    print(f"Путей переведено на корневые: {report['rel_paths']}")
    print(f"id=\"contacts\" добавлен: {len(report['contacts_id_added'])} стр.")
    print(f"Закрыто незакрытых <div> в статьях: {len(report['closed_divs'])} стр.")
    print('Предупреждения:' if report['warnings'] else 'Предупреждений нет.')
    for w in report['warnings']:
        print('  ! ' + w)


if __name__ == '__main__':
    main()
