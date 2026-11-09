import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PurgeTarget } from './dto/purge-old-records.dto';

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  // Ручная, по требованию, очистка старых записей журнала — лёгкое
  // промежуточное решение retention-проблемы (полноценная конфигурируемая
  // политика per-entity зарезервирована в config-registry.ts, но не
  // реализована; это закрывает немедленную ручную боль администратора,
  // которому раньше советовали лезть в SQL напрямую — см. ADMIN_GUIDE.md).
  private cutoffDate(olderThanDays: number): Date {
    return new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  }

  async countOldRecords(target: PurgeTarget, olderThanDays: number): Promise<number> {
    const cutoff = this.cutoffDate(olderThanDays);
    if (target === 'audit_logs') {
      return this.prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } });
    }
    return this.prisma.campaignEvent.count({ where: { createdAt: { lt: cutoff } } });
  }

  async purgeOldRecords(target: PurgeTarget, olderThanDays: number): Promise<{ deleted: number }> {
    const cutoff = this.cutoffDate(olderThanDays);
    if (target === 'audit_logs') {
      const result = await this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      return { deleted: result.count };
    }
    const result = await this.prisma.campaignEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return { deleted: result.count };
  }
}
