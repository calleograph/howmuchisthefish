#!/bin/bash
# Применяет обновление: backup → git fetch/checkout новой версии → build/pull
# → migrate → перезапуск сервисов → healthcheck. При сбое миграции или
# healthcheck — автоматический откат к предыдущему состоянию (код/БД).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deployment"
EXCHANGE_DIR="${SAP_EXCHANGE_DIR:-/var/lib/security-awareness-platform/updater}"

log() { echo "[$(date -Is)] $1" >&2; }

write_progress() {
  cat > "$EXCHANGE_DIR/progress.json" <<EOF
{"stage":"$1","startedAt":"$(date -Is)"}
EOF
}

current_version=$(cat "$PROJECT_ROOT/VERSION" 2>/dev/null || echo "unknown")
target_version=$(python3 -I -c "import json; print(json.load(open('$EXCHANGE_DIR/version_info.json')).get('latestVersion',''))" 2>/dev/null || echo "")

if [ -z "$target_version" ]; then
  log "Нет данных о целевой версии — сначала запустите check"
  exit 1
fi
if [ "$target_version" = "$current_version" ]; then
  log "Уже на последней версии ($current_version) — обновление не требуется"
  exit 0
fi

write_progress "backup"
log "Резервное копирование перед обновлением $current_version → $target_version"
bash "$PROJECT_ROOT/scripts/backup.sh" --label "pre-update-v$target_version" || {
  log "ОШИБКА: резервное копирование не удалось — обновление остановлено"
  exit 1
}
backup_file=$(ls -t "$PROJECT_ROOT"/backups/*.tar.gz.enc 2>/dev/null | head -1)

write_progress "fetching"
cd "$PROJECT_ROOT"
git fetch --tags --quiet
if ! git checkout "v$target_version" --quiet 2>/dev/null; then
  log "ОШИБКА: тег v$target_version не найден"
  exit 1
fi

write_progress "building"
cd "$DEPLOY_DIR"
if ! docker compose build; then
  log "ОШИБКА: сборка образов не удалась — откатываю код к $current_version"
  cd "$PROJECT_ROOT" && git checkout "v$current_version" --quiet
  exit 1
fi

write_progress "migrating"
if ! docker compose run --rm backend npx prisma migrate deploy; then
  log "ОШИБКА: миграция не удалась — восстанавливаю БД из резервной копии и откатываю код"
  cd "$PROJECT_ROOT" && git checkout "v$current_version" --quiet
  cd "$DEPLOY_DIR" && docker compose build
  [ -n "$backup_file" ] && bash "$PROJECT_ROOT/scripts/restore.sh" "$backup_file" --force
  docker compose up -d
  exit 1
fi

write_progress "restarting"
docker compose up -d

write_progress "healthcheck"
healthy=0
for _ in $(seq 1 30); do
  if docker compose exec -T backend node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done

if [ "$healthy" -ne 1 ]; then
  log "ОШИБКА: backend не прошёл healthcheck после обновления — откатываю"
  cd "$PROJECT_ROOT" && git checkout "v$current_version" --quiet
  cd "$DEPLOY_DIR" && docker compose build
  [ -n "$backup_file" ] && bash "$PROJECT_ROOT/scripts/restore.sh" "$backup_file" --force
  docker compose up -d
  exit 1
fi

write_progress "done"
log "Обновление до $target_version завершено успешно"
