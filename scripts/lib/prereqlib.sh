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

# Печатает отсутствующие зависимости (команда + пакет), ничего не меняет.
sap_missing_prereqs() {
  local missing=()
  for cmd in "${!SAP_PREREQ_PACKAGES[@]}"; do
    if ! sap_check_command "$cmd"; then
      missing+=("$cmd:${SAP_PREREQ_PACKAGES[$cmd]}")
    fi
  done
  if ! sap_check_docker_compose_plugin; then
    missing+=("docker-compose-plugin:docker-compose-plugin")
  fi
  # printf с пустым массивом всё равно даёт одну пустую строку вывода —
  # mapfile в вызывающем коде тогда считает это одним (пустым) элементом.
  # Явно ничего не печатаем, если действительно нечего перечислять.
  if [ "${#missing[@]}" -gt 0 ]; then
    printf '%s\n' "${missing[@]}"
  fi
}
