import { Injectable, Logger } from '@nestjs/common';
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
}
