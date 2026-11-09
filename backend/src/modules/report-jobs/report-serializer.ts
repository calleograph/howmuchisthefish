import * as ExcelJS from 'exceljs';
import type { ReportTable } from './report-data.service';

export function serializeCsv(table: ReportTable): string {
  const header = table.headers.join(',') + '\n';
  const rows = table.rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  return header + rows;
}

function csvEscape(value: string | number | boolean): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function serializeXlsx(table: ReportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Отчёт');
  sheet.addRow(table.headers);
  sheet.getRow(1).font = { bold: true };
  for (const row of table.rows) sheet.addRow(row);
  // Автоширина по самому длинному значению в колонке — без этого XLSX
  // открывается со сжатыми до "###" колонками, читать нечитаемо.
  sheet.columns.forEach((column) => {
    let maxLength = 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      maxLength = Math.max(maxLength, String(cell.value ?? '').length + 2);
    });
    column.width = Math.min(maxLength, 60);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
