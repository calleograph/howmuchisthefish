import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto, PreviewTemplateDto, UpdateTemplateDto } from './dto/template.dto';

@ApiTags('templates')
@ApiBearerAuth()
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string) {
    return this.templates.list(includeArchived === 'true');
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post()
  create(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Roles('ADMIN', 'EDITOR')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.templates.duplicate(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.templates.archive(id);
  }

  @Post(':id/preview')
  preview(@Param('id') id: string, @Body() dto: PreviewTemplateDto) {
    return this.templates.preview(id, dto.sampleData);
  }
}
