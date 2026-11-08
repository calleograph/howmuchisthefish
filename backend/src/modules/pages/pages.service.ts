import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePageDto, UpdatePageDto } from './dto/page.dto';

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.landingPage.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        htmlSource: dto.htmlSource,
        formEnabled: dto.formEnabled ?? false,
      },
    });
  }

  async update(id: string, dto: UpdatePageDto) {
    await this.get(id);
    return this.prisma.landingPage.update({ where: { id }, data: dto });
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
