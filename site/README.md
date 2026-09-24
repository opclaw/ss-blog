# smartsolutions.today на Astro

Сайт Smart Solutions — тот же, что сейчас работает на Beget, но собран на единой системе.
На выходе — чистые статичные `.html` **с теми же адресами** (`/services.html`, `/blog/ii-dlya-hr.html`),
поэтому для поисковиков и хостинга ничего не меняется.

## Быстрый старт

```bash
cd site
npm install
npm run dev        # http://localhost:4321 — живая перезагрузка
npm run check      # сборка + сверка с оригиналом + проверка JS (перед каждым деплоем)
```

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
│                             styles.css, script.js, icons.svg, images/, logos/, иконки,
│                             robots.txt, sitemap.xml, .htaccess, верификации Google/Яндекса
└── tools/
    ├── import_legacy.py      перенос из legacy/version-4 (уже выполнен, повторно не нужен)
    ├── verify.py             сверка сборки с оригиналом
    └── js-check.mjs          прогон script.js на всех страницах (меню, бургер, FAQ)
```

## Типовые задачи

**Поменять телефон / почту / Telegram / адрес** — `src/data/site.ts`. Меняется в шапке, мобильном
меню, подвале и карточках контактов на всех 27 страницах.

**Поменять пункт меню** — `NAV` (шапка и мобильное меню) и `FOOTER_NAV` (подвал) в `src/data/site.ts`.
Меню главной менять только по согласованию (CLAUDE.md).

**Отключить Метрику** — `metrikaId: null` в `src/data/site.ts`.

**Новая статья блога** — скопировать любую `src/pages/blog/*.astro`, поменять `title`, `description`,
`path`, `jsonLd` и текст. Добавить карточку в `src/pages/blog/index.astro` и адрес в `public/sitemap.xml`.

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
