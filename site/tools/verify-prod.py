#!/usr/bin/env python3
"""Проверка прода после выкладки: все URL из sitemap отвечают 200 и совпадают со сборкой.

    python3 tools/verify-prod.py            # проверить прод по dist/sitemap.xml
    python3 tools/verify-prod.py --json     # машинный отчёт (для релизного скрипта)

Запускать из места, откуда виден прод (свой компьютер или CI): из закрытой песочницы
внешняя сеть недоступна, скрипт честно об этом скажет.
"""
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
TIMEOUT = 20
UA = 'SmartSolutions-release-check/1.0 (+https://smartsolutions.today)'


def local_title(url: str) -> str | None:
    """Заголовок той же страницы в сборке — чтобы поймать «прод отстал»."""
    path = url.split('https://', 1)[-1].split('/', 1)
    name = path[1] if len(path) > 1 else ''
    if name in ('', '/'):
        name = 'index.html'
    if not name.endswith('.html'):
        name = name.rstrip('/') + '/index.html'
    f = DIST / name
    if not f.exists():
        return None
    m = re.search(r'<title>(.*?)</title>', f.read_text(encoding='utf-8'), re.S)
    return m.group(1).strip() if m else None


def fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, ''
    except Exception as e:  # noqa: BLE001 — сеть, DNS, TLS
        raise RuntimeError(str(e)) from e


def main() -> int:
    sitemap = (DIST / 'sitemap.xml').read_text(encoding='utf-8')
    urls = [m.strip() for m in re.findall(r'<loc>([^<]+)</loc>', sitemap)]
    report: list[dict] = []
    title_diff = 0

    for url in urls:
        item: dict = {'url': url}
        try:
            status, html = fetch(url)
            item['status'] = status
            if status == 200:
                m = re.search(r'<title>(.*?)</title>', html, re.S)
                item['title'] = m.group(1).strip() if m else ''
                want = local_title(url)
                if want and item['title'] != want:
                    item['title_diff'] = want
                    title_diff += 1
        except RuntimeError as e:
            item['error'] = e
        report.append(item)

    if all('error' in i for i in report):
        print('✗ Прод недоступен из этого окружения — запустите проверку там, откуда виден сайт.')
        return 2

    bad = [i for i in report if i.get('status') != 200]
    print(f'Проверено URL: {len(report)} · не 200: {len(bad)} · расхождений заголовка со сборкой: {title_diff}')
    for i in bad:
        print(f'  ✗ {i["url"]} — {i.get("status") or i.get("error")}')
    for i in report:
        if i.get('title_diff'):
            print(f'  ⚠ {i["url"]}\n     прод:   {i["title"][:90]}\n     сборка: {i["title_diff"][:90]}')

    if '--json' in sys.argv:
        Path(ROOT / 'deliverables/release-report.json').write_text(
            json.dumps({'urls': len(report), 'not_200': len(bad), 'title_diff': title_diff, 'report': report},
                       ensure_ascii=False, indent=2), encoding='utf-8')
    return 0 if not bad and not title_diff else 1


if __name__ == '__main__':
    raise SystemExit(main())
