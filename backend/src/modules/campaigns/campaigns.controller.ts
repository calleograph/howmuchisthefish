import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CampaignsService } from './campaigns.service';
import {
  BulkTargetsDto,
  CreateCampaignDto,
  ScheduleCampaignDto,
  UpdateCampaignDto,
} from './dto/campaign.dto';

@ApiTags('campaigns')
@ApiBearerAuth()
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list() {
    return this.campaigns.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.campaigns.get(id);
  }

  @Get(':id/stats')
  stats(@Param('id') id: string) {
    return this.campaigns.stats(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post()
  create(@Body() dto: CreateCampaignDto) {
    return this.campaigns.create(dto);
  }

  @Roles('ADMIN', 'EDITOR')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(id, dto);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/targets')
  addTargets(@Param('id') id: string, @Body() dto: BulkTargetsDto) {
    return this.campaigns.addTargets(id, dto);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/schedule')
  schedule(@Param('id') id: string, @Body() dto: ScheduleCampaignDto) {
    return this.campaigns.schedule(id, new Date(dto.scheduledAt));
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.campaigns.start(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.campaigns.pause(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/resume')
  resume(@Param('id') id: string) {
    return this.campaigns.resume(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/finish')
  finish(@Param('id') id: string) {
    return this.campaigns.finish(id);
  }
}
