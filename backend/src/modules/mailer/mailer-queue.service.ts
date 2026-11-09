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
    // retryLimit/retryBackoff — закрывает shortcut из предыдущей версии
    // ("без повторных попыток отправки"): временный сбой SMTP (сеть,
    // перегрузка релея) не должен означать "письмо никогда не уйдёт" —
    // см. матрицу docs/FUNCTIONAL_GAP_MATRIX.md §9. 3 попытки с
    // экспоненциальной задержкой (не бесконечно) покрывают и постоянные
    // сбои (неверный email и т.п.) — после исчерпания лимита письмо
    // просто не получает EMAIL_SENT, как и раньше, видно в отчёте кампании.
    await this.boss.createQueue(QUEUE_NAME, {
      retryLimit: 3,
      retryBackoff: true,
    });
    await this.boss.work<SendJobData>(QUEUE_NAME, async ([job]) =>
      this.handleSend(job.data, job.retryCount),
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

  private async handleSend(data: SendJobData, retryCount: number) {
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
      // department/position/customFields уже есть в модели Employee, но не
      // попадали в реальную рассылку (только firstName/lastName) — малое
      // доделывание из матрицы, docs/FUNCTIONAL_GAP_MATRIX.md §4.
      // customFields (произвольный JSON — text/number/boolean/select из
      // CustomFieldDef) приводится к строке: renderWithData ожидает
      // Record<string, string>, значения могут быть не строками. Идёт
      // ПЕРВЫМ в объекте — явные поля ниже (firstName и т.д.) всегда
      // побеждают при совпадении ключа, а не наоборот.
      const customFieldsRaw =
        typeof target.employee.customFields === 'object' &&
        target.employee.customFields !== null
          ? (target.employee.customFields as Record<string, unknown>)
          : {};
      const customFields = Object.fromEntries(
        Object.entries(customFieldsRaw).map(([key, value]) => [key, String(value ?? '')]),
      );
      const { html } = await this.mjml.renderWithData(
        campaign.template.mjmlSource,
        {
          ...customFields,
          firstName: target.employee.firstName,
          lastName: target.employee.lastName,
          department: target.employee.department ?? '',
          position: target.employee.position ?? '',
        },
      );
      const smtpConfig = await this.smtp.get(campaign.smtpConfigId);

      // Ссылки на учебную страницу и пиксель открытия встраиваются с trackingToken цели.
      const publicBaseUrl = this.config
        .get<string>('PUBLIC_BASE_URL', '')
        .replace(/\/$/, '');
      // Если у страницы есть собственный верифицированный домен — ссылка на
      // неё ведёт туда (похожий на цель URL для кампании), а служебные
      // pixel/report-эндпоинты остаются на основном PUBLIC_BASE_URL — это
      // backend-маршруты приложения, не часть похожей на цель страницы.
      const page = await this.prisma.landingPage.findUnique({
        where: { id: campaign.pageId },
        include: { domain: true },
      });
      const landingBaseUrl = page?.domain
        ? `https://${page.domain.hostname}`
        : publicBaseUrl;
      const landingUrl = `${landingBaseUrl}/lp/${campaign.page.slug}?token=${target.trackingToken}`;
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
      // retryLimit=3 задан на уровне очереди (onModuleInit) — re-throw даёт
      // pg-boss повторить задачу с экспоненциальной задержкой; после
      // последней исчерпанной попытки письмо просто не получает EMAIL_SENT
      // (видно в отчёте кампании как "не отправлено"), не создаём отдельный
      // тип события для провала — в модели его сейчас нет, а домысливать
      // новый enum-кейс ради лог-сообщения избыточно.
      this.logger.error(
        `Не удалось отправить письмо цели ${target.id} (попытка ${retryCount + 1}): ${err.message}`,
      );
      throw err;
    }
  }
}
