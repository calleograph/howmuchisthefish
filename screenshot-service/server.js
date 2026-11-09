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

// Общий размер скачиваемых ресурсов на одно клонирование — защита от
// случайного/злонамеренного клонирования гигантского сайта, кладущего диск.
const MAX_TOTAL_ASSET_BYTES = 25 * 1024 * 1024; // 25 МБ
const CLONEABLE_RESOURCE_TYPES = new Set(['stylesheet', 'image', 'font', 'script']);

function extForContentType(contentType) {
  const type = (contentType || '').split(';')[0].trim();
  const map = {
    'text/css': 'css',
    'application/javascript': 'js',
    'text/javascript': 'js',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico',
    'font/woff2': 'woff2',
    'font/woff': 'woff',
    'font/ttf': 'ttf',
    'application/font-woff2': 'woff2',
    'application/font-woff': 'woff',
  };
  return map[type] || 'bin';
}

/**
 * Клонирует страницу так, чтобы её работа НЕ зависела от последующей
 * доступности исходного сайта (требование §3 задания — ранее клон работал
 * через <base href>, ресурсы продолжали грузиться напрямую с источника).
 * Перехватывает сетевые ответы CSS/JS/изображений/шрифтов через
 * page.on('response'), сохраняет их в память (как base64 в ответе —
 * сервис без диска, сохранение на диск делает backend), переписывает в
 * финальном HTML атрибуты href/src/srcset на локальные относительные пути
 * assets/{filename}, которые backend раздаёт публично (см.
 * pages.service.ts saveClonedAssets, public-pages.controller.ts assets).
 */
async function cloneWithLocalAssets(page, url, parsed) {
  const assets = []; // { originalUrl, filename, contentType, dataBase64 }
  const urlToFilename = new Map();
  let totalBytes = 0;
  let nextIndex = 0;

  page.on('response', async (response) => {
    try {
      const request = response.request();
      if (!CLONEABLE_RESOURCE_TYPES.has(request.resourceType())) return;
      if (!response.ok()) return;
      if (totalBytes >= MAX_TOTAL_ASSET_BYTES) return;
      const resourceUrl = response.url();
      if (urlToFilename.has(resourceUrl)) return;

      const buffer = await response.body();
      if (totalBytes + buffer.length > MAX_TOTAL_ASSET_BYTES) return;
      totalBytes += buffer.length;

      const contentType = response.headers()['content-type'] || '';
      const ext = extForContentType(contentType);
      const filename = `asset-${nextIndex++}.${ext}`;
      urlToFilename.set(resourceUrl, filename);
      assets.push({
        originalUrl: resourceUrl,
        filename,
        contentType: contentType.split(';')[0].trim() || 'application/octet-stream',
        dataBase64: buffer.toString('base64'),
      });
    } catch {
      // Отдельный ресурс не скачался (CORS/сбой сети/редирект) — пропускаем
      // его, не прерывая клонирование всей страницы ради одной картинки.
    }
  });

  // networkidle, не domcontentloaded — страница должна полностью
  // дорендериться (SPA с формой входа, подгружаемой через JS), иначе
  // клонируем пустой корневой div вместо реальной формы.
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

  // Переписываем href/src на собранных страницах — делаем это в самом
  // браузере (page.evaluate), т.к. там проще сопоставить DOM-атрибуты с
  // уже разрешёнными абсолютными URL (браузер сам резолвит относительные
  // пути), чем парсить HTML-строку регэкспом.
  const urlToFilenameEntries = [...urlToFilename.entries()];
  await page.evaluate((entries) => {
    const map = new Map(entries);
    const rewrite = (el, attr) => {
      const absolute = el[attr === 'href' ? 'href' : 'src']; // DOM-свойство возвращает уже разрешённый абсолютный URL
      const filename = map.get(absolute);
      if (filename) el.setAttribute(attr, `assets/${filename}`);
    };
    document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => rewrite(el, 'href'));
    document.querySelectorAll('script[src]').forEach((el) => rewrite(el, 'src'));
    document.querySelectorAll('img[src]').forEach((el) => rewrite(el, 'src'));
    document.querySelectorAll('source[src]').forEach((el) => rewrite(el, 'src'));
  }, urlToFilenameEntries);

  const html = await page.content();
  return { html, assets };
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
          const { html, assets } = await cloneWithLocalAssets(page, url, parsed);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ html, assets }));
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
