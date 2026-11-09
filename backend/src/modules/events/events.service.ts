import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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
