import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const REPORT_TYPES = [
  'overview',
  'campaigns',
  'employees',
  'groups',
  'templates',
  'pages',
  'domains',
  'smtp',
  'analytics',
  'audit-log',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface ReportTable {
  headers: string[];
  rows: (string | number | boolean)[][];
}

/**
 * Единый механизм отчётности (задание §9) — один табличный builder на каждый
 * из 10 разделов продукта, а не отдельная CSV-реализация в каждом модуле
 * (как было раньше для campaigns — см. reports.service.ts exportCampaign*Csv,
 * которые эта реализация НЕ заменяет, они остаются как узкоспециализированный
 * путь для конкретной кампании). ReportTable — общий промежуточный формат,
 * сериализуется в CSV/XLSX отдельно (report-serializer.ts), не здесь — чтобы
 * добавление нового формата не требовало трогать каждый builder.
 */
@Injectable()
export class ReportDataService {
  constructor(private readonly prisma: PrismaService) {}

  async build(type: ReportType, filters: Record<string, unknown>): Promise<ReportTable> {
    switch (type) {
      case 'overview':
        return this.buildOverview();
      case 'campaigns':
        return this.buildCampaigns();
      case 'employees':
        return this.buildEmployees();
      case 'groups':
        return this.buildGroups();
      case 'templates':
        return this.buildTemplates();
      case 'pages':
        return this.buildPages();
      case 'domains':
        return this.buildDomains();
      case 'smtp':
        return this.buildSmtp();
      case 'analytics':
        return this.buildAnalytics();
      case 'audit-log':
        return this.buildAuditLog(filters);
      default:
        throw new BadRequestException(`Неизвестный тип отчёта: ${type}`);
    }
  }

  private async buildOverview(): Promise<ReportTable> {
    const [campaigns, employees, groups, events] = await Promise.all([
      this.prisma.campaign.count(),
      this.prisma.employee.count(),
      this.prisma.group.count(),
      this.prisma.campaignEvent.groupBy({ by: ['type'], _count: true }),
    ]);
    const eventCounts = Object.fromEntries(events.map((e) => [e.type, e._count]));
    return {
      headers: ['metric', 'value'],
      rows: [
        ['campaigns', campaigns],
        ['employees', employees],
        ['groups', groups],
        ['events_sent', eventCounts.EMAIL_SENT ?? 0],
        ['events_opened', eventCounts.EMAIL_OPENED ?? 0],
        ['events_clicked', eventCounts.LINK_CLICKED ?? 0],
        ['events_submitted', eventCounts.FORM_SUBMITTED ?? 0],
        ['events_reported_phishing', eventCounts.REPORTED_PHISHING ?? 0],
      ],
    };
  }

  private async buildCampaigns(): Promise<ReportTable> {
    const campaigns = await this.prisma.campaign.findMany({
      include: { _count: { select: { targets: true, events: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      headers: ['name', 'status', 'targets', 'events', 'created_at'],
      rows: campaigns.map((c) => [
        c.name,
        c.status,
        c._count.targets,
        c._count.events,
        c.createdAt.toISOString(),
      ]),
    };
  }

  private async buildEmployees(): Promise<ReportTable> {
    const employees = await this.prisma.employee.findMany({ orderBy: { lastName: 'asc' } });
    return {
      headers: ['email', 'first_name', 'last_name', 'department', 'position', 'is_active'],
      rows: employees.map((e) => [
        e.email,
        e.firstName,
        e.lastName,
        e.department ?? '',
        e.position ?? '',
        e.isActive,
      ]),
    };
  }

  private async buildGroups(): Promise<ReportTable> {
    const groups = await this.prisma.group.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: { name: 'asc' },
    });
    return {
      headers: ['name', 'description', 'members', 'created_at'],
      rows: groups.map((g) => [g.name, g.description ?? '', g._count.members, g.createdAt.toISOString()]),
    };
  }

  private async buildTemplates(): Promise<ReportTable> {
    const templates = await this.prisma.mailTemplate.findMany({ orderBy: { name: 'asc' } });
    return {
      headers: ['name', 'subject', 'is_archived', 'created_at'],
      rows: templates.map((t) => [t.name, t.subject, t.isArchived, t.createdAt.toISOString()]),
    };
  }

  private async buildPages(): Promise<ReportTable> {
    const pages = await this.prisma.landingPage.findMany({
      include: { domain: true },
      orderBy: { name: 'asc' },
    });
    return {
      headers: ['name', 'slug', 'domain', 'form_enabled', 'captures_credentials', 'is_archived'],
      rows: pages.map((p) => [
        p.name,
        p.slug,
        p.domain?.hostname ?? '',
        p.formEnabled,
        p.capturesCredentials,
        p.isArchived,
      ]),
    };
  }

  private async buildDomains(): Promise<ReportTable> {
    const domains = await this.prisma.domain.findMany({
      include: { _count: { select: { pages: true } } },
      orderBy: { hostname: 'asc' },
    });
    return {
      headers: ['hostname', 'verification_status', 'pages', 'last_checked_at'],
      rows: domains.map((d) => [
        d.hostname,
        d.verificationStatus,
        d._count.pages,
        d.lastCheckedAt?.toISOString() ?? '',
      ]),
    };
  }

  private async buildSmtp(): Promise<ReportTable> {
    const configs = await this.prisma.smtpConfig.findMany({ orderBy: { name: 'asc' } });
    return {
      headers: ['name', 'host', 'port', 'from_address', 'is_default', 'last_test_ok'],
      rows: configs.map((c) => [c.name, c.host, c.port, c.fromAddress, c.isDefault, c.lastTestOk ?? '']),
    };
  }

  private async buildAnalytics(): Promise<ReportTable> {
    // Срез "по сотрудникам" — тот же набор данных, что ReportsPage.tsx
    // byEmployee(), но как самостоятельный отчёт со своей историей.
    const targets = await this.prisma.campaignTarget.findMany({
      where: { employeeId: { not: null } },
      include: { employee: true, events: { select: { type: true } } },
    });
    const byEmployee = new Map<string, { email: string; name: string; opened: number; clicked: number; submitted: number; reported: number }>();
    for (const t of targets) {
      if (!t.employee) continue;
      const entry = byEmployee.get(t.employee.id) ?? {
        email: t.employee.email,
        name: `${t.employee.firstName} ${t.employee.lastName}`,
        opened: 0,
        clicked: 0,
        submitted: 0,
        reported: 0,
      };
      for (const ev of t.events) {
        if (ev.type === 'EMAIL_OPENED') entry.opened++;
        if (ev.type === 'LINK_CLICKED') entry.clicked++;
        if (ev.type === 'FORM_SUBMITTED') entry.submitted++;
        if (ev.type === 'REPORTED_PHISHING') entry.reported++;
      }
      byEmployee.set(t.employee.id, entry);
    }
    return {
      headers: ['email', 'name', 'opened', 'clicked', 'submitted', 'reported_phishing'],
      rows: [...byEmployee.values()].map((e) => [e.email, e.name, e.opened, e.clicked, e.submitted, e.reported]),
    };
  }

  private async buildAuditLog(filters: Record<string, unknown>): Promise<ReportTable> {
    const since = typeof filters.since === 'string' ? new Date(filters.since) : undefined;
    const logs = await this.prisma.auditLog.findMany({
      where: since ? { createdAt: { gte: since } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 10000, // shortcut: лимит вместо пагинации — upgrade, если реальные логи окажутся больше
    });
    return {
      headers: ['action', 'entity_type', 'entity_id', 'user_id', 'ip_address', 'created_at'],
      rows: logs.map((l) => [
        l.action,
        l.entityType,
        l.entityId ?? '',
        l.userId ?? '',
        l.ipAddress ?? '',
        l.createdAt.toISOString(),
      ]),
    };
  }
}
