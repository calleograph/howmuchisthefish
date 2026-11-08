import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Шифрует/расшифровывает секреты уровня приложения (SMTP-пароли и т.п.) ключом
 * APP_MASTER_KEY. Хранить этот ключ отдельно от резервных копий — см. docs/BACKUP_RESTORE.md:
 * без него зашифрованные поля (@policy:secret в schema.prisma) не восстановить.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>('APP_MASTER_KEY');
    if (!raw || raw.startsWith('CHANGE_ME')) {
      throw new Error(
        'APP_MASTER_KEY не задан или не заменён. Сгенерируйте его установщиком (scripts/install.sh) перед запуском.',
      );
    }
    // Ключ может быть любой строкой — приводим к 32 байтам детерминированным образом (sha256),
    // чтобы не требовать от администратора руками подгонять длину hex-строки.
    this.key = createHash('sha256').update(raw).digest();
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    // формат: base64(iv).base64(authTag).base64(ciphertext)
    return [iv, authTag, encrypted].map((b) => b.toString('base64')).join('.');
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Некорректный формат зашифрованного значения');
    }
    const decipher = createDecipheriv(
      ALGO,
      this.key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
