#!/bin/bash
# Манифест системных зависимостей установщика (практика из «Переговорки»:
# единый список команда→apt-пакет вместо разрозненных проверок по коду —
# легче не забыть добавить зависимость при добавлении новой фичи).
set -euo pipefail

# command -> apt-пакет
declare -A SAP_PREREQ_PACKAGES=(
  [docker]="docker.io"
  [curl]="curl"
  [openssl]="openssl"
)

sap_detect_os() {
  if [ ! -f /etc/os-release ]; then
    echo "unknown"
    return 1
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  case "$ID" in
    ubuntu)
      case "${VERSION_ID%%.*}" in
        22|24|25|26) echo "ubuntu-$VERSION_ID"; return 0 ;;
        *) echo "ubuntu-$VERSION_ID-unsupported"; return 1 ;;
      esac
      ;;
    debian)
      case "$VERSION_ID" in
        12|13) echo "debian-$VERSION_ID"; return 0 ;;
        *) echo "debian-$VERSION_ID-unsupported"; return 1 ;;
      esac
      ;;
    *)
      echo "$ID-unsupported"
      return 1
      ;;
  esac
}

sap_check_command() {
  command -v "$1" >/dev/null 2>&1
}

sap_check_docker_compose_plugin() {
  docker compose version >/dev/null 2>&1
}

# Без него docker compose build на каждом прогоне печатает предупреждение
# "Docker Compose is configured to build using Bake, but buildx isn't
# installed" — сборка и так работает (откатывается на обычный docker build),
# но для нового пользователя выглядит как недостающая/сломанная зависимость.
# Найдено реальным прогоном install.sh. Пакет в стандартных репозиториях
# Ubuntu/Debian называется docker-buildx (не docker-buildx-plugin).
sap_check_docker_buildx() {
  docker buildx version >/dev/null 2>&1
}

# Печатает суммарно свободные экстенты (в ГБ, округлено вниз) во всех LVM
# volume group, не выделенные ни одному logical volume. На чистых установках
# Ubuntu Server LVM иногда создаёт root LV меньше реального диска (например
# 15 ГБ том на 32 ГБ диске) — пользователь видит "мало места", хотя физически
# диска хватает с запасом. Найдено реальным прогоном install.sh на тестовом
# стенде: df показывал 5 ГБ свободных при физическом диске 32 ГБ, 15 ГБ лежали
# невыделенными в VG. Ничего не меняет, только печатает число (0, если LVM не
# используется или vgs недоступен).
sap_vgs_free_raw() {
  sudo vgs --noheadings --units g --nosuffix -o vg_free 2>/dev/null
}

sap_lvm_free_gb() {
  if ! sap_check_command vgs; then
    echo 0
    return 0
  fi
  sap_vgs_free_raw | tr -d ' ' | cut -d. -f1 | awk '{s+=$1} END {print s+0}'
}

# Печатает отсутствующие зависимости (команда + пакет), ничего не меняет.
sap_missing_prereqs() {
  local missing=()
  for cmd in "${!SAP_PREREQ_PACKAGES[@]}"; do
    if ! sap_check_command "$cmd"; then
      missing+=("$cmd:${SAP_PREREQ_PACKAGES[$cmd]}")
    fi
  done
  if ! sap_check_docker_compose_plugin; then
    # Имя apt-пакета для `docker compose` плагина — docker-compose-v2 на
    # Ubuntu/Debian из стандартных репозиториев (проверено реальной
    # установкой на чистой Ubuntu 26.04: пакета docker-compose-plugin там
    # нет, это ошибочное предположение по памяти, не проверенное install.sh
    # на настоящей системе до этого прогона).
    missing+=("docker-compose-plugin:docker-compose-v2")
  fi
  if ! sap_check_docker_buildx; then
    missing+=("docker-buildx:docker-buildx")
  fi
  # printf с пустым массивом всё равно даёт одну пустую строку вывода —
  # mapfile в вызывающем коде тогда считает это одним (пустым) элементом.
  # Явно ничего не печатаем, если действительно нечего перечислять.
  if [ "${#missing[@]}" -gt 0 ]; then
    printf '%s\n' "${missing[@]}"
  fi
}
