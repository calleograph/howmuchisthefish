// Расширения соответствуют тем, что screenshot-service присваивает файлам
// при клонировании (см. extForContentType в screenshot-service/server.js) —
// держать в синхроне с тем списком, не произвольный общий mime-реестр.
// Используется и для финальной раздачи (public-pages.controller.ts), и для
// preview-раздачи до сохранения страницы (pages.controller.ts).
export const EXT_CONTENT_TYPE: Record<string, string> = {
  css: 'text/css',
  js: 'application/javascript',
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
};
