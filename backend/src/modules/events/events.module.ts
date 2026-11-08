import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { TrackingController } from './tracking.controller';

@Module({
  controllers: [EventsController, TrackingController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
