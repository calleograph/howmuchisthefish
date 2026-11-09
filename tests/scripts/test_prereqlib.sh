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
  sap_check_docker_buildx() { return 0; }

  mapfile -t result < <(sap_missing_prereqs)
  assert_eq "sap_missing_prereqs() пустой массив, когда всё установлено" "0" "${#result[@]}"
}

test_missing_prereqs_lists_one_missing() {
  sap_check_command() { [ "$1" != "docker" ]; }
  sap_check_docker_compose_plugin() { return 0; }
  sap_check_docker_buildx() { return 0; }

  mapfile -t result < <(sap_missing_prereqs)
  assert_eq "ровно один недостающий пакет" "1" "${#result[@]}"
  assert_eq "правильный формат записи" "docker:docker.io" "${result[0]}"
}

test_missing_prereqs_lists_one_missing

# Регрессия: имя apt-пакета для docker compose было ошибочно предположено
# как "docker-compose-plugin" (не существует на Ubuntu/Debian из стандартных
# репозиториев) — найдено реальной установкой на чистой Ubuntu 26.04,
# правильное имя docker-compose-v2. Этот тест фиксирует правильное имя,
# чтобы предположение не вернулось незамеченным.
test_docker_compose_package_name_is_v2() {
  sap_check_command() { return 0; }
  sap_check_docker_compose_plugin() { return 1; }
  sap_check_docker_buildx() { return 0; }

  mapfile -t result < <(sap_missing_prereqs)
  assert_eq "ровно один недостающий пакет (docker compose)" "1" "${#result[@]}"
  assert_eq "правильное имя apt-пакета для docker compose" "docker-compose-plugin:docker-compose-v2" "${result[0]}"
}

# Регрессия: без docker-buildx `docker compose build` печатает пугающее для
# нового пользователя предупреждение про Bake, хотя сборка всё равно
# работает. Найдено реальным прогоном install.sh на тестовом стенде.
test_docker_buildx_missing_is_detected() {
  sap_check_command() { return 0; }
  sap_check_docker_compose_plugin() { return 0; }
  sap_check_docker_buildx() { return 1; }

  mapfile -t result < <(sap_missing_prereqs)
  assert_eq "ровно один недостающий пакет (buildx)" "1" "${#result[@]}"
  assert_eq "правильное имя apt-пакета для buildx" "docker-buildx:docker-buildx" "${result[0]}"
}

test_missing_prereqs_empty_when_all_installed
test_missing_prereqs_lists_one_missing
test_docker_compose_package_name_is_v2
test_docker_buildx_missing_is_detected

# Регрессия: на тестовом стенде LVM root-том (15 ГБ) оказался вдвое меньше
# физического диска (32 ГБ) — установщик Ubuntu Server не выделил всё
# пространство VG тому. df показывал "мало места", хотя диска хватало —
# пользователь не мог понять причину медленной сборки. sap_lvm_free_gb()
# должна корректно суммировать и округлять вывод vgs (с пробелами и без
# дробной части).
test_lvm_free_gb_sums_and_truncates_vgs_output() {
  sap_check_command() { [ "$1" = "vgs" ]; }
  sap_vgs_free_raw() { printf '  15.00\n'; }

  result="$(sap_lvm_free_gb)"
  assert_eq "sap_lvm_free_gb() суммирует и округляет вниз" "15" "$result"
}

test_lvm_free_gb_zero_when_vgs_missing() {
  sap_check_command() { [ "$1" != "vgs" ]; }

  result="$(sap_lvm_free_gb)"
  assert_eq "sap_lvm_free_gb() равно 0, когда LVM не используется" "0" "$result"
}

test_lvm_free_gb_sums_and_truncates_vgs_output
test_lvm_free_gb_zero_when_vgs_missing

if [ "$FAILED" -ne 0 ]; then
  echo "ТЕСТЫ НЕ ПРОШЛИ" >&2
  exit 1
fi
echo "Все тесты прошли."
