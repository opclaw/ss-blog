#!/usr/bin/env python3
"""
Сборка sitemap.xml из готового сайта (site/dist).

Адреса берутся не «руками», а из сборки — новая статья попадает в карту автоматически.
lastmod ставится только там, где есть настоящая дата:
  - у статей блога — dateModified из их же JSON-LD;
  - у остальных страниц — из MANUAL_DATES ниже (если дата не указана, lastmod не пишется,
    чтобы не подсовывать поисковику одинаковую дату у всего сайта).

Приоритеты и частота обновления заданы в RULES.

Запуск (из site/):  python3 tools/make-sitemap.py [--check]
  --check — не писать файл, только показать, что изменится (код 1, если файл устарел).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = ROOT / 'public' / 'sitemap.xml'
BASE = 'https://smartsolutions.today'

# Даты для страниц, у которых нет схемы. Ставим реальную дату правки, а не «сегодня».
MANUAL_DATES: dict[str, str] = {
    # 2026-09-25: на ai.html добавлена карточка статьи «Что такое ИИ-агент» и поправлен счётчик
    '/ai.html': '2026-09-25',
}

# (регулярка адреса, changefreq, priority)
RULES = [
    (r'^/$', 'weekly', '1.0'),
    (r'^/services\.html$', 'monthly', '0.8'),
    (r'^/cases/', 'monthly', '0.7'),
    (r'^/ai\.html$', 'weekly', '0.9'),
    (r'^/blog/$', 'weekly', '0.8'),
    (r'^/blog/', 'monthly', '0.8'),
]


def url_of(html_path: Path) -> str:
    rel = html_path.relative_to(DIST).as_posix()
    if rel == 'index.html':
        return '/'
    if rel.endswith('/index.html'):
        return '/' + rel[: -len('index.html')]
    return '/' + rel


def rule(url: str) -> tuple[str, str]:
    for pattern, freq, prio in RULES:
        if re.search(pattern, url):
            return freq, prio
    return 'monthly', '0.5'


def lastmod(html: str) -> str | None:
    m = re.search(r'"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})"', html)
    return m.group(1) if m else None


def collect() -> list[dict]:
    pages = []
    for p in sorted(DIST.rglob('*.html')):
        if re.match(r'(google|yandex)', p.name):
            continue
        url = url_of(p)
        html = p.read_text(encoding='utf-8')
        pages.append({'url': url, 'mod': lastmod(html) or MANUAL_DATES.get(url), 'html': html})

    def sort_key(item):
        url = item['url']
        order = 0 if url == '/' else 1 if url == '/services.html' else 2 if url.startswith('/cases/') \
            else 3 if url == '/ai.html' else 4 if url == '/blog/' else 5
        # статьи: свежие сверху, затем по алфавиту
        return (order, (item['mod'] or ''), url) if order == 5 else (order, '', url)

    pages.sort(key=sort_key, reverse=False)
    blog = [p for p in pages if p['url'].startswith('/blog/') and p['url'] != '/blog/']
    blog.sort(key=lambda p: (p['mod'] or '', p['url']), reverse=True)
    head = [p for p in pages if not (p['url'].startswith('/blog/') and p['url'] != '/blog/')]
    return head + blog


def render(pages: list[dict]) -> str:
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for p in pages:
        freq, prio = rule(p['url'])
        out.append('  <url>')
        out.append(f"    <loc>{BASE}{p['url']}</loc>")
        if p['mod']:
            out.append(f"    <lastmod>{p['mod']}</lastmod>")
        out.append(f'    <changefreq>{freq}</changefreq>')
        out.append(f'    <priority>{prio}</priority>')
        out.append('  </url>')
    out.append('</urlset>')
    return '\n'.join(out) + '\n'


def main() -> None:
    if not DIST.exists():
        print('Нет site/dist — сначала npm run build')
        sys.exit(1)
    pages = collect()
    new = render(pages)
    old = OUT.read_text(encoding='utf-8') if OUT.exists() else ''
    check = '--check' in sys.argv

    named = [p for p in pages if p['mod']]
    print(f'Страниц в карте: {len(pages)}; с датой lastmod: {len(named)}')
    if old == new:
        print('sitemap.xml уже соответствует сборке')
        sys.exit(0)
    old_urls = set(re.findall(r'<loc>[^<]+', old))
    new_urls = set(re.findall(r'<loc>[^<]+', new))
    for u in sorted(new_urls - old_urls):
        print(f'  + {u.replace("<loc>", "")}')
    for u in sorted(old_urls - new_urls):
        print(f'  − {u.replace("<loc>", "")}')
    if check:
        print('sitemap.xml устарел — запустите без --check, чтобы обновить')
        sys.exit(1)
    OUT.write_text(new, encoding='utf-8')
    print(f'Записан {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
