// Единый список страниц для аудитов: статьи блога, кейсы и посадочные из корня dist.
// Раньше каждый аудит держал свой захардкоженный список — посадочные в него не попадали.
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.DIST || '/home/user/ss-blog/site/dist';
const SKIP = new Set(['404.html']);
// файлы верификации поисковых систем — не страницы сайта
const VERIFY = /^(google|yandex)[\w-]*\.html$/;

export function sitePages(dist = DIST) {
  const list = [];
  const root = fs.readdirSync(dist).filter((f) => f.endsWith('.html') && !SKIP.has(f) && !VERIFY.test(f));
  list.push(...root);
  for (const dir of ['blog', 'cases']) {
    const p = path.join(dist, dir);
    if (!fs.existsSync(p)) continue;
    for (const f of fs.readdirSync(p).filter((x) => x.endsWith('.html'))) {
      if (dir === 'blog' && f === 'index.html') continue; // уже есть blog/index.html из корня? — нет, добавим явно
      list.push(`${dir}/${f}`);
    }
  }
  if (!list.includes('blog/index.html') && fs.existsSync(path.join(dist, 'blog/index.html'))) list.push('blog/index.html');
  return [...new Set(list)].sort();
}
