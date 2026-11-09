import { Test } from '@nestjs/testing';

// pg-boss и @nestjs/config публикуют ESM, который ts-jest по умолчанию не
// транспилирует (node_modules вне "transform" в package.json) — mailer-queue
// импортирует оба напрямую (PgBoss как класс очереди, ConfigService для
// PUBLIC_BASE_URL), поэтому мокаем их раньше импорта тестируемого модуля.
jest.mock('pg-boss', () => ({ PgBoss: class PgBoss {} }));
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {
    get(key: string, fallback?: string) {
      if (key === 'PUBLIC_BASE_URL') return 'https://app.example.com';
      return fallback;
    }
  },
}));

import { MailerQueueService } from './mailer-queue.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SmtpConfigService } from '../smtp/smtp-config.service';
import { MjmlRenderService } from '../templates/mjml-render.service';
import { ConfigService } from '@nestjs/config';

const baseTarget = {
  id: 'target-1',
  trackingToken: 'tok-1',
  employee: {
    firstName: 'Иван',
    lastName: 'Петров',
    department: 'IT',
    position: 'Инженер',
    email: 'ivan@example.com',
    customFields: { office: 'Москва', badge: 42 },
  },
  campaign: {
    id: 'campaign-1',
    pageId: 'page-1',
    smtpConfigId: 'smtp-1',
    template: { mjmlSource: 'Привет {{firstName}}, отдел {{department}}, офис {{office}}', subject: 'Тест' },
    page: { slug: 'test-page' },
  },
};

// Регрессия: persist вся доступность персонализации (department/position/
// customFields уже были в модели Employee, но не попадали в реальную
// рассылку — docs/FUNCTIONAL_GAP_MATRIX.md §4), и retry при сбое SMTP
// (ошибка должна re-throw'иться, чтобы pg-boss retryLimit реально сработал
// — раньше ошибка тихо глоталась, retry был бы мёртвым кодом даже если
// задать retryLimit на очереди).
describe('MailerQueueService — handleSend', () => {
  let service: MailerQueueService;
  let prisma: any;
  let smtp: any;
  let mjml: any;

  beforeEach(async () => {
    prisma = {
      campaignTarget: { findUnique: jest.fn().mockResolvedValue(baseTarget) },
      landingPage: { findUnique: jest.fn().mockResolvedValue({ domain: null }) },
      campaignEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    smtp = {
      getTransportForCampaign: jest.fn().mockResolvedValue({ sendMail: jest.fn().mockResolvedValue({}) }),
      get: jest.fn().mockResolvedValue({ fromAddress: 'noreply@example.com' }),
    };
    mjml = { renderWithData: jest.fn().mockResolvedValue({ html: '<p>ok</p>', errors: [] }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MailerQueueService,
        { provide: PrismaService, useValue: prisma },
        { provide: SmtpConfigService, useValue: smtp },
        { provide: MjmlRenderService, useValue: mjml },
        ConfigService,
      ],
    }).compile();
    service = moduleRef.get(MailerQueueService);
  });

  it('передаёт firstName/lastName/department/position/customFields в рендер', async () => {
    await (service as any).handleSend({ campaignId: 'campaign-1', targetId: 'target-1' }, 0);

    expect(mjml.renderWithData).toHaveBeenCalledWith(
      baseTarget.campaign.template.mjmlSource,
      expect.objectContaining({
        firstName: 'Иван',
        lastName: 'Петров',
        department: 'IT',
        position: 'Инженер',
        office: 'Москва',
        badge: '42', // приведено к строке — customFields.badge был number
      }),
    );
  });

  it('явные поля (firstName) не перетираются одноимённым customField', async () => {
    const withConflict = {
      ...baseTarget,
      employee: { ...baseTarget.employee, customFields: { firstName: 'Подделка' } },
    };
    prisma.campaignTarget.findUnique.mockResolvedValue(withConflict);

    await (service as any).handleSend({ campaignId: 'campaign-1', targetId: 'target-1' }, 0);

    expect(mjml.renderWithData).toHaveBeenCalledWith(
      withConflict.campaign.template.mjmlSource,
      expect.objectContaining({ firstName: 'Иван' }),
    );
  });

  it('создаёт EMAIL_SENT при успешной отправке', async () => {
    await (service as any).handleSend({ campaignId: 'campaign-1', targetId: 'target-1' }, 0);

    expect(prisma.campaignEvent.create).toHaveBeenCalledWith({
      data: { campaignId: 'campaign-1', targetId: 'target-1', type: 'EMAIL_SENT' },
    });
  });

  it('пробрасывает ошибку SMTP дальше — иначе pg-boss retryLimit никогда не сработает', async () => {
    smtp.getTransportForCampaign.mockResolvedValue({
      sendMail: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });

    await expect(
      (service as any).handleSend({ campaignId: 'campaign-1', targetId: 'target-1' }, 1),
    ).rejects.toThrow('ECONNREFUSED');
    expect(prisma.campaignEvent.create).not.toHaveBeenCalled();
  });

  it('использует домен страницы для landingUrl, если он задан', async () => {
    prisma.landingPage.findUnique.mockResolvedValue({ domain: { hostname: 'training.example.org' } });
    const transport = { sendMail: jest.fn().mockResolvedValue({}) };
    smtp.getTransportForCampaign.mockResolvedValue(transport);
    mjml.renderWithData.mockResolvedValue({
      html: '<p>{{landingPageUrl}}</p>',
      errors: [],
    });

    await (service as any).handleSend({ campaignId: 'campaign-1', targetId: 'target-1' }, 0);

    const sentHtml = transport.sendMail.mock.calls[0][0].html;
    expect(sentHtml).toContain('https://training.example.org/lp/test-page?token=tok-1');
  });
});
