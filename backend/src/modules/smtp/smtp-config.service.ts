import { Injectable, NotFoundException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { CreateSmtpConfigDto, UpdateSmtpConfigDto } from './dto/smtp-config.dto';

/** Пароль никогда не возвращается клиенту — ни в списке, ни при чтении одной записи. */
function omitPassword<T extends { passwordEnc: string | null }>(config: T) {
  const { passwordEnc, ...rest } = config;
  return { ...rest, hasPassword: !!passwordEnc };
}

@Injectable()
export class SmtpConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async list() {
    const configs = await this.prisma.smtpConfig.findMany({ orderBy: { name: 'asc' } });
    return configs.map(omitPassword);
  }

  async get(id: string) {
    const config = await this.prisma.smtpConfig.findUnique({ where: { id } });
    if (!config) throw new NotFoundException('SMTP-подключение не найдено');
    return config;
  }

  async getSafe(id: string) {
    return omitPassword(await this.get(id));
  }

  async create(dto: CreateSmtpConfigDto) {
    const created = await this.prisma.smtpConfig.create({
      data: {
        name: dto.name,
        host: dto.host,
        port: dto.port,
        secure: dto.secure ?? true,
        username: dto.username,
        passwordEnc: dto.password ? this.crypto.encrypt(dto.password) : null,
        fromAddress: dto.fromAddress,
        isDefault: dto.isDefault ?? false,
      },
    });
    return omitPassword(created);
  }

  async update(id: string, dto: UpdateSmtpConfigDto) {
    await this.get(id);
    const updated = await this.prisma.smtpConfig.update({
      where: { id },
      data: {
        name: dto.name,
        host: dto.host,
        port: dto.port,
        secure: dto.secure,
        username: dto.username,
        fromAddress: dto.fromAddress,
        isDefault: dto.isDefault,
        // Пароль меняется только если явно передан — пустое значение не стирает сохранённый.
        ...(dto.password ? { passwordEnc: this.crypto.encrypt(dto.password) } : {}),
      },
    });
    return omitPassword(updated);
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.smtpConfig.delete({ where: { id } });
  }

  private async buildTransport(id: string) {
    const config = await this.get(id);
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465, // неявный TLS только на 465; остальное — STARTTLS через requireTLS
      requireTLS: config.secure && config.port !== 465,
      auth: config.username
        ? { user: config.username, pass: config.passwordEnc ? this.crypto.decrypt(config.passwordEnc) : '' }
        : undefined,
      // Отказ от самоподписанных сертификатов по умолчанию — ослаблять явно, не молча.
      tls: { rejectUnauthorized: true },
    });
  }

  async test(id: string, toAddress: string) {
    const config = await this.get(id);
    const transport = await this.buildTransport(id);
    try {
      await transport.verify();
      await transport.sendMail({
        from: config.fromAddress,
        to: toAddress,
        subject: 'Security Awareness Platform — проверка SMTP-подключения',
        text: 'Если вы получили это письмо, SMTP-подключение настроено верно.',
      });
      await this.prisma.smtpConfig.update({
        where: { id },
        data: { lastTestAt: new Date(), lastTestOk: true },
      });
      return { ok: true };
    } catch (err: any) {
      await this.prisma.smtpConfig.update({
        where: { id },
        data: { lastTestAt: new Date(), lastTestOk: false },
      });
      return { ok: false, error: err.message };
    }
  }

  /** Используется mailer-модулем для реальной отправки кампаний. */
  async getTransportForCampaign(smtpConfigId: string) {
    return this.buildTransport(smtpConfigId);
  }
}
