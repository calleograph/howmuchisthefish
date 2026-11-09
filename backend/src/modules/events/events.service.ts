import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { isLikelyAutomatedScanner } from './bot-detection';

export type TrackableEventType =
  | 'email_sent'
  | 'email_opened'
  | 'link_clicked'
  | 'form_submitted'
  | 'reported_phishing';

const TYPE_MAP: Record<
  TrackableEventType,
  'EMAIL_SENT' | 'EMAIL_OPENED' | 'LINK_CLICKED' | 'FORM_SUBMITTED' | 'REPORTED_PHISHING'
> = {
  email_sent: 'EMAIL_SENT',
  email_opened: 'EMAIL_OPENED',
  link_clicked: 'LINK_CLICKED',
  form_submitted: 'FORM_SUBMITTED',
  // Сотрудник сам сообщил о подозрительном письме — положительная метрика,
  // та же безопасная token-схема, что и у остальных событий (факт действия,
  // без каких-либо данных формы/содержимого).
  reported_phishing: 'REPORTED_PHISHING',
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * Регистрирует событие по trackingToken цели. См. safe-form-injector.ts и
   * TrackEventDto — в params НЕТ и не может быть содержимого формы.
   */
  async record(params: {
    token: string;
    type: TrackableEventType;
    userAgent?: string | null;
    ipAddress?: string | null;
  }) {
    const target = await this.prisma.campaignTarget.findUnique({
      where: { trackingToken: params.token },
    });
    if (!target) {
      // Намеренно тихо: не раскрываем внешнему вызывающему, существует ли токен —
      // иначе эндпоинт стал бы оракулом для перебора валидных trackingToken.
      return { recorded: false };
    }

    await this.prisma.campaignEvent.create({
      data: {
        campaignId: target.campaignId,
        targetId: target.id,
        type: TYPE_MAP[params.type],
        isSuspiciousAutomated: isLikelyAutomatedScanner(params.userAgent),
        userAgent: params.userAgent ?? null,
        ipAddress: params.ipAddress ?? null,
      },
    });
    return { recorded: true };
  }

  /**
   * Сохраняет значения полей, перехваченных на странице с явно включённым
   * LandingPage.capturesCredentials (см. safe-form-injector.ts
   * buildCapturingFormScript). Создаёт FORM_SUBMITTED-событие (как и обычный
   * путь через record()) + по одной CapturedCredential-записи на каждое
   * УНИКАЛЬНОЕ значение поля за это событие (дедупликация по SHA-256,
   * без расшифровки — "ввёл один реальный пароль" отличимо от "перебирал
   * несколько в шутку" по количеству разных hash, не по количеству кликов).
   * Молчаливо отклоняет запрос, если страница не включала захват — защита от
   * того, что клиент пришлёт /t/credential для страницы без capturesCredentials
   * (например кто-то подделал запрос вручную, не через наш скрипт).
   */
  async recordCredentials(params: {
    token: string;
    fields: { name: string; value: string }[];
    userAgent?: string | null;
    ipAddress?: string | null;
  }) {
    const target = await this.prisma.campaignTarget.findUnique({
      where: { trackingToken: params.token },
      include: { campaign: { include: { page: true } } },
    });
    if (!target) return { recorded: false };
    if (!target.campaign.page.capturesCredentials) {
      // Страница не включала захват — тихо игнорируем поля, но факт отправки
      // всё равно фиксируем через обычный record(), чтобы не терять событие.
      await this.record({
        token: params.token,
        type: 'form_submitted',
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      });
      return { recorded: true, captured: 0 };
    }

    const event = await this.prisma.campaignEvent.create({
      data: {
        campaignId: target.campaignId,
        targetId: target.id,
        type: 'FORM_SUBMITTED',
        isSuspiciousAutomated: isLikelyAutomatedScanner(params.userAgent),
        userAgent: params.userAgent ?? null,
        ipAddress: params.ipAddress ?? null,
      },
    });

    const seenHashes = new Set<string>();
    let captured = 0;
    for (const field of params.fields) {
      if (!field.value) continue;
      const hash = createHash('sha256').update(field.value).digest('hex');
      if (seenHashes.has(hash)) continue; // тот же вариант ввода за эту отправку — не дублируем
      seenHashes.add(hash);
      await this.prisma.capturedCredential.create({
        data: {
          eventId: event.id,
          fieldName: field.name,
          valueEnc: this.crypto.encryptCredential(field.value),
          valueHash: hash,
        },
      });
      captured++;
    }
    return { recorded: true, captured };
  }

  // Явное, нечастое действие — расшифровка конкретного значения. Пишет
  // AuditLog при каждом вызове (успешном и безуспешном — факт попытки
  // расшифровать чужие данные стоит видеть в журнале тоже), не кэширует
  // расшифрованное значение нигде за пределами этого ответа.
  async revealCredential(
    campaignId: string,
    eventId: string,
    actorUserId: string | null,
    actorIp?: string,
  ) {
    const credential = await this.prisma.capturedCredential.findFirst({
      where: { eventId, event: { campaignId } },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'reveal_captured_credential',
        entityType: 'CapturedCredential',
        entityId: credential?.id ?? eventId,
        metadata: { campaignId, eventId, found: !!credential },
        ipAddress: actorIp ?? null,
      },
    });
    if (!credential) throw new NotFoundException('Перехваченное значение не найдено');
    return {
      fieldName: credential.fieldName,
      value: this.crypto.decryptCredential(credential.valueEnc),
      createdAt: credential.createdAt,
    };
  }

  async listForCampaign(campaignId: string) {
    return this.prisma.campaignEvent.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      include: { target: { include: { employee: true, group: true } } },
    });
  }

  async getTrackingPixel() {
    // 1x1 прозрачный GIF — минимальный валидный, 43 байта.
    return Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      'base64',
    );
  }

  async ensureTargetExists(token: string) {
    const target = await this.prisma.campaignTarget.findUnique({
      where: { trackingToken: token },
    });
    if (!target) throw new NotFoundException();
    return target;
  }
}
