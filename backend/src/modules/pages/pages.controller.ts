import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
