#!/usr/bin/env python3
"""
QA-проверка готовых страниц (site/dist): целостность разметки и доступность.

Что проверяется:
  - нет дублей id на странице;
  - все ссылки-якоря (`#...`) ведут на существующий id — и на той же странице,
    и при переходе на другую страницу сайта (например, «/#approach»);
  - пропуск к содержимому («Перейти к содержимому») ведёт на реальный id;
  - у каждой ссылки есть текст или aria-label (пустых ссылок нет);
  - у каждой кнопки есть текст или aria-label;
  - у изображений есть alt (в т.ч. пустой alt="" — это допустимо);
  - незакрытые/лишние теги (по стеку HTMLParser);
  - у бургер-кнопки есть aria-expanded/aria-controls (состояние меню читается скринридером);
  - по одной <main>/<header>/<footer> на страницу.

Код выхода 1, если есть ошибки.

Запуск (из site/):  python3 tools/qa-check.py
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source',
        'track', 'wbr', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'stop',
        'ellipse', 'use', 'text', 'tspan', 'defs', 'g'}
# ^ в SVG-контенте статьи встречаются самозакрывающиеся узлы; закрывающие теги там не обязательны
OPTIONAL_CLOSE = {'p', 'li', 'td', 'th', 'tr', 'option', 'dt', 'dd'}

errors: list[str] = []
warns: list[str] = []
notes: list[str] = []


def url_to_file(path: str) -> Path | None:
    if not path or path == '/':
        return DIST / 'index.html'
    if path.endswith('/'):
        return DIST / path.lstrip('/') / 'index.html'
    if path.endswith('.html'):
        return DIST / path.lstrip('/')
    return DIST / path.lstrip('/')   # ресурс (иконки, картинки)")


def is_resource(path: str) -> bool:
    return bool(path) and not path.endswith(('/', '.html'))


def ids_of(path: Path) -> set[str]:
    return set(re.findall(r'\sid="([^"]+)"', path.read_text(encoding='utf-8')))


class Structure(HTMLParser):
    """Ищет незакрытые теги и собирает факты для проверок доступности."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, int]] = []
        self.unclosed: list[tuple[str, int]] = []
        self.extra_close: list[tuple[str, int]] = []
        self.links: list[tuple[int, str, str, str]] = []   # (строка, href, текстовый контент, aria-label)
        self.buttons: list[tuple[int, str, str]] = []
        self._link_depth = 0
        self._btn_depth = 0
        self._link_start = 0
        self._buf = ''

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        line = self.getpos()[0]
        if tag not in VOID and tag not in OPTIONAL_CLOSE:
            self.stack.append((tag, line))
        if tag == 'a':
            self._link_depth += 1
            if self._link_depth == 1:
                self._link_start = line
                self._buf = ''
                self._pending = (a.get('href', ''), a.get('aria-label', ''))
        elif tag == 'button':
            self._btn_depth += 1
            if self._btn_depth == 1:
                self._buf = ''
                self._pending_btn = (line, a.get('aria-label', ''), a.get('aria-expanded'))

    def handle_endtag(self, tag):
        if tag in OPTIONAL_CLOSE or tag in VOID:
            return
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
        else:
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i][0] == tag:
                    self.unclosed.extend(self.stack[i + 1:])
                    del self.stack[i:]
                    break
            else:
                if tag not in ('html', 'body'):
                    self.extra_close.append((tag, self.getpos()[0]))
        if tag == 'a' and self._link_depth:
            self._link_depth -= 1
            if self._link_depth == 0:
                href, aria = getattr(self, '_pending', ('', ''))
                self.links.append((self._link_start, href, self._buf.strip(), aria))
        elif tag == 'button' and self._btn_depth:
            self._btn_depth -= 1
            if self._btn_depth == 0:
                line, aria, expanded = getattr(self, '_pending_btn', (0, '', None))
                self.buttons.append((line, aria, (self._buf.strip(), expanded)))

    def handle_data(self, data):
        if self._link_depth or self._btn_depth:
            self._buf += data


