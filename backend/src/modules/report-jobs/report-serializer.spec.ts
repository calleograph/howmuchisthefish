import { serializeCsv, serializeXlsx } from './report-serializer';
import * as ExcelJS from 'exceljs';

describe('report-serializer', () => {
  describe('serializeCsv()', () => {
    it('формирует заголовок и строки через запятую', () => {
      const csv = serializeCsv({
        headers: ['email', 'name'],
        rows: [
          ['a@example.com', 'Alice'],
          ['b@example.com', 'Bob'],
        ],
      });
      expect(csv).toBe('email,name\na@example.com,Alice\nb@example.com,Bob');
    });

    it('экранирует значения с запятыми/кавычками/переносами строк', () => {
      const csv = serializeCsv({
        headers: ['value'],
        rows: [['IT, Support'], ['He said "hi"'], ['line1\nline2']],
      });
      expect(csv).toContain('"IT, Support"');
      expect(csv).toContain('"He said ""hi"""');
      expect(csv).toContain('"line1\nline2"');
    });

    it('приводит числа и булевы значения к строке без экранирования', () => {
      const csv = serializeCsv({ headers: ['count', 'active'], rows: [[42, true]] });
      expect(csv).toBe('count,active\n42,true');
    });
  });

  describe('serializeXlsx()', () => {
    it('формирует читаемую книгу с заголовком и данными', async () => {
      const buffer = await serializeXlsx({
        headers: ['email', 'count'],
        rows: [['a@example.com', 5]],
      });

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const sheet = workbook.getWorksheet('Отчёт');
      expect(sheet).toBeDefined();
      expect(sheet!.getRow(1).getCell(1).value).toBe('email');
      expect(sheet!.getRow(1).getCell(1).font?.bold).toBe(true);
      expect(sheet!.getRow(2).getCell(1).value).toBe('a@example.com');
      expect(sheet!.getRow(2).getCell(2).value).toBe(5);
    });
  });
});
