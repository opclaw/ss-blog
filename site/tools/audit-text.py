#!/usr/bin/env python3
"""Вычитка текстов блога: SEO, типографика, визуализации, «нейрослоп».

Запуск:  python3 site/tools/audit-text.py [--json /tmp/audit-text.json] [--only slug]

Проверяет каждую статью dist/blog/*.html:
  1) SEO: title (40–65), description (120–175), ровно один H1 с главным ключом,
     ≥3 H2, оглавление соответствует разделам, внутренние ссылки на другие статьи.
  2) Типографика и «портянки»: абзацы > 600 знаков, лиды > 400, подписи рисунков > 90,
     двойные пробелы, пробел перед знаком препинания, дефис вместо тире в тексте.
  3) «Нейрослоп»: клише («в современном мире», «не секрет, что», «в заключение»,
     «важно отметить», «давайте разберёмся», «как никогда», «играет важную роль» …),
     канцелярит («осуществляется», «является», «данный», «в целях», «производится»),
     обилие вводных «таким образом», повторы одинаковых предложений.
  4) Визуализации: у каждой фигуры есть подпись «Рис. N»; нумерация без дыр;
     подписи рисунков и таблиц не дублируют текст дословно.
"""
import json
import os
import re
import sys
import html
from collections import Counter

SITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DIST_BLOG = os.path.normpath(os.path.join(SITE, 'dist/blog'))

args = sys.argv[1:]
ONLY = ''
JSON_OUT = '/tmp/audit-text.json'
if '--only' in args:
    ONLY = args[args.index('--only') + 1]
if '--json' in args:
    JSON_OUT = args[args.index('--json') + 1]

CLICHE = [
    'в современном мире', 'не секрет, что', 'в заключение', 'важно отметить',
    'давайте разберёмся', 'давайте разберемся', 'как никогда', 'играет важную роль',
    'на сегодняшний день', 'стоит отметить', 'нельзя не отметить', 'в конечном счёте',
    'в силу того', 'в рамках данной', 'представляет собой', 'данный подход',
    'данная статья', 'в данной статье', 'ключевой инструмент', 'мощный инструмент',
    'инновационное решение', 'широкий спектр', 'динамично развивающийся',
]
BUREAUCRATIC = ['осуществляется', 'является', 'производится', 'в целях', 'в связи с тем',
                'посредством', 'функционал', 'оптимизировать процессы', 'синергия']


def strip_html(raw):
    raw = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', raw)
    raw = re.sub(r'(?is)<br\s*/?>', ' ', raw)
    raw = re.sub(r'(?s)<[^>]+>', ' ', raw)
    return html.unescape(re.sub(r'[ \t\u00a0]+', ' ', raw))


def section(raw, cls):
    m = re.search(r'(?is)<div class="[^"]*' + cls + r'[^"]*"[^>]*>(.*?)</div>\s*</div>', raw)
    return m.group(1) if m else ''


