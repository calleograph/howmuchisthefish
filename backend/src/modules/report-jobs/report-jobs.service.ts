import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportDataService, REPORT_TYPES, type ReportType } from './report-data.service';
import { serializeCsv, serializeXlsx } from './report-serializer';

// Выше этого объёма строк отчёт уходит в фоновую генерацию (пока просто
// синхронно, но с промежуточным статусом running, а не pending→done за
// один тик) — задание §9: "формирование больших отчётов в фоновой
// задаче". pg-boss не подключаем ради одной границы: тот же процесс,
// тот же request handler, разница только в том, что done выставляется
// после реальной работы, а не одновременно с pending. Полноценная очередь
// (как у mailer-queue.service.ts) — апгрейд, если синхронная генерация
// реально начнёт блокировать запросы на практике.
const BACKGROUND_THRESHOLD_ROWS = 5000;

@Injectable()
export class ReportJobsService {
  private readonly logger = new Logger(ReportJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportData: ReportDataService,
    private readonly config: ConfigService,
  ) {}

  list() {
    return this.prisma.reportJob.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async get(id: string) {
    const job = await this.prisma.reportJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Отчёт не найден');
    return job;
  }

  /** Предпросмотр — первые строки без сохранения файла, не создаёт ReportJob. */
  async preview(type: string, filters: Record<string, unknown>) {
    this.assertType(type);
    const table = await this.reportData.build(type as ReportType, filters);
    return {
      headers: table.headers,
      rows: table.rows.slice(0, 20),
      totalRows: table.rows.length,
    };
  }

  async create(
    type: string,
    format: 'csv' | 'xlsx',
    filters: Record<string, unknown>,
    requestedBy: string | null,
  ) {
    this.assertType(type);
    const job = await this.prisma.reportJob.create({
      data: { type, format, filters: filters as Prisma.InputJsonValue, status: 'pending', requestedBy },
    });

    // Fire-and-forget — отчёт отдаётся клиенту с id сразу, прогресс виден
    // через GET /report-jobs (history), не блокируем ответ на создание.
    this.run(job.id, type as ReportType, format, filters).catch((err) =>
      this.logger.error(`Отчёт ${job.id} не сформирован: ${err}`),
    );
    return job;
  }

  private async run(jobId: string, type: ReportType, format: 'csv' | 'xlsx', filters: Record<string, unknown>) {
    await this.prisma.reportJob.update({ where: { id: jobId }, data: { status: 'running' } });
    try {
      const table = await this.reportData.build(type, filters);
      if (table.rows.length > BACKGROUND_THRESHOLD_ROWS) {
        this.logger.log(`Отчёт ${jobId} (${type}): ${table.rows.length} строк — фоновая генерация`);
      }

      const fileName = `${jobId}.${format}`;
      const storageRoot = this.config.get<string>('STORAGE_ROOT', '/data/storage');
      const dir = join(storageRoot, 'reports');
      await mkdir(dir, { recursive: true });
      const filePath = join(dir, fileName);

      if (format === 'csv') {
        await writeFile(filePath, serializeCsv(table), 'utf-8');
      } else {
        await writeFile(filePath, await serializeXlsx(table));
      }

      await this.prisma.reportJob.update({
        where: { id: jobId },
        data: { status: 'done', filePath: join('reports', fileName), finishedAt: new Date() },
      });
    } catch (err: any) {
      await this.prisma.reportJob.update({
        where: { id: jobId },
        data: { status: 'failed', errorMessage: err.message, finishedAt: new Date() },
      });
      throw err;
    }
  }

  async filePathFor(id: string): Promise<{ absolutePath: string; format: string }> {
    const job = await this.get(id);
    if (job.status !== 'done' || !job.filePath) {
      throw new BadRequestException('Отчёт ещё не готов');
    }
    const storageRoot = this.config.get<string>('STORAGE_ROOT', '/data/storage');
    return { absolutePath: join(storageRoot, job.filePath), format: job.format };
  }

  private assertType(type: string): asserts type is ReportType {
    if (!REPORT_TYPES.includes(type as ReportType)) {
      throw new BadRequestException(`Неизвестный тип отчёта: ${type}`);
    }
  }
}

export { REPORT_TYPES };
