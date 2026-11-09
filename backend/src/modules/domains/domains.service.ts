import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveTxt } from 'dns/promises';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDomainDto } from './dto/domain.dto';

const TXT_RECORD_PREFIX = 'howmuchisthefish-verify=';

/**
 * Управление доменами, которыми организация вправе распоряжаться, для
 * публикации учебных страниц не на общем PUBLIC_BASE_URL (см. PROJECT.md
 * и docs/FUNCTIONAL_GAP_MATRIX.md — "Домены" были полностью отсутствующим
 * модулем).
 *
 * Верификация владения: администратор добавляет домен, система выдаёт
 * токен, администратор публикует TXT-запись
 * `_howmuchisthefish-challenge.{hostname}` со значением
 * `howmuchisthefish-verify={token}`, затем запускает проверку — только
 * после VERIFIED домен можно привязать к LandingPage (см. pages.service.ts).
 * Это тот же принцип, что ACME http-01/dns-01: токен доказывает контроль
 * над DNS-зоной, не больше.
 *
 * TLS: приложение НЕ хранит сертификаты и НЕ является ACME-клиентом.
 * Caddy (compose.caddy.yml, deployment/Caddyfile) настроен с on-demand TLS
 * и `ask`-эндпоинтом, указывающим на `isAllowedForTls()` этого сервиса —
 * Caddy спрашивает "можно ли этому домену сертификат?" при каждом новом
 * TLS-рукопожатии, мы отвечаем 2xx только для VERIFIED-доменов. Проверено
 * через официальную документацию Caddy (ask — задокументированный,
 * поддерживаемый способ; выдуманный "allowlist в Admin API" без ask не
 * существует как отдельный встроенный модуль). При деплое за внешним
 * reverse-proxy (compose.external-proxy.yml) этот механизм не используется
 * — TLS для кастомных доменов администратор настраивает в своём прокси
 * самостоятельно, это явно отражено статусом `tlsManaged` в ответах API.
 */
@Injectable()
export class DomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Caddy on-demand TLS ask-эндпоинт — см. public-domains.controller.ts.
   * 2xx = можно выпускать сертификат, что угодно другое = отказ.
   * Должен отвечать быстро (документация Caddy: "несколько миллисекунд"),
   * поэтому простой индексированный SELECT по уникальному hostname, без
   * сетевых запросов.
   */
  async isAllowedForTls(hostname: string): Promise<boolean> {
    const domain = await this.prisma.domain.findUnique({
      where: { hostname: hostname.toLowerCase() },
      select: { verificationStatus: true },
    });
    return domain?.verificationStatus === 'VERIFIED';
  }

  /** Используется UI — показать статус "TLS управляется автоматически" только при Caddy-деплое. */
  isTlsManaged(): boolean {
    return this.config.get<string>('TLS_MODE') === 'caddy';
  }

  list() {
    return this.prisma.domain.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { pages: true } } },
    });
  }

  async get(id: string) {
    const domain = await this.prisma.domain.findUnique({
      where: { id },
      include: {
        pages: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!domain) throw new NotFoundException('Домен не найден');
    return domain;
  }

  async create(dto: CreateDomainDto) {
    const hostname = dto.hostname.toLowerCase();
    const existing = await this.prisma.domain.findUnique({ where: { hostname } });
    if (existing) throw new ConflictException('Этот домен уже добавлен');
    return this.prisma.domain.create({ data: { hostname } });
  }

  async remove(id: string) {
    const domain = await this.get(id);
    if (domain.pages.length > 0) {
      throw new BadRequestException(
        `Нельзя удалить домен — он используется ${domain.pages.length} учебными страницами. Сначала отвяжите страницы.`,
      );
    }
    // Ничего дополнительно чистить в Caddy не нужно: isAllowedForTls()
    // перестанет отвечать 2xx сразу после удаления записи, ask-эндпоинт
    // читает статус "на лету" при каждом рукопожатии, отдельного состояния
    // на стороне Caddy нет.
    await this.prisma.domain.delete({ where: { id } });
  }

  /** Инструкция для администратора — что опубликовать в DNS. Не требует сетевого запроса. */
  async getVerificationInstructions(id: string) {
    const domain = await this.get(id);
    return {
      recordType: 'TXT',
      recordName: `_howmuchisthefish-challenge.${domain.hostname}`,
      recordValue: `${TXT_RECORD_PREFIX}${domain.verificationToken}`,
      status: domain.verificationStatus,
    };
  }

  /** Активная DNS-проверка — вызывается администратором из UI по кнопке "Проверить". */
  async verify(id: string) {
    const domain = await this.get(id);
    const recordName = `_howmuchisthefish-challenge.${domain.hostname}`;
    const expected = `${TXT_RECORD_PREFIX}${domain.verificationToken}`;

    let found = false;
    let error: string | null = null;
    try {
      const records = await resolveTxt(recordName);
      // resolveTxt возвращает массив массивов (запись может быть разбита на несколько строк TXT)
      found = records.some((chunks) => chunks.join('') === expected);
      if (!found) error = 'TXT-запись найдена, но значение не совпадает с ожидаемым токеном';
    } catch (err: any) {
      error =
        err.code === 'ENOTFOUND' || err.code === 'ENODATA'
          ? 'TXT-запись не найдена — проверьте, что она опубликована и DNS успел обновиться'
          : `Ошибка DNS-запроса: ${err.message}`;
    }

    const updated = await this.prisma.domain.update({
      where: { id },
      data: {
        verificationStatus: found ? 'VERIFIED' : 'FAILED',
        lastCheckedAt: new Date(),
        lastCheckError: found ? null : error,
      },
    });

    // Сертификат Caddy выпустит сам при первом HTTPS-обращении к домену
    // (ask-эндпоинт теперь отвечает 2xx для него) — ничего дополнительно
    // инициировать не нужно.
    return updated;
  }
}