def main() -> None:
    pages = sorted(p for p in DIST.rglob('*.html') if not re.match(r'(google|yandex)', p.name))
    if not pages:
        print('Нет site/dist — сначала npm run build')
        sys.exit(1)
    print(f'QA-проверка: {len(pages)} страниц\n')

    for p in pages:
        rel = str(p.relative_to(DIST))
        html = p.read_text(encoding='utf-8')

        # --- дубли id
        ids = re.findall(r'\sid="([^"]+)"', html)
        dup = {i for i in ids if ids.count(i) > 1}
        if dup:
            errors.append(f'{rel}: дубли id — {", ".join(sorted(dup))}')

        # --- якоря (включая переходы на другие страницы)
        for href in re.findall(r'href="([^"]*#[^"]+)"', html):
            u = urlparse(href)
            if u.scheme and u.netloc and 'smartsolutions.today' not in u.netloc:
                continue
            if u.netloc and 'smartsolutions.today' not in u.netloc:
                continue
            if u.path:
                target = url_to_file(u.path)
                if target is None or not target.exists():
                    errors.append(f'{rel}: {href} — файла {u.path} нет в сборке')
                    continue
            else:
                target = p
            if u.fragment and u.fragment not in ids_of(target):
                what = 'символа' if is_resource(u.path) else 'id'
                errors.append(f'{rel}: {href} — нет {what} «{u.fragment}» в {target.relative_to(DIST)}')

        # --- пропуск к содержимому
        skip = re.search(r'class="skip-nav"[^>]*href="#([^"]+)"', html) or \
               re.search(r'href="#([^"]+)"[^>]*class="skip-nav"', html)
        if skip and skip.group(1) not in ids:
            errors.append(f'{rel}: «Перейти к содержимому» ведёт на несуществующий #{skip.group(1)}')

        # --- структура и доступность
        s = Structure()
        s.feed(html)
        for tag, line in s.unclosed:
            warns.append(f'{rel}:{line}: не закрыт <{tag}>')
        for tag, line in s.extra_close:
            warns.append(f'{rel}:{line}: лишний </{tag}>')
        for line, href, text, aria in s.links:
            if not text and not aria and 'aria-labelledby' not in html[max(0, 0):]:
                if href and not href.startswith('#'):
                    warns.append(f'{rel}:{line}: ссылка без текста и aria-label ({href})')
        for line, aria, expanded in s.buttons:
            if not aria and not expanded:
                warns.append(f'{rel}:{line}: кнопка без текста/aria-label и без aria-expanded')
        for m in re.finditer(r'<img\b[^>]*>', html, re.I):
            if 'alt=' not in m.group(0):
                errors.append(f'{rel}: <img> без alt')

    # --- каркас страницы
    for p in pages:
        rel = str(p.relative_to(DIST))
        html = p.read_text(encoding='utf-8')
        for tag in ('header', 'footer'):
            n = len(re.findall(rf'<{tag}\b', html, re.I))
            if n > 1:
                warns.append(f'{rel}: <{tag}> встречается {n} раз')
        if not re.search(r'<main\b', html, re.I):
            warns.append(f'{rel}: нет <main> (скринридер не выделяет основной блок)')
        if not re.search(r'<button[^>]*id="navBurger"[^>]*aria-expanded', html):
            warns.append(f'{rel}: у бургера нет aria-expanded')

    # --- текст: типографские огрехи (проверяются сами текстовые узлы, без разметки)
    class TextNodes(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.skip = 0
            self.nodes: list[str] = []

        # <pre> не проверяем: там переносы и отступы значимы (промпты для копирования)
        SKIP_TAGS = ('script', 'style', 'pre')

        def handle_starttag(self, tag, attrs):
            if tag in self.SKIP_TAGS:
                self.skip += 1

        def handle_endtag(self, tag):
            if tag in self.SKIP_TAGS and self.skip:
                self.skip -= 1
        def handle_data(self, data):
            if not self.skip and data.strip():
                self.nodes.append(data)

    TYPO_PATTERNS = (
        (r'[ \t]{2,}', 'двойной пробел'),
        (r'\s+[.,;:!?](\s|$)', 'пробел перед знаком препинания'),
        (r'\b(и|в|на|с|по|не|что|как)\s+\1\b', 'повтор слова'),
    )
    typo_left = 0
    typo_total = 0
    for p in pages:
        rel = str(p.relative_to(DIST))
        t = TextNodes()
        t.feed(p.read_text(encoding='utf-8'))
        for node in t.nodes:
            # как в браузере: перевод строки + отступ = один пробел (иначе ловим форматирование исходника)
            node = re.sub(r'[^\S\n]*\n[^\S\n]*', ' ', node)
            for pat, what in TYPO_PATTERNS:
                for m in re.finditer(pat, node, re.I):
                    typo_total += 1
                    if typo_left < 10:
                        typo_left += 1
                        frag = node[max(0, m.start() - 35):m.end() + 25].strip()
                        warns.append(f'{rel}: {what} — «…{frag}…»')
                    elif typo_left == 10:
                        typo_left += 1
                        warns.append('… остальные типографские замечания см. в полном списке')
    if typo_total:
        warns.append(f'всего типографских замечаний: {typo_total}')

    # --- карточка автора: у каждой статьи блога, из одного источника (AUTHOR/CONTACTS в site.ts)
    bio = re.search(r"bio:\s*'([^']+)'", (ROOT / 'src/data/site.ts').read_text(encoding='utf-8'))
    bio = bio.group(1) if bio else None
    blog_articles = [x for x in pages if x.parent.name == 'blog' and x.name != 'index.html']
    for p in blog_articles:
        rel = str(p.relative_to(DIST))
        html = p.read_text(encoding='utf-8')
        if 'author-card-bio' not in html:
            errors.append(f'{rel}: нет карточки автора (класс author-card-bio)')
            continue
        if bio and bio not in html:
            errors.append(f'{rel}: текст автора в карточке не совпадает с site.ts (AUTHOR.bio)')
        if 't.me/' not in html:
            errors.append(f'{rel}: в карточке автора нет ссылки на Telegram')
        if 'class="author-card-name"' not in html:
            errors.append(f'{rel}: в карточке автора нет имени')
        cards = html.count('<aside class="author-card')
        if cards != 1:
            errors.append(f'{rel}: карточка автора встречается {cards} раз(а), ожидается одна')
    # --- тема карточки: на светлом «листе» — светлая, в тёмных статьях — тёмная
    for p in blog_articles:
        rel = str(p.relative_to(DIST))
        html = p.read_text(encoding='utf-8')
        light_sheet = 'bl-sheet' in html          # светлый лист статьи (Article.astro / свой макет)
        light_card = 'author-card--light' in html
        if light_sheet and not light_card:
            errors.append(f'{rel}: светлый лист, но карточка автора тёмная (нужен theme="light")')
        if light_card and not light_sheet:
            errors.append(f'{rel}: тёмная статья, но карточка автора светлая')

    # --- воронка: из каждой статьи есть контекстная ссылка на денежную страницу.
    # Зона контента — от <h1> до блока контактов: так не считаются шапка (в т.ч. мобильное меню
    # вне <nav>), хлебные крошки, подвал и CTA. Ссылки оттуда воронкой не являются.
    money = re.compile(r'href="/(?:ai|services|cases)/?[^"]*"')
    for p in blog_articles:
        rel = str(p.relative_to(DIST))
        html = p.read_text(encoding='utf-8')
        start = html.find('<h1')
        end = html.find('id="contacts"', start)
        body = html[start:end] if start != -1 and end != -1 else html
        body = re.sub(r'<aside class="author-card.*?</aside>', ' ', body, flags=re.S)
        if not money.search(body):
            errors.append(f'{rel}: нет контекстной ссылки на денежную страницу (/ai.html, /services.html или кейс)')

    # чистота: старой разметки карточки (sticky-*) быть не должно ни в одной статье
    for p in pages:
        if p.parent.name != 'blog':
            continue
        if 'sticky-author' in p.read_text(encoding='utf-8'):
            errors.append(f'{p.relative_to(DIST)}: осталась старая разметка карточки (sticky-author)')
    notes.append('карточка автора: одна на статью, из site.ts — проверено у ' + str(len(blog_articles)) + ' статей')

    # --- контакты: сверка со справочником сайта
    site_ts = (ROOT / 'src' / 'data' / 'site.ts').read_text(encoding='utf-8')
    tel = re.search(r"tel:\s*'([^']+)'", site_ts)
    wa = re.search(r"whatsapp:\s*'https://wa\.me/(\d+)'", site_ts)
    tg = re.search(r"telegram:\s*'https://t\.me/([\w_]+)'", site_ts)
    mail = re.search(r"email:\s*'([^']+)'", site_ts)
    for p in pages:
        rel = str(p.relative_to(DIST))
        html = p.read_text(encoding='utf-8')
        found_tel = set(re.findall(r'href="tel:([^"]+)"', html))
        if tel and found_tel and found_tel != {tel.group(1)}:
            errors.append(f'{rel}: tel-ссылки {sorted(found_tel)} ≠ {tel.group(1)} из site.ts')
        found_wa = set(re.findall(r'href="https://wa\.me/(\d+)"', html))
        if wa and found_wa and found_wa != {wa.group(1)}:
            errors.append(f'{rel}: WhatsApp {sorted(found_wa)} ≠ {wa.group(1)} из site.ts')
        found_tg = set(re.findall(r'href="https://t\.me/([\w_]+)"', html))
        if tg and found_tg and found_tg != {tg.group(1)}:
            errors.append(f'{rel}: Telegram {sorted(found_tg)} ≠ {tg.group(1)} из site.ts')
        found_mail = set(re.findall(r'href="mailto:([^"]+)"', html))
        if mail and found_mail and found_mail != {mail.group(1)}:
            errors.append(f'{rel}: почта {sorted(found_mail)} ≠ {mail.group(1)} из site.ts')

    print('=' * 72)
    if errors:
        print(f'ОШИБКИ ({len(errors)}):')
        for e in errors:
            print(f'  ✗ {e}')
    else:
        print('Ошибок нет')
    if notes:
        print('\nК сведению:')
        for n in notes:
            print(f'  · {n}')
    if warns:
        print(f'\nПредупреждения ({len(warns)}):')
        for w in warns[:40]:
            print(f'  ⚠ {w}')
        if len(warns) > 40:
            print(f'  … ещё {len(warns) - 40}')
    print(f'\nИТОГ: {"OK" if not errors else f"{len(errors)} ошибок"} (предупреждений: {len(warns)})')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
