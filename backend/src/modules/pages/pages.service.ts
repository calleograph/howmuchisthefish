import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScreenshotService } from './screenshot.service';
import { CreatePageDto, UpdatePageDto } from './dto/page.dto';

@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly screenshots: ScreenshotService,
  ) {}

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
    const page = await this.prisma.landingPage.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        htmlSource: dto.htmlSource,
        formEnabled: dto.formEnabled ?? false,
      },
    });
    this.regenerateScreenshot(page.id, page.htmlSource);
    return page;
  }

  async update(id: string, dto: UpdatePageDto) {
    await this.get(id);
    const page = await this.prisma.landingPage.update({ where: { id }, data: dto });
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
