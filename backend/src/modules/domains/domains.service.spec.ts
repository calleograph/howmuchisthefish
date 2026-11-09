import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DomainsService } from './domains.service';
import { PrismaService } from '../../prisma/prisma.service';

// @nestjs/config публикует ESM, который ts-jest по умолчанию не транспилирует
// (см. jest "transform" в package.json — node_modules не включён); другие
// спеки этого проекта его не импортируют по той же причине. Мокаем модуль
// целиком, не трогая его реальный ESM-билд — jest подставляет наш мок до
// импорта DomainsService (который реально импортирует ConfigService).
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {
    get = jest.fn();
  },
}));
import { ConfigService } from '@nestjs/config';

jest.mock('dns/promises', () => ({ resolveTxt: jest.fn() }));
import { resolveTxt } from 'dns/promises';

// Регрессия: DNS TXT-верификация — единственный способ домен получает статус
// VERIFIED, после чего (1) его можно привязать к учебной странице и (2) Caddy
// on-demand TLS ask-эндпоинт разрешит выпуск сертификата. Ошибка здесь means
// либо фальшивое доверие недоказанному домену, либо отказ рабочему.
describe('DomainsService', () => {
  let service: DomainsService;
  let prisma: {
    domain: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      domain: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DomainsService,
        { provide: PrismaService, useValue: prisma },
        ConfigService,
      ],
    }).compile();
    service = moduleRef.get(DomainsService);
    jest.clearAllMocks();
  });

  describe('verify()', () => {
    const domain = {
      id: 'd1',
      hostname: 'training.example.com',
      verificationToken: 'secret-token',
      pages: [],
    };

    it('помечает VERIFIED, когда TXT-запись точно совпадает', async () => {
      prisma.domain.findUnique.mockResolvedValue(domain);
      (resolveTxt as jest.Mock).mockResolvedValue([['howmuchisthefish-verify=secret-token']]);
      prisma.domain.update.mockResolvedValue({ ...domain, verificationStatus: 'VERIFIED' });

      const result = await service.verify('d1');

      expect(result.verificationStatus).toBe('VERIFIED');
      expect(prisma.domain.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: expect.objectContaining({ verificationStatus: 'VERIFIED', lastCheckError: null }),
      });
    });

    it('собирает TXT-запись из нескольких chunks (DNS разбивает длинные строки)', async () => {
      prisma.domain.findUnique.mockResolvedValue(domain);
      // Реальный DNS может вернуть длинную TXT-строку разбитой на части —
      // join('') должен их склеить перед сравнением.
      (resolveTxt as jest.Mock).mockResolvedValue([['howmuchisthefish-verify=', 'secret-token']]);
      prisma.domain.update.mockResolvedValue({ ...domain, verificationStatus: 'VERIFIED' });

      const result = await service.verify('d1');
      expect(result.verificationStatus).toBe('VERIFIED');
    });

    it('не выдаёт VERIFIED, если токен не совпадает (чужой/устаревший домен)', async () => {
      prisma.domain.findUnique.mockResolvedValue(domain);
      (resolveTxt as jest.Mock).mockResolvedValue([['howmuchisthefish-verify=wrong-token']]);
      prisma.domain.update.mockResolvedValue({ ...domain, verificationStatus: 'FAILED' });

      const result = await service.verify('d1');

      expect(result.verificationStatus).toBe('FAILED');
      expect(prisma.domain.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: expect.objectContaining({
          verificationStatus: 'FAILED',
          lastCheckError: expect.stringContaining('не совпадает'),
        }),
      });
    });

    it('не выдаёт VERIFIED, когда TXT-запись отсутствует', async () => {
      prisma.domain.findUnique.mockResolvedValue(domain);
      const err: any = new Error('not found');
      err.code = 'ENOTFOUND';
      (resolveTxt as jest.Mock).mockRejectedValue(err);
      prisma.domain.update.mockResolvedValue({ ...domain, verificationStatus: 'FAILED' });

      const result = await service.verify('d1');

      expect(result.verificationStatus).toBe('FAILED');
    });
  });

  describe('isAllowedForTls()', () => {
    it('разрешает TLS только для VERIFIED-доменов (Caddy ask-эндпоинт)', async () => {
      prisma.domain.findUnique.mockResolvedValue({ verificationStatus: 'VERIFIED' });
      await expect(service.isAllowedForTls('training.example.com')).resolves.toBe(true);
    });

    it('отказывает для PENDING — не должно быть возможности обойти верификацию выпуском сертификата', async () => {
      prisma.domain.findUnique.mockResolvedValue({ verificationStatus: 'PENDING' });
      await expect(service.isAllowedForTls('training.example.com')).resolves.toBe(false);
    });

    it('отказывает для неизвестного домена', async () => {
      prisma.domain.findUnique.mockResolvedValue(null);
      await expect(service.isAllowedForTls('unknown.example.com')).resolves.toBe(false);
    });
  });

  describe('create()', () => {
    it('приводит hostname к нижнему регистру', async () => {
      prisma.domain.findUnique.mockResolvedValue(null);
      prisma.domain.create.mockResolvedValue({ id: 'd1', hostname: 'example.com' });

      await service.create({ hostname: 'Example.COM' });

      expect(prisma.domain.create).toHaveBeenCalledWith({ data: { hostname: 'example.com' } });
    });

    it('отклоняет дубликат домена', async () => {
      prisma.domain.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create({ hostname: 'example.com' })).rejects.toThrow(ConflictException);
    });
  });

  describe('remove()', () => {
    it('отклоняет удаление домена, привязанного к страницам', async () => {
      prisma.domain.findUnique.mockResolvedValue({
        id: 'd1',
        hostname: 'example.com',
        pages: [{ id: 'p1', name: 'Test', slug: 'test' }],
      });
      await expect(service.remove('d1')).rejects.toThrow(BadRequestException);
      expect(prisma.domain.delete).not.toHaveBeenCalled();
    });
  });
});
