import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

/**
 * Превью-скриншот учебной страницы для списка лендингов — опциональная
 * функция: screenshot-service (отдельный образ с Chromium) может быть не
 * запущен (нет профиля "screenshots" в docker compose). В этом случае
 * генерация тихо пропускается — отсутствие превью не должно мешать
 * сохранению самой страницы, это второстепенное удобство, не критичная
 * функциональность.
 */
@Injectable()
export class ScreenshotService {
  private readonly logger = new Logger(ScreenshotService.name);

  constructor(private readonly config: ConfigService) {}

  async generate(html: string): Promise<string | null> {
    const serviceUrl = this.config.get<string>('SCREENSHOT_SERVICE_URL');
    if (!serviceUrl) return null;

    try {
      const response = await fetch(`${serviceUrl}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        this.logger.warn(`screenshot-service вернул ${response.status} — превью не создано`);
        return null;
      }
      const buffer = Buffer.from(await response.arrayBuffer());

      const storageRoot = this.config.get<string>('STORAGE_ROOT', '/data/storage');
      const dir = join(storageRoot, 'landing-screenshots');
      await mkdir(dir, { recursive: true });
      const fileName = `${randomUUID()}.png`;
      await writeFile(join(dir, fileName), buffer);
      return `landing-screenshots/${fileName}`;
    } catch (err) {
      // Недоступность сервиса (не запущен, нет профиля screenshots) — ожидаемый,
      // не экстренный случай, не на уровне error.
      this.logger.warn(`Превью-скриншот не создан (screenshot-service недоступен): ${err}`);
      return null;
    }
  }

  /**
   * Граббер страниц: получает HTML по URL через headless-рендер (JS-рендеринг
   * SPA/CSP-страниц, не просто curl — см. docs/CONFIGURATION.md "Граббер
   * страниц"). В отличие от generate() выше, НЕ глотает ошибку молча — это
   * основное действие пользователя (создание лендинга из URL), не
   * второстепенное удобство; отсутствие сервиса или сбой рендера должны
   * быть видны администратору как явная ошибка, не тихий no-op.
   */
  async clone(url: string): Promise<string> {
    const serviceUrl = this.config.get<string>('SCREENSHOT_SERVICE_URL');
    if (!serviceUrl) {
      throw new ServiceUnavailableException(
        'Граббер страниц требует запущенный screenshot-service — docker compose --profile screenshots up -d, см. CONFIGURATION.md',
      );
    }
    let response: Response;
    try {
      response = await fetch(`${serviceUrl}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(25000),
      });
    } catch (err) {
      throw new ServiceUnavailableException(`screenshot-service недоступен: ${err}`);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new BadRequestException(`Не удалось загрузить страницу: ${body || response.status}`);
    }
    const data = (await response.json()) as { html?: string };
    if (!data.html) {
      throw new BadRequestException('Сервис клонирования вернул пустой результат');
    }
    return data.html;
  }
}
