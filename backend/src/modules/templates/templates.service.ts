import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MjmlRenderService } from './mjml-render.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mjml: MjmlRenderService,
  ) {}

  list(includeArchived = false) {
    return this.prisma.mailTemplate.findMany({
      where: includeArchived ? {} : { isArchived: false },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(id: string) {
    const template = await this.prisma.mailTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Шаблон не найден');
    return template;
  }

  async create(dto: CreateTemplateDto) {
    const htmlCache = await this.mjml.compileOrThrow(dto.mjmlSource);
    const variables = dto.variables ?? this.mjml.extractVariables(dto.mjmlSource);
    return this.prisma.mailTemplate.create({
      data: {
        name: dto.name,
        subject: dto.subject,
        mjmlSource: dto.mjmlSource,
        htmlCache,
        variables,
      },
    });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    const existing = await this.get(id);
    const mjmlSource = dto.mjmlSource ?? existing.mjmlSource;
    const htmlCache = dto.mjmlSource ? await this.mjml.compileOrThrow(mjmlSource) : existing.htmlCache;
    const variables = dto.variables ?? (dto.mjmlSource ? this.mjml.extractVariables(mjmlSource) : undefined);

    return this.prisma.mailTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        subject: dto.subject,
        mjmlSource: dto.mjmlSource,
        htmlCache,
        ...(variables ? { variables } : {}),
      },
    });
  }

  async duplicate(id: string) {
    const existing = await this.get(id);
    return this.prisma.mailTemplate.create({
      data: {
        name: `${existing.name} (копия)`,
        subject: existing.subject,
        mjmlSource: existing.mjmlSource,
        htmlCache: existing.htmlCache,
        variables: existing.variables as any,
      },
    });
  }

  async archive(id: string) {
    await this.get(id);
    return this.prisma.mailTemplate.update({ where: { id }, data: { isArchived: true } });
  }

  async preview(id: string, sampleData: Record<string, string> = {}) {
    const template = await this.get(id);
    return this.mjml.renderWithData(template.mjmlSource, sampleData);
  }
}
