import { BadRequestException } from '@nestjs/common';

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'FINISHED' | 'FAILED';

/**
 * Явный конечный автомат состояний кампании (задание §2.4). Переход, не описанный
 * здесь, запрещён — проще и безопаснее, чем проверять условия разрозненно по методам
 * сервиса, легко упустить запрещённый переход при добавлении новой фичи.
 */
const ALLOWED_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ['SCHEDULED', 'RUNNING'],
  SCHEDULED: ['RUNNING', 'DRAFT'], // DRAFT — отмена запланированного запуска
  RUNNING: ['PAUSED', 'FINISHED', 'FAILED'],
  PAUSED: ['RUNNING', 'FINISHED'],
  FINISHED: [],
  FAILED: ['DRAFT'], // можно исправить настройки и перезапустить с нуля
};

export function assertTransitionAllowed(from: CampaignStatus, to: CampaignStatus) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(
      `Недопустимый переход кампании из состояния ${from} в ${to}`,
    );
  }
}
