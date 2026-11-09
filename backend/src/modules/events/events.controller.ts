import { Controller, Get, Param, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
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

  // Расшифровка конкретного перехваченного значения — явное действие,
  // не возвращается вместе со списком событий/статистикой. ADMIN-only +
  // обязательный audit-log на каждый факт расшифровки (кто, когда, какая
  // запись) — см. docs/SECURITY.md.
  @Roles('ADMIN')
  @Get(':eventId/credential')
  reveal(
    @Param('campaignId') campaignId: string,
    @Param('eventId') eventId: string,
    @Request() req: any,
  ) {
    return this.events.revealCredential(campaignId, eventId, req.user?.id ?? null, req.ip);
  }
}
