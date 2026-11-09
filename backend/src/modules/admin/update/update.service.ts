import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { UPDATE_ACTIONS } from './dto/request-update-action.dto';

// Версия берётся из package.json (копируется в Docker-образ целиком), не из
// корневого VERSION-файла — тот лежит на уровень выше backend/ в репозитории
// и НЕ попадает в контекст сборки backend-образа (см. backend/Dockerfile).
// Тот же паттерн, что и в health.controller.ts — единый источник правды,
// не дублируется хардкодом.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- package.json не ESM-импортируемый JSON без resolveJsonModule
const { version: PACKAGE_VERSION } = require('../../../../package.json');

type UpdateAction = (typeof UPDATE_ACTIONS)[number];

export interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  checkedAt: string;
}

export interface UpdateStatus {
  state: 'idle' | 'updating' | 'failed';
  stepNo: number;
  stepTotal: number;
  stepName: string;
  ts: string;
}

export interface UpdateHeartbeat {
  ts: string;
  pid: number;
}

export interface UpdateHistoryEntry {
  at: string;
  fromVersion: string;
  toVersion: string;
  result: 'ok' | 'failed';
  message: string;
}

export interface UpdateReport {
  fromVersion: string;
  toVersion: string;
  finishedAt: string;
  outcome: { update: string; deploy: string; healthcheck: string };
  message: string;
}

// Пульс считается свежим в пределах этого окна — то же значение, что и
// интервал systemd-таймера (10с) с запасом, архитектура подсмотрена в
// «Переговорке» (helper.json, HEARTBEAT_MAX_AGE=40с там; здесь берём
// меньшее окно — наш таймер чаще, см. howmuchisthefish-updater.timer).
const HEARTBEAT_MAX_AGE_S = 30;

/**
 * Мост между backend (непривилегированный контейнер, нет доступа к Docker
 * socket — задание §5) и root-helper (scripts/root-helper/updater.sh,
 * systemd-служба на хосте, устанавливается install.sh этапом root_helper).
 *
 * Протокол — файлы в общем каталоге обмена (SAP_EXCHANGE_DIR, bind mount
 * на тот же хостовый путь, что видит root-служба). Архитектура и состав
 * файлов перенесены из проекта «Переговорка»
 * (backend/app/services/updates.py), упрощены под масштаб этого продукта:
 *   request.json   — backend пишет {"action": "check"|"update"|"backup"}
 *   status.json    — root-helper пишет текущий этап во время apply_update.sh
 *   helper.json    — root-helper пишет на КАЖДЫЙ проход таймера (пульс,
 *                     отдельно от status.json — тот не меняется минутами
 *                     во время долгой сборки, это не значит, что служба мертва)
 *   history.ndjson — одна строка на попытку обновления, root-helper дописывает
 *   report.json    — итоговый отчёт последней попытки
 *   version_info.json — root-helper пишет после check
 *
 * Таймер опрашивает каталог раз в ~10с — это НЕ мгновенный ответ, см.
 * docs/UPDATE.md. Если root-helper не установлен (install.sh пропустил
 * этап root_helper — например нет systemd), каталог обмена недоступен —
 * методы здесь явно сообщают об этом, не притворяются, что что-то произошло.
 */
@Injectable()
export class UpdateService {
  private readonly logger = new Logger(UpdateService.name);

  constructor(private readonly config: ConfigService) {}

  private exchangeDir(): string {
    return this.config.get<string>(
      'SAP_EXCHANGE_DIR',
      '/var/lib/howmuchisthefish/updater',
    );
  }

  private async readJsonIfExists<T>(path: string): Promise<T | null> {
    try {
      const raw = await readFile(path, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private currentVersion(): string {
    return PACKAGE_VERSION;
  }

  async overview() {
    const dir = this.exchangeDir();
    const [heartbeat, status, version, history, report] = await Promise.all([
      this.readJsonIfExists<UpdateHeartbeat>(join(dir, 'helper.json')),
      this.readJsonIfExists<UpdateStatus>(join(dir, 'status.json')),
      this.readJsonIfExists<VersionInfo>(join(dir, 'version_info.json')),
      this.readNdjson<UpdateHistoryEntry>(join(dir, 'history.ndjson')),
      this.readJsonIfExists<UpdateReport>(join(dir, 'report.json')),
    ]);

    const heartbeatAgeS = heartbeat
      ? (Date.now() - new Date(heartbeat.ts).getTime()) / 1000
      : null;
    const helperAvailable =
      heartbeatAgeS !== null && heartbeatAgeS <= HEARTBEAT_MAX_AGE_S;
    const running = status?.state === 'updating';

    return {
      installedVersion: this.currentVersion(),
      helper: {
        available: helperAvailable,
        heartbeatAgeS:
          heartbeatAgeS !== null ? Math.round(heartbeatAgeS) : null,
      },
      status,
      running,
      version,
      history: history.slice(-15).reverse(),
      report,
      canUpdate: helperAvailable && !running,
    };
  }

  private async readNdjson<T>(path: string): Promise<T[]> {
    try {
      const raw = await readFile(path, 'utf8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as T;
          } catch {
            return null;
          }
        })
        .filter((x): x is T => x !== null);
    } catch {
      return [];
    }
  }

  async log(offset: number) {
    const path = join(this.exchangeDir(), 'update.log');
    try {
      const full = await readFile(path, 'utf8');
      const size = Buffer.byteLength(full, 'utf8');
      const reset = offset > size || offset < 0;
      const safeOffset = reset ? 0 : offset;
      const text = Buffer.from(full, 'utf8')
        .subarray(safeOffset)
        .toString('utf8');
      return {
        offset: safeOffset + Buffer.byteLength(text, 'utf8'),
        size,
        text,
        reset,
      };
    } catch {
      return { offset: 0, size: 0, text: '', reset: false };
    }
  }

  async requestAction(action: UpdateAction) {
    const dir = this.exchangeDir();
    try {
      await mkdir(dir, { recursive: true });
    } catch (err) {
      // Каталог обмена недоступен (root-helper не установлен — install.sh
      // пропустил этап root_helper, например нет systemd) — честная ошибка,
      // не тихий no-op: иначе кнопка в UI выглядела бы рабочей, но ничего
      // не происходило бы.
      throw new ServiceUnavailableException(
        `Root-helper недоступен (${err}). Обновление через веб-интерфейс требует scripts/install.sh — этап root_helper (systemd). См. docs/UPDATE.md "Вручную, из командной строки".`,
      );
    }

    const requestPath = join(dir, 'request.json');
    const existing = await this.readJsonIfExists<{ action: string }>(
      requestPath,
    );
    if (existing) {
      throw new BadRequestException(
        `Уже обрабатывается запрос "${existing.action}" — дождитесь завершения перед новым действием.`,
      );
    }

    await writeFile(
      requestPath,
      JSON.stringify({ action, requestedAt: new Date().toISOString() }),
    );
    this.logger.log(`Запрошено действие root-helper: ${action}`);
    return { requested: action };
  }
}
