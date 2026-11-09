import { Body, Controller, Get, NotFoundException, Param, Post, Request, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { Roles } from '../auth/roles.decorator';
import { ReportJobsService } from './report-jobs.service';
import { CreateReportDto, PreviewReportDto } from './dto/create-report.dto';

const CONTENT_TYPE: Record<string, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

@ApiTags('report-jobs')
@ApiBearerAuth()
@Controller('report-jobs')
export class ReportJobsController {
  constructor(private readonly reportJobs: ReportJobsService) {}

  @Get()
  list() {
    return this.reportJobs.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.reportJobs.get(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post('preview')
  preview(@Body() dto: PreviewReportDto) {
    return this.reportJobs.preview(dto.type, dto.filters ?? {});
  }

  @Roles('ADMIN', 'EDITOR')
  @Post()
  create(@Body() dto: CreateReportDto, @Request() req: any) {
    return this.reportJobs.create(dto.type, dto.format, dto.filters ?? {}, req.user?.id ?? null);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { absolutePath, format } = await this.reportJobs.filePathFor(id);
    if (!existsSync(absolutePath)) throw new NotFoundException('Файл отчёта не найден');
    res.set('Content-Type', CONTENT_TYPE[format] ?? 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="report.${format}"`);
    createReadStream(absolutePath).pipe(res);
  }
}
