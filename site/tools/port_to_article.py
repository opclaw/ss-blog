#!/usr/bin/env python3
"""
Перенос статьи старого макета (Base + article.css сайта, тёмный фон) на единый макет
статьи `Article.astro` (светлый «лист», v6): TOC, «Коротко», FAQ, «Читать дальше», карточка
автора и JSON-LD — из одного места.

Что делает скрипт (детерминированно, без правок смысла):
  1. вытаскивает из старой разметки надзаголовок, H1, мету, оглавление, «Коротко»,
     FAQ и карточки «Читать дальше» → в пропсы `Article.astro`;
  2. переносит тело статьи, убирая структурные обёртки старого макета
     (хлебные крошки, дубль оглавления, две колонки-обёртки, CTA-секция, скрипты);
  3. перекрашивает инлайновые SVG-схемы под светлый лист (`retint`);
  4. убирает обёртки `.kit-dark` — компоненты кита светлые по умолчанию;
  5. превращает `<ul class="article-checklist">` в интерактивный `<Checklist>`;
  6. добавляет арт в шапку, вводный абзац и интерактив из `tools/migrate-style.json`
     (там же — короткое имя для BreadcrumbList и дата правки);
  7. перенумеровывает рисунки (SVG и компоненты кита) по порядку в тексте.

Запуск (из site/):
    python3 tools/port_to_article.py ii-dlya-turagentstva        # одна статья
    python3 tools/port_to_article.py --all --dry-run             # отчёт без записи
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOG = ROOT / 'src' / 'pages' / 'blog'
MANIFEST_PATH = ROOT / 'tools' / 'migrate-style.json'

SKIP = {'index'}
KIT_IMPORTS = {
    'Calc': "import Calc from '../../components/blog/Calc.astro';",
    'Checklist': "import Checklist from '../../components/blog/Checklist.astro';",
    'Timeline': "import Timeline from '../../components/blog/Timeline.astro';",
    'Tabs': "import Tabs from '../../components/blog/Tabs.astro';",
    'Matrix': "import Matrix from '../../components/blog/Matrix.astro';",
    'Prompt': "import Prompt from '../../components/blog/Prompt.astro';",
    'Funnel': "import Funnel from '../../components/blog/Funnel.astro';",
    'DocScan': "import DocScan from '../../components/blog/DocScan.astro';",
    'Sources': "import Sources from '../../components/blog/Sources.astro';",
    'HeroArt': "import HeroArt from '../../components/blog/HeroArt.astro';",
}

# Тёмная палитра схем → светлый лист (article.css). Точные пары заменяются как есть,
# остальные rgba(234,240,255,A) — по правилу с уменьшением альфы.
# Светлые цвета, которыми в тёмной теме подписывали схемы: на светлом листе их не видно.
# Для <text> заменяем на тёмный аналог (проверено замером контраста в браузере).
RETINT_TEXT = {
    # тёмные «чернила» старой темы тоже трогаем: в таблице заливок они становятся белыми,
    # а белый текст на светлом листе не читается
    '#0E0E14': '#101014', '#16161D': '#101014', '#2A2A33': '#2B2B33', '#E8E8ED': '#5E5E68',
    '#FFFFFF': '#101014', '#FFF': '#101014', '#F5F5F7': '#101014', '#EAF0FF': '#101014',
    '#E4E4DE': '#5E5E68', '#D2D2CA': '#5E5E68', '#B9C2D0': '#5E5E68', '#8C8C96': '#5E5E68',
    '#00D9FF': '#0A7EA4', '#7ED090': '#0E9F6E', '#E3F7FC': '#0A7EA4',
    '#FFB454': '#B45309', '#D97706': '#B45309', '#FF6B6B': '#C2410C', '#E05252': '#C2410C',
    '#B45309': '#B45309', '#0E9F6E': '#0E9F6E', '#0A7EA4': '#0A7EA4', '#C2410C': '#C2410C',
    '#101014': '#101014',
}

RETINT_EXACT = {
    'rgba(234,240,255,0.35)': 'rgba(16,16,20,0.28)',
    'rgba(234,240,255,0.3)': 'rgba(16,16,20,0.24)',
    'rgba(234,240,255,0.25)': 'rgba(16,16,20,0.2)',
    'rgba(234,240,255,0.14)': 'rgba(16,16,20,0.14)',
    'rgba(234,240,255,0.12)': 'rgba(16,16,20,0.12)',
    'rgba(234,240,255,0.1)': 'rgba(16,16,20,0.1)',
    'rgba(234,240,255,0.08)': 'rgba(16,16,20,0.05)',
    'rgba(234,240,255,0.07)': 'rgba(16,16,20,0.05)',
    'rgba(234,240,255,0.06)': 'rgba(16,16,20,0.05)',
    'rgba(234,240,255,0.05)': 'rgba(16,16,20,0.04)',
    'rgba(234,240,255,0.04)': 'rgba(16,16,20,0.04)',
    'rgba(234,240,255,0.03)': 'rgba(16,16,20,0.03)',
    '#7ED090': '#0E9F6E',
    'rgba(126,208,144,0.1)': 'rgba(14,159,110,0.1)',
    'rgba(126,208,144,0.2)': 'rgba(14,159,110,0.14)',
    '#E05252': '#C2410C',
    '#FF6B6B': '#C2410C',
    '#FFB454': '#B45309',
    'rgba(224,82,82,0.05)': 'rgba(194,65,12,0.05)',
    'rgba(224,82,82,0.12)': 'rgba(194,65,12,0.1)',
    'rgba(224,82,82,0.15)': 'rgba(194,65,12,0.12)',
    'rgba(224,82,82,0.18)': 'rgba(194,65,12,0.14)',
    'rgba(224,82,82,0.2)': 'rgba(194,65,12,0.16)',
    'rgba(224,82,82,0.35)': 'rgba(194,65,12,0.3)',
    'rgba(224,82,82,0.4)': 'rgba(194,65,12,0.34)',
    '#E8E8ED': '#E4E4DE',
    '#0E0E14': '#FFFFFF',
    '#16161D': '#FFFFFF',
    '#2A2A33': '#E4E4DE',
    '#0E2A33': '#E3F7FC',
    '#2A1215': '#FBEDE7',
    '#8A8A96': '#8C8C96',
}
# Цвета текста в схемах: на тёмном фоне текст был почти белым.
RETINT_TEXT_FILL = {'#F5F5F7': '#101014', '#FFFFFF': '#101014', '#fff': '#101014', '#EAf0FF': '#101014',
                    '#EAEAEF': '#101014', '#D2D2CA': '#5E5E68'}


def die(msg: str) -> None:
    print(f'✗ {msg}', file=sys.stderr)
    sys.exit(1)


def strip_tags(s: str) -> str:
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = s.replace('&nbsp;', ' ').replace('&laquo;', '«').replace('&raquo;', '»')
    s = s.replace('&mdash;', '—').replace('&ndash;', '–').replace('&amp;', '&')
    s = s.replace('&quot;', '"').replace('&#39;', "'")
    return re.sub(r'\s+', ' ', s).strip()


def match_div(text: str, start: int) -> int:
    """Индекс `</div>`, закрывающего div, открытый в позиции start. −1, если не найден."""
    assert text.startswith('<div', start)
    depth, i = 0, start
    while i < len(text):
        nxt_open = text.find('<div', i + 1)
        nxt_close = text.find('</div>', i + 1)
        if nxt_close == -1:
            return -1
        if nxt_open != -1 and nxt_open < nxt_close:
            depth += 1
            i = nxt_open
        else:
            if depth == 0:
                return nxt_close
            depth -= 1
            i = nxt_close
    return -1


def drop_kit_dark(text: str) -> tuple[str, int]:
    """Снимает обёртки .kit-dark: кит светлый по умолчанию."""
    n = 0
    while True:
        m = re.search(r'<div class="kit-dark">', text)
        if not m:
            return text, n
        end = match_div(text, m.start())
        if end == -1:
            die('не найден закрывающий div у .kit-dark')
        inner = text[m.end():end]
        inner = re.sub(r'\n\s{6}', '\n    ', inner)
        text = text[:m.start()] + inner.lstrip('\n') + text[end + len('</div>'):]
        n += 1


def _retint_svg_block(svg: str) -> tuple[str, int]:
    """Перекрашивает один SVG: заливки/обводки — по таблице, текст — в тёмный (иначе он белый на белом)."""
    n = 0

    def text_fill(m: re.Match) -> str:
        nonlocal n
        n += 1
        return m.group(1) + '#101014' + m.group(3)

    def repl(m: re.Match) -> str:
        nonlocal n
        val = m.group(2)
        if val in RETINT_EXACT:
            n += 1
            return m.group(1) + RETINT_EXACT[val] + m.group(3)
        return m.group(0)

    def rgba_sub(m: re.Match) -> str:
        nonlocal n
        a = float(m.group(1))
        n += 1
        return f'rgba(16,16,20,{max(0.03, min(0.3, round(a * 0.7, 3)))})'

    # 1) подписи <text>: светлые заливки → тёмные (и в атрибуте, и в inline-стиле)
    def text_color(m: re.Match) -> str:
        nonlocal n
        val = m.group(2)
        new = RETINT_TEXT.get(val.upper()) or RETINT_TEXT.get(val)
        if not new:
            return m.group(0)
        n += 1
        return m.group(1) + new + m.group(3)

    def fix_text_element(m: re.Match) -> str:
        el = re.sub(r'(fill=")([^"]+)(")', text_color, m.group(0))
        el = re.sub(r'(style="[^"]*?fill:\s*)(#[0-9A-Fa-f]{3,6})([^"]*")', text_color, el)
        return el

    svg = re.sub(r'<text[\s\S]*?</text>', fix_text_element, svg)
    # 2) заливки/обводки по таблице (атрибуты и inline-стили)
    svg = re.sub(r'(fill="|stroke=")([^"]+)(")', repl, svg)
    svg = re.sub(r'(style="[^"]*?(?:fill|stroke):\s*)([^;"]+)([;"])', repl, svg)
    # 3) остатки старой полупрозрачной палитры
    svg = re.sub(r'rgba\(234,240,255,([\d.]+)\)', rgba_sub, svg)
    return svg, n


def retint(text: str) -> tuple[str, int]:
    """Перекрашивает инлайновые SVG-схемы под светлый лист (только внутри <svg>, текст — в тёмный)."""
    total = 0

    def sub(m: re.Match) -> str:
        nonlocal total
        out, n = _retint_svg_block(m.group(0))
        total += n
        return out

    return re.sub(r'<svg[\s\S]*?</svg>', sub, text), total


def extract_head_consts(front: str) -> dict[str, str]:
    """Возвращает {имя: код} для всех const в старом фронтматтере, кроме jsonLd."""
    out: dict[str, str] = {}
    for m in re.finditer(r'^const (\w+)[^=]*= ', front, re.M):
        name = m.group(1)
        if name == 'jsonLd':
            continue
        start = m.start()
        i = front.index('=', start)
        depth = 0
        end = None
        j = i + 1
        while j < len(front):
            ch = front[j]
            if ch in '[{(':
                depth += 1
            elif ch in ']})':
                depth -= 1
                if depth < 0:
                    end = j + 1
                    break
            elif ch == ';' and depth == 0:
                end = j + 1
                break
            j += 1
        if end is None:
            die(f'не найден конец const {name}')
        out[name] = front[start:end].rstrip()
    return out


def renumber_figs(body: str) -> tuple[str, list[str]]:
    """Нумерует рисунки по порядку: `<span>Рис. N</span>` и `fig={N}` (компоненты кита)."""
    items = [(m.start(), m.end(), m.group(0), 'span') for m in re.finditer(r'<span>Рис\. \d+</span>', body)]
    items += [(m.start(), m.end(), m.group(0), 'kit') for m in re.finditer(r'fig=\{\d+\}', body)]
    items.sort()
    order = []
    for i, (s, e, raw, kind) in enumerate(items, start=1):
        order.append(str(i))
    for (s, e, raw, kind), i in sorted(zip(items, order), key=lambda x: -x[0][0]):
        new = f'<span>Рис. {i}</span>' if kind == 'span' else f'fig={{{i}}}'
        body = body[:s] + new + body[e:]
    return body, order


def repair_faq_nesting(block: str) -> tuple[str, int]:
    """Выпрямляет вложенность faq-item в старом HTML.

    В legacy-файлах часть карточек FAQ потеряла закрывающий div: следующая карточка
    оказывается вложенной в предыдущую. Раскладываем карточки в соседи, сохраняя
    остальные вложения (таблицы, обёртки внутри ответов) и баланс тегов.
    """
    out: list[str] = []
    stack: list[str] = []
    fixed = 0
    last = 0
    for m in re.finditer(r'<div\b[^>]*>|</div>', block):
        out.append(block[last:m.start()])      # текст между тегами сохраняем как есть
        last = m.end()
        tok = m.group(0)
        if tok.startswith('</'):
            if stack:
                stack.pop()
                out.append(tok)
            else:
                fixed += 1          # лишнее закрытие — выбрасываем
            continue
        is_item = 'class="faq-item"' in tok
        if is_item and stack:
            out.append('</div>' * len(stack))   # закрываем родителя и всех вложенных
            fixed += len(stack)
            stack.clear()
        stack.append('item' if is_item else 'other')
        out.append(tok)
    out.append(block[last:])
    if stack:
        out.append('</div>' * len(stack))
        fixed += len(stack)
    return ''.join(out), fixed

def convert(slug: str, man: dict, dry: bool = False) -> dict:
    path = BLOG / f'{slug}.astro'
    if not path.exists():
        die(f'нет файла {path}')
    src = path.read_text(encoding='utf-8')
    if 'layouts/Article.astro' in src:
        die(f'{slug}: уже на макете Article.astro')

    front, body_full = src.split('---\n', 2)[1], src.split('---\n', 2)[2]

    # --- шапка: пропсы
    title = re.search(r'title=\{"([^"]*)"\}', src).group(1)
    desc = re.search(r'description=\{"([^"]*)"\}', src).group(1)
    path_prop = re.search(r'path="([^"]*)"', src).group(1)
    kicker = strip_tags(re.search(r'<p class="label">(.*?)</p>', src, re.S).group(1))
    h1 = strip_tags(re.search(r'<h1 class="article-title">(.*?)</h1>', src, re.S).group(1))
    meta = strip_tags(re.search(r'<p class="article-meta">(.*?)</p>', src, re.S).group(1))
    month = re.search(r'·\s*([а-яё]+ \d{4})\s*·', meta)
    minutes = re.search(r'~(\d+)\s*минут', meta)
    month_year = month.group(1) if month else 'август 2026'
    minutes_n = int(minutes.group(1)) if minutes else 9
    date_pub = re.search(r'datePublished\\?":\s*\\?"([\d-]+)', src)
    date_pub = date_pub.group(1) if date_pub else '2026-08-23'
    og_title = re.search(r'ogTitle=\{\"([^\"]*)\"\}', src)
    og_desc = re.search(r'ogDescription=\{\"([^\"]*)\"\}', src)
    breadcrumb_old = re.search(r'"position":\s*3,\s*"name":\s*"([^"]+)"', src)
    breadcrumb = man.get('breadcrumb') or (breadcrumb_old.group(1) if breadcrumb_old else h1)

    # --- оглавление (из колонки «В статье»)
    aside = re.search(r'<aside class="article-aside-left".*?</aside>', src, re.S)
    toc = re.findall(r'<li><a href="#([^"]+)">(.*?)</a></li>', aside.group(0), re.S) if aside else []
    toc = [(i, strip_tags(t)) for i, t in toc]
    if not toc:
        toc = [(m.group(1) or f'sec-{n}', strip_tags(m.group(2))) for n, m in
               enumerate(re.finditer(r'<h2(?:\s+id="([^"]*)")?[^>]*>(.*?)</h2>', src, re.S), start=1)]

    # --- «Коротко»
    brief = []
    m_tldr = re.search(r'<div class="tldr">(.*?)</div>\s*', src, re.S)
    if m_tldr:
        brief = [strip_tags(x) for x in re.findall(r'<li>(.*?)</li>', m_tldr.group(1), re.S)]
    if man.get('brief'):
        brief = man['brief']

    # --- FAQ: выпрямляем вложенность карточек, разбираем их и вырезаем блок из исходника
    faq = []
    n_faq_fixed = 0
    m_list0 = re.search(r'<div class="faq-list"[^>]*>', src)
    if m_list0:
        end0 = match_div(src, m_list0.start())
        if end0 == -1:
            die(f'{slug}: у .faq-list нет закрывающего div')
        fixed_inner, n_faq_fixed = repair_faq_nesting(src[m_list0.end():end0])
        src = src[:m_list0.end()] + fixed_inner + src[end0:]
        pos, last_end = 0, None
        while True:
            m = re.compile(r'<div class="faq-item">').search(fixed_inner, pos)
            if not m:
                break
            close = match_div(fixed_inner, m.start())
            if close == -1:
                die(f'{slug}: у faq-item нет закрывающего div')
            block = fixed_inner[m.start():close + len('</div>')]
            pos = close + len('</div>')
            last_end = pos
            q = re.search(r'class="faq-question"[^>]*>(.*?)</button>', block, re.S)
            am = re.search(r'<div class="faq-answer"[^>]*>', block)
            if not q or not am:
                die(f'{slug}: в faq-item нет вопроса или ответа')
            a_end = match_div(block, am.start())
            if a_end == -1:
                die(f'{slug}: у faq-answer нет закрывающего div')
            faq.append((strip_tags(q.group(1)), strip_tags(block[am.end():a_end])))
        if last_end is not None:
            # вырезаем ровно блок вопросов, не задевая текст, который идёт после последней карточки
            cut_from = m_list0.start()
            cut_to = m_list0.end() + last_end
            m_close = re.match(r'\s*</div>', src[cut_to:])
            if m_close:
                cut_to += m_close.end()
            src = src[:cut_from] + src[cut_to:]
    if not faq:
        # формат без разметки faq-item: <h2>Частые вопросы</h2> + <h3>вопрос</h3><p>ответ</p>
        m2 = re.search(r'<h2[^>]*>\s*Частые вопросы\s*</h2>', src)
        if m2:
            nxt = re.search(r'<h2\b', src[m2.end():])
            seg_end = m2.end() + nxt.start() if nxt else len(src)
            seg = src[m2.end():seg_end]
            pairs = list(re.finditer(r'<h3[^>]*>(.*?)</h3>\s*<p[^>]*>(.*?)</p>', seg, re.S))
            faq = [(strip_tags(x.group(1)), strip_tags(x.group(2))) for x in pairs]
            if pairs:
                # последняя пара уже включает свой </p>: режем ровно по ней,
                # не задевая абзацы, которые идут после блока вопросов
                cut_to = m2.end() + pairs[-1].end()
                src = src[:m2.start()] + src[cut_to:]
    if not faq:
        die(f'{slug}: не разобран FAQ')

    # --- «Читать дальше»
    more = []
    for m in re.finditer(r'<a class="related-card" href="([^"]+)"[^>]*>(.*?)</a>', src, re.S):
        href, inner = m.group(1), m.group(2)
        meta_t = re.search(r'class="related-meta">(.*?)</span>', inner, re.S)
        title_t = re.search(r'class="related-title">(.*?)</span>', inner, re.S)
        more.append((href, strip_tags(meta_t.group(1)) if meta_t else '', strip_tags(title_t.group(1)) if title_t else ''))
    more = more[:3]

    # --- тело: структурно, по обёртке старого макета `.article-inner`
    # (внутри неё лежат контент, блок «Коротко» и FAQ; за ней — «Читать дальше» и CTA)
    m_inner = re.search(r'<div class="article-inner"[^>]*>', src)
    if not m_inner:
        die(f'{slug}: нет .article-inner во входной разметке')
    inner_end = match_div(src, m_inner.start())
    if inner_end == -1:
        die(f'{slug}: у .article-inner нет закрывающего div')
    body = src[m_inner.end():inner_end]
    # внутри .article-inner лежат контент, «Коротко», FAQ, «Читать дальше» и финальные абзацы;
    # обёртку .article-content снимаем, но соседние блоки и хвостовые абзацы сохраняем
    m_content = re.search(r'<div class="article-content"[^>]*>', body)
    if m_content:
        content_end = match_div(body, m_content.start())
        if content_end == -1:
            die(f'{slug}: у .article-content нет закрывающего div')
        body = (body[:m_content.start()] + body[m_content.end():content_end]
                + body[content_end + len('</div>'):])

    def cut_block(text: str, open_pat: str) -> tuple[str, str]:
        """Вырезает первый блок по открывающему шаблону (баланс тегов) и возвращает (текст, блок)."""
        m = re.search(open_pat, text)
        if not m:
            return text, ''
        close = match_div(text, m.start())
        if close == -1:
            die(f'{slug}: у блока {open_pat} нет закрывающего div')
        block = text[m.start():close + len('</div>')]
        return text[:m.start()] + text[close + len('</div>'):], block

    # «Коротко», «Читать дальше», карточку автора и CTA рисует макет: вырезаем их из тела
    body, _aside = cut_block(body, r'<div class="article-aside-right"[^>]*>')
    body = re.sub(r'<section[^>]*class="[^"]*section-cta[^"]*"[\s\S]*?</section>', '', body)
    body = re.sub(r'<AuthorCard\b[^>]*/>', '', body)
    body = re.sub(r'<ContactCards\b[^>]*/>', '', body)
    body, _related_block = cut_block(body, r'<div class="article-related"[^>]*>')
    body, tldr_block = cut_block(body, r'<div class="tldr"[^>]*>')
    if _related_block:
        m_brief2 = re.search(r'<div class="tldr"[^>]*>', _related_block)
        if m_brief2 and not brief:
            brief = [strip_tags(x) for x in re.findall(r'<li>(.*?)</li>', _related_block, re.S)]
    if tldr_block and not brief:
        brief = [strip_tags(x) for x in re.findall(r'<li>(.*?)</li>', tldr_block, re.S)]
    if tldr_block and not brief:
        # «Коротко» прозой: разбиваем абзац на предложения — по одному пункту на мысль
        body_without_title = re.sub(r'<p class="tldr-title"[^>]*>.*?</p>', '', tldr_block, flags=re.S)
        prose = ' '.join(strip_tags(x) for x in re.findall(r'<p[^>]*>(.*?)</p>', body_without_title, re.S))
        prose = re.sub(r'<[^>]+>', '', prose)
        brief = [x.strip() for x in re.split(r'(?<=[.!?])\s+', prose) if len(x.split()) >= 4][:6]
    # заголовки-подписи к вырезанным блокам
    body = re.sub(r'<h2[^>]*>\s*Частые вопросы\s*</h2>', '', body)
    body = re.sub(r'<h2 class="article-faq-title"[^>]*>[^<]*</h2>', '', body)

    # --- структурные обёртки старого макета из тела
    body = re.sub(r'<div class="tldr">.*?</div>\s*', '', body, flags=re.S, count=1)
    body, n_dark = drop_kit_dark(body)
    # класс `fig` оставляем: на нём держится зум-оверлей из script.js; `bl-fig` — оформление светлого листа
    body = body.replace('<figure class="fig">', '<figure class="fig bl-fig">')
    body = re.sub(r'<span class="fig-hint">[^<]*</span>', '', body)
    body, n_retint = retint(body)

    # --- чек-лист → интерактивный компонент
    consts: dict[str, str] = extract_head_consts(front)
    new_consts: dict[str, str] = {}
    n_check = 0
    used_check_titles: set[str] = set()

    def make_checklist(items: list[str], title: str) -> str:
        """Список готовности → <Checklist>: те же пункты, но со шкалой и вердиктом."""
        nonlocal n_check
        items = [i for i in items if i]
        if len(items) < 3:
            return ''
        n_check += 1
        name = f'checkItems{n_check}'
        new_consts[name] = 'const ' + name + ' = ' + json.dumps(items, ensure_ascii=False) + ';'
        title = title.split(':')[0].split('—')[0].strip()[:58]
        used_check_titles.add(title)
        return (f'<Checklist fig={{0}} title="{title}" items={{{name}}}\n'
                f'    note="Отметьте пункты, которые уже выполнены: шкала покажет, готовы ли вы к пилоту." />')

    def checklist_sub(m: re.Match) -> str:
        items = [strip_tags(x) for x in re.findall(r'<li>(.*?)</li>', m.group(1), re.S)]
        head = body[:m.start()]
        h2 = re.findall(r'<h2[^>]*>(.*?)</h2>', head, re.S)
        return make_checklist(items, strip_tags(h2[-1]) if h2 else 'Чек-лист готовности')

    # 1) списки с классом старого макета
    body = re.sub(r'<ul class="article-checklist">(.*?)</ul>', checklist_sub, body, flags=re.S)

    # 2) обычные <ul> сразу под заголовком «Чек-лист…» (в части статей список без класса)
    def checklist_after_heading(m: re.Match) -> str:
        items = [strip_tags(x) for x in re.findall(r'<li[^>]*>(.*?)</li>', m.group(2), re.S)]
        code = make_checklist(items, strip_tags(m.group(1)))
        return (m.group(1) + '\n' + code) if code else m.group(0)

    body = re.sub(r'(<h2[^>]*>(?:(?!</h2>).)*Чек-лист(?:(?!</h2>).)*</h2>)\s*<ul[^>]*>(.*?)</ul>',
                  checklist_after_heading, body, flags=re.S)

    # --- добавки из манифеста: арт, вводный абзац, интерактив
    hero = man.get('hero')
    hero_tag = ''
    if hero:
        labels = ', '.join("'" + x.replace("'", "\\'") + "'" for x in hero.get('labels', []))
        hero_tag = f'<HeroArt slot="hero" variant="{hero["variant"]}" labels={{[{labels}]}} />\n'
    intro = man.get('intro', '')

    for kit in man.get('kits', []):
        comp = kit['component']
        if kit.get('consts'):
            new_consts.update(kit['consts'])
        code = kit['code'].replace('fig={0}', 'fig={0}')       # номер поставит renumber
        anchor = kit.get('after')
        if not anchor:
            die(f'{slug}: у добавки {comp} не указан after')
        h2 = re.search(rf'<h2 id="{anchor}"[^>]*>.*?</h2>', body, re.S)
        if not h2:
            die(f'{slug}: не найден раздел {anchor} для {comp}')
        rest = body[h2.end():]
        if kit.get('position', 'first_para') == 'first_para':
            para = re.search(r'\n<p[ >].*?</p>', rest, re.S)
            pos = h2.end() + (para.end() if para else 0)
        else:
            nxt = re.search(r'\n<h2', rest)
            pos = h2.end() + (nxt.start() if nxt else len(rest))
        body = body[:pos].rstrip() + f'\n\n  {code.strip()}\n' + body[pos:]

    # контроль: в новое тело не должно утечь ни одного незакрытого div старого макета
    opens = len(re.findall(r'<div\b', body))
    closes = len(re.findall(r'</div>', body))
    if opens != closes:
        die(f'{slug}: после вырезания обёрток div не сходятся (открыто {opens}, закрыто {closes})')

    body = body.strip('\n')
    body = re.sub(r'\n\s*\n\s*\n+', '\n\n', body)
    body = '\n'.join('  ' + line if line.strip() else line for line in body.split('\n')).strip('\n')

    if intro:
        body = f'  <p class="bl-intro">{intro}</p>\n\n' + body

    body, fig_order = renumber_figs(body)

    # --- что используем
    used_kits = sorted({c for c in KIT_IMPORTS if re.search(rf'<{c}\b', body)})
    used_consts = {n for n in list(consts) + list(new_consts) if re.search(rf'\b{n}\b', body)}
    imports = [KIT_IMPORTS['HeroArt'] if hero else None] + [KIT_IMPORTS[c] for c in used_kits]
    imports = [x for x in imports if x]

    def arr(name: str, rows: list[str]) -> str:
        return f'const {name} = [\n' + '\n'.join('  ' + r for r in rows) + '\n];'

    toc_code = arr('toc', [f"{{ id: '{i}', label: '{l.replace(chr(39), chr(92)+chr(39))}' }}," for i, l in toc] +
                          ["{ id: 'sec-faq', label: 'Частые вопросы' },"])
    brief_code = arr('brief', [f"'{b.replace(chr(39), chr(92)+chr(39))}'," for b in brief])
    faq_rows = ['{ q: ' + json.dumps(q, ensure_ascii=False) + ', a: ' + json.dumps(a, ensure_ascii=False) + ' },' for q, a in faq]
    faq_code = arr('faq', faq_rows)
    more_code = arr('more', [f"{{ href: '{h}', meta: '{mm.replace(chr(39), chr(92)+chr(39))}', title: '{t.replace(chr(39), chr(92)+chr(39))}' }}," for h, mm, t in more])
    consts_code = '\n'.join(consts[n] for n in consts if n in used_consts) + \
                  ('\n' if consts and used_consts else '') + '\n'.join(new_consts[n] for n in new_consts)

    new = (
        '---\n'
        f'// {h1} — переведена на единый макет статьи (светлый лист, v6) 2026-09-25.\n'
        f'// Источник текста: legacy/version-4/blog/{slug}.html (импорт — tools/import_legacy.py,\n'
        '// перенос макета — tools/port_to_article.py; правки контента — по правилам CLAUDE.md).\n'
        "import Article from '../../layouts/Article.astro';\n"
        + '\n'.join(imports) + '\n\n'
        + toc_code + '\n\n' + brief_code + '\n\n' + faq_code + '\n\n' + more_code + '\n'
        + (('\n' + consts_code + '\n') if consts_code.strip() else '')
        + '---\n'
        f'<Article\n'
        f'  title={{{json.dumps(title, ensure_ascii=False)}}}\n'
        f'  description={{{json.dumps(desc, ensure_ascii=False)}}}\n'
        f'  path="{path_prop}"\n'
        f'  kicker="{kicker}"\n'
        f'  h1={{{json.dumps(h1, ensure_ascii=False)}}}\n'
        f'  monthYear="{month_year}" minutes={{{minutes_n}}}\n'
        f'  datePublished="{date_pub}" dateModified="{man.get("dateModified", "2026-09-25")}"\n'
        f'  breadcrumb={{{json.dumps(breadcrumb, ensure_ascii=False)}}}\n'
        + (f'  ogTitle={{{json.dumps(og_title.group(1), ensure_ascii=False)}}}\n' if og_title else '')
        + (f'  ogDescription={{{json.dumps(og_desc.group(1), ensure_ascii=False)}}}\n' if og_desc else '')
        + f'  toc={{toc}} brief={{brief}} faq={{faq}} more={{more}}\n'
        '>\n'
        + ('  ' + hero_tag if hero_tag else '')
        + body + '\n'
        '</Article>\n'
    )

    if not dry:
        path.write_text(new, encoding='utf-8')

    words_old = len(strip_tags(body_full).split())
    words_new = len(strip_tags(body).split())
    return {
        'slug': slug, 'words_old': words_old, 'words_new': words_new,
        'faq': len(faq), 'brief': len(brief), 'figs': len(fig_order), 'kits': used_kits,
        'kits_new': len(man.get('kits', [])), 'checklists': n_check, 'kit_dark_removed': n_dark,
        'retint': n_retint, 'more': len(more), 'toc': len(toc) + 1, 'faq_fixed': n_faq_fixed,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('slugs', nargs='*')
    ap.add_argument('--all', action='store_true', help='все статьи из манифеста')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    man_all = json.loads(MANIFEST_PATH.read_text(encoding='utf-8'))
    slugs = list(man_all) if args.all else args.slugs
    if not slugs:
        die('укажите slug статьи или --all')

    print(f'{"статья":36} {"слов было":>9} {"стало":>6} {"FAQ":>3} {"кор":>3} {"рис":>3} {"кит":>3} {"чек":>3}  компоненты')
    bad = 0
    for slug in slugs:
        man = man_all.get(slug, {})
        if not man:
            print(f'{slug:36} — нет в tools/migrate-style.json, пропуск (ничего не меняю)')
            bad += 1
            continue
        if 'layouts/Article.astro' in (BLOG / f'{slug}.astro').read_text(encoding='utf-8'):
            print(f'{slug:36} — уже на макете, пропуск')
            continue
        r = convert(slug, man, dry=args.dry_run)
        print(f"{r['slug']:36} {r['words_old']:>9} {r['words_new']:>6} {r['faq']:>3} {r['brief']:>3} "
              f"{r['figs']:>3} {r['kits_new']:>3} {r['checklists']:>3}  {', '.join(r['kits'])}")
    if bad:
        print(f'\n{ "записано" if not args.dry_run else "проверено (dry-run)" }: {len(slugs) - bad} из {len(slugs)}')


if __name__ == '__main__':
    main()
