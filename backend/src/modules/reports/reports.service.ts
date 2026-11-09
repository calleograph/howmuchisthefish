import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Общая статистика по всем кампаниям (для главной панели). */
  async overview() {
    const [totalCampaigns, totalEmployees, totalGroups, eventCounts, firstCampaign, compromisedTargets] =
      await Promise.all([
        this.prisma.campaign.count(),
        this.prisma.employee.count({ where: { isActive: true } }),
        this.prisma.group.count(),
        this.prisma.campaignEvent.groupBy({ by: ['type'], _count: true }),
        // Первая когда-либо созданная кампания — честная нижняя граница для
        // дефолтного диапазона дашборда (см. timeline()): не показываем
        // пустой график из нулей за "текущий месяц", если все данные были
        // раньше. Найдено как UX-проблема у донора: жёсткий недефолт.
        this.prisma.campaign.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
        // "Скомпрометирован" = ввёл хотя бы одно значение формы на странице с
        // включённым захватом — считаем ЦЕЛЬ один раз, не количество событий
        // (сотрудник, подобравший 3 варианта пароля подряд, всё равно один
        // человек, не три инцидента). distinct по targetId через группировку.
        this.prisma.campaignTarget.count({
          where: { events: { some: { credential: { isNot: null } } } },
        }),
      ]);
    const byType: Record<string, number> = {};
    for (const row of eventCounts) byType[row.type] = row._count;

    return {
      totalCampaigns,
      totalEmployees,
      totalGroups,
      firstCampaignAt: firstCampaign?.createdAt ?? null,
      events: {
        sent: byType.EMAIL_SENT ?? 0,
        opened: byType.EMAIL_OPENED ?? 0,
        clicked: byType.LINK_CLICKED ?? 0,
        submitted: byType.FORM_SUBMITTED ?? 0,
        reportedPhishing: byType.REPORTED_PHISHING ?? 0,
        // Честно НЕ "проверенная реальная компрометация" (как и просил
        // пользователь — на этапе отчёта не перепроверяем, реально ли пароль
        // совпадает с рабочим), а факт: сотрудник ввёл значение в форму с
        // включённым захватом. Терминология в UI — "ввели данные формы".
        compromised: compromisedTargets,
      },
    };
  }

  /** Срез по сотрудникам: сколько раз каждый "попался" на form_submitted по всем кампаниям. */
  async byEmployee() {
    const targets = await this.prisma.campaignTarget.findMany({
      where: { employeeId: { not: null } },
      include: {
        employee: true,
        events: { select: { type: true } },
      },
    });

    const byEmployee = new Map<
      string,
      {
        employeeId: string;
        email: string;
        fullName: string;
        campaignsReceived: number;
        opened: number;
        clicked: number;
        submitted: number;
        reportedPhishing: number;
      }
    >();

    for (const target of targets) {
      if (!target.employee) continue;
      const key = target.employee.id;
      const entry = byEmployee.get(key) ?? {
        employeeId: key,
        email: target.employee.email,
        fullName: `${target.employee.firstName} ${target.employee.lastName}`,
        campaignsReceived: 0,
        opened: 0,
        clicked: 0,
        submitted: 0,
        reportedPhishing: 0,
      };
      entry.campaignsReceived++;
      for (const ev of target.events) {
        if (ev.type === 'EMAIL_OPENED') entry.opened++;
        if (ev.type === 'LINK_CLICKED') entry.clicked++;
        if (ev.type === 'FORM_SUBMITTED') entry.submitted++;
        if (ev.type === 'REPORTED_PHISHING') entry.reportedPhishing++;
      }
      byEmployee.set(key, entry);
    }
    return [...byEmployee.values()].sort((a, b) => b.submitted - a.submitted);
  }

  /**
   * Полная история конкретного сотрудника по всем кампаниям — для отчёта
   * руководителю: какие действия совершены/не совершены, точный IP/браузер
   * каждого события, количество УНИКАЛЬНЫХ вариантов введённого пароля
   * (по хешу, значения НЕ возвращаются — для них отдельный reveal-эндпоинт
   * с ADMIN-ролью и audit-логом, см. EventsController.reveal).
   */
  async employeeDetail(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { groups: { include: { group: true } } },
    });
    if (!employee) throw new NotFoundException('Сотрудник не найден');

    const targets = await this.prisma.campaignTarget.findMany({
      where: { employeeId },
      include: {
        campaign: { select: { id: true, name: true, status: true } },
        events: {
          orderBy: { createdAt: 'asc' },
          include: { credential: { select: { id: true, fieldName: true, valueHash: true, createdAt: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const campaigns = targets.map((target) => {
      const byType = new Map<string, (typeof target.events)[number]>();
      for (const ev of target.events) {
        // Первое событие каждого типа — момент, когда действие впервые
        // произошло (достаточно для "что совершил / когда", не нужен весь
        // поток кликов одного типа ради этого отчёта).
        if (!byType.has(ev.type)) byType.set(ev.type, ev);
      }

      const ALL_TYPES = ['EMAIL_SENT', 'EMAIL_OPENED', 'LINK_CLICKED', 'FORM_SUBMITTED', 'REPORTED_PHISHING'];
      const actions = ALL_TYPES.map((type) => {
        const ev = byType.get(type);
        return {
          type,
          occurred: !!ev,
          at: ev?.createdAt ?? null,
          ipAddress: ev?.ipAddress ?? null,
          userAgent: ev?.userAgent ?? null,
          isSuspiciousAutomated: ev?.isSuspiciousAutomated ?? null,
        };
      });

      // Уникальные варианты пароля за ВСЕ submit этой кампании-цели (дедуп
      // по valueHash уже на уровне записи в БД — здесь просто считаем группы).
      const uniqueCredentials = new Map<
        string,
        { fieldName: string; valueHash: string; firstSeenAt: Date; eventId: string }
      >();
      for (const ev of target.events) {
        if (!ev.credential) continue;
        if (!uniqueCredentials.has(ev.credential.valueHash)) {
          uniqueCredentials.set(ev.credential.valueHash, {
            fieldName: ev.credential.fieldName,
            valueHash: ev.credential.valueHash,
            firstSeenAt: ev.credential.createdAt,
            eventId: ev.id,
          });
        }
      }

      return {
        campaignId: target.campaign.id,
        campaignName: target.campaign.name,
        campaignStatus: target.campaign.status,
        actions,
        capturedVariants: [...uniqueCredentials.values()],
      };
    });

    return {
      employeeId: employee.id,
      email: employee.email,
      fullName: `${employee.firstName} ${employee.lastName}`,
      department: employee.department,
      position: employee.position,
      groups: employee.groups.map((g) => g.group.name),
      campaigns,
    };
  }

  /** Срез по группам — усреднённая "уязвимость" (доля попавшихся) по группе. */
  async byGroup() {
    const groups = await this.prisma.group.findMany({
      include: {
        members: {
          include: {
            employee: {
              include: {
                targets: { include: { events: { select: { type: true } } } },
              },
            },
          },
        },
      },
    });

    return groups.map((group) => {
      let totalTargets = 0;
      let submitted = 0;
      for (const member of group.members) {
        for (const target of member.employee.targets) {
          totalTargets++;
          if (target.events.some((e) => e.type === 'FORM_SUBMITTED'))
            submitted++;
        }
      }
      return {
        groupId: group.id,
        groupName: group.name,
        memberCount: group.members.length,
        totalTargets,
        submitted,
        submissionRate:
          totalTargets > 0 ? Math.round((submitted / totalTargets) * 100) : 0,
      };
    });
  }

  /**
   * Временная динамика событий (по дням) — для графика на дашборде. Если
   * days не задан явно, диапазон начинается от первой когда-либо созданной
   * кампании (а не "последние 30 дней") — иначе на свежеустановленной
   * системе с данными, скажем, за прошлый месяц, график показал бы пустые
   * нули вместо реальной картины (найденная у донора UX-проблема: жёсткий
   * диапазон, не подстраивающийся под фактические данные, вводит в
   * заблуждение, что система "не работает").
   */
  async timeline(days?: number) {
    let since: Date;
    if (days) {
      since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    } else {
      const firstCampaign = await this.prisma.campaign.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      since = firstCampaign?.createdAt ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }
    const events = await this.prisma.campaignEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { type: true, createdAt: true },
    });

    const byDay = new Map<
      string,
      {
        date: string;
        sent: number;
        opened: number;
        clicked: number;
        submitted: number;
        reportedPhishing: number;
      }
    >();
    for (const ev of events) {
      const day = ev.createdAt.toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? {
        date: day,
        sent: 0,
        opened: 0,
        clicked: 0,
        submitted: 0,
        reportedPhishing: 0,
      };
      if (ev.type === 'EMAIL_SENT') entry.sent++;
      if (ev.type === 'EMAIL_OPENED') entry.opened++;
      if (ev.type === 'LINK_CLICKED') entry.clicked++;
      if (ev.type === 'FORM_SUBMITTED') entry.submitted++;
      if (ev.type === 'REPORTED_PHISHING') entry.reportedPhishing++;
      byDay.set(day, entry);
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Сравнение кампаний по ключевым метрикам. */
  async compareCampaigns() {
    const campaigns = await this.prisma.campaign.findMany({
      include: {
        _count: { select: { targets: true } },
        events: { select: { type: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return campaigns.map((c) => {
      const counts = { sent: 0, opened: 0, clicked: 0, submitted: 0, reportedPhishing: 0 };
      for (const ev of c.events) {
        if (ev.type === 'EMAIL_SENT') counts.sent++;
        if (ev.type === 'EMAIL_OPENED') counts.opened++;
        if (ev.type === 'LINK_CLICKED') counts.clicked++;
        if (ev.type === 'FORM_SUBMITTED') counts.submitted++;
        if (ev.type === 'REPORTED_PHISHING') counts.reportedPhishing++;
      }
      return {
        campaignId: c.id,
        name: c.name,
        status: c.status,
        totalTargets: c._count.targets,
        ...counts,
        submissionRate:
          c._count.targets > 0
            ? Math.round((counts.submitted / c._count.targets) * 100)
            : 0,
      };
    });
  }

  /** Экспорт событий кампании в CSV (задание §2.6). */
  async exportCampaignEventsCsv(campaignId: string): Promise<string> {
    const events = await this.prisma.campaignEvent.findMany({
      where: { campaignId },
      include: { target: { include: { employee: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const header = 'email,event_type,is_suspicious_automated,created_at\n';
    const rows = events
      .map((e) => {
        const email = e.target.employee?.email ?? '';
        return [
          csvEscape(email),
          e.type,
          e.isSuspiciousAutomated,
          e.createdAt.toISOString(),
        ].join(',');
      })
      .join('\n');
    return header + rows;
  }

  /** Экспорт сводки по сотрудникам кампании (раздельно от сырого журнала
   * событий выше) — один сотрудник = одна строка со статусом по всем типам
   * событий, не построчный лог. */
  async exportCampaignUsersCsv(campaignId: string): Promise<string> {
    const targets = await this.prisma.campaignTarget.findMany({
      where: { campaignId },
      include: { employee: true, events: { select: { type: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const header = 'email,sent,opened,clicked,submitted,reported_phishing\n';
    const rows = targets
      .map((t) => {
        const types = new Set(t.events.map((e) => e.type));
        return [
          csvEscape(t.employee?.email ?? ''),
          types.has('EMAIL_SENT'),
          types.has('EMAIL_OPENED'),
          types.has('LINK_CLICKED'),
          types.has('FORM_SUBMITTED'),
          types.has('REPORTED_PHISHING'),
        ].join(',');
      })
      .join('\n');
    return header + rows;
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
