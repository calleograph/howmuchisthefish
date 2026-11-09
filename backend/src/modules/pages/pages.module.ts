import { Module } from '@nestjs/common';
import { PagesController } from './pages.controller';
import { PublicPagesController } from './public-pages.controller';
import { PagesService } from './pages.service';
import { ScreenshotService } from './screenshot.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [PagesController, PublicPagesController],
  providers: [PagesService, ScreenshotService],
  exports: [PagesService],
})
export class PagesModule {}
