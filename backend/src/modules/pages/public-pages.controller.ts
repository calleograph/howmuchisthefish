import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/public.decorator';
import { PagesService } from './pages.service';
import { EventsService } from '../events/events.service';
import { buildSafeFormScript } from './safe-form-injector';

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
    private readonly config: ConfigService,
  ) {}

  @Get(':slug')
  @Header('Cache-Control', 'no-store')
  @Header('X-Frame-Options', 'DENY')
  @Header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'")
  async serve(@Param('slug') slug: string, @Query('token') token: string | undefined, @Res() res: Response) {
    const page = await this.pages.getBySlug(slug);

    let html = page.htmlSource;
    if (token) {
      // Токен должен существовать — иначе произвольный/угаданный токен не должен
      // давать возможность регистрировать события под видом реальной цели кампании.
      const target = await this.events.ensureTargetExists(token).catch(() => null);
      if (target) {
        // Скрипт всегда шлёт link_clicked при загрузке; слушатель submit вешается
        // независимо от formEnabled — лишний обработчик без формы на странице не
        // сработает, но так проще, чем условно генерировать разный JS.
        const script = buildSafeFormScript(token, this.config.get<string>('PUBLIC_BASE_URL', ''));
        html = injectBeforeBodyEnd(html, script);
      }
    }
    // Без token страница просто отдаётся как есть (например открыта администратором
    // для предпросмотра) — событий не регистрируем, т.к. нет связанной цели кампании.

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}

function injectBeforeBodyEnd(html: string, snippet: string): string {
  const closingBodyIndex = html.toLowerCase().lastIndexOf('</body>');
  if (closingBodyIndex === -1) return html + snippet;
  return html.slice(0, closingBodyIndex) + snippet + html.slice(closingBodyIndex);
}
