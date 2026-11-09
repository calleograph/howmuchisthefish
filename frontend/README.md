# Frontend — HowMuchIsTheFish

React + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui. См. корневой
[README.md](../README.md) проекта для общей картины.

## Разработка

```bash
npm install
npm run dev
```

Dev-сервер проксирует API-запросы (`/api`, `/health`, `/lp`, `/t`) на backend
на `localhost:3000` — см. `vite.config.ts`.

## Скрипты

| Команда | Назначение |
|---|---|
| `npm run dev` | Dev-сервер с hot reload |
| `npm run build` | Проверка типов (`tsc -b`) + production-сборка |
| `npm run lint` | oxlint |
| `npm run preview` | Локальный просмотр production-сборки |

## Структура

- `src/pages/` — страницы по модулям продукта (Dashboard, Employees, Templates,
  Pages, Campaigns, Reports, Settings)
- `src/components/ui/` — компоненты shadcn/ui
- `src/components/layout/` — общий layout (сайдбар/мобильная навигация)
- `src/hooks/use-auth.tsx` — аутентификация, хранение токена
- `src/lib/api.ts` — HTTP-клиент (axios) с автоматическим JWT и обработкой 401
