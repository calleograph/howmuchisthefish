#!/bin/bash
# Восстановление из резервной копии. Делает страховочный дамп перед
# восстановлением (pre-restore) — если что-то пойдёт не так, можно
# откатиться и к нему тоже.
# Использование: ./scripts/restore.sh <путь-к-архиву.tar.gz.enc> [--force]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deployment"

ARCHIVE="${1:?Укажите путь к зашифрованному архиву резервной копии}"
FORCE=0
[ "${2:-}" = "--force" ] && FORCE=1

if [ ! -f "$ARCHIVE" ]; then
  echo "Файл не найден: $ARCHIVE" >&2
  exit 1
fi

if [ "$FORCE" -ne 1 ]; then
  echo "ВНИМАНИЕ: это заменит текущую базу данных и файловое хранилище."
  echo "Введите имя проекта (COMPOSE_PROJECT_NAME из .env) для подтверждения:"
  read -r confirm_name
  actual_name=$(grep '^COMPOSE_PROJECT_NAME=' "$DEPLOY_DIR/.env" | cut -d= -f2)
  if [ "$confirm_name" != "$actual_name" ]; then
    echo "Имя не совпадает — восстановление отменено." >&2
    exit 1
  fi
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

echo "Пароль для расшифровки архива:"
read -rs decrypt_pass
echo
openssl enc -aes-256-cbc -d -pbkdf2 -in "$ARCHIVE" -out "$WORKDIR/backup.tar.gz" -pass "pass:$decrypt_pass" || {
  echo "Не удалось расшифровать — неверный пароль или повреждённый архив." >&2
  exit 1
}
tar -xzf "$WORKDIR/backup.tar.gz" -C "$WORKDIR"

if [ ! -f "$WORKDIR/database.dump" ]; then
  echo "Архив не содержит database.dump — похоже, это не резервная копия этого продукта." >&2
  exit 1
fi

# Страховочный дамп текущего состояния перед заменой.
echo "Создаю страховочную копию текущего состояния (pre-restore)..."
bash "$SCRIPT_DIR/backup.sh" --label "pre-restore-$(date +%Y%m%d%H%M%S)" || {
  echo "Не удалось создать страховочную копию — восстановление остановлено." >&2
  exit 1
}

cd "$DEPLOY_DIR"
echo "Останавливаю backend (БД должна быть недоступна для записи во время restore)..."
docker compose stop backend

echo "Восстанавливаю базу данных..."
docker compose exec -T postgres pg_restore -U sap -d sap --clean --if-exists < "$WORKDIR/database.dump"

if [ -f "$WORKDIR/storage.tar.gz" ]; then
  echo "Восстанавливаю файловое хранилище..."
  volume_name=$(docker compose config --format json | python3 -I -c "import json,sys; print(json.load(sys.stdin)['volumes']['app-storage'].get('name') or 'deployment_app-storage')")
  docker run --rm -v "$volume_name:/data" -v "$WORKDIR:/backup" alpine sh -c "rm -rf /data/* && tar -xzf /backup/storage.tar.gz -C /data"
fi

echo "Применяю миграции (на случай если резервная копия со старой версии схемы)..."
docker compose run --rm backend npx prisma migrate deploy

docker compose up -d
echo "Восстановление завершено."
