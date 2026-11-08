import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { MjmlRenderService } from './mjml-render.service';

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService, MjmlRenderService],
  exports: [TemplatesService, MjmlRenderService],
})
export class TemplatesModule {}
