import { Controller, Get, Header, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync } from 'fs';
import { basename } from 'path';
import { Public } from '../auth/public.decorator';
import { PagesService } from './pages.service';
import { ScreenshotService } from './screenshot.service';
import { EventsService } from '../events/events.service';
import { buildCapturingFormScript, buildSafeFormScript } from './safe-form-injector';
import { EXT_CONTENT_TYPE } from './asset-content-type';

/**
 * Публичная раздача учебных страниц по адресу /lp/{slug}?token={trackingToken}.
 * Без авторизации — страницу открывает сотрудник, перешедший по ссылке из письма.
 */
@ApiTags('public-pages')
@Public()
@Controller('lp')
export class PublicPagesController {
  constructor(
    private readonly pages: PagesService,
    private readonly events: EventsService,
    private readonly screenshots: ScreenshotService,
    private readonly config: ConfigService,
  ) {}

  // Локально сохранённые ресурсы клонированной страницы (CSS/JS/картинки/
  // шрифты) — см. screenshot.service.ts commitClonedAssets(). basename()
  // отбрасывает любые "../" в параметре маршрута — защита от выхода за
  // пределы папки ассетов конкретной страницы через путь в URL.
  @Get(':slug/assets/:filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async asset(@Param('slug') slug: string, @Param('filename') filename: string, @Res() res: Response) {
    const page = await this.pages.getBySlug(slug);
    const safeFilename = basename(filename);
    const filePath = this.screenshots.assetPath(page.id, safeFilename);
    if (!existsSync(filePath)) throw new NotFoundException('Ресурс не найден');
    res.set('Content-Type', contentTypeByExtension(safeFilename));
    createReadStream(filePath).pipe(res);
  }

  @Get(':slug')
  @Header('Cache-Control', 'no-store')
  @Header('X-Frame-Options', 'DENY')
  @Header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'",
  )
  async serve(
    @Param('slug') slug: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const page = await this.pages.getBySlug(slug);

    let html = page.htmlSource;
    if (token) {
      // Токен должен существовать — иначе произвольный/угаданный токен не должен
      // давать возможность регистрировать события под видом реальной цели кампании.
      const target = await this.events
        .ensureTargetExists(token)
        .catch(() => null);
      if (target) {
        // Скрипт всегда шлёт link_clicked при загрузке; слушатель submit вешается
        // независимо от formEnabled — лишний обработчик без формы на странице не
        // сработает, но так проще, чем условно генерировать разный JS.
        // Выбор между безопасным и захватывающим скриптом — единственное место
        // в коде, где решается, читать ли значения формы: явный флаг страницы,
        // не глобальная настройка. См. safe-form-injector.ts.
        const publicBaseUrl = this.config.get<string>('PUBLIC_BASE_URL', '');
        const script = page.capturesCredentials
          ? buildCapturingFormScript(token, publicBaseUrl)
          : buildSafeFormScript(token, publicBaseUrl);
        html = injectBeforeBodyEnd(html, script);
      }
    }
    // Без token страница просто отдаётся как есть (например открыта администратором
    // для предпросмотра) — событий не регистрируем, т.к. нет связанной цели кампании.

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}

function contentTypeByExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_CONTENT_TYPE[ext] ?? 'application/octet-stream';
}

function injectBeforeBodyEnd(html: string, snippet: string): string {
  const closingBodyIndex = html.toLowerCase().lastIndexOf('</body>');
  if (closingBodyIndex === -1) return html + snippet;
  return (
    html.slice(0, closingBodyIndex) + snippet + html.slice(closingBodyIndex)
  );
}
