#!/bin/bash
# HowMuchIsTheFish — установщик для чистого сервера.
#
# Использование:
#   ./install.sh                      установка/обновление, все этапы по порядку
#   ./install.sh --from migrations    продолжить с указанного этапа (после сбоя)
#   ./install.sh --dry-run            напечатать план, ничего не делать
#   ./install.sh --proxy external     за внешним reverse proxy (по умолчанию: caddy)
#
# Этапы: prerequisites → dirs → secrets → build → database → migrations →
#         services → healthcheck → caddy → done
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deployment"
ENV_FILE="$DEPLOY_DIR/.env"

# shellcheck source=lib/prereqlib.sh
source "$SCRIPT_DIR/lib/prereqlib.sh"
# shellcheck source=lib/envlib.sh
source "$SCRIPT_DIR/lib/envlib.sh"

STAGES=(prerequisites dirs secrets build database migrations services healthcheck proxy done)
FROM_STAGE="prerequisites"
DRY_RUN=0
PROXY_MODE="caddy"

while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM_STAGE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --proxy) PROXY_MODE="$2"; shift 2 ;;
    *) echo "Неизвестный параметр: $1" >&2; exit 1 ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $1"; }

stage_reached=0
run_stage() {
  local stage="$1"
  if [ "$stage" = "$FROM_STAGE" ]; then stage_reached=1; fi
  if [ "$stage_reached" -eq 0 ]; then return 0; fi

  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] этап: $stage"
    return 0
  fi
  log "Этап: $stage"
  "stage_$stage"
}

stage_prerequisites() {
  mapfile -t missing < <(sap_missing_prereqs)
  if [ "${#missing[@]}" -gt 0 ]; then
    log "Устанавливаю недостающие пакеты: ${missing[*]%%:*}"
    local pkgs=()
    for m in "${missing[@]}"; do pkgs+=("${m##*:}"); done
    sudo apt-get update -qq
    # shellcheck disable=SC2068
    sudo apt-get install -y -qq ${pkgs[@]}
  fi

  # Свежеустановленный Docker добавляет группу docker, но не добавляет в
  # неё текущего пользователя — без этого каждая команда docker требует
  # sudo. Добавляем автоматически; членство в группе применяется только к
  # новым сессиям входа (ограничение Linux, не обходится в рамках текущего
  # запущенного процесса install.sh) — честно просим перелогиниться и
  # продолжить с этого же этапа, вместо того чтобы install.sh продолжил
  # молча падать на каждой следующей docker-команде с невнятной ошибкой.
  if ! groups "$USER" | grep -qw docker; then
    log "Добавляю $USER в группу docker (требуется для работы без sudo)..."
    sudo usermod -aG docker "$USER"
    echo
    echo "Пользователь $USER добавлен в группу docker — это применится только" >&2
    echo "после нового входа в систему. Выполните:" >&2
    echo "  exit    # выйти из текущей SSH-сессии" >&2
    echo "  ssh ...  # зайти заново" >&2
    echo "  cd $(pwd) && ./scripts/install.sh --from dirs" >&2
    exit 1
  fi

  bash "$SCRIPT_DIR/preflight.sh" "$ENV_FILE" --allow-missing-env || true
}

stage_dirs() {
  mkdir -p "$DEPLOY_DIR"
  if [ ! -f "$ENV_FILE" ]; then
    cp "$DEPLOY_DIR/.env.example" "$ENV_FILE"
    log ".env создан из .env.example — потребуется заполнить CHANGE_ME_* значения"
  fi
}

stage_secrets() {
  if sap_has_unfilled_placeholders "$ENV_FILE"; then
    log "Генерирую секреты для незаполненных значений..."
    grep -qE '^DB_PASSWORD=CHANGE_ME' "$ENV_FILE" && sap_set_env_value "$ENV_FILE" DB_PASSWORD "$(sap_gen_secret)"
    grep -qE '^JWT_SECRET=CHANGE_ME' "$ENV_FILE" && sap_set_env_value "$ENV_FILE" JWT_SECRET "$(sap_gen_secret)"
    grep -qE '^APP_MASTER_KEY=CHANGE_ME' "$ENV_FILE" && sap_set_env_value "$ENV_FILE" APP_MASTER_KEY "$(sap_gen_secret)"
  fi
  if sap_has_unfilled_placeholders "$ENV_FILE"; then
    echo "Остались значения, которые нужно заполнить вручную (домен и т.п.):" >&2
    sap_list_unfilled_placeholders "$ENV_FILE" | sed 's/^/  - /' >&2
    echo "Отредактируйте $ENV_FILE и запустите install.sh --from build" >&2
    exit 1
  fi
}

compose_files() {
  if [ "$PROXY_MODE" = "external" ]; then
    echo "-f compose.yml -f compose.external-proxy.yml"
  else
    echo "-f compose.yml -f compose.caddy.yml"
  fi
}

stage_build() {
  cd "$DEPLOY_DIR"
  # shellcheck disable=SC2046
  docker compose $(compose_files) build
}

stage_database() {
  cd "$DEPLOY_DIR"
  # shellcheck disable=SC2046
  docker compose $(compose_files) up -d postgres
  log "Жду готовности PostgreSQL..."
  for _ in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U sap -d sap >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "PostgreSQL не стал готов за отведённое время" >&2
  exit 1
}

stage_migrations() {
  cd "$DEPLOY_DIR"
  # shellcheck disable=SC2046
  docker compose $(compose_files) run --rm backend npx prisma migrate deploy
}

stage_services() {
  cd "$DEPLOY_DIR"
  # shellcheck disable=SC2046
  docker compose $(compose_files) up -d
}

stage_healthcheck() {
  cd "$DEPLOY_DIR"
  log "Жду готовности backend..."
  for _ in $(seq 1 30); do
    if docker compose exec -T backend node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      log "Backend готов."
      return 0
    fi
    sleep 2
  done
  echo "Backend не ответил на /health за отведённое время — см. docker compose logs backend" >&2
  exit 1
}

stage_proxy() {
  if [ "$PROXY_MODE" = "caddy" ]; then
    log "Caddy запущен в составе services — HTTPS-сертификат получается автоматически при первом обращении."
  else
    log "Режим external-proxy: настройте свой reverse proxy по правилам в README (раздел 'Reverse-proxy маршрутизация')."
  fi
}

stage_done() {
  source "$ENV_FILE"
  echo
  echo "=========================================="
  echo " Установка завершена."
  echo " Адрес: ${PUBLIC_BASE_URL:-см. .env}"
  echo " Создайте первого администратора:"
  echo "   cd $DEPLOY_DIR && docker compose exec backend npm run seed"
  echo "=========================================="
}

for stage in "${STAGES[@]}"; do
  run_stage "$stage"
done
