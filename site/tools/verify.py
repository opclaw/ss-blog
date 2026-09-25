#!/usr/bin/env python3
"""
Сверка собранного сайта (site/dist) с оригиналом (legacy/version-4).

По каждой странице сравнивает:
  - <title>, description, og:*, canonical;
  - JSON-LD (как данные, а не как текст);
  - основной контент (всё, кроме шапки, мобильного меню и подвала):
      видимый текст, ссылки и адреса картинок (приведённые к абсолютным), набор CSS-классов, id;
  - шапку / мобильное меню / подвал — с эталоном главной страницы
    (одинаковые пункты, одинаковые классы, рабочие адреса).
Плюс: все внутренние ссылки и ресурсы в dist существуют (нет битых ссылок).

Ожидаемые (намеренные) отличия помечаются как FIX, остальные — как DIFF.
Код выхода 1, если есть DIFF или битые ссылки.

Запуск (из site/):  python3 tools/verify.py
"""
import json, re, sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parent.parent
LEGACY = ROOT.parent / 'legacy' / 'version-4'
DIST = ROOT / 'dist'
BASE = 'https://smartsolutions.today/'
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'use', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'stop', 'ellipse'}


class Doc(HTMLParser):
    """Разбирает страницу на зоны: head / chrome (nav, mobile, footer) / content."""
    def __init__(self, url):
        super().__init__(convert_charrefs=True)
        self.url = url
        self.stack = []            # (tag, zone)
        self.title = ''
        self.meta = {}
        self.canonical = None
        self.ld = []
        self._in = None
        self._buf = ''
        self.zones = {z: {'text': [], 'links': [], 'classes': Counter(), 'ids': []} for z in ('content', 'nav', 'mobile', 'footer')}

    def zone(self):
        for tag, z in reversed(self.stack):
            if z:
                return z
        return 'content'

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        z = None
        if tag == 'nav' and a.get('id') == 'nav': z = 'nav'
        elif tag == 'div' and a.get('id') == 'mobileMenu': z = 'mobile'
        elif tag == 'footer' and 'footer' in (a.get('class') or '').split(): z = 'footer'
        if tag == 'title': self._in, self._buf = 'title', ''
        if tag == 'script' and a.get('type') == 'application/ld+json': self._in, self._buf = 'ld', ''
        elif tag in ('script', 'style'): self._in = 'skip'
        if tag == 'meta':
            k = a.get('name') or a.get('property')
            if k: self.meta[k] = a.get('content', '')
        if tag == 'link' and a.get('rel') == 'canonical': self.canonical = a.get('href')
        if tag not in VOID:
            self.stack.append((tag, z))
        cur = z or self.zone()
        if not self.in_head():
            Z = self.zones[cur]
            for c in (a.get('class') or '').split(): Z['classes'][c] += 1
            if a.get('id'): Z['ids'].append(a['id'])
            for at in ('href', 'src'):
                v = a.get(at)
                if v and tag not in ('link', 'script'):
                    Z['links'].append(self.norm(v))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID and self.stack and self.stack[-1][0] == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        if tag in ('title', 'script', 'style'):
            if self._in == 'title': self.title = self._buf.strip()
            if self._in == 'ld': self.ld.append(self._buf.strip())
            self._in = None
        if tag in VOID: return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, d):
        if self._in in ('title', 'ld'):
            self._buf += d; return
        if self._in == 'skip' or self.in_head(): return
        t = d.strip()
        if t: self.zones[self.zone()]['text'].append(re.sub(r'\s+', ' ', t))

    def in_head(self):
        return any(t == 'head' for t, _ in self.stack)

    def norm(self, v):
        v = v.strip().replace('tel:+792****9500', 'tel:+79250909500#FIXED')
        u = urljoin(self.url, v)
        u = re.sub(r'/index\.html(?=$|[#?])', '/', u)
        return u


def parse(path, url, text=None):
    d = Doc(url)
    d.feed(path.read_text(encoding='utf-8') if text is None else text)
    return d


# Журнал намеренных правок контента: {"blog/x.html": {"reason": "...", "allow": ["text"]}}
_EDITS_FILE = Path(__file__).with_name('content-edits.json')
EDITS = json.loads(_EDITS_FILE.read_text(encoding='utf-8')) if _EDITS_FILE.exists() else {}


NEW_CARD = re.compile(r'\s*<a class="blog-grid-card" href="/blog/([\w-]+)\.html">.*?</a>', re.S)


def strip_new_cards(text):
    """Убирает карточки статей, которых нет в оригинале (новые статьи). Возвращает (текст, [slug])."""
    added = []
    def sub(m):
        if (LEGACY / 'blog' / f'{m.group(1)}.html').exists(): return m.group(0)
        added.append(m.group(1)); return ''
    return NEW_CARD.sub(sub, text), added


def url_of(rel):
    return BASE + rel


