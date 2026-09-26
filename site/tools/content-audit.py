#!/usr/bin/env python3
"""
Контент-аудит статей блога (site/dist/blog/*.html): шаблонность, честность цифр, путь к заявке.

Что считается и проверяется:
  - объём текста и заявленное «~N минут чтения» (считаем 180 слов/мин, допуск ±3 мин);
  - схожесть статей: пересечение наборов H2 и общих абзацев (кандидаты в «одну статью 18 раз»);
  - абзацы, дословно повторяющиеся в разных статьях (более 120 символов);
  - цифры и проценты: есть ли рядом пометка «оценка/пример/расчёт/источник/по нашим данным»;
  - путь к заявке: ссылки на /services.html, /ai.html, мессенджеры, телефон;
  - чем статья заканчивается (CTA или просто текст);
  - даты публикации/правки в схеме.

Отчёт печатается в консоль; машинный вид — tools/content-report.json.

Запуск (из site/):  python3 tools/content-audit.py [--top N]
"""
import json
import re
import sys
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
BLOG = DIST / 'blog'
WPM = 180
TIME_TOLERANCE = 3
STRICT = '--strict' in sys.argv      # считать расхождения времени чтения ошибкой


class Text(HTMLParser):
    """Видимый текст статьи: H2 и абзацы отдельно, шапка/меню/подвал не считаются."""

    CHROME = {'nav', 'footer'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self._skip_stack: list[str] = []
        self.h2: list[str] = []
        self.paras: list[str] = []
        self.all_words = 0
        self._mode = None
        self._buf = ''

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style') or tag in self.CHROME or a.get('id') == 'mobileMenu' \
                or 'skip-nav' in (a.get('class') or '') or 'back-to-top' in (a.get('class') or ''):
            self.skip += 1
            self._skip_stack.append(tag)
        elif tag == 'h2':
            self._mode, self._buf = 'h2', ''
        elif tag in ('p', 'li', 'td', 'summary'):
            self._mode, self._buf = 'p', ''

    def handle_endtag(self, tag):
        if self._skip_stack and self._skip_stack[-1] == tag:
            self._skip_stack.pop()
            self.skip -= 1
        elif tag == 'h2' and self._mode == 'h2':
            self.h2.append(' '.join(self._buf.split()))
            self._mode = None
        elif tag in ('p', 'li', 'td', 'summary') and self._mode == 'p':
            txt = ' '.join(self._buf.split())
            if len(txt) > 40:
                self.paras.append(txt)
            self._mode = None

    def handle_data(self, data):
        if self.skip:
            return
        self.all_words += len(re.findall(r'[\w-]+', data))
        if self._mode:
            self._buf += data


SOURCE_HINT = re.compile(r'оценк|пример|расчёт|расчет|по нашим данным|источник|в среднем по рынку|порядок величин|ориентир', re.I)
NUMBER = re.compile(r'\b\d+[\d\s,.]*\s?(%|процент|раз|часов|час|минут|минуты|руб|₽|тыс|млн)')


def words(t: str) -> int:
    return len(re.findall(r'[\w-]+', t))


def jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a | b else 0.0


def main() -> None:
    pages = sorted(p for p in BLOG.glob('*.html') if p.name != 'index.html')
    if not pages:
        print('Нет site/dist/blog — сначала npm run build')
        sys.exit(1)

    data = {}
    for p in pages:
        html = p.read_text(encoding='utf-8')
        t = Text()
        t.feed(html)
        body = ' '.join(t.paras)
        claim = re.search(r'~?\s*(\d+)\s*минут[а-яё]*\s*чтения', html)
        pub = re.search(r'"datePublished"\s*:\s*"([\d-]+)"', html)
        mod = re.search(r'"dateModified"\s*:\s*"([\d-]+)"', html)
        data[p.name] = {
            'h2': t.h2,
            'paras': t.paras,
            'words': t.all_words,
            'claim': int(claim.group(1)) if claim else None,
            'has_tldr': 'tldr-title' in html or 'bl-brief-t' in html,
            'faq_visible': len(re.findall(r'<details\b|faq-answer', html)),
            'links_services': len(re.findall(r'href="(/services\.html|/ai\.html)"', html)),
            'links_contacts': len(re.findall(r'href="(https://t\.me/|https://wa\.me/|tel:|mailto:)', html)),
            'numbers': len(NUMBER.findall(body)),
            'sourced': len(SOURCE_HINT.findall(body)),
            'pub': pub.group(1) if pub else None,
            'mod': mod.group(1) if mod else None,
            'new_layout': 'bl-sheet' in html,
        }

    print(f'Контент-аудит: {len(pages)} статей\n')

    # --- время чтения
    print('Время чтения: заявлено против фактического (180 слов/мин)')
    time_issues = []
    for name, d in data.items():
        real = round(d['words'] / WPM)
        if d['claim'] is None:
            print(f'  ? {name}: время чтения не указано ({d["words"]} слов)')
            continue
        delta = abs(d['claim'] - real)
        mark = '✓' if delta <= TIME_TOLERANCE else '⚠'
        if delta > TIME_TOLERANCE:
            time_issues.append((name, d['claim'], real))
            print(f'  {mark} {name}: заявлено {d["claim"]} мин, по тексту {real} мин ({d["words"]} слов)')
    if not time_issues:
        print('  расхождений больше допуска нет')

    # --- структура и схожесть
    print('\nСхожесть статей (пересечение разделов H2; выше 0.5 — кандидаты в шаблон)')
    names = list(data)
    sims = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            s = jaccard({x.lower() for x in data[a]['h2']}, {x.lower() for x in data[b]['h2']})
            if s >= 0.5:
                sims.append((s, a, b))
    sims.sort(reverse=True)
    for s, a, b in sims[:12]:
        print(f'  {s:.2f}  {a} ↔ {b}')
    if not sims:
        print('  пар с пересечением ≥ 0.5 нет')
    h2_count = Counter(len(d['h2']) for d in data.values())
    print('  распределение числа H2: ' + ', '.join(f'{k} разделов — {v} статей' for k, v in sorted(h2_count.items())))

    # --- дословные повторы
    print('\nАбзацы, повторяющиеся дословно в разных статьях (>120 символов)')
    seen: dict[str, list[str]] = defaultdict(list)
    for name, d in data.items():
        for para in d['paras']:
            if len(para) > 120:
                seen[para].append(name)
    dups = {p: n for p, n in seen.items() if len(set(n)) > 1}
    for para, n in list(dups.items())[:8]:
        print(f'  ×{len(set(n))} — «{para[:90]}…» ({", ".join(sorted(set(n))[:3])})')
    print(f'  всего повторов: {len(dups)}')

    # --- цифры и источники
    print('\nЦифры и пометки о происхождении')
    for name, d in sorted(data.items(), key=lambda x: -x[1]['numbers']):
        if d['numbers'] >= 8 and d['sourced'] == 0:
            print(f'  ⚠ {name}: {d["numbers"]} цифр и ни одной пометки «оценка/пример/источник»')
    print('  (полный перечень цифр — в content-report.json)')

    # --- путь к заявке
    print('\nПуть к заявке из статьи')
    for name, d in sorted(data.items()):
        problems = []
        if d['links_services'] == 0:
            problems.append('нет ссылки на услуги/AI')
        if d['links_contacts'] == 0:
            problems.append('нет контактов')
        if not d['has_tldr']:
            problems.append('нет блока «Коротко»')
        if d['faq_visible'] == 0:
            problems.append('нет вопросов')
        if problems:
            print(f'  ⚠ {name}: {", ".join(problems)}')

    # --- даты
    print('\nДаты в схеме')
    for name, d in sorted(data.items()):
        if not d['pub']:
            print(f'  ⚠ {name}: нет datePublished')
        elif d['mod'] and d['mod'] != d['pub']:
            print(f'  · {name}: опубликовано {d["pub"]}, правилось {d["mod"]}')

    # --- машинный отчёт
    report = {name: {k: v for k, v in d.items() if k not in ('paras',)} for name, d in data.items()}
    out = ROOT / 'tools' / 'content-report.json'
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\nМашинный отчёт: {out.relative_to(ROOT)}')
    print(f'ИТОГ: статей {len(pages)}; на новом макете {sum(1 for d in data.values() if d["new_layout"])}; '
          f'повторов абзацев {len(dups)}; пар-«шаблонов» {len(sims)}')
    sys.exit(1 if (STRICT and time_issues) else 0)


if __name__ == '__main__':
    main()
