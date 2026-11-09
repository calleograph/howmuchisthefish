import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomFieldDto, UpdateCustomFieldDto } from './dto/custom-field.dto';

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.customFieldDef.findMany({ orderBy: { label: 'asc' } });
  }

  async get(id: string) {
    const field = await this.prisma.customFieldDef.findUnique({ where: { id } });
    if (!field) throw new NotFoundException('Доп. поле не найдено');
    return field;
  }

  async create(dto: CreateCustomFieldDto) {
    const existing = await this.prisma.customFieldDef.findUnique({ where: { key: dto.key } });
    if (existing) throw new ConflictException('Поле с таким ключом уже существует');
    return this.prisma.customFieldDef.create({
      data: {
        key: dto.key,
        label: dto.label,
        type: dto.type,
        options: dto.options ?? undefined,
      },
    });
  }

  async update(id: string, dto: UpdateCustomFieldDto) {
    await this.get(id);
    return this.prisma.customFieldDef.update({
      where: { id },
      data: { label: dto.label, options: dto.options },
    });
  }

  async remove(id: string) {
    await this.get(id);
    // Значения в Employee.customFields намеренно не чистим — поле просто
    // перестаёт быть описанным в конфигураторе, старые данные не мешают
    // (JSONB, не колонка; осиротевший ключ безвреден).
    await this.prisma.customFieldDef.delete({ where: { id } });
  }
}
