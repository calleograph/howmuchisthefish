import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Общая статистика по всем кампаниям (для главной панели). */
  async overview() {
    const [totalCampaigns, totalEmployees, totalGroups, eventCounts] = await Promise.all([
      this.prisma.campaign.count(),
      this.prisma.employee.count({ where: { isActive: true } }),
      this.prisma.group.count(),
      this.prisma.campaignEvent.groupBy({ by: ['type'], _count: true }),
    ]);
    const byType: Record<string, number> = {};
    for (const row of eventCounts) byType[row.type] = row._count;

    return {
      totalCampaigns,
      totalEmployees,
      totalGroups,
      events: {
        sent: byType.EMAIL_SENT ?? 0,
        opened: byType.EMAIL_OPENED ?? 0,
        clicked: byType.LINK_CLICKED ?? 0,
        submitted: byType.FORM_SUBMITTED ?? 0,
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
      { employeeId: string; email: string; fullName: string; campaignsReceived: number; opened: number; clicked: number; submitted: number }
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
      };
      entry.campaignsReceived++;
      for (const ev of target.events) {
        if (ev.type === 'EMAIL_OPENED') entry.opened++;
        if (ev.type === 'LINK_CLICKED') entry.clicked++;
        if (ev.type === 'FORM_SUBMITTED') entry.submitted++;
      }
      byEmployee.set(key, entry);
    }
    return [...byEmployee.values()].sort((a, b) => b.submitted - a.submitted);
  }

  /** Срез по группам — усреднённая "уязвимость" (доля попавшихся) по группе. */
  async byGroup() {
    const groups = await this.prisma.group.findMany({
      include: {
        members: {
          include: {
            employee: {
              include: { targets: { include: { events: { select: { type: true } } } } },
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
          if (target.events.some((e) => e.type === 'FORM_SUBMITTED')) submitted++;
        }
      }
      return {
        groupId: group.id,
        groupName: group.name,
        memberCount: group.members.length,
        totalTargets,
        submitted,
        submissionRate: totalTargets > 0 ? Math.round((submitted / totalTargets) * 100) : 0,
      };
    });
  }

  /** Временная динамика событий (по дням) — для графика на дашборде. */
  async timeline(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const events = await this.prisma.campaignEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { type: true, createdAt: true },
    });

    const byDay = new Map<string, { date: string; sent: number; opened: number; clicked: number; submitted: number }>();
    for (const ev of events) {
      const day = ev.createdAt.toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { date: day, sent: 0, opened: 0, clicked: 0, submitted: 0 };
      if (ev.type === 'EMAIL_SENT') entry.sent++;
      if (ev.type === 'EMAIL_OPENED') entry.opened++;
      if (ev.type === 'LINK_CLICKED') entry.clicked++;
      if (ev.type === 'FORM_SUBMITTED') entry.submitted++;
      byDay.set(day, entry);
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Сравнение кампаний по ключевым метрикам. */
  async compareCampaigns() {
    const campaigns = await this.prisma.campaign.findMany({
      include: { _count: { select: { targets: true } }, events: { select: { type: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return campaigns.map((c) => {
      const counts = { sent: 0, opened: 0, clicked: 0, submitted: 0 };
      for (const ev of c.events) {
        if (ev.type === 'EMAIL_SENT') counts.sent++;
        if (ev.type === 'EMAIL_OPENED') counts.opened++;
        if (ev.type === 'LINK_CLICKED') counts.clicked++;
        if (ev.type === 'FORM_SUBMITTED') counts.submitted++;
      }
      return {
        campaignId: c.id,
        name: c.name,
        status: c.status,
        totalTargets: c._count.targets,
        ...counts,
        submissionRate: c._count.targets > 0 ? Math.round((counts.submitted / c._count.targets) * 100) : 0,
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
        return [csvEscape(email), e.type, e.isSuspiciousAutomated, e.createdAt.toISOString()].join(',');
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
