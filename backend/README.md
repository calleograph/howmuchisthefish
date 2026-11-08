# Backend — Security Awareness Platform

NestJS-приложение (модульный монолит). См. корневой [README.md](../README.md)
проекта и [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) для общей картины.

## Разработка

```bash
npm install
npx prisma generate
cp .env.example .env   # заполните значения
npx prisma migrate dev
npm run start:dev
```

## Скрипты

| Команда | Назначение |
|---|---|
| `npm run build` | Сборка (`nest build`) |
| `npm run lint` | ESLint с автофиксом |
| `npm test` | Юнит-тесты (включает guard-тест `config-registry` против `schema.prisma`) |
| `npm run seed` | Создать первого администратора (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`) |

## Структура

Каждый модуль в `src/modules/` — своя директория с DTO, сервисом,
контроллером и модулем NestJS. См. таблицу модулей в
[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#backend-модули).
