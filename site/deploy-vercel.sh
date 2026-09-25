#!/usr/bin/env bash
# Выгрузка сайта на Vercel-превью (ss-ai-preview.vercel.app).
# Схема из SESSION.md: деплоим копию БЕЗ .git — иначе Vercel Hobby блокирует CLI-деплой (BLOCKED).
#
#   cd site && VERCEL_TOKEN=... ./deploy-vercel.sh
#
# Токен: vercel.com → Account Settings → Tokens. В файлы и репозиторий не вписывать.
set -euo pipefail
cd "$(dirname "$0")"

: "${VERCEL_TOKEN:?Задайте VERCEL_TOKEN: VERCEL_TOKEN=... ./deploy-vercel.sh}"
SCOPE="${VERCEL_SCOPE:-opclaws-projects-1b852b6a}"
PROJECT="${VERCEL_PROJECT:-ss-ai-preview}"
OUT="${DEPLOY_DIR:-$HOME/projects/ss-deploy}"

echo "1/4 Зависимости и проверка"
[ -d node_modules ] || npm ci --no-fund --no-audit
npm run check

echo "2/4 Копия сборки без .git → $OUT"
rm -rf "$OUT" && mkdir -p "$OUT"
cp -a dist/. "$OUT"/
# .htaccess нужен Beget, на Vercel не действует — не мешает
cat > "$OUT/vercel.json" <<'JSON'
{ "cleanUrls": false, "trailingSlash": false }
JSON

echo "3/4 Привязка к проекту $PROJECT"
cd "$OUT"
npx --yes vercel@latest link --yes --project "$PROJECT" --scope "$SCOPE" --token "$VERCEL_TOKEN" >/dev/null

echo "4/4 Деплой"
URL=$(npx --yes vercel@latest deploy --prod --yes --scope "$SCOPE" --token "$VERCEL_TOKEN")
echo
echo "Готово: $URL"
echo "Превью: https://$PROJECT.vercel.app/blog/ii-dlya-yuristov.html"
