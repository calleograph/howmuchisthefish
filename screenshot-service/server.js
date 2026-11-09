/**
 * Опциональный сервис превью-скриншотов учебных страниц. Отдельный образ с
 * Chromium (300+МБ) — сознательно НЕ часть основного backend-образа, чтобы
 * не раздувать установку для всех пользователей, которым скриншоты не
 * нужны. Backend обращается сюда по HTTP (SCREENSHOT_SERVICE_URL); если
 * сервис недоступен/не запущен — просто нет превью, не ошибка установки.
 *
 * Простой HTTP-сервер без фреймворка — единственная зависимость это сам
 * Playwright, который и так тяжёлый; добавлять Express ради одного роута
 * не нужно.
 */
const http = require('http');
const { chromium } = require('playwright-core');

const PORT = process.env.PORT || 4000;

let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ args: ['--no-sandbox'] });
  }
  return browserPromise;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/clone') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { url } = JSON.parse(body);
        if (!url || typeof url !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Поле url обязательно' }));
          return;
        }
        let parsed;
        try {
          parsed = new URL(url);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Некорректный URL' }));
          return;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Поддерживаются только http/https' }));
          return;
        }

        const browser = await getBrowser();
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        try {
          // networkidle, не domcontentloaded — страница должна полностью
          // дорендериться (SPA с формой входа, подгружаемой через JS), иначе
          // клонируем пустой корневой div вместо реальной формы.
          await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
          // <base href> переписывает относительные пути ресурсов (css/js/img)
          // на абсолютные с оригинального домена — простой и надёжный подход
          // для первой реализации (не требует скачивать и зеркалировать
          // каждый ресурс на диск); у исходного сайта ресурсы продолжат
          // отдаваться напрямую, пока он жив — известное ограничение,
          // задокументированное в SECURITY.md/CONFIGURATION.md.
          await page.evaluate((baseUrl) => {
            const base = document.createElement('base');
            base.href = baseUrl;
            document.head.prepend(base);
          }, parsed.origin + parsed.pathname.replace(/[^/]*$/, ''));
          const html = await page.content();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ html }));
        } finally {
          await page.close();
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/screenshot') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { html } = JSON.parse(body);
        if (!html || typeof html !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Поле html обязательно' }));
          return;
        }
        const browser = await getBrowser();
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        try {
          await page.setContent(html, { waitUntil: 'networkidle', timeout: 10000 });
          const png = await page.screenshot({ type: 'png' });
          res.writeHead(200, { 'Content-Type': 'image/png' });
          res.end(png);
        } finally {
          await page.close();
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`screenshot-service слушает порт ${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
