import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  overview() {
    return this.reports.overview();
  }

  @Get('by-employee')
  byEmployee() {
    return this.reports.byEmployee();
  }

  @Get('by-group')
  byGroup() {
    return this.reports.byGroup();
  }

  @Get('timeline')
  timeline(@Query('days') days?: string) {
    return this.reports.timeline(days ? parseInt(days, 10) : undefined);
  }

  @Get('compare-campaigns')
  compareCampaigns() {
    return this.reports.compareCampaigns();
  }

  @Get('campaigns/:id/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCampaign(@Param('id') id: string, @Res() res: Response) {
    const csv = await this.reports.exportCampaignEventsCsv(id);
    res.set(
      'Content-Disposition',
      `attachment; filename="campaign-${id}-events.csv"`,
    );
    res.send(csv);
  }

  @Get('campaigns/:id/export-users.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCampaignUsers(@Param('id') id: string, @Res() res: Response) {
    const csv = await this.reports.exportCampaignUsersCsv(id);
    res.set(
      'Content-Disposition',
      `attachment; filename="campaign-${id}-users.csv"`,
    );
    res.send(csv);
  }
}
