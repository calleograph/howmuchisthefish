import { Controller, Get, HttpCode, HttpStatus, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { DomainsService } from './domains.service';

/**
 * Caddy on-demand TLS `ask` endpoint (deployment/Caddyfile, global options
 * block). Caddy запрашивает этот путь с `?domain=` при КАЖДОМ новом
 * TLS-рукопожатии для домена без уже выпущенного сертификата — должен
 * отвечать быстро, без побочных эффектов. 2xx разрешает выпуск сертификата
 * Let's Encrypt, любой другой статус — отказ (см. официальную документацию
 * Caddy: caddyserver.com/docs/caddyfile/options#on-demand-tls).
 * Не документируется в Swagger — внутренний инфраструктурный эндпоинт,
 * не часть публичного API продукта.
 */
@ApiExcludeController()
@Public()
@Controller('internal/tls-ask')
export class PublicDomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async ask(@Query('domain') domain: string | undefined, @Res() res: Response) {
    const allowed = domain ? await this.domains.isAllowedForTls(domain) : false;
    res.status(allowed ? HttpStatus.OK : HttpStatus.FORBIDDEN).send();
  }
}
