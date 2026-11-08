import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../../prisma/prisma.service';

export interface CsvImportRowError {
  row: number;
  email?: string;
  reason: string;
}

export interface CsvImportResult {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: CsvImportRowError[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED_COLUMNS = ['email', 'firstName', 'lastName'];
const MAX_ROWS = 20_000; // shortcut: защита от случайной загрузки гигантского файла, поднять при реальной потребности

@Injectable()
export class CsvImportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Импортирует сотрудников из CSV. Ожидаемые колонки: email, firstName, lastName,
   * department (опционально), position (опционально). Разделитель — запятая, первая
   * строка — заголовки. Невалидные строки не прерывают импорт целиком — собираются
   * в errors и возвращаются администратору.
   */
  async importFromBuffer(buffer: Buffer, actorUserId: string | null): Promise<CsvImportResult> {
    const result: CsvImportResult = { totalRows: 0, created: 0, updated: 0, skipped: 0, errors: [] };

    let records: Record<string, string>[];
    try {
      records = parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
    } catch (e: any) {
      result.errors.push({ row: 0, reason: `Не удалось разобрать CSV: ${e.message}` });
      return result;
    }

    if (records.length === 0) {
      result.errors.push({ row: 0, reason: 'Файл пуст или не содержит строк данных' });
      return result;
    }
    if (records.length > MAX_ROWS) {
      result.errors.push({
        row: 0,
        reason: `Файл содержит более ${MAX_ROWS} строк — импортируйте частями`,
      });
      return result;
    }

    const headers = Object.keys(records[0]);
    const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
    if (missingColumns.length > 0) {
      result.errors.push({
        row: 0,
        reason: `Отсутствуют обязательные колонки: ${missingColumns.join(', ')}`,
      });
      return result;
    }

    result.totalRows = records.length;
    const seenEmails = new Set<string>();

    for (let i = 0; i < records.length; i++) {
      const rowNum = i + 2; // +1 заголовок, +1 для человекочитаемой нумерации с 1
      const row = records[i];
      const email = row.email?.trim().toLowerCase();

      if (!email || !EMAIL_RE.test(email)) {
        result.errors.push({ row: rowNum, email, reason: 'Некорректный или пустой email' });
        result.skipped++;
        continue;
      }
      if (seenEmails.has(email)) {
        result.errors.push({ row: rowNum, email, reason: 'Дублирующийся email в самом файле' });
        result.skipped++;
        continue;
      }
      if (!row.firstName?.trim() || !row.lastName?.trim()) {
        result.errors.push({ row: rowNum, email, reason: 'Пустое имя или фамилия' });
        result.skipped++;
        continue;
      }
      seenEmails.add(email);

      const data = {
        email,
        firstName: row.firstName.trim(),
        lastName: row.lastName.trim(),
        department: row.department?.trim() || null,
        position: row.position?.trim() || null,
      };

      const existing = await this.prisma.employee.findUnique({ where: { email } });
      if (existing) {
        await this.prisma.employee.update({ where: { email }, data });
        await this.prisma.employeeHistory.create({
          data: {
            employeeId: existing.id,
            changedBy: actorUserId,
            changeType: 'imported',
            diff: data,
          },
        });
        result.updated++;
      } else {
        const created = await this.prisma.employee.create({ data });
        await this.prisma.employeeHistory.create({
          data: {
            employeeId: created.id,
            changedBy: actorUserId,
            changeType: 'imported',
            diff: data,
          },
        });
        result.created++;
      }
    }

    return result;
  }
}
