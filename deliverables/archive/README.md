# Архив: история работы (в работу не возвращаемся)

Дата разборки: 2026-09-26. Здесь лежит всё, что отработало и мешает ориентироваться в актуальных
документах. **Ничего не удалено** — только вынесено из корня `deliverables/` и корня репозитория.

## Что здесь и почему

| Что | Зачем храним | Чем заменено сейчас |
|---|---|---|
| `TEAM-RUN-3.md` … `TEAM-RUN-8.md` | разборы командных шагов: как принимались решения по тексту, семантике, графике | актуальный шаг — `deliverables/TEAM-RUN-9.md`, дальше новые отчёты |
| `TEAM-REVIEW-V5.md`, `TEAM-REVIEW-V6.md` | вёрстка v5 → v6: варианты светлого листа, разборы | боевой макет — `site/src/layouts/Article.astro` |
| `REVIEW-BLOG-V1.md`, `REVIEW-BLOG-V2.md` | первые ревью блога | `deliverables/BLOG-REWORK-PLAN.md` |
| `CONCEPT-ARTICLE-V4.md` | концепция статьи, до эталона v6 | `site/src/pages/blog/chto-takoe-ii-agent.astro` |
| `SITE-AUDIT-2026-09.md` | первый аудит сайта | `deliverables/SEO-STRATEGY-REVIEW.md`, `NEXT-STEPS-2026-09.md` |
| `IMPLEMENTATION-PLAN.md` | план старта проекта (24 сентября) | `deliverables/RELEASE-PLAN.md` |
| `SEO-ANALYSIS-REPORT.md` | сравнение с Detistov.ru (23 сентября) | `deliverables/COMPETITIVE-ANALYSIS-2026.md` |
| `design-preview/` | прототип блога v5/v6 — **источник кита** (бывшая папка `site-preview/`) | боевые стили `site/public/blog-assets/`, компоненты `site/src/components/blog/`. Скрипт `site/tools/port_v6.py` читает прототип отсюда |
| `site-fixes/` | разовый пакет правок для прода (robots.txt, sitemap.xml + инструкция) | правки внесены: актуальные `site/public/robots.txt` и `site/public/sitemap.xml` (генерируется `site/tools/make-sitemap.py`) |
| `articles-cluster-ai-agents/` | первый HTML-черновик статьи про ИИ-агента | статья живёт в `site/src/pages/blog/chto-takoe-ii-agent.astro` |

## Правила архива

1. Из архива ничего не редактируем: если решение понадобилось — берём идею и делаем заново в `site/`.
2. Ссылки в живых документах на эти файлы должны указывать на `deliverables/archive/…`.
3. Новое сюда попадает, когда шаг закрыт и его документ больше не нужен для текущей работы.
