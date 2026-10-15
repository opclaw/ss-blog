#!/usr/bin/env python3
"""
Реестр чисел сайта: деньги, проценты, сроки — по собранным страницам (site/dist).

Заход команды 1 («тексты, смыслы, цифры»), проход 0. Задача — собрать все числа сайта
в один список с контекстом и пометкой «оценка/пример/расчёт», чтобы дальше сверять
их между страницами и не терять противоречия.

Запуск:
    python3 site/tools/audit-numbers.py                 # отчёт в консоль (сводка)
    python3 site/tools/audit-numbers.py --md out.md     # реестр в markdown
    python3 site/tools/audit-numbers.py --json out.json # машинный вид

Категории:
    money   — суммы: ₽, руб., тыс., млн (включая вилки вида 50–150 тысяч)
    percent — проценты и доли: 20 %, ×3, 1,9 мес — проценты только с знаком %
    time    — сроки: минуты, часы, дни, недели, месяцы, годы

Пометки у числа: ищем в предложении слова «оценка/пример/расчёт/источник/по нашим данным».
Число без пометки — кандидат в стоп-лист (проверяет человек, не скрипт).
"""
import argparse
import html
import json
import re
import sys
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / 'dist'

MONEY = re.compile(
    r'(?<![\d.,])(\d[\d\s\u00A0\u202F]*(?:[.,]\d+)?(?:\s*[–—-]\s*\d[\d\s\u00A0\u202F]*(?:[.,]\d+)?)?)\s*'
    r'(₽|руб(?:\.|лей|ля|ль)?|тыс(?:\.|яч[аи]?)?|млн(?:\.|а|ов)?|миллион\w*|тысяч\w*)',
    re.IGNORECASE)
PERCENT = re.compile(r'(?<![\d.,])(\d+(?:[.,]\d+)?)\s*%')
TIME = re.compile(
    r'(?<![\d.,])(\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?)\s*'
    r'(мин\w*|час\w*|дн\w*|сут\w*|недел\w*|мес\w*|год\w*|лет)', re.IGNORECASE)
MARKER = re.compile(r'(оценк\w*|пример\w*|расчёт\w*|расчет\w*|источник\w*|по нашим данным|на наших данных|оценочн\w*|порядка)', re.IGNORECASE)

TAG = re.compile(r'<(script|style|svg|noscript)\b.*?</\1>', re.IGNORECASE | re.DOTALL)
ANY_TAG = re.compile(r'<[^>]+>')


def page_text(path: Path) -> str:
    raw = path.read_text(encoding='utf-8', errors='ignore')
    raw = TAG.sub(' ', raw)
    raw = ANY_TAG.sub(' ', raw)
    return html.unescape(re.sub(r'[ \t\r\f\v]+', ' ', raw))


def sentences(text: str):
    for part in re.split(r'(?<=[.!?;])\s+|\n+', text):
        s = part.strip()
        if s:
            yield s


def scan_page(path: Path, rel: str):
    out = {'page': rel, 'money': [], 'percent': [], 'time': []}
    for s in sentences(page_text(path)):
        marker = bool(MARKER.search(s))
        for kind, rx in (('money', MONEY), ('percent', PERCENT), ('time', TIME)):
            for m in rx.finditer(s):
                ctx = s[max(0, m.start() - 70):m.end() + 70].strip()
                out[kind].append({'value': m.group(0).strip(), 'context': ctx, 'marker': marker})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--md')
    ap.add_argument('--json')
    ap.add_argument('--only')
    args = ap.parse_args()

    pages = sorted(DIST.rglob('*.html'))
    pages = [p for p in pages if '/404.' not in str(p)]
    data = []
    for p in pages:
        rel = p.relative_to(DIST).as_posix()
        if args.only and args.only not in rel:
            continue
        data.append(scan_page(p, rel))

    total = {k: sum(len(d[k]) for d in data) for k in ('money', 'percent', 'time')}
    without_marker = {k: sum(1 for d in data for x in d[k] if not x['marker']) for k in total}
    print(f'страниц: {len(data)}')
    for k in ('money', 'percent', 'time'):
        print(f'  {k}: {total[k]} (без пометки «оценка/пример/расчёт»: {without_marker[k]})')
    print('страницы с деньгами:', ', '.join(d['page'] for d in data if d['money']))

    if args.json:
        Path(args.json).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
        print('json:', args.json)

    if args.md:
        lines = ['# Реестр чисел сайта (автоматическая выгрузка)', '',
                 'Источник: `site/tools/audit-numbers.py` по сборке `site/dist`.',
                 'Тег «(о)** — рядом с числом нет пометки «оценка/пример/расчёт».', '']
        for d in data:
            if not (d['money'] or d['percent'] or d['time']):
                continue
            lines.append(f"## {d['page']}")
            for kind, title in (('money', 'Деньги'), ('percent', 'Проценты'), ('time', 'Сроки')):
                items = d[kind]
                if not items:
                    continue
                lines.append(f"**{title}**:")
                seen = set()
                for it in items:
                    key = (it['value'], it['context'][:60])
                    if key in seen:
                        continue
                    seen.add(key)
                    mark = '' if it['marker'] else ' **(о)**'
                    lines.append(f"- `{it['value']}`{mark} — …{it['context']}…")
                lines.append('')
        Path(args.md).write_text('\n'.join(lines), encoding='utf-8')
        print('md:', args.md)
    return 0


if __name__ == '__main__':
    sys.exit(main())
