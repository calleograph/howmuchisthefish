import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScreenshotService } from './screenshot.service';
import { CreatePageDto, UpdatePageDto } from './dto/page.dto';
import { rewriteFormsForCapture } from './form-rewriter';

@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly screenshots: ScreenshotService,
  ) {}

  // Привязать страницу можно только к верифицированному домену — незачем
  // публиковать на домене, владение которым ещё не подтверждено DNS-записью
  // (см. domains.service.ts verify()).
  private async assertDomainUsable(domainId: string | null | undefined) {
    if (!domainId) return;
    const domain = await this.prisma.domain.findUnique({ where: { id: domainId } });
    if (!domain) throw new NotFoundException('Домен не найден');
    if (domain.verificationStatus !== 'VERIFIED') {
      throw new BadRequestException(
        'Домен ещё не верифицирован — сначала подтвердите владение через TXT-запись',
      );
    }
  }

  // Fire-and-forget: не блокирует ответ на create/update, сервис скриншотов
  // опционален и может отсутствовать (до 15с на попытку соединения).
  private regenerateScreenshot(pageId: string, html: string) {
    this.screenshots
      .generate(html)
      .then((path) => {
        if (path) {
          return this.prisma.landingPage.update({
            where: { id: pageId },
            data: { screenshotPath: path },
          });
        }
      })
      .catch((err) => this.logger.warn(`Не удалось обновить превью страницы ${pageId}: ${err}`));
  }

  list(includeArchived = false) {
    return this.prisma.landingPage.findMany({
      where: includeArchived ? {} : { isArchived: false },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(id: string) {
    const page = await this.prisma.landingPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Страница не найдена');
    return page;
  }

  async getBySlug(slug: string) {
    const page = await this.prisma.landingPage.findUnique({ where: { slug } });
    if (!page || page.isArchived)
      throw new NotFoundException('Страница не найдена');
    return page;
  }

  async create(dto: CreatePageDto) {
    const existing = await this.prisma.landingPage.findUnique({
      where: { slug: dto.slug },
    });
    if (existing)
      throw new ConflictException('Страница с таким адресом уже существует');
    await this.assertDomainUsable(dto.domainId);
    const page = await this.prisma.landingPage.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        htmlSource: dto.htmlSource,
        formEnabled: dto.formEnabled ?? false,
        capturesCredentials: dto.capturesCredentials ?? false,
        sourceUrl: dto.sourceUrl,
        domainId: dto.domainId,
      },
    });
    if (dto.cloneId) await this.screenshots.commitClonedAssets(dto.cloneId, page.id);
    this.regenerateScreenshot(page.id, page.htmlSource);
    return page;
  }

  // Граббер: только рендерит и готовит HTML для предпросмотра/редактирования,
  // НЕ создаёт LandingPage — администратор сохраняет явно через create() после
  // просмотра результата. rewriteFormsForCapture убирает оригинальный
  // action/method формы (чтобы сетевой сбой JS-перехвата не отправил данные
  // на реальный сайт) — сама логика трекинга добавляется позже, при раздаче
  // через /lp/{slug} (см. public-pages.controller.ts), не здесь.
  //
  // Ресурсы (CSS/JS/картинки/шрифты), перехваченные при рендере, сохраняются
  // ВО ВРЕМЕННУЮ папку под cloneId (см. screenshot.service.ts) — страница
  // остаётся самостоятельной копией, не зависящей от исходного сайта после
  // сохранения. cloneId возвращается клиенту и должен быть передан обратно
  // в CreatePageDto.cloneId при сохранении — иначе ассеты останутся orphan.
  async clonePreview(url: string) {
    const { html: rawHtml, cloneId, assetCount } = await this.screenshots.clone(url);
    const htmlSource = rewriteFormsForCapture(rawHtml);
    return { htmlSource, sourceUrl: url, cloneId, assetCount };
  }

  async update(id: string, dto: UpdatePageDto) {
    await this.get(id);
    if (dto.domainId !== undefined) await this.assertDomainUsable(dto.domainId);
    const page = await this.prisma.landingPage.update({
      where: { id },
      data: {
        name: dto.name,
        htmlSource: dto.htmlSource,
        formEnabled: dto.formEnabled,
        capturesCredentials: dto.capturesCredentials,
        // null явно означает "отвязать домен, вернуться на PUBLIC_BASE_URL"
        ...(dto.domainId !== undefined ? { domainId: dto.domainId } : {}),
      },
    });
    if (dto.htmlSource) this.regenerateScreenshot(page.id, page.htmlSource);
    return page;
  }

  async duplicate(id: string) {
    const existing = await this.get(id);
    let slug = `${existing.slug}-copy`;
    let n = 1;
    while (await this.prisma.landingPage.findUnique({ where: { slug } })) {
      n++;
      slug = `${existing.slug}-copy-${n}`;
    }
    return this.prisma.landingPage.create({
      data: {
        name: `${existing.name} (копия)`,
        slug,
        htmlSource: existing.htmlSource,
        formEnabled: existing.formEnabled,
      },
    });
  }

  async archive(id: string) {
    await this.get(id);
    return this.prisma.landingPage.update({
      where: { id },
      data: { isArchived: true },
    });
  }
}
