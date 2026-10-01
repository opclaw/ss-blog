#!/usr/bin/env python3
"""
Аудит собранного сайта (site/dist) глазами диджитал-команды:
SEO-мета, микроразметка, структура, вес страниц, служебные файлы.

Проверяет по каждой странице:
  - <title>, description: наличие, длину, дубли между страницами;
  - canonical (совпадает с адресом страницы), og:title / og:description / og:image / og:url;
  - <html lang>, viewport, theme-color, skip-nav;
  - ровно один H1, дубли H1 между страницами, порядок заголовков;
  - JSON-LD: синтаксис, типы, автор/даты у статей, FAQPage ↔ видимый FAQ;
  - «Коротко» (TL;DR), автор и время чтения в статьях;
  - картинки: alt, вес локальных файлов;
  - смешанный контент (http://), target=_blank без rel=noopener;
  - вес HTML, размер styles.css / script.js, самые тяжёлые файлы;
  - robots.txt: устаревшие директивы, правила против существующих файлов;
  - sitemap.xml: адреса совпадают со сборкой, есть ли lastmod;
  - .htaccess: закрывает ли он нужные файлы (manifest.json);
  - оглавление блога: карточки = статьи.

Ошибка (ERROR) — то, что ломает индексацию/работу сайта. Предупреждение (WARN) — риск.
Код выхода 1, если есть ERROR.

Запуск (из site/):  python3 tools/seo-audit.py
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
PUBLIC = ROOT / 'public'
BASE = 'https://smartsolutions.today/'
IMG_WARN_KB = 300
TITLE = (25, 60)          # рекомендация Яндекса/Google по длине
DESC = (80, 170)

errors: list[str] = []
warns: list[str] = []
notes: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warns.append(msg)


def note(msg: str) -> None:
    notes.append(msg)


def rel(p: Path) -> str:
    return str(p.relative_to(DIST))


def url_of(relpath: str) -> str:
    r = relpath.replace('\\', '/')
    if r == 'index.html':
        return BASE
    if r.endswith('/index.html'):
        return urljoin(BASE, r[:-len('index.html')])
    return urljoin(BASE, r)


def text_of(html: str) -> str:
    """Видимый текст: без скриптов, стилей и разметки."""
    html = re.sub(r'<(script|style)\b.*?</\1>', ' ', html, flags=re.S | re.I)
    html = re.sub(r'<[^>]+>', ' ', html)
    html = re.sub(r'&[a-z]+;|&#\d+;', ' ', html)
    return re.sub(r'\s+', ' ', html).strip()


def ld_blocks(html: str) -> list[str]:
    return re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S)


def ld_types(obj, out: list[str]) -> None:
    if isinstance(obj, dict):
        t = obj.get('@type')
        if isinstance(t, str):
            out.append(t)
        elif isinstance(t, list):
            out.extend(x for x in t if isinstance(x, str))
        for v in obj.values():
            ld_types(v, out)
    elif isinstance(obj, list):
        for v in obj:
            ld_types(v, out)


def find_objects(obj, type_name: str) -> list[dict]:
    found: list[dict] = []
    if isinstance(obj, dict):
        t = obj.get('@type')
        if t == type_name or (isinstance(t, list) and type_name in t):
            found.append(obj)
        for v in obj.values():
            found.extend(find_objects(v, type_name))
    elif isinstance(obj, list):
        for v in obj:
            found.extend(find_objects(v, type_name))
    return found


def meta(html: str, attr: str, key: str) -> list[str]:
    out = []
    for m in re.finditer(r'<meta\b[^>]*>', html, re.I):
        tag = m.group(0)
        if re.search(rf'{attr}="{re.escape(key)}"', tag, re.I):
            v = re.search(r'content="([^"]*)"', tag, re.I)
            if v:
                out.append(v.group(1))
    return out


def main() -> None:
    if not DIST.exists():
        print('Нет site/dist — сначала соберите: npm run build')
        sys.exit(1)

    SERVICE = {'404.html'}   # служебные страницы: noindex, в sitemap не входят
    pages = sorted(p for p in DIST.rglob('*.html')
                   if not re.match(r'(google|yandex)', p.name) and p.name not in SERVICE)
    articles = [p for p in pages if p.parent.name == 'blog' and p.name != 'index.html']
    blog_index = DIST / 'blog' / 'index.html'

    print(f'Аудит сборки: {len(pages)} страниц, из них статей блога {len(articles)}\n')

    titles: dict[str, list[str]] = defaultdict(list)
    descs: dict[str, list[str]] = defaultdict(list)
    h1s: dict[str, list[str]] = defaultdict(list)

    for p in pages:
        html = p.read_text(encoding='utf-8')
        r = rel(p)
        is_article = p in articles
        kind = 'статья' if is_article else 'страница'

        # --- title
        t = re.search(r'<title>(.*?)</title>', html, re.S)
        title = t.group(1).strip() if t else ''
        if not title:
            err(f'{r}: нет <title>')
        else:
            titles[title].append(r)
            if not (TITLE[0] <= len(title) <= TITLE[1]):
                warn(f'{r}: title {len(title)} симв. (норма {TITLE[0]}–{TITLE[1]}): {title[:70]}')

        # --- description
        d = meta(html, 'name', 'description')
        if not d:
            err(f'{r}: нет meta description')
        else:
            desc = d[0]
            descs[desc].append(r)
            if not (DESC[0] <= len(desc) <= DESC[1]):
                warn(f'{r}: description {len(desc)} симв. (норма {DESC[0]}–{DESC[1]}): {desc[:70]}')
            if len(d) > 1:
                err(f'{r}: несколько meta description')

        # --- canonical / og
        c = re.findall(r'<link[^>]*rel="canonical"[^>]*href="([^"]+)"', html, re.I)
        if not c:
            err(f'{r}: нет canonical')
        elif c[0] != url_of(r):
            err(f'{r}: canonical {c[0]} ≠ адрес страницы {url_of(r)}')
        if len(c) > 1:
            err(f'{r}: несколько canonical')
        for prop in ('og:title', 'og:description', 'og:image'):
            if not meta(html, 'property', prop):
                warn(f'{r}: нет {prop}')
        ou = meta(html, 'property', 'og:url')
        if ou and c and ou[0] != c[0]:
            err(f'{r}: og:url {ou[0]} ≠ canonical {c[0]}')

        # --- база
        if not re.search(r'<html[^>]*\blang="ru"', html, re.I):
            err(f'{r}: нет <html lang="ru">')
        if not meta(html, 'name', 'viewport'):
            warn(f'{r}: нет viewport')
        if not meta(html, 'name', 'theme-color'):
            warn(f'{r}: нет theme-color')
        if 'skip-nav' not in html:
            warn(f'{r}: нет ссылки «Перейти к содержимому»')

        # --- заголовки
        h = re.findall(r'<h1\b[^>]*>(.*?)</h1>', html, re.S | re.I)
        if len(h) != 1:
            err(f'{r}: H1 — {len(h)} шт. (нужен ровно один)')
        else:
            h1s[text_of(h[0])].append(r)
        h2 = len(re.findall(r'<h2\b', html, re.I))
        if is_article and h2 < 8:
            warn(f'{r}: всего {h2} H2 (бриф: 10–12 разделов)')
        seq = [m.group(1).lower() for m in re.finditer(r'<(h[1-3])\b', html, re.I)]
        if seq and seq[0] != 'h1':
            warn(f'{r}: первый заголовок — {seq[0]}, а не h1')

        # --- JSON-LD
        blocks = ld_blocks(html)
        if not blocks:
            warn(f'{r}: нет JSON-LD')
        types: list[str] = []
        for b in blocks:
            try:
                ld_types(json.loads(b), types)
            except json.JSONDecodeError as e:
                err(f'{r}: JSON-LD не парсится ({e.msg})')
        if is_article:
            for need in ('Article', 'BreadcrumbList', 'FAQPage'):
                if need not in types:
                    warn(f'{r}: в JSON-LD нет {need}')
            for b in blocks:
                try:
                    obj = json.loads(b)
                except json.JSONDecodeError:
                    continue
                for art in find_objects(obj, 'Article') + find_objects(obj, 'BlogPosting'):
                    author = art.get('author')
                    if not isinstance(author, dict) or not author.get('name'):
                        warn(f'{r}: у Article нет автора (E-E-A-T)')
                    for key in ('datePublished', 'dateModified'):
                        if not art.get(key):
                            warn(f'{r}: у Article нет {key}')
            faq = 0
            for b in blocks:
                try:
                    faq += sum(len(o.get('mainEntity') or []) for o in find_objects(json.loads(b), 'FAQPage'))
                except json.JSONDecodeError:
                    pass
            visible = (len(re.findall(r'<details\b', html)) + len(re.findall(r'faq-answer', html))
                       + len(re.findall(r'Частые вопросы', html)))
            if faq and not visible:
                warn(f'{r}: FAQPage в схеме ({faq} вопросов), но видимого FAQ на странице нет')
            if not faq:
                warn(f'{r}: нет FAQPage')
            if 'tldr-title' not in html and 'bl-brief-t' not in html:
                warn(f'{r}: нет блока «Коротко» (TL;DR)')
            if 'минут чтения' not in html:
                warn(f'{r}: нет времени чтения в мете статьи')

        # --- картинки
        for tag in re.findall(r'<img\b[^>]*>', html, re.I):
            if 'alt=' not in tag:
                src = re.search(r'src="([^"]+)"', tag)
                warn(f'{r}: <img> без alt: {src.group(1) if src else "?"}')
        for m in re.finditer(r'(?:src|href)="(http://[^"]+)"', html):
            err(f'{r}: смешанный контент http:// → {m.group(1)}')

        # --- ссылки наружу в новой вкладке
        for a in re.findall(r'<a\b[^>]*target="_blank"[^>]*>', html, re.I):
            if 'noopener' not in a:
                warn(f'{r}: target=_blank без rel=noopener')

        # --- вес и объём
        wc = len(text_of(html).split())
        if is_article and wc < 700:
            warn(f'{r}: {wc} слов текста (мало для статьи)')
        size_kb = p.stat().st_size / 1024
        if size_kb > 300:
            note(f'{r}: HTML {size_kb:.0f} КБ')

    # --- дубли между страницами
    for t, rs in titles.items():
        if len(rs) > 1:
            err(f'дубли title ({len(rs)}): {", ".join(rs)}')
    for d, rs in descs.items():
        if len(rs) > 1:
            err(f'дубли description ({len(rs)}): {", ".join(rs)}')
    for h, rs in h1s.items():
        if len(rs) > 1:
            warn(f'дубли H1 «{h[:50]}»: {", ".join(rs)}')

    # --- оглавление блога ↔ статьи
    if blog_index.exists():
        cards = set(re.findall(r'href="/blog/([\w-]+)\.html"', blog_index.read_text(encoding='utf-8')))
        real = {p.stem for p in articles}
        if cards != real:
            if real - cards:
                err(f'нет карточек в /blog/: {", ".join(sorted(real - cards))}')
            if cards - real:
                err(f'карточки ведут на несуществующие статьи: {", ".join(sorted(cards - real))}')
        else:
            note(f'оглавление блога: {len(cards)} карточек = {len(real)} статей')
    else:
        err('нет /blog/index.html')

    # --- robots.txt
    robots = PUBLIC / 'robots.txt'
    if not robots.exists():
        err('нет robots.txt')
    else:
        rb = robots.read_text(encoding='utf-8')
        if 'Sitemap:' not in rb:
            err('robots.txt: нет директивы Sitemap')
        if re.search(r'^Host:', rb, re.M):
            warn('robots.txt: устаревшая директива Host (Яндекс не использует с 2018)')
        LEGACY_RULES = ('/wp-', '/category', '/feed', '/trackback', '/author', '/tag', '/page/', '/xmlrpc.php', '/send.php')
        for m in re.finditer(r'^Disallow:\s*(\S+)', rb, re.M):
            rule = m.group(1)
            if not rule.startswith('/') or any(ch in rule for ch in '*$'):
                continue
            if rule.startswith(LEGACY_RULES):
                continue  # старые пути WordPress: закрыты осознанно, отдаются 410
            if not (DIST / rule.lstrip('/')).exists() and rule != '/':
                warn(f'robots.txt: Disallow: {rule} — такого файла в сборке нет')
        if re.search(r'Disallow:\s*/\*\.json\$', rb) and (DIST / 'manifest.json').exists():
            warn('robots.txt: правило /*.json$ закрывает нужный /manifest.json')

    # --- sitemap.xml
    sm = PUBLIC / 'sitemap.xml'
    if not sm.exists():
        err('нет sitemap.xml')
    else:
        s = sm.read_text(encoding='utf-8')
        locs = set(re.findall(r'<loc>([^<]+)</loc>', s))
        own = {url_of(rel(p)) for p in pages}   # 404 в карту сайта не входит — это правильно
        if own - locs:
            err(f'sitemap.xml: нет {len(own - locs)} страниц: {", ".join(sorted(own - locs)[:5])}')
        if locs - own:
            err(f'sitemap.xml: лишние адреса: {", ".join(sorted(locs - own)[:5])}')
        if '<lastmod>' not in s:
            warn('sitemap.xml: нет lastmod ни у одной страницы')
        for m in re.finditer(r'<url>\s*<loc>([^<]+)</loc>(.*?)</url>', s, re.S):
            if '<lastmod>' not in m.group(2):
                pass  # lastmod не обязем — считаем по наличию выше

    # --- .htaccess
    ht = PUBLIC / '.htaccess'
    if ht.exists():
        hb = ht.read_text(encoding='utf-8')
        if re.search(r'FilesMatch\s+"[^"]*json', hb) and (DIST / 'manifest.json').exists():
            if 'manifest' not in hb:
                err('.htaccess: запрет .json закрывает /manifest.json (его запрашивает браузер)')
        for m in re.finditer(r'Files?\s+"([^"]+)"', hb):
            name = m.group(1)
            if name.startswith('.') or name == 'send.php':
                continue  # send.php в сборку не входит: правило на случай ручной выгрузки
            if not (DIST / name).exists():
                warn(f'.htaccess: правило для {name}, которого нет в сборке')

    # --- перелинковка: входящие ссылки из других статей
    slugs = {p.stem for p in articles}
    incoming: Counter = Counter()
    for p in articles:
        h = p.read_text(encoding='utf-8')
        for t in set(re.findall(r'href="/blog/([\w-]+)\.html"', h)):
            if t != p.stem:
                incoming[t] += 1
    orphans = sorted(s for s in slugs if incoming[s] == 0)
    if orphans:
        warn(f'статьи без входящих ссылок из других статей: {", ".join(orphans)}')
    note('перелинковка: ' + ', '.join(f'{s} ←{incoming[s]}' for s in sorted(slugs, key=lambda x: incoming[x])[:5]))

    # --- блок «Из блога» на ai.html
    ai = DIST / 'ai.html'
    if ai.exists():
        linked = set(re.findall(r'href="/blog/([\w-]+)\.html"', ai.read_text(encoding='utf-8')))
        missing = sorted(slugs - linked)
        if missing:
            warn(f'ai.html: в блоке «Из блога» нет {len(missing)} статей: {", ".join(missing)}')

    # --- служебные файлы: валидность и совпадение с данными сайта
    import xml.etree.ElementTree as ET
    sm_file = PUBLIC / 'sitemap.xml'
    if sm_file.exists():
        try:
            ET.fromstring(sm_file.read_text(encoding='utf-8'))
        except ET.ParseError as e:
            err(f'sitemap.xml: битый XML ({e})')
    for name in ('manifest.json',):
        f = DIST / name
        if f.exists():
            try:
                json.loads(f.read_text(encoding='utf-8'))
            except json.JSONDecodeError as e:
                err(f'{name}: битый JSON ({e})')
    bc = DIST / 'browserconfig.xml'
    if bc.exists():
        try:
            ET.fromstring(bc.read_text(encoding='utf-8'))
        except ET.ParseError as e:
            warn(f'browserconfig.xml: битый XML ({e})')
    og = re.search(r'ogImage:\s*\'([^\']+)\'', (ROOT / 'src' / 'data' / 'site.ts').read_text(encoding='utf-8'))
    if og:
        og_rel = urlparse(og.group(1)).path.lstrip('/')
        if not (DIST / og_rel).exists():
            err(f'og:image {og.group(1)} — файла нет в сборке')
    mid = re.search(r'metrikaId:\s*(\d+)', (ROOT / 'src' / 'data' / 'site.ts').read_text(encoding='utf-8'))
    if mid:
        want = mid.group(1)
        ids = set(re.findall(r'mc\.yandex\.ru/metrika/tag\.js\?id=(\d+)', (DIST / 'index.html').read_text(encoding='utf-8')))
        # Метрика подключается в одном месте — сверим id на всех страницах
        for p_ in pages:
            found = re.findall(r'mc\.yandex\.ru/metrika/tag\.js\?id=(\d+)', p_.read_text(encoding='utf-8'))
            if found and set(found) != {want}:
                err(f'{rel(p_)}: счётчик Метрики {found} ≠ {want} из site.ts')

    # --- вес страницы: HTML + подключённые css/js/картинки
    heavy_pages = []
    for p_ in pages:
        html_ = p_.read_text(encoding='utf-8')
        total = p_.stat().st_size
        for m in re.finditer(r'<(?:link|script)[^>]+(?:href|src)="(/[^"]+\.(?:css|js))"', html_):
            f = DIST / m.group(1).lstrip('/')
            if f.exists():
                total += f.stat().st_size
        for m in re.finditer(r'<img[^>]+src="(/images/[^"]+)"', html_):
            f = DIST / m.group(1).lstrip('/')
            if f.exists():
                total += f.stat().st_size
        heavy_pages.append((total / 1024, rel(p_)))
    heavy_pages.sort(reverse=True)
    note('тяжелейшие страницы (HTML + свои css/js + картинки): ' +
         ', '.join(f'{r} {kb:.0f} КБ' for kb, r in heavy_pages[:4]))

    # --- вес
    css = PUBLIC / 'styles.css'
    js = PUBLIC / 'script.js'
    if css.exists():
        note(f'styles.css {css.stat().st_size / 1024:.0f} КБ')
    if js.exists():
        note(f'script.js {js.stat().st_size / 1024:.0f} КБ')
    heavy = sorted((f for f in (PUBLIC / 'images').rglob('*') if f.is_file()),
                   key=lambda f: -f.stat().st_size)
    big = [(f, f.stat().st_size / 1024) for f in heavy if f.stat().st_size / 1024 > IMG_WARN_KB]
    if big:
        warn(f'тяжёлые картинки (>{IMG_WARN_KB} КБ): ' +
             ', '.join(f'{f.name} {kb:.0f} КБ' for f, kb in big[:6]))
    images_total = sum(f.stat().st_size for f in (PUBLIC / 'images').rglob('*') if f.is_file()) / 1024 / 1024
    note(f'images/ всего {images_total:.1f} МБ')

    # --- Метрика
    with_metrika = sum(1 for p in pages if 'mc.yandex.ru' in p.read_text(encoding='utf-8'))
    note(f'Яндекс.Метрика подключена на {with_metrika} из {len(pages)} страниц')

    # --- вывод
    print('=' * 72)
    if errors:
        print(f'ОШИБКИ ({len(errors)}):')
        for e in errors:
            print(f'  ✗ {e}')
    if warns:
        print(f'\nПРЕДУПРЕЖДЕНИЯ ({len(warns)}):')
        for w in warns:
            print(f'  ⚠ {w}')
    if notes:
        print('\nК сведению:')
        for n in notes:
            print(f'  · {n}')
    verdict = 'OK — ошибок нет' if not errors else f'{len(errors)} ошибок'
    print(f'\nИТОГ: {verdict} (предупреждений: {len(warns)})')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
