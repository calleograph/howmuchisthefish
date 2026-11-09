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
import { join } from 'path';
import { Roles } from '../auth/roles.decorator';
import { PagesService } from './pages.service';
import { CreatePageDto, UpdatePageDto } from './dto/page.dto';

@ApiTags('pages')
@ApiBearerAuth()
@Controller('pages')
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string) {
    return this.pages.list(includeArchived === 'true');
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
