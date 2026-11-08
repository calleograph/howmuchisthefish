#!/bin/bash
# Юнит-тесты lib/prereqlib.sh. Запуск: bash tests/scripts/test_prereqlib.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../scripts/lib/prereqlib.sh"

FAILED=0
assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" != "$actual" ]; then
    echo "✗ $desc: ожидалось [$expected], получено [$actual]" >&2
    FAILED=1
  else
    echo "✓ $desc"
  fi
}

# Регрессия: sap_missing_prereqs() через printf с пустым массивом раньше
# давала одну пустую строку, из-за чего `mapfile -t` в вызывающем коде
# считал это одним (пустым) недостающим пакетом — preflight.sh всегда
# показывал "Не установлено: (пакет: )" даже когда всё установлено.
test_missing_prereqs_empty_when_all_installed() {
  # Подменяем проверки так, будто всё установлено.
  sap_check_command() { return 0; }
  sap_check_docker_compose_plugin() { return 0; }

  mapfile -t result < <(sap_missing_prereqs)
  assert_eq "sap_missing_prereqs() пустой массив, когда всё установлено" "0" "${#result[@]}"
}

test_missing_prereqs_lists_one_missing() {
  sap_check_command() { [ "$1" != "docker" ]; }
  sap_check_docker_compose_plugin() { return 0; }

  mapfile -t result < <(sap_missing_prereqs)
  assert_eq "ровно один недостающий пакет" "1" "${#result[@]}"
  assert_eq "правильный формат записи" "docker:docker.io" "${result[0]}"
}

test_missing_prereqs_empty_when_all_installed
test_missing_prereqs_lists_one_missing

if [ "$FAILED" -ne 0 ]; then
  echo "ТЕСТЫ НЕ ПРОШЛИ" >&2
  exit 1
fi
echo "Все тесты прошли."