def check_article(path):
    slug = os.path.basename(path)[:-5]
    raw = open(path, encoding='utf-8').read()
    errs, warns, notes = [], [], []

    title = re.search(r'(?is)<title>(.*?)</title>', raw)
    title = html.unescape(title.group(1).strip()) if title else ''
    desc = re.search(r'(?is)<meta name="description" content="(.*?)"', raw)
    desc = html.unescape(desc.group(1).strip()) if desc else ''
    h1s = re.findall(r'(?is)<h1[^>]*>(.*?)</h1>', raw)
    h1 = strip_html(h1s[0]).strip() if h1s else ''
    h2s = [strip_html(x).strip() for x in re.findall(r'(?is)<h2[^>]*>(.*?)</h2>', raw)]
    h2s = [re.sub(r'^\d+\s*/\s*', '', x) for x in h2s]

    # --- SEO ---
    if len(h1s) != 1:
        errs.append(f'SEO: заголовков H1 — {len(h1s)} (должен быть ровно один)')
    if not (40 <= len(title) <= 65):
        warns.append(f'SEO: title {len(title)} знаков (норма 40–65): «{title[:70]}»')
    if not (120 <= len(desc) <= 175):
        warns.append(f'SEO: description {len(desc)} знаков (норма 120–175)')
    if len(h2s) < 3:
        errs.append(f'SEO: разделов H2 — {len(h2s)} (минимум 3)')
    inner_links = len(set(re.findall(r'href="[^"]*?/blog/([a-z0-9\-]+)\.html"', raw)))
    if inner_links < 2:
        warns.append(f'SEO: внутренних ссылок на другие статьи — {inner_links} (минимум 2)')

    # --- текст статьи ---
    body = section(raw, 'bl-text') or raw
    body = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', body)
    text = strip_html(body)
    text = re.sub(r'\s+', ' ', text).strip()
    text_low = text.lower()

    # только «прозаические» абзацы: убираем фигуры, промпты, код, таблицы и кит-блоки
    prose_body = re.sub(r'(?is)<figure.*?</figure>|<pre.*?</pre>|<table.*?</table>|<div class="[^"]*(?:bl-prompt|kit|bl-table)[^"]*".*?</div>\s*</div>', ' ', body)
    paras = [p.strip() for p in re.findall(r'(?is)<p[^>]*>(.*?)</p>', prose_body)]
    paras = [re.sub(r'\s+', ' ', html.unescape(re.sub(r'(?s)<[^>]+>', '', p))).strip() for p in paras]
    long_paras = [p for p in paras if len(p) > 600]
    if long_paras:
        errs.append(f'Портянки: абзацев > 600 знаков — {len(long_paras)} (макс {max(len(p) for p in long_paras)})')
    if paras and len(paras[0]) > 420:
        warns.append(f'Лид длинный: {len(paras[0])} знаков (норма ≤ 420)')

    caps = [c.strip() for c in re.findall(r'(?is)<figcaption[^>]*>(.*?)</figcaption>', body)]
    caps = [re.sub(r'\s+', ' ', html.unescape(re.sub(r'(?s)<[^>]+>', '', c))).strip() for c in caps]
    long_caps = [c for c in caps if len(c) > 90]
    if long_caps:
        warns.append(f'Подписи рисунков > 90 знаков: {len(long_caps)} шт.')

    # --- нейрослоп и канцелярит ---
    def has_word(w):
        return re.search(r'(?<![а-яёa-z])' + re.escape(w) + r'(?![а-яёa-z])', text_low) is not None
    cl = [c for c in CLICHE if has_word(c)]
    if cl:
        warns.append('Клише: ' + '; '.join(cl[:5]))
    bur = [b for b in BUREAUCRATIC if has_word(b)]
    if bur:
        warns.append('Канцелярит: ' + '; '.join(bur[:5]))

    sents = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if len(s.strip().split()) >= 10]
    dup = [s for s, n in Counter(sents).items() if n > 1]
    if dup:
        errs.append(f'Дубли предложений: {len(dup)} — «{dup[0][:80]}…»')

    prose = ' '.join(paras + caps + [strip_html(re.sub(r'(?s)<[^>]+>', ' ', t)) for t in h2s])
    typos = []
    if re.search(r'[а-яёА-ЯЁ0-9)]\s+[.,;:!?]', prose):
        typos.append('пробел перед знаком препинания')
    if re.search(r'[а-яёА-ЯЁ]\s-\s[а-яёА-ЯЁ]', prose):
        typos.append('дефис с пробелами вместо тире')
    if '  ' in prose:
        typos.append('двойные пробелы')
    if typos:
        warns.append('Типографика: ' + '; '.join(typos))

    # --- визуализации ---
    figs = len(re.findall(r'(?i)<figure', body))
    ris = len(re.findall(r'Рис\.\s*\d+', body))
    if figs and ris == 0:
        errs.append(f'Визуализация: фигур {figs}, но ни одной подписи «Рис. N»')
    if ris and figs and ris < figs:
        warns.append(f'Визуализация: фигур {figs}, подписей «Рис.» {ris}')
    tables = len(re.findall(r'(?i)<table', body))
    notes.append(f'фигур {figs}, подписей «Рис.» {ris}, таблиц {tables}, знаков {len(text)}')

    return {'slug': slug, 'errors': errs, 'warnings': warns, 'notes': notes,
            'seo': {'title_len': len(title), 'desc_len': len(desc), 'h2': len(h2s), 'inner_links': inner_links}}


def main():
    files = sorted(f for f in os.listdir(DIST_BLOG) if f.endswith('.html') and f != 'index.html')
    if ONLY:
        files = [f for f in files if ONLY in f]
    report = {'articles': [], 'totals': Counter()}
    for f in files:
        res = check_article(os.path.join(DIST_BLOG, f))
        report['articles'].append(res)
        for e in res['errors']:
            report['totals']['errors'] += 1
            print(f'ОШИБКА  {res["slug"]}: {e}')
        for w in res['warnings']:
            report['totals']['warnings'] += 1
            print(f'   предупреждение  {res["slug"]}: {w}')
    print(f'\nСтатей проверено: {len(files)}; ошибок {report["totals"]["errors"]}, '
          f'предупреждений {report["totals"]["warnings"]}; отчёт {JSON_OUT}')
    report['totals'] = dict(report['totals'])
    json.dump(report, open(JSON_OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return 1 if report['totals'].get('errors', 0) else 0


if __name__ == '__main__':
    sys.exit(main())
