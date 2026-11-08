# syntax=docker/dockerfile:1
# Многоступенчатая сборка: builder ставит все зависимости и компилирует TS,
# финальный образ содержит только прод-зависимости и собранный dist/ —
# меньше размер образа, меньше поверхность атаки (нет dev-инструментов в проде).

FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
# Используем npm ci, не install — детерминированная сборка по lock-файлу,
# требование для воспроизводимых релизных образов.
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# dumb-init — корректная обработка сигналов (SIGTERM от docker stop) как PID 1;
# без него Node не получает сигнал вовремя, graceful shutdown не срабатывает.
RUN apk add --no-cache dumb-init

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

# Непривилегированный пользователь — контейнер приложения не должен работать
# от root (требование задания §5: минимальные привилегии).
RUN addgroup -g 10001 -S app && adduser -u 10001 -S app -G app \
    && mkdir -p /data/storage && chown -R app:app /data /app
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
