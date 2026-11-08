import { Module } from '@nestjs/common';
import { MailerQueueService } from './mailer-queue.service';
import { TestSendController } from './test-send.controller';
import { SmtpModule } from '../smtp/smtp.module';
import { TemplatesModule } from '../templates/templates.module';

@Module({
  imports: [SmtpModule, TemplatesModule],
  controllers: [TestSendController],
  providers: [MailerQueueService],
  exports: [MailerQueueService],
})
export class MailerModule {}
