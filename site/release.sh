#!/usr/bin/env bash
# Релиз на прод (Beget) одной командой: сборка → проверки → выгрузка → проверка прода → IndexNow.
#
#   cd site
#   BEGET_USER=логин BEGET_HOST=хост BEGET_PATH=~/smartsolutions.today/public_html ./release.sh
#   ./release.sh --dry-run          # только показать, что будет выгружено
#   ./release.sh --skip-rsync       # прод уже обновлён: только проверка + IndexNow
#
# Креды не хранятся в репозитории: задаются переменными окружения на время запуска.
# Если предпочитаете выкладку без ручного запуска — можно перенести эти шаги в .github/workflows
# (секреты BEGET_* в настройках репозитория); сейчас по решению владельца релиз ручной.
set -euo pipefail
cd "$(dirname "$0")"

DRY=0; SKIP_RSYNC=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --skip-rsync) SKIP_RSYNC=1 ;;
    *) echo "Неизвестный аргумент: $a"; exit 2 ;;
  esac
done

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

step '1/6 Зависимости'
[ -d node_modules ] || npm ci --no-fund --no-audit

step '2/6 Сборка и все проверки (verify, JS, интерактив, QA, SEO-аудит)'
npm run check

step '3/6 Что поедет на прод'
urls=$(grep -c '<loc>' dist/sitemap.xml || true)
echo "  страниц в карте сайта: $urls"
du -sh dist | awk '{print "  вес сборки: "$1}'

if [ "$SKIP_RSYNC" = 0 ]; then
  : "${BEGET_USER:?Задайте BEGET_USER (логин хостинга)}"
  : "${BEGET_HOST:?Задайте BEGET_HOST (хост хостинга)}"
  : "${BEGET_PATH:?Задайте BEGET_PATH (путь до public_html)}"
  step '4/6 Выгрузка на прод (rsync)'
  RSYNC=(rsync -az --delete --exclude='.well-known/***' --exclude='*.md' --exclude='.DS_Store'
         dist/ "${BEGET_USER}@${BEGET_HOST}:${BEGET_PATH}/")
  if [ "$DRY" = 1 ]; then
    echo '  сухой прогон:'
    "${RSYNC[@]}" --dry-run --itemize-changes | head -30
    echo '  … показаны первые 30 строк'
    exit 0
  fi
  "${RSYNC[@]}"
  echo '  выгружено'
else
  step '4/6 Выгрузка пропущена (--skip-rsync)'
  [ "$DRY" = 1 ] && exit 0
fi

step '5/6 Проверка прода: 28 URL отвечают 200 и совпадают со сборкой'
python3 tools/verify-prod.py || {
  echo '  ✗ Проверка не прошла. Релиз не закрыт: разберитесь с расхождениями выше.'
  exit 1
}

step '6/6 IndexNow: сообщаем Яндексу и Bing об обновлении (Google — только sitemap и Search Console)'
node tools/indexnow.mjs --send || echo '  ⚠ IndexNow не ответил — это не блокер, переобход в Вебмастере остаётся.'

cat <<'NEXT'

Дальше руками (5 минут, нужен доступ к панелям):
  1. Яндекс.Вебмастер → Индексирование → Файлы Sitemap: переотправить sitemap.xml
  2. Там же → Переобход страниц: добавить 5 главных адресов (новая статья, посадочные, /blog/)
  3. Вебмастер → Диагностика: убедиться, что ошибок нет
  4. Метрика → Цели: проверить, что 4 цели ловят клики (Telegram, телефон, WhatsApp, e-mail)
  5. Записать дату релиза и первые цифры в SESSION.md и plan-файл позиций
NEXT
