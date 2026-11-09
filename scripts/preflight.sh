#!/bin/bash
# Проверяет готовность системы к установке/обновлению. Только читает —
# ничего не меняет. Используется install.sh перед каждым этапом и отдельно
# администратором для диагностики ("почему не ставится").
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/prereqlib.sh
source "$SCRIPT_DIR/lib/prereqlib.sh"
# shellcheck source=lib/envlib.sh
source "$SCRIPT_DIR/lib/envlib.sh"

ENV_FILE="${1:-$SCRIPT_DIR/../deployment/.env}"
FAILED=0

note_fail() {
  echo "✗ $1" >&2
  FAILED=1
}
note_ok() {
  echo "✓ $1"
}

echo "== Проверка системы =="

os="$(sap_detect_os)" || { note_fail "Неподдерживаемая ОС: $os (поддерживаются Ubuntu 22.04+/24.04+, Debian 12+/13+)"; }
[ "$FAILED" -eq 0 ] 2>/dev/null && note_ok "ОС: $os"

mapfile -t missing < <(sap_missing_prereqs)
if [ "${#missing[@]}" -gt 0 ]; then
  for m in "${missing[@]}"; do
    note_fail "Не установлено: ${m%%:*} (пакет: ${m##*:})"
  done
else
  note_ok "Все системные зависимости установлены (docker, docker compose, curl, openssl)"
fi

if sap_check_command docker && ! docker info >/dev/null 2>&1; then
  note_fail "Docker демон недоступен (запущен? у пользователя есть права?)"
fi

echo
echo "== Проверка диска =="
avail_gb=$(df --output=avail -BG "$SCRIPT_DIR" 2>/dev/null | tail -1 | tr -dc '0-9' || echo 0)
if [ "${avail_gb:-0}" -lt 5 ]; then
  note_fail "Свободно на диске менее 5 ГБ (${avail_gb}ГБ) — рекомендуется минимум 10 ГБ"
elif [ "${avail_gb:-0}" -lt 15 ]; then
  echo "⚠ Свободно на диске: ${avail_gb}ГБ — хватит для установки, но первая сборка Docker-образов (сотни пакетов node_modules) пройдёт заметно дольше при малом запасе места"
else
  note_ok "Свободно на диске: ${avail_gb}ГБ"
fi

lvm_free_gb=$(sap_lvm_free_gb)
if [ "${lvm_free_gb:-0}" -ge 2 ]; then
  echo "⚠ В LVM volume group не выделено логическому тому ${lvm_free_gb}ГБ свободного места — диск физически больше, чем видит система."
  echo "    Частая причина: установщик Ubuntu Server создал root-том меньше всего диска."
  echo "    Расширить онлайн (без перезагрузки, безопасно — только рост):"
  echo "      sudo lvextend -l +100%FREE /dev/mapper/\$(sudo vgs --noheadings -o vg_name | tr -d ' ')-\$(sudo lvs --noheadings -o lv_name | tr -d ' ')"
  echo "      sudo resize2fs /dev/mapper/\$(sudo vgs --noheadings -o vg_name | tr -d ' ')-\$(sudo lvs --noheadings -o lv_name | tr -d ' ')   # для ext4"
fi

echo
echo "== Проверка конфигурации =="
if [ ! -f "$ENV_FILE" ]; then
  note_fail "Файл .env не найден по пути $ENV_FILE (скопируйте .env.example в .env)"
else
  note_ok ".env найден"
  if sap_has_unfilled_placeholders "$ENV_FILE"; then
    note_fail "В .env остались незаменённые значения CHANGE_ME_*:"
    sap_list_unfilled_placeholders "$ENV_FILE" | sed 's/^/    - /' >&2
  else
    note_ok "Все значения CHANGE_ME_* в .env заменены"
  fi
fi

echo
echo "== Проверка портов =="
# Порты 80/443 нужны только для встроенного HTTPS (профиль caddy) — не
# жёсткая ошибка, предупреждение: администратор может выбрать external-proxy.
for port in 80 443; do
  if command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -q ":${port} "; then
    echo "⚠ Порт $port уже занят — это нормально, если вы используете внешний reverse proxy (compose.external-proxy.yml)"
  fi
done

echo
if [ "$FAILED" -ne 0 ]; then
  echo "Проверка не пройдена — исправьте указанное выше перед установкой." >&2
  exit 1
fi
echo "Все проверки пройдены."
