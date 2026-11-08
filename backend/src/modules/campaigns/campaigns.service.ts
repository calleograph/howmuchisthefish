import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertTransitionAllowed, CampaignStatus } from './campaign-state-machine';
import { CreateCampaignDto, UpdateCampaignDto, BulkTargetsDto } from './dto/campaign.dto';
import { MailerQueueService } from '../mailer/mailer-queue.service';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailerQueue: MailerQueueService,
  ) {}

  list() {
    return this.prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { targets: true, events: true } } },
    });
  }

  async get(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { template: true, page: true, smtpConfig: true, targets: true },
    });
    if (!campaign) throw new NotFoundException('Кампания не найдена');
    // smtpConfig.passwordEnc — зашифрованный пароль SMTP, но шифротекст всё равно не
    // должен уходить клиенту через API кампании (единственная авторизованная точка
    // получения статуса пароля — SmtpConfigService, который возвращает hasPassword).
    const { passwordEnc, ...smtpConfigSafe } = campaign.smtpConfig;
    return { ...campaign, smtpConfig: { ...smtpConfigSafe, hasPassword: !!passwordEnc } };
  }

  async create(dto: CreateCampaignDto) {
    // Явные проверки существования связанных сущностей — лучше понятная ошибка 404/400
    // здесь, чем непрозрачная ошибка внешнего ключа из Postgres.
    await this.assertTemplateExists(dto.templateId);
    await this.assertPageExists(dto.pageId);
    await this.assertSmtpExists(dto.smtpConfigId);

    const campaign = await this.prisma.campaign.create({
      data: {
        name: dto.name,
        templateId: dto.templateId,
        pageId: dto.pageId,
        smtpConfigId: dto.smtpConfigId,
        sendRateLimit: dto.sendRateLimit ?? 10,
        allowedDomainsOverride: dto.allowedDomains ?? undefined,
      },
    });

    if (dto.employeeIds?.length || dto.groupIds?.length) {
      await this.addTargets(campaign.id, { employeeIds: dto.employeeIds, groupIds: dto.groupIds });
    }
    return this.get(campaign.id);
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const campaign = await this.get(id);
    if (campaign.status !== 'DRAFT') {
      throw new BadRequestException('Изменять можно только кампанию в статусе DRAFT');
    }
    if (dto.templateId) await this.assertTemplateExists(dto.templateId);
    if (dto.pageId) await this.assertPageExists(dto.pageId);
    if (dto.smtpConfigId) await this.assertSmtpExists(dto.smtpConfigId);

    await this.prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        templateId: dto.templateId,
        pageId: dto.pageId,
        smtpConfigId: dto.smtpConfigId,
        sendRateLimit: dto.sendRateLimit,
      },
    });

    if (dto.employeeIds || dto.groupIds) {
      await this.prisma.campaignTarget.deleteMany({ where: { campaignId: id } });
      await this.addTargets(id, { employeeIds: dto.employeeIds, groupIds: dto.groupIds });
    }
    return this.get(id);
  }

  async addTargets(campaignId: string, dto: BulkTargetsDto) {
    const campaign = await this.get(campaignId);
    const allowedDomains = campaign.allowedDomainsOverride as string[] | null;

    const employeeIds = new Set(dto.employeeIds ?? []);
    if (dto.groupIds?.length) {
      const groupMembers = await this.prisma.employeeGroup.findMany({
        where: { groupId: { in: dto.groupIds } },
        select: { employeeId: true },
      });
      groupMembers.forEach((m) => employeeIds.add(m.employeeId));
    }
    if (employeeIds.size === 0) return { added: 0 };

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: [...employeeIds] }, isActive: true },
    });

    const filtered = allowedDomains?.length
      ? employees.filter((e) => allowedDomains.some((d) => e.email.toLowerCase().endsWith(`@${d.toLowerCase()}`)))
      : employees;

    const skippedByDomain = employees.length - filtered.length;

    await this.prisma.$transaction(
      filtered.map((e) =>
        this.prisma.campaignTarget.upsert({
          where: { campaignId_employeeId: { campaignId, employeeId: e.id } },
          create: { campaignId, employeeId: e.id },
          update: {},
        }),
      ),
    );

    return { added: filtered.length, skippedByDomain };
  }

  async schedule(id: string, scheduledAt: Date) {
    const campaign = await this.get(id);
    assertTransitionAllowed(campaign.status as CampaignStatus, 'SCHEDULED');
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('Дата запуска должна быть в будущем');
    }
    return this.prisma.campaign.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledAt },
    });
  }

  async start(id: string) {
    const campaign = await this.get(id);
    assertTransitionAllowed(campaign.status as CampaignStatus, 'RUNNING');
    if (campaign.targets.length === 0) {
      throw new BadRequestException('У кампании нет получателей');
    }
    // Сначала ставим письма в очередь — если это не удалось (например очередь pg-boss
    // недоступна), статус кампании не должен измениться на RUNNING, иначе кампания
    // застревает в RUNNING без единого реально отправленного письма.
    const { enqueued } = await this.mailerQueue.enqueueCampaign(id);
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    return { ...updated, enqueuedEmails: enqueued };
  }

  async pause(id: string) {
    const campaign = await this.get(id);
    assertTransitionAllowed(campaign.status as CampaignStatus, 'PAUSED');
    return this.prisma.campaign.update({ where: { id }, data: { status: 'PAUSED' } });
  }

  async resume(id: string) {
    const campaign = await this.get(id);
    assertTransitionAllowed(campaign.status as CampaignStatus, 'RUNNING');
    return this.prisma.campaign.update({ where: { id }, data: { status: 'RUNNING' } });
  }

  async finish(id: string) {
    const campaign = await this.get(id);
    assertTransitionAllowed(campaign.status as CampaignStatus, 'FINISHED');
    return this.prisma.campaign.update({
      where: { id },
      data: { status: 'FINISHED', finishedAt: new Date() },
    });
  }

  async stats(id: string) {
    await this.get(id);
    const [sent, opened, clicked, submitted, total] = await Promise.all([
      this.prisma.campaignEvent.count({ where: { campaignId: id, type: 'EMAIL_SENT' } }),
      this.prisma.campaignEvent.count({ where: { campaignId: id, type: 'EMAIL_OPENED' } }),
      this.prisma.campaignEvent.count({ where: { campaignId: id, type: 'LINK_CLICKED' } }),
      this.prisma.campaignEvent.count({ where: { campaignId: id, type: 'FORM_SUBMITTED' } }),
      this.prisma.campaignTarget.count({ where: { campaignId: id } }),
    ]);
    return { totalTargets: total, sent, opened, clicked, submitted };
  }

  private async assertTemplateExists(id: string) {
    const t = await this.prisma.mailTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Почтовый шаблон не найден');
  }
  private async assertPageExists(id: string) {
    const p = await this.prisma.landingPage.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Учебная страница не найдена');
  }
  private async assertSmtpExists(id: string) {
    const s = await this.prisma.smtpConfig.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('SMTP-подключение не найдено');
  }
}
