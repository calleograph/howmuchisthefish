#!/bin/bash
# Применяет обновление: backup → git fetch/checkout новой версии → build/pull
# → migrate → перезапуск сервисов → healthcheck. При сбое миграции или
# healthcheck — автоматический откат к предыдущему состоянию (код/БД).
#
# Протокол статуса (архитектура подсмотрена в «Переговорке» —
# frontend/src/pages/admin/UpdatesAdmin.tsx — и упрощена под масштаб этого
# продукта, см. _private/docs для полного разбора):
#   status.json    — текущий этап {step_no, step_total, step_name, state, ts}
#   update.log     — построчный вывод всего процесса (читает UI построчно)
#   history.ndjson — одна строка на попытку обновления, новые в конец
#   report.json    — итоговый отчёт последней попытки (outcome по категориям)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deployment"
EXCHANGE_DIR="${SAP_EXCHANGE_DIR:-/var/lib/howmuchisthefish/updater}"
LOG_FILE="$EXCHANGE_DIR/update.log"
STEP_TOTAL=6
STEP_NO=0

: > "$LOG_FILE" # новый прогон — новый журнал, UI определяет это по сбросу offset

log() {
  echo "[$(date -Is)] $1" | tee -a "$LOG_FILE" >&2
}

write_status() {
  local state="$1" step_name="$2"
  cat > "$EXCHANGE_DIR/status.json" <<EOF
{"state":"$state","stepNo":$STEP_NO,"stepTotal":$STEP_TOTAL,"stepName":"$step_name","ts":"$(date -Is)"}
EOF
}

step() {
  STEP_NO=$((STEP_NO + 1))
  write_status "updating" "$1"
  log "Этап $STEP_NO/$STEP_TOTAL: $1"
}

write_history() {
  local result="$1" message="$2"
  cat >> "$EXCHANGE_DIR/history.ndjson" <<EOF
{"at":"$(date -Is)","fromVersion":"$current_version","toVersion":"$target_version","result":"$result","message":"$message"}
EOF
}

write_report() {
  local outcome_update="$1" outcome_deploy="$2" outcome_health="$3" message="$4"
  cat > "$EXCHANGE_DIR/report.json" <<EOF
{"fromVersion":"$current_version","toVersion":"$target_version","finishedAt":"$(date -Is)","outcome":{"update":"$outcome_update","deploy":"$outcome_deploy","healthcheck":"$outcome_health"},"message":"$message"}
EOF
}

fail() {
  local message="$1" outcome_update="${2:-error}" outcome_deploy="${3:-skipped}" outcome_health="${4:-skipped}"
  log "ОШИБКА: $message"
  write_status "failed" "$message"
  write_history "failed" "$message"
  write_report "$outcome_update" "$outcome_deploy" "$outcome_health" "$message"
  exit 1
}

current_version=$(cat "$PROJECT_ROOT/VERSION" 2>/dev/null || echo "unknown")
target_version=$(python3 -I -c "import json; print(json.load(open('$EXCHANGE_DIR/version_info.json')).get('latestVersion',''))" 2>/dev/null || echo "")

if [ -z "$target_version" ]; then
  fail "Нет данных о целевой версии — сначала запустите проверку обновлений" "skipped" "skipped" "skipped"
fi
if [ "$target_version" = "$current_version" ]; then
  log "Уже на последней версии ($current_version) — обновление не требуется"
  write_status "idle" "up_to_date"
  exit 0
fi

# Защита от отката версии: найдено реальным тестированием — если
# разрабатываемая версия ещё не опубликована тегом на GitHub (как сейчас),
# "последний релиз" API вернёт версию СТАРШЕ установленной. Frontend это
# уже не даёт запросить (см. UpdateTab.tsx isNewerVersion), но root-helper
# не должен доверять этому — вторая линия защиты перед реальным git
# checkout на более старую версию.
is_version_newer() {
  local candidate="$1" current="$2"
  python3 -I -c "
import sys
def parts(v): return [int(x) if x.isdigit() else 0 for x in v.split('.')[:3]] + [0,0,0]
c, u = parts('$candidate'), parts('$current')
sys.exit(0 if c[:3] > u[:3] else 1)
"
}
if ! is_version_newer "$target_version" "$current_version"; then
  fail "Целевая версия $target_version не новее установленной $current_version — обновление отклонено (защита от отката)" "skipped" "skipped" "skipped"
fi

step "backup"
bash "$PROJECT_ROOT/scripts/backup.sh" --label "pre-update-v$target_version" >>"$LOG_FILE" 2>&1 \
  || fail "Резервное копирование не удалось — обновление остановлено до внесения изменений"
backup_file=$(ls -t "$PROJECT_ROOT"/backups/*.tar.gz.enc 2>/dev/null | head -1)

step "fetching"
cd "$PROJECT_ROOT"
git fetch --tags --quiet >>"$LOG_FILE" 2>&1
if ! git checkout "v$target_version" --quiet 2>>"$LOG_FILE"; then
  fail "Тег v$target_version не найден в репозитории" "error" "skipped" "skipped"
fi

step "building"
cd "$DEPLOY_DIR"
if ! docker compose build >>"$LOG_FILE" 2>&1; then
  log "Сборка образов не удалась — откатываю код к $current_version"
  cd "$PROJECT_ROOT" && git checkout "v$current_version" --quiet >>"$LOG_FILE" 2>&1
  fail "Сборка образов версии $target_version не удалась, код возвращён к $current_version" "error" "skipped" "skipped"
fi

step "migrating"
if ! docker compose run --rm backend npx prisma migrate deploy >>"$LOG_FILE" 2>&1; then
  log "Миграция не удалась — восстанавливаю БД из резервной копии и откатываю код"
  cd "$PROJECT_ROOT" && git checkout "v$current_version" --quiet >>"$LOG_FILE" 2>&1
  cd "$DEPLOY_DIR" && docker compose build >>"$LOG_FILE" 2>&1
  [ -n "$backup_file" ] && bash "$PROJECT_ROOT/scripts/restore.sh" "$backup_file" --force >>"$LOG_FILE" 2>&1
  docker compose up -d >>"$LOG_FILE" 2>&1
  fail "Миграция БД не удалась — выполнен автоматический откат кода и базы данных" "error" "rolled_back" "skipped"
fi

step "restarting"
docker compose up -d >>"$LOG_FILE" 2>&1

step "healthcheck"
healthy=0
for _ in $(seq 1 30); do
  if docker compose exec -T backend node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done

if [ "$healthy" -ne 1 ]; then
  log "Backend не прошёл healthcheck — откатываю код, базу данных и сервисы"
  cd "$PROJECT_ROOT" && git checkout "v$current_version" --quiet >>"$LOG_FILE" 2>&1
  cd "$DEPLOY_DIR" && docker compose build >>"$LOG_FILE" 2>&1
  [ -n "$backup_file" ] && bash "$PROJECT_ROOT/scripts/restore.sh" "$backup_file" --force >>"$LOG_FILE" 2>&1
  docker compose up -d >>"$LOG_FILE" 2>&1
  fail "Backend не ответил на /health после обновления — выполнен автоматический откат" "ok" "ok" "rolled_back"
fi

write_status "idle" "done"
write_history "ok" "Обновление до $target_version завершено успешно"
write_report "ok" "ok" "ok" "Обновление до $target_version завершено успешно"
log "Обновление до $target_version завершено успешно"
