# SEO-машина Smart Solutions — карта и план интеграции

> Составлено 2026-08-25. Основано на реальном чтении файлов на диске, не по памяти.

---

## 1. Что у нас есть (инвентаризация)

### A. SEO-скиллы (~80 шт) — `~/.claude/skills/`
Отдельные инструменты. Ключевые для нас:

| Скилл | Роль |
|---|---|
| `keyword-research` | сбор ключей |
| `serp-analysis` | анализ выдачи |
| `content-gap-analysis` | пробелы конкурентов |
| `competitor-analysis` | анализ конкурентов |
| `content-quality-auditor` | E-E-A-T аудит (главный gate) |
| `meta-tags-optimizer` | title/description |
| `schema-markup-generator` | JSON-LD |
| `internal-linking-optimizer` | перелинковка |
| `on-page-seo-auditor` | технический аудит |
| `rank-tracker` | позиции |
| `humanizer` | очеловечивание |
| `fact-checker` | проверка фактов |
| `geo-content-optimizer` | GEO/AI-цитирование |
| `seo-google`, `seo-orchestrate`, `seo-plan` | оркестрация под Google |

### B. SEO-машина (шаблон) — `~/Documents/Git/seo-machine-template/`
Конвейер, связывающий скиллы в pipeline:

- **Команды** `.claude/commands/sm-*.md`: `sm-research`, `sm-cluster`, `sm-write-article`, `sm-write-landing`, `sm-optimize`, `sm-publish`, `sm-priorities`
- **Агенты** `.claude/agents/sm-*.md`: `sm-content-analyzer`, `sm-meta-creator`, `sm-internal-linker`, `sm-editor`, `sm-seo-optimizer`
- **Скрипты** `scripts/`: `publisher_static.py`, `publisher_wordpress.py`, `publisher_astro.py`, `publisher_nextjs.py`, `ru_readability.py`, `ru_keyword_analyzer.py`
- **Контекст** `context/`: `00-platform-config.md`, `01-brand-voice.md`, `02-seo-guidelines.md`, `03-internal-links-map.md`, `04-target-keywords.md`, `05-competitor-analysis.md`
- **Карты** `.claude-docs/`: `SEO-GOOGLE.md`, `SEO-YANDEX.md`, `SEO-BOTH.md`

### C. Движок статей (statejnik) — `~/Documents/Git/SEO-smyslokod(dvizhok-skill)/`
Автономный режим «тема → публикация» без вопросов:
- `statejnik/SKILL.md` — 16 этапов, 4 фазы (ПОИСК → ВЫБОР → НАПИСАНИЕ → ВАЛИДАЦИЯ)
- `statejnik/methodology/00-methodology-16-stages.md`
- `statejnik/checklists/` — anti-ai, cta, compliance, seo-geo
- `statejnik/tools/` — preview, originality-check, structure-check, publish
- `statejnik/AUTOPILOT.md` — собирает config.yaml
- `stateinik-engine/` — Next.js CMS (НЕ нужен, у нас static)

### D. Наш Wordstat — `~/Documents/opencode/wordstat-seo-tool/`
Яндекс-спрос (частотность). Уже работает, ~1000 req/h.

### E. Наш сайт — `~/Documents/Git/smart-solutions-site/version 4/`
Статический HTML. Прод = Beget (rsync). 26 страниц.

---

## 2. Ключевой вывод

**Система уже собрана, но рассыпана по 4 папкам и не привязана к нашему сайту.**

Главное несоответствие: шаблон `seo-machine-template` заточен под **Astro/WordPress/Next.js**, а наш сайт — **статический HTML**. Нужна адаптация.

---

## 3. Целевая архитектура (единый конвейер)

```
[РАЗВЕДКА]                    [ВАЛИДАЦИЯ]              [ПРОИЗВОДСТВО]
youtube-intelligence-ru  →    Wordstat-тул        →    K3 → ТЗ
blogwatcher/competitor   →    (частотность)      →    k2.7 → черновик
competitor-analysis      →    отсев нулевых      →    humanizer + fact-checker
        ↓                        ↓                        ↓
   кандидаты тем            темы со спросом          готовая статья
                                                          ↓
[ПУБЛИКАЦИЯ] ← [ОПТИМИЗАЦИЯ] ← [ВАЛИДАЦИЯ КАЧЕСТВА]
sm-publish (static)   sm-optimize        content-quality-auditor
rsync → Beget         meta-tags          schema-markup
индексация            internal-linking   (главный gate)
        ↓
[ИЗМЕРЕНИЕ]
Метрика + rank-tracker → что работает → усилить / переписать
```

---

## 4. Что нужно адаптировать (под наш static-сайт)

| Что | Сейчас в шаблоне | Нужно для нас |
|---|---|---|
| Платформа | Astro/WordPress/Next.js | **Static HTML** (уже есть `publisher_static.py`) |
| `context/00-platform-config.md` | плейсхолдеры `{{...}}` | заполнить: домен, пути, услуги |
| `context/01-brand-voice.md` | пусто | голос Smart Solutions (анти-хайп, измеримость) |
| `context/02-seo-guidelines.md` | общие | уже подходит (Яндекс+Google) |
| `context/03-internal-links-map.md` | пусто | карта наших 26 страниц |
| `context/04-target-keywords.md` | пусто | из Wordstat (уже есть CONTENT-MAP.md) |
| `publisher_static.py` | копирует в `public/blog` | адаптировать под `version 4/blog/` + rsync |
| `statejnik/config.yaml` | нет | собрать через AUTOPILOT под наш сайт |

---

## 5. План внедрения (3 фазы)

### Фаза 1 — Полуавтомат для себя (сейчас)
Цикл по команде «напиши статью про X»:
1. Wordstat → спрос
2. `/sm-research` → бриф
3. `/sm-write-article` → черновик
4. `humanizer` + `fact-checker` → качество
5. `/sm-optimize` + `content-quality-auditor` → gate
6. `publisher_static.py` → `version 4/blog/`
7. rsync → Beget + индексация

**Действия:**
- [ ] Заполнить `context/` под smartsolutions.today
- [ ] Адаптировать `publisher_static.py` под `version 4/blog/`
- [ ] Собрать `statejnik/config.yaml`
- [ ] Прогнать 1 тестовую статью

### Фаза 2 — Автопилот для себя
Тот же цикл через cron: разведка → Wordstat → статья → публикация → отчёт.

**Действия:**
- [ ] Подключить youtube-intelligence-ru (разведка трендов)
- [ ] MCP Вебмастер + Метрика (автоиндексация + трафик)
- [ ] cron-конвейер

### Фаза 3 — Продукт для клиентов
Параметризовать конвейер: ниша, голос, бан-лист, домен → `config.yaml`. Разворачивать на клиента за день.

**Действия:**
- [ ] Упаковать в шаблон «разверни на нового клиента»
- [ ] Документация + прайс

---

## 6. Что НЕ нужно делать

- ❌ Ставить `stateinik-engine` (Next.js CMS) — у нас static HTML
- ❌ Ставить MCP-Wordstat из поста — у нас свой тул лучше
- ❌ Ставить `humanizer-ru` — у нас уже есть `humanizer` скилл
- ❌ Ставить TheCraigHewitt/seomachine — у нас уже есть адаптация
- ❌ Ставить sourceforge seo-machine — это старый виндовый софт

---

## 7. Следующий шаг

Заполнить `context/` под smartsolutions.today и адаптировать `publisher_static.py`. Это разблокирует Фазу 1.
