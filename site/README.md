# smartsolutions.today на Astro

Сайт Smart Solutions — тот же, что сейчас работает на Beget, но собран на единой системе.
На выходе — чистые статичные `.html` **с теми же адресами** (`/services.html`, `/blog/ii-dlya-hr.html`),
поэтому для поисковиков и хостинга ничего не меняется.

Состав сборки: 28 страниц — главная, услуги, AI-хаб, 3 кейса, 21 статья блога и оглавление блога.

## Быстрый старт

```bash
cd site
npm install
npm run dev        # http://localhost:4321 — живая перезагрузка
npm run check      # сборка + все проверки (перед каждым деплоем)
npm run audit      # SEO-аудит: мета, схемы, вес, robots/sitemap/.htaccess
npm run qa         # доступность и целостность разметки: якоря, дубли id, alt, контакты, типографика
npm run content    # контент-аудит статей: объём, время чтения, структура, повторы, цифры
npm run sitemap    # пересобрать sitemap.xml из готовых страниц
```

`npm run check` по шагам: сборка → сверка каждой страницы с эталоном `legacy/version-4` →
актуален ли `sitemap.xml` → JS на всех страницах (меню, бургер, FAQ) → интерактив kit →
QA-проверка (доступность, якоря, контакты, типографика) → SEO-аудит. Ошибки любого шага останавливают
сборку; то же самое запускается в GitHub Actions на каждый push.

Готовый сайт — в `site/dist/`. Его и заливаем на хостинг.

## Где что лежит

```
site/
├── astro.config.mjs          настройки: статичная сборка, адреса *.html как сейчас
├── src/
│   ├── data/site.ts          ← ТЕЛЕФОН, ПОЧТА, TELEGRAM, АДРЕС, МЕНЮ, МЕТРИКА — один раз на весь сайт
│   ├── layouts/Base.astro    <head> (SEO, иконки, шрифты, JSON-LD), шапка, меню, подвал
│   ├── components/
│   │   ├── Nav.astro         шапка (6 пунктов + телефон + бургер)
│   │   ├── MobileMenu.astro  мобильное меню (Позвонить / Написать)
│   │   ├── Footer.astro      подвал (7 пунктов, контакты, адрес, ©)
│   │   ├── ContactCards.astro 4 карточки контактов
│   │   └── Metrika.astro     Яндекс.Метрика (вкл/выкл в data/site.ts)
│   └── pages/                страницы — те же пути, что на сайте
│       ├── index.astro, services.astro, ai.astro
│       ├── cases/*.astro
│       └── blog/*.astro
├── public/                   без изменений копируется в корень сайта:
│                             styles.css, script.js, blog-assets/, icons.svg, images/, logos/, иконки,
│                             robots.txt, sitemap.xml, .htaccess, manifest.json, верификации Google/Яндекса
└── tools/
    ├── verify.py             сверка сборки с оригиналом (эталон legacy/version-4)
    ├── make-sitemap.py       сборка sitemap.xml из dist (lastmod — из схем статей)
    ├── seo-audit.py          SEO-аудит сборки: мета, схемы, ссылки, вес, robots/sitemap
    ├── qa-check.py           доступность и разметка: якоря, дубли id, alt, контакты, типографика
    ├── content-audit.py      контент-аудит статей (отчёт — tools/content-report.json)
    ├── js-check.mjs          прогон script.js на всех страницах (меню, бургер, FAQ)
    ├── kit-check.mjs         прогон интерактива статей нового образца (scan/tabs/matrix/calc/prompt)
    ├── content-edits.json    журнал намеренных правок контента (для verify.py)
    ├── import_legacy.py      перенос из legacy/version-4 (уже выполнен, повторно не нужен)
    └── port_v6.py            перенос статьи на макет Article.astro (вспомогательный)
```

## Типовые задачи

**Поменять телефон / почту / Telegram / адрес** — `src/data/site.ts`. Меняется в шапке, мобильном
меню, подвале и карточках контактов на всех 28 страницах.

**Поменять пункт меню** — `NAV` (шапка и мобильное меню) и `FOOTER_NAV` (подвал) в `src/data/site.ts`.
Меню главной менять только по согласованию (CLAUDE.md).

**Отключить Метрику** — `metrikaId: null` в `src/data/site.ts`.

