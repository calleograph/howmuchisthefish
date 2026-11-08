import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

interface Attempt {
  count: number;
  lockedUntil?: number;
}

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000; // 5 минут

/**
 * Защита от перебора учётных записей (задание §3): после 5 неудачных попыток логина
 * с одного email блокирует попытки на 5 минут. In-memory — достаточно для одного
 * процесса backend (монолит, без горизонтального масштабирования в версии 0.1.0);
 * shortcut: счётчик сбрасывается при перезапуске процесса, не переживает несколько
 * инстансов backend — если появится горизонтальное масштабирование, перенести в БД/кэш.
 */
@Injectable()
export class LoginThrottleService {
  private attempts = new Map<string, Attempt>();

  assertNotLocked(email: string) {
    const entry = this.attempts.get(email);
    if (entry?.lockedUntil && entry.lockedUntil > Date.now()) {
      const secondsLeft = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
      throw new HttpException(
        `Слишком много неудачных попыток входа. Повторите через ${secondsLeft} секунд.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(email: string) {
    const entry = this.attempts.get(email) ?? { count: 0 };
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) {
      entry.lockedUntil = Date.now() + LOCK_MS;
    }
    this.attempts.set(email, entry);
  }

  recordSuccess(email: string) {
    this.attempts.delete(email);
  }
}
