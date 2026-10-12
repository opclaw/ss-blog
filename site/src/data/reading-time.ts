// Единый источник времени чтения для карточек «Читать дальше» и «Смотрите также».
//
// Раньше каждая карточка хранила своё число («· 9 мин»), вписанное руками: к сентябрю
// 2026-го 60 карточек из 66 врали — статьи выросли до 12–16 минут, а подписи остались
// старыми. Теперь время берётся из самой статьи (minutes={N} в её файле), а за тем,
// чтобы это значение совпадало с фактом, следит tools/fix-minutes.mjs --check
// (он же в `npm run check`). Расхождение стало структурно невозможным.
const sources = import.meta.glob('../pages/blog/*.astro', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const bySlug: Record<string, number> = {};
for (const [file, raw] of Object.entries(sources)) {
  const slug = String(file).replace(/^.*\//, '').replace(/\.astro$/, '');
  // Новый формат — проп minutes={N} у статей на layouts/Article.astro.
  const m = String(raw).match(/minutes=\{(\d+)\}/);
  if (m) {
    bySlug[slug] = Number(m[1]);
    continue;
  }
  // Старые страницы держат время прямо в строке метаданных: «~7 минут чтения».
  const legacy = String(raw).match(/~\s*(\d+)\s*минут/);
  if (legacy) bySlug[slug] = Number(legacy[1]);
}

/** Фактическое время чтения статьи блога, null — если это не статья. */
export function readMinutes(href: string): number | null {
  const slug = String(href).replace(/^\/blog\//, '').replace(/\.html$/, '');
  return bySlug[slug] ?? null;
}

/** «· 13 мин» для статьи блога, пустая строка — для остальных страниц. */
export function readSuffix(href: string): string {
  const n = readMinutes(href);
  return n ? ` · ${n} мин` : '';
}
