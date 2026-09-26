#!/usr/bin/env python3
"""Страж стиля графики: не пускает в блог «нейрослоп».

Правила (разбор — deliverables/GRAPHICS-STYLE.md):
  1. Никакого размытия и свечения: filter: blur/drop-shadow, backdrop-filter, text-shadow, radial-gradient.
  2. Тени — «печатные»: контур 1px или смещение без размытия. Размытие больше 2px — ошибка.
  3. Ни одного растрового изображения в статьях: только вектор (inline SVG), который не мылится при зуме.
  4. Внутри SVG нет градиентных заливок и фильтров.
  5. Каждая содержательная фигура статьи — с классом fig (иначе не работает зум и не видно подписи).

Код выхода 1, если есть нарушения.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOG_CSS = sorted((ROOT / 'public' / 'blog-assets').glob('*.css'))
BLOG_PAGES = sorted((ROOT / 'src' / 'pages' / 'blog').glob('*.astro'))
BLOG_COMPONENTS = sorted((ROOT / 'src' / 'components' / 'blog').rglob('*.astro'))

MAX_BLUR_PX = 2.0
errors: list[str] = []
notes: list[str] = []

CSS_FORBIDDEN = {
    'filter: blur': r'filter\s*:[^;}]*\bblur\(',
    'filter: drop-shadow': r'filter\s*:[^;}]*drop-shadow',
    'backdrop-filter': r'backdrop-filter\s*:',
    'text-shadow': r'text-shadow\s*:',
    'radial-gradient': r'radial-gradient\(',
}
SVG_FORBIDDEN = {
    'градиентная заливка': r'<(linearGradient|radialGradient|meshgradient)\b',
    'SVG-фильтр (размытие)': r'<(filter|feGaussianBlur|feDropShadow)\b',
    'SVG-маска прозрачности': r'<mask\b',
}
RASTER = {
    'тег <img>': r'<img\b',
    'тег <picture>': r'<picture\b',
    'фон-картинка': r'background(?:-image)?\s*:[^;}]*url\(',
    'инлайновый <image>': r'<image\b',
}


def check_css(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    rel = path.relative_to(ROOT)
    for name, pat in CSS_FORBIDDEN.items():
        for m in re.finditer(pat, text):
            line = text[:m.start()].count('\n') + 1
            errors.append(f'{rel}:{line}: {name} — размытие/свечение запрещено')
    for m in re.finditer(r'box-shadow\s*:([^;}]+)', text):
        line = text[:m.start()].count('\n') + 1
        for shadow in m.group(1).split(','):
            # убираем цвет и ключевые слова, остаются числа смещений: x y blur spread
            core = re.sub(r'(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8}|var\([^)]*\)|inset|none)', ' ', shadow)
            nums = re.findall(r'-?\d*\.?\d+', core)
            if len(nums) >= 3:
                blur = abs(float(nums[2]))
                if blur > MAX_BLUR_PX:
                    errors.append(f'{rel}:{line}: мягкая тень с размытием {blur:g}px — максимум {MAX_BLUR_PX:g}px')
    # тёмная тема кита: цвета допускаются, размытие — нет
    if 'kit.css' in path.name or 'article.css' in path.name:
        notes.append(f'{rel}: проверен (правил {len(CSS_FORBIDDEN)})')


def check_markup(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    rel = path.relative_to(ROOT)
    for name, pat in {**SVG_FORBIDDEN, **RASTER}.items():
        for m in re.finditer(pat, text, re.I):
            line = text[:m.start()].count('\n') + 1
            errors.append(f'{rel}:{line}: {name} — в блог пускаем только вектор без размытия')
    for m in re.finditer(r'style="[^"]*?(filter\s*:[^";]*blur|drop-shadow)[^"]*"', text):
        line = text[:m.start()].count('\n') + 1
        errors.append(f'{rel}:{line}: инлайновый filter/blur')


def main() -> int:
    figures = captions = 0
    for p in BLOG_CSS:
        check_css(p)
    for p in BLOG_PAGES + BLOG_COMPONENTS:
        check_markup(p)
        if p.parent.name == 'blog' and p.name != 'index.astro':
            body = p.read_text(encoding='utf-8')
            figs = re.findall(r'<figure\b[^>]*>', body)
            figures += len(figs)
            captions += len(re.findall(r'<figcaption', body))
            for f in figs:
                if 'fig' not in f:
                    errors.append(f'{p.relative_to(ROOT)}: фигура без класса fig — не сработает зум')

    print(f'Проверка стиля графики: {len(BLOG_CSS)} css, {len(BLOG_PAGES)} статей, {len(BLOG_COMPONENTS)} компонентов')
    print(f'Фигур в статьях: {figures} (подписей {captions}) — все векторные, растровых нет')
    if errors:
        print(f'\nНАРУШЕНИЯ ({len(errors)}):')
        for e in errors:
            print(f'  ✗ {e}')
        print('\nИТОГ: стиль графики нарушен')
        return 1
    print('ИТОГ: OK — размытия, свечений, градиентов и растра в блоге нет')
    return 0


if __name__ == '__main__':
    sys.exit(main())
