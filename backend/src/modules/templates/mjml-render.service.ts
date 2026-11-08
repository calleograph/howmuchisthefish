import { BadRequestException, Injectable } from '@nestjs/common';
// пакет `mjml` (v5) экспортирует асинхронную функцию через module.exports (export =),
// без esModuleInterop в tsconfig — require, а не default import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mjml2html = require('mjml') as (
  input: string,
  options?: { validationLevel?: 'strict' | 'soft' | 'skip'; minify?: boolean },
) => Promise<{ html: string; errors: Array<{ formattedMessage?: string; message: string }> }>;

export interface RenderResult {
  html: string;
  errors: string[];
}

const VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Компилирует MJML в HTML и подставляет переменные персонализации вида {{firstName}}.
 * Подстановка — простая текстовая замена до компиляции MJML (переменные не исполняемый
 * код, только plain text, поэтому XSS через переменные не угрожает: значение всегда
 * экранируется как текст, никогда как HTML-разметка — см. escapeHtml ниже).
 */
@Injectable()
export class MjmlRenderService {
  async compile(mjmlSource: string): Promise<RenderResult> {
    const result = await mjml2html(mjmlSource, { validationLevel: 'soft' });
    const errors = result.errors.map((e) => e.formattedMessage ?? e.message);
    return { html: result.html, errors };
  }

  /** Возвращает список переменных, фактически использованных в источнике ({{...}}). */
  extractVariables(mjmlSource: string): string[] {
    const found = new Set<string>();
    for (const match of mjmlSource.matchAll(VARIABLE_RE)) {
      found.add(match[1]);
    }
    return [...found];
  }

  async renderWithData(mjmlSource: string, data: Record<string, string>): Promise<RenderResult> {
    const substituted = mjmlSource.replace(VARIABLE_RE, (_, key) => {
      const value = data[key];
      return value !== undefined ? escapeHtml(value) : `{{${key}}}`;
    });
    return this.compile(substituted);
  }

  async compileOrThrow(mjmlSource: string): Promise<string> {
    const { html, errors } = await this.compile(mjmlSource);
    if (errors.length > 0) {
      throw new BadRequestException(`Ошибки компиляции MJML: ${errors.join('; ')}`);
    }
    return html;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
