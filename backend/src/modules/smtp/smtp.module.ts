import { Module } from '@nestjs/common';
import { SmtpConfigController } from './smtp-config.controller';
import { SmtpConfigService } from './smtp-config.service';

@Module({
  controllers: [SmtpConfigController],
  providers: [SmtpConfigService],
  exports: [SmtpConfigService],
})
export class SmtpModule {}
