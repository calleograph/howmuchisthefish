#!/bin/bash
# Проверяет доступность новой версии через GitHub Releases API. Только
# читает — ничего не меняет. Результат пишется в result.json родительским
# updater.sh; здесь — просто код возврата (0 = проверка выполнена, не
# "новая версия есть").
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO="${SAP_GITHUB_REPO:-calleograph/howmuchisthefish}"
EXCHANGE_DIR="${SAP_EXCHANGE_DIR:-/var/lib/howmuchisthefish/updater}"

current_version=$(cat "$PROJECT_ROOT/VERSION" 2>/dev/null || echo "unknown")

latest_json=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null) || {
  echo "Не удалось обратиться к GitHub Releases API" >&2
  exit 1
}
latest_version=$(echo "$latest_json" | python3 -I -c "import json,sys; print(json.load(sys.stdin).get('tag_name','').lstrip('v'))")

cat > "$EXCHANGE_DIR/version_info.json" <<EOF
{"currentVersion":"$current_version","latestVersion":"$latest_version","checkedAt":"$(date -Is)"}
EOF

echo "Текущая версия: $current_version, последняя доступная: $latest_version"
