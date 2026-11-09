#!/bin/bash
# Root-helper: systemd-служба от root на хосте, выполняющая операции
# обновления/обслуживания, которые непривилегированный backend-контейнер
# запросить не может напрямую (нет доступа к Docker socket, нет прав на хосте
# — задание §5: "минимальные привилегии контейнера, без прямого доступа к
# Docker socket или произвольному выполнению команд на хосте").
#
# Протокол: backend кладёт JSON-запрос в $SAP_EXCHANGE_DIR/request.json,
# эта служба (запущенная systemd-таймером или вручную в цикле) читает его,
# проверяет по белому списку, выполняет, пишет результат в result.json и
# удаляет request.json. Белый список проверяется на каждом уровне —
# практика из «Переговорки»: не доверять, даже если caller уже проверил.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deployment"

# Каталог обмена: непривилегированный контейнер (uid 10001, см.
# backend/Dockerfile) пишет сюда, root-служба читает. Права 1777 (sticky bit)
# — любой может создать файл, но удалить только владелец или root, что не
# даёт одному процессу удалить/подменить запрос другого раньше обработки.
EXCHANGE_DIR="${SAP_EXCHANGE_DIR:-/var/lib/howmuchisthefish/updater}"
REQUEST_FILE="$EXCHANGE_DIR/request.json"
RESULT_FILE="$EXCHANGE_DIR/result.json"
LOG_FILE="$EXCHANGE_DIR/updater.log"

# Белый список действий — единственный источник правды о том, что вообще
# можно запросить. Ничего не выполняется, если action не входит сюда.
ALLOWED_ACTIONS=(check update backup restore)

log() {
  echo "[$(date -Is)] $1" | tee -a "$LOG_FILE" >&2
}

# Повторная проверка белого списка на этом уровне — даже если backend уже
# отфильтровал на своей стороне, helper не доверяет этому и проверяет сам.
is_action_allowed() {
  local action="$1"
  for allowed in "${ALLOWED_ACTIONS[@]}"; do
    [ "$action" = "$allowed" ] && return 0
  done
  return 1
}

# Запрос принимается только от доверенного владельца файла: root, сам этот
# процесс, или известный uid контейнера backend (10001, см. Dockerfile).
# Symlink отклоняется явно — нельзя подсунуть запрос через подмену пути.
validate_request_file() {
  local file="$1"
  if [ -L "$file" ]; then
    log "ОТКАЗ: $file — symlink, обработка отклонена"
    return 1
  fi
  local owner_uid
  owner_uid=$(stat -c '%u' "$file")
  if [ "$owner_uid" != "10001" ] && [ "$owner_uid" != "0" ]; then
    log "ОТКАЗ: $file принадлежит неизвестному uid=$owner_uid (ожидался 10001 или 0)"
    return 1
  fi
  return 0
}

# Стерильное окружение для подпроцессов обновления — случайные ASR_*/LIVEKIT_*-
# подобные переменные из окружения родителя не должны просочиться в update.sh.
# (Практика из «Переговорки».)
run_sterile() {
  env -i PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
         HOME="/root" \
         SAP_DEPLOY_DIR="$DEPLOY_DIR" \
         "$@"
}

write_result() {
  local status="$1" message="$2"
  cat > "$RESULT_FILE" <<EOF
{"status":"$status","message":"$message","finishedAt":"$(date -Is)"}
EOF
}

process_request() {
  if [ ! -f "$REQUEST_FILE" ]; then
    return 0
  fi
  if ! validate_request_file "$REQUEST_FILE"; then
    rm -f "$REQUEST_FILE"
    return 0
  fi

  local action
  action=$(python3 -I -c "import json,sys; print(json.load(open(sys.argv[1])).get('action',''))" "$REQUEST_FILE" 2>/dev/null) || {
    log "ОТКАЗ: не удалось разобрать $REQUEST_FILE как JSON"
    rm -f "$REQUEST_FILE"
    write_result "error" "invalid_request_json"
    return 0
  }

  if ! is_action_allowed "$action"; then
    log "ОТКАЗ: действие '$action' не в белом списке (${ALLOWED_ACTIONS[*]})"
    rm -f "$REQUEST_FILE"
    write_result "error" "action_not_allowed"
    return 0
  fi

  log "Выполняю действие: $action"
  rm -f "$REQUEST_FILE" # удаляем запрос ДО выполнения — не обрабатывать дважды при сбое

  case "$action" in
    check)
      run_sterile bash "$SCRIPT_DIR/check_update.sh" && write_result "ok" "check_complete" \
        || write_result "error" "check_failed"
      ;;
    update)
      run_sterile bash "$SCRIPT_DIR/apply_update.sh" && write_result "ok" "update_complete" \
        || write_result "error" "update_failed"
      ;;
    backup)
      run_sterile bash "$PROJECT_ROOT/scripts/backup.sh" --label "pre-update-$(date +%Y%m%d%H%M%S)" \
        && write_result "ok" "backup_complete" || write_result "error" "backup_failed"
      ;;
    restore)
      log "restore требует явного пути к архиву — только через ручной вызов scripts/restore.sh, не через очередь"
      write_result "error" "restore_requires_manual_invocation"
      ;;
  esac
}

mkdir -p "$EXCHANGE_DIR"
chmod 1777 "$EXCHANGE_DIR"

# Heartbeat — отдельный от status.json признак живости (архитектура из
# «Переговорки»): status.json пишет apply_update.sh только на смену этапа и
# может не обновляться минутами во время долгой сборки — не повод считать
# службу неработающей. helper.json пишется на КАЖДЫЙ проход таймера (каждые
# ~10с), независимо от того, обновляется что-то сейчас или нет.
write_heartbeat() {
  cat > "$EXCHANGE_DIR/helper.json" <<EOF
{"ts":"$(date -Is)","pid":$$}
EOF
}

# Обычный режим — один проход (вызывается systemd-таймером каждые N секунд).
# --loop — для разработки/отладки, не используется в проде.
if [ "${1:-}" = "--loop" ]; then
  log "updater.sh запущен в режиме цикла (разработка)"
  while true; do
    write_heartbeat
    process_request
    sleep 5
  done
else
  write_heartbeat
  process_request
fi
