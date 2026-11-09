import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { basename, join } from 'path';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { PagesService } from './pages.service';
import { ScreenshotService } from './screenshot.service';
import { CreatePageDto, UpdatePageDto, CloneUrlDto } from './dto/page.dto';
import { EXT_CONTENT_TYPE } from './asset-content-type';

@ApiTags('pages')
@ApiBearerAuth()
@Controller('pages')
export class PagesController {
  constructor(
    private readonly pages: PagesService,
    private readonly screenshots: ScreenshotService,
  ) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string) {
    return this.pages.list(includeArchived === 'true');
  }

  // Раздача ресурсов клона ДО сохранения страницы — редактор показывает
  // предпросмотр по cloneId (см. clonePreview ниже), у которого ещё нет
  // slug для /lp/:slug/assets/:filename. @Public(), не JWT: обычные
  // ресурсные запросы браузера (img/link в iframe-предпросмотре) не несут
  // Authorization-заголовок, подставить его некуда. Защита —
  // непредсказуемый cloneId (UUID), тот же принцип, что у trackingToken
  // участника кампании: самостоятельная непрозрачная строка как секрет,
  // не отдельный auth-слой. Живёт недолго — до сохранения страницы
  // (дальше раздача идёт по постоянному pageId тем же способом).
  // Регистрируется ПЕРЕД :id, иначе Nest принял бы "clone-preview" за id.
  @Public()
  @Get('clone-preview/:cloneId/assets/:filename')
  async clonePreviewAsset(
    @Param('cloneId') cloneId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const safeFilename = basename(filename);
    const filePath = this.screenshots.tmpClonedAssetPath(cloneId, safeFilename);
    if (!existsSync(filePath)) throw new NotFoundException('Ресурс не найден');
    const ext = safeFilename.split('.').pop()?.toLowerCase() ?? '';
    res.set('Content-Type', EXT_CONTENT_TYPE[ext] ?? 'application/octet-stream');
    createReadStream(filePath).pipe(res);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.pages.get(id);
  }

  // Отдаёт превью-скриншот, если он был сгенерирован (screenshot-service
  // запущен и успел обработать страницу) — 404, если скриншота ещё нет.
  @Get(':id/screenshot')
  async screenshot(@Param('id') id: string, @Res() res: Response) {
    const page = await this.pages.get(id);
    const storageRoot = process.env.STORAGE_ROOT ?? '/data/storage';
    if (!page.screenshotPath) throw new NotFoundException('Превью ещё не создано');
    const filePath = join(storageRoot, page.screenshotPath);
    if (!existsSync(filePath)) throw new NotFoundException('Превью ещё не создано');
    res.set('Content-Type', 'image/png');
    createReadStream(filePath).pipe(res);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post()
  create(@Body() dto: CreatePageDto) {
    return this.pages.create(dto);
  }

  // Граббер страниц: получает готовый HTML по URL (headless-рендер, не
  // просто curl — работает для SPA), НЕ сохраняет страницу сразу —
  // администратор видит результат в редакторе и сам решает, сохранять ли,
  // прежде чем он станет реальным лендингом кампании. См. docs/SECURITY.md
  // "Граббер страниц" про ограничения (CSP/anti-cloning/authwalled сайты).
  @Roles('ADMIN', 'EDITOR')
  @Post('clone-preview')
  clonePreview(@Body() dto: CloneUrlDto) {
    return this.pages.clonePreview(dto.url);
  }

  @Roles('ADMIN', 'EDITOR')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePageDto) {
    return this.pages.update(id, dto);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.pages.duplicate(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.pages.archive(id);
  }
}
