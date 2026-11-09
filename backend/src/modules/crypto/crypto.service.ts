import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(raw: string): Buffer {
  // Ключ может быть любой строкой — приводим к 32 байтам детерминированным образом (sha256),
  // чтобы не требовать от администратора руками подгонять длину hex-строки.
  return createHash('sha256').update(raw).digest();
}

/**
 * Шифрует/расшифровывает секреты уровня приложения (SMTP-пароли и т.п.) ключом
 * APP_MASTER_KEY. Хранить этот ключ отдельно от резервных копий — см. docs/BACKUP_RESTORE.md:
 * без него зашифрованные поля (@policy:secret в schema.prisma) не восстановить.
 *
 * ВТОРОЙ, ОТДЕЛЬНЫЙ ключ (CREDENTIAL_ENCRYPTION_KEY) используется только для
 * значений, перехваченных в учебных формах (CapturedCredential) — намеренно
 * НЕ выводится из APP_MASTER_KEY и не лежит в том же .env, что и остальная
 * конфигурация приложения. Это сознательный компромисс (не полноценная
 * клиентская E2E-схема, см. docs/SECURITY.md "История решения о значениях
 * форм"): защищает от утечки через дамп БД/бэкап БД без доступа к серверу
 * целиком, но НЕ защищает от полной компрометации сервера (где оба ключа
 * физически достижимы). HKDF даёт отдельные подключи по назначению (purpose)
 * из этого секрета — задел на будущее (например отдельный подключ на
 * конкретную кампанию), сейчас используется с фиксированным purpose.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private key!: Buffer;
  private credentialKeySecret?: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>('APP_MASTER_KEY');
    if (!raw || raw.startsWith('CHANGE_ME')) {
      throw new Error(
        'APP_MASTER_KEY не задан или не заменён. Сгенерируйте его установщиком (scripts/install.sh) перед запуском.',
      );
    }
    this.key = deriveKey(raw);

    const credRaw = this.config.get<string>('CREDENTIAL_ENCRYPTION_KEY');
    // Намеренно НЕ обязателен при старте: захват учётных данных — опциональная
    // функция (LandingPage.capturesCredentials по умолчанию выключен), так что
    // отсутствие этого ключа не должно блокировать запуск всего приложения —
    // только сам захват (см. encryptCredential ниже, явная ошибка в момент
    // использования, не при старте).
    if (credRaw && !credRaw.startsWith('CHANGE_ME')) {
      this.credentialKeySecret = deriveKey(credRaw);
    }
  }

  encrypt(plainText: string): string {
    return this.encryptWithKey(plainText, this.key);
  }

  decrypt(payload: string): string {
    return this.decryptWithKey(payload, this.key);
  }

  // purpose — доменный "контекст" использования подключа (HKDF info),
  // защита AAD-подобного типа от случайной путаницы ключей между разными
  // назначениями при будущем расширении (не используется для разных полей
  // одного назначения — только для разделения самих назначений).
  encryptCredential(plainText: string, purpose = 'phishing-captured-credentials'): string {
    return this.encryptWithKey(plainText, this.credentialKey(purpose));
  }

  decryptCredential(payload: string, purpose = 'phishing-captured-credentials'): string {
    return this.decryptWithKey(payload, this.credentialKey(purpose));
  }

  private credentialKey(purpose: string): Buffer {
    if (!this.credentialKeySecret) {
      throw new Error(
        'CREDENTIAL_ENCRYPTION_KEY не задан — захват учётных данных форм недоступен. Задайте переменную окружения отдельно от APP_MASTER_KEY.',
      );
    }
    return Buffer.from(
      hkdfSync('sha256', this.credentialKeySecret, Buffer.alloc(0), purpose, 32),
    );
  }

  private encryptWithKey(plainText: string, key: Buffer): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    // формат: base64(iv).base64(authTag).base64(ciphertext)
    return [iv, authTag, encrypted].map((b) => b.toString('base64')).join('.');
  }

  private decryptWithKey(payload: string, key: Buffer): string {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Некорректный формат зашифрованного значения');
    }
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
