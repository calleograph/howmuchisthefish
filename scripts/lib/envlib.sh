#!/bin/bash
# Работа с .env: генерация секретов, проверка незаменённых CHANGE_ME-заглушек.
set -euo pipefail

sap_gen_secret() {
  openssl rand -hex 32
}

# Заменяет значение ключа KEY=... в .env файле, сохраняя остальные строки.
sap_set_env_value() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file"; then
    # используем | как разделитель sed — значения (пароли) не содержат его
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

# Возвращает 0, если в файле остались незаменённые CHANGE_ME_* значения.
sap_has_unfilled_placeholders() {
  local file="$1"
  grep -qE '=CHANGE_ME_' "$file"
}

sap_list_unfilled_placeholders() {
  local file="$1"
  grep -E '=CHANGE_ME_' "$file" | cut -d= -f1
}
