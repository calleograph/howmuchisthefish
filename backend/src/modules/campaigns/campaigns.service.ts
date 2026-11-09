import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertTransitionAllowed,
  CampaignStatus,
} from './campaign-state-machine';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
  BulkTargetsDto,
} from './dto/campaign.dto';
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
    return {
      ...campaign,
      smtpConfig: { ...smtpConfigSafe, hasPassword: !!passwordEnc },
    };
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

    if (dto.employeeIds?.length || dto.groupIds?.length || dto.segment || dto.random) {
      await this.addTargets(campaign.id, {
        employeeIds: dto.employeeIds,
        groupIds: dto.groupIds,
        segment: dto.segment,
        random: dto.random,
      });
    }
    return this.get(campaign.id);
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const campaign = await this.get(id);
    if (campaign.status !== 'DRAFT') {
      throw new BadRequestException(
        'Изменять можно только кампанию в статусе DRAFT',
      );
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

    if (dto.employeeIds || dto.groupIds || dto.segment || dto.random) {
      await this.prisma.campaignTarget.deleteMany({
        where: { campaignId: id },
      });
      await this.addTargets(id, {
        employeeIds: dto.employeeIds,
        groupIds: dto.groupIds,
        segment: dto.segment,
        random: dto.random,
      });
    }
    return this.get(id);
  }

  async addTargets(campaignId: string, dto: BulkTargetsDto) {
    const campaign = await this.get(campaignId);
    const allowedDomains = campaign.allowedDomainsOverride as string[] | null;

    // Источник таргетинга на каждого сотрудника — для отображения "откуда
    // взят этот получатель" (manual/group/segment/random) в UI кампании.
    const sourceByEmployee = new Map<string, string>();
    const markSource = (ids: string[], kind: string) => {
      for (const id of ids) if (!sourceByEmployee.has(id)) sourceByEmployee.set(id, kind);
    };

    const employeeIds = new Set(dto.employeeIds ?? []);
    markSource(dto.employeeIds ?? [], 'manual');

    if (dto.groupIds?.length) {
      // Рекурсивно включаем сотрудников вложенных групп — таргетинг на
      // родительскую группу должен охватывать весь поддерево (департамент
      // → отдел), а не только прямых участников самой группы.
      const allGroupIds = await this.expandGroupHierarchy(dto.groupIds);
      const groupMembers = await this.prisma.employeeGroup.findMany({
        where: { groupId: { in: allGroupIds } },
        select: { employeeId: true },
      });
      const groupEmployeeIds = groupMembers.map((m) => m.employeeId);
      groupEmployeeIds.forEach((id) => employeeIds.add(id));
      markSource(groupEmployeeIds, 'group');
    }

    if (dto.segment) {
      const segmentIds = await this.resolveSegmentTargets(
        dto.segment.sourceCampaignId,
        dto.segment.condition,
      );
      segmentIds.forEach((id) => employeeIds.add(id));
      markSource(segmentIds, 'segment');
    }

    if (dto.random) {
      const randomIds = await this.resolveRandomTargets(dto.random.count, dto.random.groupId);
      randomIds.forEach((id) => employeeIds.add(id));
      markSource(randomIds, 'random');
    }

    if (employeeIds.size === 0) return { added: 0 };

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: [...employeeIds] }, isActive: true },
    });

    const filtered = allowedDomains?.length
      ? employees.filter((e) =>
          allowedDomains.some((d) =>
            e.email.toLowerCase().endsWith(`@${d.toLowerCase()}`),
          ),
        )
      : employees;

    const skippedByDomain = employees.length - filtered.length;

    await this.prisma.$transaction(
      filtered.map((e) =>
        this.prisma.campaignTarget.upsert({
          where: { campaignId_employeeId: { campaignId, employeeId: e.id } },
          create: {
            campaignId,
            employeeId: e.id,
            sourceKind: sourceByEmployee.get(e.id) ?? 'manual',
            sourceCampaignId: dto.segment?.sourceCampaignId,
          },
          update: {},
        }),
      ),
    );

    return { added: filtered.length, skippedByDomain };
  }

  // Поднимает полный список ID групп включая все вложенные (дочерние)
  // группы для переданных корневых groupIds — BFS по parentGroupId.
  private async expandGroupHierarchy(rootGroupIds: string[]): Promise<string[]> {
    const result = new Set(rootGroupIds);
    let frontier = rootGroupIds;
    while (frontier.length > 0) {
      const children = await this.prisma.group.findMany({
        where: { parentGroupId: { in: frontier } },
        select: { id: true },
      });
      const newIds = children.map((c) => c.id).filter((id) => !result.has(id));
      newIds.forEach((id) => result.add(id));
      frontier = newIds;
    }
    return [...result];
  }

  // Таргетинг по результатам прошлой кампании: сотрудники, у которых есть
  // событие заданного типа в кампании-источнике (NOT_OPENED — наоборот, те,
  // у кого нет события EMAIL_OPENED, то есть кому ушло письмо, но не открыли).
  private async resolveSegmentTargets(
    sourceCampaignId: string,
    condition: string,
  ): Promise<string[]> {
    await this.get(sourceCampaignId); // 404, если кампания-источник не существует

    if (condition === 'NOT_OPENED') {
      const targets = await this.prisma.campaignTarget.findMany({
        where: {
          campaignId: sourceCampaignId,
          employeeId: { not: null },
          events: { none: { type: 'EMAIL_OPENED' } },
        },
        select: { employeeId: true },
      });
      return targets.map((t) => t.employeeId!).filter(Boolean);
    }

    const events = await this.prisma.campaignEvent.findMany({
      where: { campaignId: sourceCampaignId, type: condition as never },
      select: { target: { select: { employeeId: true } } },
    });
    const ids = new Set(events.map((e) => e.target.employeeId).filter(Boolean) as string[]);
    return [...ids];
  }

  private async resolveRandomTargets(count: number, groupId?: string): Promise<string[]> {
    const where = groupId
      ? { isActive: true, groups: { some: { groupId } } }
      : { isActive: true };
    const pool = await this.prisma.employee.findMany({ where, select: { id: true } });
    const ids = pool.map((e) => e.id);
    // Fisher-Yates shuffle в памяти — для пилотного запуска на подвыборке N
    // из общего числа сотрудников компании (тысячи, не миллионы), не на
    // массовых таблицах, где был бы нужен SQL TABLESAMPLE.
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, count);
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
    return this.prisma.campaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    });
  }

  async resume(id: string) {
    const campaign = await this.get(id);
    assertTransitionAllowed(campaign.status as CampaignStatus, 'RUNNING');
    return this.prisma.campaign.update({
      where: { id },
      data: { status: 'RUNNING' },
    });
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
    const [sent, opened, clicked, submitted, reportedPhishing, total, compromised] = await Promise.all([
      this.prisma.campaignEvent.count({
        where: { campaignId: id, type: 'EMAIL_SENT' },
      }),
      this.prisma.campaignEvent.count({
        where: { campaignId: id, type: 'EMAIL_OPENED' },
      }),
      this.prisma.campaignEvent.count({
        where: { campaignId: id, type: 'LINK_CLICKED' },
      }),
      this.prisma.campaignEvent.count({
        where: { campaignId: id, type: 'FORM_SUBMITTED' },
      }),
      // Положительная метрика (в отличие от остальных — чем выше, тем лучше):
      // сотрудник сам распознал и сообщил о подозрительном письме.
      this.prisma.campaignEvent.count({
        where: { campaignId: id, type: 'REPORTED_PHISHING' },
      }),
      this.prisma.campaignTarget.count({ where: { campaignId: id } }),
      // Уникальные цели, реально введшие данные формы (не количество
      // событий/попыток) — см. ReportsService.overview() для той же логики
      // на уровне всех кампаний.
      this.prisma.campaignTarget.count({
        where: { campaignId: id, events: { some: { credential: { isNot: null } } } },
      }),
    ]);
    return { totalTargets: total, sent, opened, clicked, submitted, reportedPhishing, compromised };
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