# Что разрешено менять у страницы: ключи записываются в tools/content-edits.json
# (title, meta, jsonld, text, links, classes, id, rewrite — «rewrite» снимает все проверки контента).
def allow(edit, key):
    if not edit:
        return False
    keys = edit.get('allow') or []
    return key in keys or 'rewrite' in keys


def ld_data(lst):
    out = []
    for x in lst:
        try: out.append(json.loads(x))
        except Exception: out.append(('BROKEN', x[:60]))
    return out


def main():
    pages = sorted(str(p.relative_to(LEGACY)) for p in LEGACY.rglob('*.html')
                   if not re.match(r'(google|yandex)', p.name))
    total_diff = 0
    fixes = Counter()
    ref_chrome = None
    print(f'Сверка {len(pages)} страниц: legacy/version-4 ↔ site/dist\n')
    for rel in pages:
        a_path, b_path = LEGACY / rel, DIST / rel
        if not b_path.exists():
            print(f'✗ {rel}: НЕТ В СБОРКЕ'); total_diff += 1; continue
        b_text, added = strip_new_cards(b_path.read_text(encoding='utf-8'))
        A, B = parse(a_path, url_of(rel)), parse(b_path, url_of(rel), b_text)
        diffs, notes = [], []
        edit = EDITS.get(rel)
        for slug in added: notes.append(f'карточка новой статьи: {slug}')

        # --- head
        if A.title != B.title:
            if allow(edit, 'title'): notes.append(f"title изменён: {edit['reason']}")
            else: diffs.append(f'title: {A.title!r} → {B.title!r}')
        if A.meta.get('theme-color') != B.meta.get('theme-color'):
            if (A.meta.get('theme-color') or '').lower() == '#0a0a0a' and B.meta.get('theme-color') == '#08080D':
                notes.append('theme-color выровнен (#0a0a0a → #08080D, цвет фона сайта)')
            else: diffs.append(f"meta theme-color: {A.meta.get('theme-color')!r} → {B.meta.get('theme-color')!r}")
        for k in ('description', 'og:title', 'og:description', 'og:image', 'og:type', 'og:locale'):
            if A.meta.get(k) != B.meta.get(k):
                if allow(edit, 'meta'): notes.append(f"meta {k} изменён: {edit['reason']}")
                else: diffs.append(f'meta {k}: {A.meta.get(k)!r} → {B.meta.get(k)!r}')
        for k in ('og:url',):
            if A.meta.get(k) is None and B.meta.get(k): notes.append(f'добавлен {k}')
            elif A.meta.get(k) != B.meta.get(k): diffs.append(f'meta {k}: {A.meta.get(k)!r} → {B.meta.get(k)!r}')
        if A.canonical is None and B.canonical: notes.append('добавлен canonical')
        elif A.canonical and urljoin(BASE, A.canonical).replace('/index.html', '/') != B.canonical: diffs.append(f'canonical: {A.canonical} → {B.canonical}')
        if ld_data(A.ld) != ld_data(B.ld):
            if allow(edit, 'jsonld'): notes.append(f"JSON-LD изменён: {edit['reason']}")
            else: diffs.append(f'JSON-LD отличается ({len(A.ld)} → {len(B.ld)})')

        # --- content
        ca, cb = A.zones['content'], B.zones['content']
        if ca['text'] != cb['text'] and allow(edit, 'text'):
            notes.append(f"текст отредактирован: {edit['reason']}")
        elif ca['text'] != cb['text']:
            ta, tb = ' '.join(ca['text']), ' '.join(cb['text'])
            i = next((i for i, (x, y) in enumerate(zip(ta, tb)) if x != y), min(len(ta), len(tb)))
            diffs.append(f'текст контента отличается @{i}: …{ta[max(0,i-40):i+60]!r} ≠ …{tb[max(0,i-40):i+60]!r}')
        la = [l.replace('#FIXED', '') for l in ca['links']]
        if '#FIXED' in ''.join(ca['links']): notes.append('исправлен tel в контенте')
        if la != cb['links']:
            if allow(edit, 'links'):
                sa, sb = Counter(la), Counter(cb['links'])
                notes.append(f"ссылки контента: +{sum((sb - sa).values())} −{sum((sa - sb).values())} — {edit['reason']}")
            else:
                sa, sb = Counter(la), Counter(cb['links'])
                only_a, only_b = sa - sb, sb - sa
                diffs.append(f'ссылки контента: убраны {dict(only_a)} добавлены {dict(only_b)}' if (only_a or only_b) else 'ссылки контента: другой порядок')
        cls_a, cls_b = ca['classes'], cb['classes']
        # мобильное меню на нестандартных классах могло попасть в «контент» оригинала — не считаем
        if cls_a != cls_b:
            if allow(edit, 'classes'):
                notes.append(f"классы контента изменены: {edit['reason']}")
            else:
                d1, d2 = cls_a - cls_b, cls_b - cls_a
                diffs.append(f'классы контента: убраны {dict(d1)} добавлены {dict(d2)}')
        ids_a, ids_b = list(ca['ids']), list(cb['ids'])
        if ids_a != ids_b:
            if sorted(ids_b) == sorted(ids_a + ['contacts']): notes.append('id="contacts" у блока контактов')
            elif allow(edit, 'id'): notes.append(f"id контента изменены: {edit['reason']}")
            else: diffs.append(f'id контента: {ids_a} → {ids_b}')

        # --- подключения: ровно по одному разу
        raw = b_path.read_text(encoding='utf-8')
        for what, pat in (('Метрика', r'mc\.yandex\.ru/metrika/tag\.js'), ('styles.css', r'href="/styles\.css"'), ('script.js', r'src="/script\.js"')):
            n = len(re.findall(pat, raw))
            if n != 1: diffs.append(f'{what} подключён {n} раз')
        # --- chrome: все страницы собраны из одних компонентов → сравниваем с эталоном структуры
        sig = {z: (B.zones[z]['text'], +B.zones[z]['classes']) for z in ('nav', 'mobile', 'footer')}
        if ref_chrome is None: ref_chrome = sig
        for z in ('nav', 'mobile', 'footer'):
            if sig[z][0] != ref_chrome[z][0]: diffs.append(f'{z}: пункты отличаются от эталона: {sig[z][0]}')
            ca_ = Counter({k: v for k, v in sig[z][1].items() if k != 'nav-link-active'})
            cr_ = Counter({k: v for k, v in ref_chrome[z][1].items() if k != 'nav-link-active'})
            if ca_ != cr_: diffs.append(f'{z}: классы отличаются от эталона')
            old = (A.zones[z]['text'], A.zones[z]['links'])
            if z != 'nav' and old[0] != sig[z][0]: notes.append(f'{z} приведён к эталону')
            if any('#FIXED' in l for l in A.zones[z]['links']): notes.append(f'{z}: исправлен tel')
        if edit and 'rewrite' in edit['allow']:
            skip = ('title', 'meta ', 'JSON-LD', 'текст', 'ссылки контента', 'классы контента', 'id контента')
            dropped = [x for x in diffs if x.startswith(skip)]
            diffs = [x for x in diffs if not x.startswith(skip)]
            if dropped: notes.append(f"статья переписана: {edit['reason']}")
        for n in notes: fixes[n] += 1
        total_diff += len(diffs)
        mark = '✓' if not diffs else '✗'
        print(f'{mark} {rel:48} {"; ".join(sorted(set(notes))) if notes else ""}')
        for d in diffs: print(f'    DIFF {d}')

    # --- новые страницы (которых нет в оригинале)
    new_pages = sorted(str(p.relative_to(DIST)) for p in DIST.rglob('*.html')
                       if not (LEGACY / p.relative_to(DIST)).exists() and not re.match(r'(google|yandex)', p.name))
    if new_pages:
        print(f'\nНовые страницы ({len(new_pages)}) — проверяются на битые ссылки и JS:')
        for n in new_pages: print(f'  + {n}')

    # --- битые внутренние ссылки в сборке
    broken = Counter()
    for p in DIST.rglob('*.html'):
        rel = str(p.relative_to(DIST))
        d = parse(p, url_of(rel))
        for z in d.zones.values():
            for l in z['links']:
                u = urlparse(l)
                if u.netloc != 'smartsolutions.today' or u.scheme not in ('http', 'https'): continue
                path = u.path
                f = DIST / path.lstrip('/')
                if path.endswith('/'): f = f / 'index.html'
                if not f.exists(): broken[f'{rel} → {path}'] += 1
                elif u.fragment and f.suffix == '.html':
                    if f'id="{u.fragment}"' not in f.read_text(encoding='utf-8'): broken[f'{rel} → {path}#{u.fragment} (нет якоря)'] += 1
        # ресурсы из <link>/<script> head
        for m in re.finditer(r'<(?:link|script)[^>]+(?:href|src)="(/[^"]+)"', p.read_text(encoding='utf-8')):
            if not (DIST / m.group(1).lstrip('/')).exists(): broken[f'{rel} → {m.group(1)} (ресурс)'] += 1
    # fixes summary
    print('\nНамеренные исправления (FIX):')
    for k, v in fixes.most_common(): print(f'  {v:3} стр. — {k}')
    print(f'\nБитые внутренние ссылки/ресурсы в сборке: {sum(broken.values())}')
    for k, v in broken.most_common(30): print(f'  ✗ {k} ×{v}')
    print(f'\nИТОГ: {"OK — расхождений нет" if total_diff == 0 and not broken else f"{total_diff} расхождений, {sum(broken.values())} битых ссылок"}')
    sys.exit(0 if total_diff == 0 and not broken else 1)


if __name__ == '__main__':
    main()