**Страница 404** — `src/pages/404.astro`, закрыта `noindex` и не входит в `sitemap.xml`;
на хостинге работает через `ErrorDocument 404 /404.html` в `public/.htaccess`.

**Микроразметка** — `jsonLd` передаётся в `Base` массивом строк: на главной `Organization` + `WebSite`,
на услугах, AI-хабе и кейсах — `BreadcrumbList`, в статьях нового макета схема собирается из данных.

**Новая статья блога** — взять за основу статью нового образца (`blog/ii-dlya-yuristov.astro` или
`blog/chto-takoe-ii-agent.astro`): макет `Article.astro` сам собирает оглавление, «Коротко», вопросы и JSON-LD.
Поменять `title`, `description`, `path`, `datePublished`/`dateModified`, текст, затем:
1. добавить карточку в `src/pages/blog/index.astro` и в блок «Из блога» на `ai.astro`;
2. `npm run sitemap` — адрес попадёт в карту автоматически, `lastmod` возьмётся из схемы статьи;
3. `npm run check`.

Если текст старой статьи правится (а не переписывается) — записать правку в `tools/content-edits.json`,
иначе сверка с эталоном покажет расхождение как ошибку.

**Правка robots.txt / .htaccess / manifest** — файлы лежат в `public/`, попадают в сборку как есть;
после правки `npm run check` проверит, что правила не закрывают нужные файлы.

**Стили и скрипты** — `public/styles.css`, `public/script.js` (те же файлы, что на сайте).

## Как устроена страница

```astro
---
import Base from '../../layouts/Base.astro';
import ContactCards from '../../components/ContactCards.astro';
const jsonLd = [ /* Article, FAQPage, BreadcrumbList — исходный JSON */ ];
---
<Base title="…" description="…" path="/blog/ii-dlya-hr.html" ogType="article"
      jsonLd={jsonLd} active="ai" skipTo="#article" readProgress>
  … контент статьи как был …
  <section id="contacts" class="section section-cta"> … <ContactCards /> … </section>
</Base>
```

- `path` — адрес страницы; из него строятся `canonical` и `og:url`.
- `active` — какой пункт меню подсвечен: `services`, `ai`, `projects`.
- `effects` — прелоадер, полоса прокрутки и свечение курсора (главная, услуги, AI, кейсы).
- `readProgress` — полоса чтения в статьях.
- Пункт «Контакты» ведёт к блоку `#contacts` на этой же странице (он есть на всех страницах).

## Деплой

1. `npm run check` — должно быть «ИТОГ: OK» и «Ошибок JS нет».
2. Залить содержимое `site/dist/` в корень сайта на Beget (как раньше `version 4/`):
   ```bash
   rsync -avz --delete --exclude send.php site/dist/ USER@HOST:~/smartsolutions.today/public_html/
   ```
   `--delete` уберёт с хостинга файлы, которых нет в сборке — проверьте путь до запуска.
   Без rsync — любым FTP-клиентом, содержимое папки `dist/`.
3. Vercel-превью: `vercel deploy dist --prod` (или подключить репозиторий: build `npm run build`,
   root `site`, output `dist`).

GitHub Actions (`.github/workflows/site.yml`) на каждый push собирает сайт и запускает сверку.

## Статьи нового образца (светлый лист + интерактив)

Эталон — `src/pages/blog/ii-dlya-yuristov.astro`. Правила — `BLOG-BRIEF.md` в корне репозитория.

- Макет `src/layouts/Article.astro`: надзаголовок, H1, мета, оглавление, «Коротко», вопросы, «Читать дальше», контакты.
  JSON-LD (Article, FAQPage, BreadcrumbList) строится из тех же данных.
- Библиотека интерактива `src/components/blog/` + `public/blog-assets/kit.{css,js}`:

| Компонент | Что делает |
|---|---|
| `DocScan` | вычитка документа: сканер, подсветка рисков, находки, «что ИИ не увидел» |
| `Tabs` | вкладки (без JS — все панели подряд) |
| `Matrix` | «светофор»: можно / с проверкой / нельзя, объяснение по клику |
| `Calc` | калькулятор: ползунки и формулы `expr` от id полей |
| `Prompt` | промпт с кнопкой «копировать» |

- Любая правка текста старой статьи записывается в `tools/content-edits.json` (`text` — правка, `rewrite` — статья переписана).
- `npm run check` нажимает весь интерактив (`tools/kit-check.mjs`) — сломанный компонент не пройдёт.
