import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, rename, rm, writeFile } from 'fs/promises';
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
   *
   * Ресурсы (CSS/JS/картинки/шрифты) screenshot-service перехватывает и
   * возвращает вместе с HTML — clonePreview() в pages.service.ts сохраняет
   * их на диск ДО того, как страница сохранена как LandingPage: клон
   * остаётся самостоятельной копией, не зависит от доступности исходного
   * сайта после сохранения (раньше здесь была только <base href> на
   * исходный домен — известное ограничение, зафиксированное в
   * docs/SECURITY.md, теперь устранено для перехваченных ресурсов; ресурсы,
   * которые браузер не перехватил за время рендера — например ленивая
   * подгрузка по скроллу — всё ещё не копируются, это по-прежнему
   * ограничение headless-снимка, не проксирования).
   */
  async clone(url: string): Promise<{ html: string; cloneId: string; assetCount: number }> {
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
    const data = (await response.json()) as { html?: string; assets?: ClonedAsset[] };
    if (!data.html) {
      throw new BadRequestException('Сервис клонирования вернул пустой результат');
    }
    const assets = data.assets ?? [];
    // Ассеты сохраняются во ВРЕМЕННУЮ папку (cloneId, не pageId) — на
    // этапе предпросмотра LandingPage ещё не существует (администратор
    // может отредактировать HTML и не сохранить вовсе). При реальном
    // create() pages.service.ts вызывает commitClonedAssets(), которая
    // переносит файлы под постоянный pageId. Если страница так и не
    // сохранена — папка остаётся orphan до следующей ручной очистки
    // (shortcut: нет TTL-уборки временных клонов; апгрейд — cron в
    // maintenance-модуле, когда станет заметной проблемой на реальном
    // использовании, не раньше).
    const cloneId = randomUUID();
    if (assets.length > 0) {
      const storageRoot = this.config.get<string>('STORAGE_ROOT', '/data/storage');
      const dir = join(storageRoot, 'landing-assets', `tmp-${cloneId}`);
      await mkdir(dir, { recursive: true });
      await Promise.all(
        assets.map((asset) =>
          writeFile(join(dir, asset.filename), Buffer.from(asset.dataBase64, 'base64')),
        ),
      );
    }
    return { html: data.html, cloneId, assetCount: assets.length };
  }

  /** Переносит временную папку ассетов клона под постоянный id сохранённой страницы. */
  async commitClonedAssets(cloneId: string, pageId: string): Promise<void> {
    const storageRoot = this.config.get<string>('STORAGE_ROOT', '/data/storage');
    const tmpDir = join(storageRoot, 'landing-assets', `tmp-${cloneId}`);
    const finalDir = join(storageRoot, 'landing-assets', pageId);
    try {
      await rename(tmpDir, finalDir);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        this.logger.warn(`Не удалось перенести ассеты клона ${cloneId} → страница ${pageId}: ${err}`);
      }
      // ENOENT — у клона не было ассетов (например обычная HTML-страница без
      // внешних ресурсов) или cloneId не из реального /pages/clone-preview —
      // не ошибка, страница просто останется без локальных ассетов.
    }
  }

  /** Публичная раздача локально сохранённого ассета — см. public-pages.controller.ts. */
  assetPath(pageId: string, filename: string): string {
    const storageRoot = this.config.get<string>('STORAGE_ROOT', '/data/storage');
    return join(storageRoot, 'landing-assets', pageId, filename);
  }

  async deleteAssets(pageId: string): Promise<void> {
    const storageRoot = this.config.get<string>('STORAGE_ROOT', '/data/storage');
    await rm(join(storageRoot, 'landing-assets', pageId), { recursive: true, force: true });
  }
}

export interface ClonedAsset {
  originalUrl: string;
  filename: string;
  contentType: string;
  dataBase64: string;
}
