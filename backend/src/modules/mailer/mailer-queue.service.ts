import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import { PrismaService } from '../../prisma/prisma.service';
import { SmtpConfigService } from '../smtp/smtp-config.service';
import { MjmlRenderService } from '../templates/mjml-render.service';

const QUEUE_NAME = 'campaign-send-email';

interface SendJobData {
  campaignId: string;
  targetId: string;
}

/**
 * Очередь отправки писем кампании на pg-boss (задание: очереди на PostgreSQL,
 * без отдельного Redis/NATS). Каждое письмо — отдельная задача в очереди, что даёт
 * естественный rate-limit через teamSize/teamConcurrency pg-boss и переживание
 * перезапуска backend без потери недоотправленных писем (задачи лежат в БД).
 */
@Injectable()
export class MailerQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailerQueueService.name);
  private boss!: PgBoss;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly smtp: SmtpConfigService,
    private readonly mjml: MjmlRenderService,
  ) {}

  async onModuleInit() {
    this.boss = new PgBoss(this.config.get<string>('DATABASE_URL')!);
    this.boss.on('error', (err) => this.logger.error('pg-boss error', err));
    await this.boss.start();
    // pg-boss v12: очередь не создаётся неявно при первом send/work — нужно явно.
    // createQueue идемпотентен (безопасно вызывать при каждом старте приложения).
    await this.boss.createQueue(QUEUE_NAME);
    await this.boss.work<SendJobData>(QUEUE_NAME, async ([job]) =>
      this.handleSend(job.data),
    );
  }

  async onModuleDestroy() {
    await this.boss?.stop();
  }

  async enqueueCampaign(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { targets: true },
    });
    if (!campaign) return { enqueued: 0 };

    // sendRateLimit (писем/минуту) переводим в задержку между задачами pg-boss —
    // простой способ ограничить скорость без отдельного токен-бакета.
    const delaySeconds = Math.ceil(60 / Math.max(campaign.sendRateLimit, 1));

    let i = 0;
    for (const target of campaign.targets) {
      const jobData: SendJobData = { campaignId, targetId: target.id };
      await this.boss.send(QUEUE_NAME, jobData, {
        startAfter: i * delaySeconds,
      });
      i++;
    }
    return { enqueued: campaign.targets.length };
  }

  private async handleSend(data: SendJobData) {
    const target = await this.prisma.campaignTarget.findUnique({
      where: { id: data.targetId },
      include: {
        employee: true,
        campaign: { include: { template: true, page: true } },
      },
    });
    if (!target || !target.employee) return;

    const { campaign } = target;
    try {
      const transport = await this.smtp.getTransportForCampaign(
        campaign.smtpConfigId,
      );
      const { html } = await this.mjml.renderWithData(
        campaign.template.mjmlSource,
        {
          firstName: target.employee.firstName,
          lastName: target.employee.lastName,
        },
      );
      const smtpConfig = await this.smtp.get(campaign.smtpConfigId);

      // Ссылки на учебную страницу и пиксель открытия встраиваются с trackingToken цели.
      const publicBaseUrl = this.config
        .get<string>('PUBLIC_BASE_URL', '')
        .replace(/\/$/, '');
      const landingUrl = `${publicBaseUrl}/lp/${campaign.page.slug}?token=${target.trackingToken}`;
      const pixelUrl = `${publicBaseUrl}/t/pixel.gif?token=${target.trackingToken}`;
      // Ссылка "Сообщить о фишинге" — шаблон может вставить её явной кнопкой
      // через {{reportPhishingUrl}}; не обязательна, просто доступна как
      // переменная, как и landingPageUrl.
      const reportUrl = `${publicBaseUrl}/t/report?token=${target.trackingToken}`;
      const htmlWithTracking = html
        .replace(/\{\{landingPageUrl\}\}/g, landingUrl)
        .replace(/\{\{reportPhishingUrl\}\}/g, reportUrl)
        .replace(
          '</body>',
          `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none" /></body>`,
        );

      await transport.sendMail({
        from: smtpConfig.fromAddress,
        to: target.employee.email,
        subject: campaign.template.subject,
        html: htmlWithTracking,
      });

      await this.prisma.campaignEvent.create({
        data: {
          campaignId: campaign.id,
          targetId: target.id,
          type: 'EMAIL_SENT',
        },
      });
    } catch (err: any) {
      this.logger.error(
        `Не удалось отправить письмо цели ${target.id}: ${err.message}`,
      );
      // shortcut: без повторных попыток отправки конкретного письма в 0.1.0 — сбой
      // просто не создаёт EMAIL_SENT, видно в отчёте как "не отправлено"; upgrade:
      // добавить retry с ограничением попыток, если доставка окажется нестабильной.
    }
  }
}
