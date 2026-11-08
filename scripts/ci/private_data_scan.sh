#!/bin/bash
# Сканер приватных данных по принципу белого списка (практика из
# «Переговорки»): ищет паттерны, которые НЕ должны попадать в публичный
# репозиторий (реальные IP, внутренние домены конкретной организации,
# явно оставленные секреты), и явно разрешает нейтральные примеры
# (example.local, example.com, RFC 5737 тестовые IP-диапазоны, localhost).
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

FAILED=0
report() {
  echo "✗ $1" >&2
  FAILED=1
}

# Каталоги/файлы, не относящиеся к публикуемому коду.
EXCLUDE_DIRS="node_modules|.git|dist|coverage|backups"

echo "== Поиск захардкоженных реальных IP-адресов (кроме тестовых/локальных) =="
# RFC 5737 (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24) и localhost/частные
# диапазоны (10.x, 172.16-31.x, 192.168.x, 127.x) разрешены как примеры.
if grep -rEn '([0-9]{1,3}\.){3}[0-9]{1,3}' \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.md" \
    --include="*.yml" --include="*.yaml" --include="*.sh" --include="*.env*" \
    . 2>/dev/null \
    | grep -vE "$EXCLUDE_DIRS" \
    | grep -vE '(127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)' \
    | grep -qE '([0-9]{1,3}\.){3}[0-9]{1,3}'; then
  echo "Найдены потенциально реальные IP-адреса (не в разрешённых диапазонах):" >&2
  grep -rEn '([0-9]{1,3}\.){3}[0-9]{1,3}' \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.md" \
    --include="*.yml" --include="*.yaml" --include="*.sh" --include="*.env*" \
    . 2>/dev/null \
    | grep -vE "$EXCLUDE_DIRS" \
    | grep -vE '(127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)' \
    | head -20 >&2
  report "обнаружены IP-адреса вне разрешённых диапазонов — проверьте вручную"
fi

echo "== Поиск доменов, не входящих в белый список примеров =="
ALLOWED_DOMAIN_PATTERN='example\.(local|com|org|net)|localhost|yourdomain|ваш-домен|CHANGE_ME'
if grep -rEoh '[a-zA-Z0-9.-]+\.(ru|com|org|net|io|local)' \
    --include="*.ts" --include="*.tsx" --include="*.md" --include="*.yml" --include="*.yaml" \
    . 2>/dev/null \
    | grep -vE "$EXCLUDE_DIRS" \
    | grep -vE "$ALLOWED_DOMAIN_PATTERN" \
    | grep -vE '\.(d\.ts|config\.ts)$' \
    | sort -u | grep -q .; then
  echo "Домены вне белого списка примеров (проверьте вручную — может быть ложным срабатыванием на библиотеках):" >&2
  grep -rEoh '[a-zA-Z0-9.-]+\.(ru|com|org|net|io|local)' \
    --include="*.ts" --include="*.tsx" --include="*.md" --include="*.yml" --include="*.yaml" \
    . 2>/dev/null \
    | grep -vE "$EXCLUDE_DIRS" \
    | grep -vE "$ALLOWED_DOMAIN_PATTERN" \
    | sort -u | head -20 >&2
fi

echo "== Поиск явных секретов, случайно оставленных в коде =="
# Паттерны реальных значений (не CHANGE_ME-заглушек, не переменных окружения).
if grep -rEn '(password|secret|api[_-]?key)\s*[:=]\s*["'"'"'][^"'"'"']{12,}["'"'"']' \
    --include="*.ts" --include="*.tsx" --include="*.yml" --include="*.yaml" \
    . 2>/dev/null \
    | grep -vE "$EXCLUDE_DIRS" \
    | grep -viE 'CHANGE_ME|process\.env|config\.get|your-domain|example' \
    | grep -q .; then
  echo "Потенциальные захардкоженные секреты:" >&2
  grep -rEn '(password|secret|api[_-]?key)\s*[:=]\s*["'"'"'][^"'"'"']{12,}["'"'"']' \
    --include="*.ts" --include="*.tsx" --include="*.yml" --include="*.yaml" \
    . 2>/dev/null \
    | grep -vE "$EXCLUDE_DIRS" \
    | grep -viE 'CHANGE_ME|process\.env|config\.get|your-domain|example' >&2
  report "обнаружены возможные захардкоженные секреты"
fi

echo "== Проверка на упоминания прежнего названия продукта или сервера-донора =="
# Паттерн собран из частей, чтобы не совпасть с собственной строкой поиска
# этого скрипта при сканировании самого scripts/ci/.
forbidden_part1="stop""phish"
forbidden_part2="стоп""фиш"
FORBIDDEN_TERMS="${forbidden_part1}|${forbidden_part2}|192\.168\.1\.47"
SELF_PATH="scripts/ci/private_data_scan.sh"
if grep -rEni "$FORBIDDEN_TERMS" \
    --include="*.ts" --include="*.tsx" --include="*.md" --include="*.yml" --include="*.yaml" --include="*.sh" \
    . 2>/dev/null | grep -vE "$EXCLUDE_DIRS" | grep -v "$SELF_PATH" | grep -q .; then
  echo "Найдены запрещённые упоминания:" >&2
  grep -rEni "$FORBIDDEN_TERMS" \
    --include="*.ts" --include="*.tsx" --include="*.md" --include="*.yml" --include="*.yaml" --include="*.sh" \
    . 2>/dev/null | grep -vE "$EXCLUDE_DIRS" | grep -v "$SELF_PATH" >&2
  report "обнаружены упоминания прежнего названия/сервера-донора — они не должны быть в публичном репозитории"
fi

if [ "$FAILED" -ne 0 ]; then
  echo
  echo "Проверка не пройдена." >&2
  exit 1
fi
echo
echo "Проверка пройдена — запрещённых паттернов не найдено."
