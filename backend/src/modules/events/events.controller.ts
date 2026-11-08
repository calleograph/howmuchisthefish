import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EventsService } from './events.service';

@ApiTags('events')
@ApiBearerAuth()
@Controller('campaigns/:campaignId/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@Param('campaignId') campaignId: string) {
    return this.events.listForCampaign(campaignId);
  }
}
