#!/bin/bash
# Резервное копирование БД + файлового хранилища + конфигурации.
# Использование: ./scripts/backup.sh [--label метка] [--keep N]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deployment"
BACKUP_DIR="$PROJECT_ROOT/backups"

LABEL="manual-$(date +%Y%m%d%H%M%S)"
KEEP=10

while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    *) echo "Неизвестный параметр: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$BACKUP_DIR"
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

echo "Резервное копирование: $LABEL"

# 1. Дамп БД (формат custom -Fc — компактнее plain SQL, поддерживает
# параллельное восстановление pg_restore).
echo "  - база данных..."
cd "$DEPLOY_DIR"
docker compose exec -T postgres pg_dump -U sap -Fc sap > "$WORKDIR/database.dump"

# 2. Файловое хранилище (docker volume app-storage).
echo "  - файловое хранилище..."
docker run --rm \
  -v "$(docker compose config --format json | python3 -I -c "import json,sys; print(json.load(sys.stdin)['volumes']['app-storage'].get('name') or 'deployment_app-storage')"):/data:ro" \
  -v "$WORKDIR:/backup" \
  alpine tar -czf /backup/storage.tar.gz -C /data . 2>/dev/null || echo "    (хранилище пустое или недоступно — пропущено)"

# 3. .env — конфигурация развёртывания. Секретные значения (DB_PASSWORD,
# JWT_SECRET, APP_MASTER_KEY) намеренно НЕ исключаются из этого файла — без
# APP_MASTER_KEY резервная копия БД с зашифрованными полями (SMTP-пароли)
# невосстановима. Поэтому сама резервная копия шифруется ниже.
cp "$DEPLOY_DIR/.env" "$WORKDIR/env.backup"

# Метаданные снимка.
cat > "$WORKDIR/manifest.json" <<EOF
{"label":"$LABEL","createdAt":"$(date -Is)","version":"$(cat "$PROJECT_ROOT/VERSION" 2>/dev/null || echo unknown)"}
EOF

ARCHIVE="$BACKUP_DIR/${LABEL}.tar.gz"
tar -czf "$ARCHIVE" -C "$WORKDIR" .

# Шифрование архива (резервная копия содержит секреты из .env и может
# содержать персональные данные сотрудников — не должна лежать в открытом
# виде). Пароль печатается один раз, нигде не сохраняется — как и в
# config-backup механизме «Переговорки».
if command -v openssl >/dev/null 2>&1; then
  pass=$(openssl rand -base64 15)
  openssl enc -aes-256-cbc -salt -pbkdf2 -in "$ARCHIVE" -out "${ARCHIVE}.enc" -pass "pass:$pass"
  rm -f "$ARCHIVE"
  echo
  echo "Резервная копия создана: ${ARCHIVE}.enc"
  echo "ПАРОЛЬ ДЛЯ РАСШИФРОВКИ (сохраните сейчас, больше не показывается): $pass"
else
  echo "openssl не найден — резервная копия сохранена БЕЗ шифрования: $ARCHIVE" >&2
fi

# Ротация: оставляем только последние KEEP копий.
ls -t "$BACKUP_DIR"/*.tar.gz.enc 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "Хранится резервных копий: $(ls "$BACKUP_DIR"/*.tar.gz.enc 2>/dev/null | wc -l) (лимит: $KEEP)"
