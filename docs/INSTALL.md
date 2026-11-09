# Установка

## Предварительные требования

См. [SYSTEM_REQUIREMENTS.md](SYSTEM_REQUIREMENTS.md). Поддерживаются Ubuntu
22.04+/24.04+ и Debian 12+/13+.

## Установка с нуля

```bash
git clone <url-репозитория> howmuchisthefish
cd howmuchisthefish
./scripts/install.sh
```

Установщик выполняет по порядку:

1. **prerequisites** — проверяет и при необходимости ставит Docker, Docker
   Compose plugin, curl, openssl.
2. **dirs** — создаёт `deployment/.env` из `.env.example`, если его ещё нет.
3. **secrets** — генерирует `DB_PASSWORD`, `JWT_SECRET`, `APP_MASTER_KEY`
   автоматически (`openssl rand -hex 32`). Домен (`DOMAIN`,
   `PUBLIC_BASE_URL`) нужно задать вручную — установщик остановится и
   укажет, что именно заполнить в `deployment/.env`.
4. **build** — собирает образы backend и frontend.
5. **database** — поднимает PostgreSQL, ждёт готовности.
6. **migrations** — применяет миграции схемы (`prisma migrate deploy`).
7. **services** — запускает все сервисы.
8. **healthcheck** — ждёт, пока backend ответит на `/health`.
9. **proxy** — настраивает публикацию (см. ниже).

Если какой-то этап упал, исправьте причину и продолжите с него же, не
начиная сначала:

```bash
./scripts/install.sh --from migrations
```

Посмотреть план без выполнения:

```bash
./scripts/install.sh --dry-run
```

## Публикация: два варианта

### Вариант 1 — встроенный HTTPS (по умолчанию)

Установщик поднимает [Caddy](https://caddyserver.com/), который публикует
80/443 и сам получает сертификат Let's Encrypt по домену из `DOMAIN` в
`.env`. Требуется, чтобы DNS A-запись домена указывала на этот сервер и
порты 80/443 были доступны снаружи.

### Вариант 2 — за внешним reverse proxy организации

Если у организации уже есть свой nginx/Caddy/Traefik с централизованным
TLS:

```bash
./scripts/install.sh --proxy external
```

Backend слушает `127.0.0.1:3000`, frontend — `127.0.0.1:8080` (порты
настраиваются в `.env`). Настройте свой reverse proxy по схеме в
[ARCHITECTURE.md](ARCHITECTURE.md#маршрутизация), ключевое — REST API под
`/api/*`, остальное на frontend, кроме `/health`, `/lp/*`, `/t/*` (эти три
обслуживает backend напрямую, без префикса — короткие ссылки в письмах).

## Первый администратор

```bash
cd deployment
docker compose exec backend npm run seed
```

Скрипт запросит email и пароль администратора интерактивно (пароль
печатается только в терминал, не в файлы и не в логи).

## Проверка установки

```bash
./scripts/preflight.sh deployment/.env
curl -f https://ваш-домен/health
```

## Если что-то пошло не так

См. раздел "Диагностика" в [ADMIN_GUIDE.md](ADMIN_GUIDE.md), либо:

```bash
cd deployment
docker compose logs -f backend
docker compose ps
```
