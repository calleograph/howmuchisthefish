# Опциональный сервис превью-скриншотов — отдельный образ на базе
# официального Playwright-образа (уже содержит Chromium + системные
# зависимости), НЕ часть основного backend-образа. См. compose.yml
# профиль "screenshots".
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev

COPY server.js .

RUN addgroup --system app && adduser --system --ingroup app app
USER app

EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
