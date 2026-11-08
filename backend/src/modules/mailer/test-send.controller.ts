import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { SmtpConfigService } from '../smtp/smtp-config.service';
import { TemplatesService } from '../templates/templates.service';
import { MjmlRenderService } from '../templates/mjml-render.service';
import { TestSendDto } from '../campaigns/dto/campaign.dto';

@ApiTags('campaigns')
@ApiBearerAuth()
@Roles('ADMIN', 'EDITOR')
@Controller('campaigns/test')
export class TestSendController {
  constructor(
    private readonly smtp: SmtpConfigService,
    private readonly templates: TemplatesService,
    private readonly mjml: MjmlRenderService,
  ) {}

  // Проверочная отправка одного письма перед запуском настоящей кампании (задание §2.4).
  @Post('send')
  async send(@Body() dto: TestSendDto) {
    const template = await this.templates.get(dto.templateId);
    const { html } = await this.mjml.renderWithData(template.mjmlSource, {
      firstName: 'Тест',
      lastName: 'Получатель',
    });
    const transport = await this.smtp.getTransportForCampaign(dto.smtpConfigId);
    const smtpConfig = await this.smtp.get(dto.smtpConfigId);
    await transport.sendMail({
      from: smtpConfig.fromAddress,
      to: dto.toAddress,
      subject: `[ТЕСТ] ${template.subject}`,
      html,
    });
    return { ok: true };
  }
}
