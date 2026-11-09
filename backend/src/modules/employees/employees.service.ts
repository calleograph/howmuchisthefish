import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customFields: CustomFieldsService,
  ) {}

  // Сверяет переданные customFields со схемой полей (тип/допустимые значения
  // для ENUM) — без этого произвольный JSON в JSONB-колонке быстро превращается
  // в неконтролируемую свалку несовместимых значений под одним ключом.
  private async validateCustomFields(values: Record<string, unknown>) {
    if (Object.keys(values).length === 0) return;
    const defs = await this.customFields.list();
    const defByKey = new Map(defs.map((d) => [d.key, d]));
    for (const [key, value] of Object.entries(values)) {
      const def = defByKey.get(key);
      if (!def) {
        throw new BadRequestException(`Неизвестное доп. поле: ${key}`);
      }
      if (value === null || value === undefined) continue;
      switch (def.type) {
        case 'STRING':
          if (typeof value !== 'string')
            throw new BadRequestException(`Поле ${def.label} должно быть строкой`);
          break;
        case 'NUMBER':
          if (typeof value !== 'number')
            throw new BadRequestException(`Поле ${def.label} должно быть числом`);
          break;
        case 'BOOLEAN':
          if (typeof value !== 'boolean')
            throw new BadRequestException(`Поле ${def.label} должно быть true/false`);
          break;
        case 'ENUM': {
          const options = (def.options as string[] | null) ?? [];
          if (!options.includes(value as string))
            throw new BadRequestException(
              `Поле ${def.label} должно быть одним из: ${options.join(', ')}`,
            );
          break;
        }
      }
    }
  }

  async list(params: {
    search?: string;
    groupId?: string;
    page: number;
    pageSize: number;
  }) {
    const { search, groupId, page, pageSize } = params;
    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (groupId) {
      where.groups = { some: { groupId } };
    }

    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { lastName: 'asc' },
        include: { groups: { include: { group: true } } },
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { groups: { include: { group: true } } },
    });
    if (!employee) throw new NotFoundException('Сотрудник не найден');
    return employee;
  }

  async create(dto: CreateEmployeeDto, actorUserId: string | null) {
    const existing = await this.prisma.employee.findUnique({
      where: { email: dto.email },
    });
    if (existing)
      throw new ConflictException('Сотрудник с таким email уже существует');
    if (dto.customFields) await this.validateCustomFields(dto.customFields);

    const employee = await this.prisma.employee.create({
      data: { ...dto, customFields: dto.customFields as Prisma.InputJsonValue | undefined },
    });
    await this.prisma.employeeHistory.create({
      data: {
        employeeId: employee.id,
        changedBy: actorUserId,
        changeType: 'created',
        diff: { ...dto } as Prisma.InputJsonValue,
      },
    });
    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto, actorUserId: string | null) {
    await this.get(id);
    if (dto.customFields) await this.validateCustomFields(dto.customFields);
    const employee = await this.prisma.employee.update({
      where: { id },
      data: { ...dto, customFields: dto.customFields as Prisma.InputJsonValue | undefined },
    });
    await this.prisma.employeeHistory.create({
      data: {
        employeeId: id,
        changedBy: actorUserId,
        changeType: 'updated',
        diff: { ...dto } as Prisma.InputJsonValue,
      },
    });
    return employee;
  }

  async deactivate(id: string, actorUserId: string | null) {
    await this.get(id);
    const employee = await this.prisma.employee.update({
      where: { id },
      data: { isActive: false },
    });
    await this.prisma.employeeHistory.create({
      data: {
        employeeId: id,
        changedBy: actorUserId,
        changeType: 'deactivated',
        diff: {},
      },
    });
    return employee;
  }

  async bulkAssignGroup(employeeIds: string[], groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Группа не найдена');

    await this.prisma.$transaction(
      employeeIds.map((employeeId) =>
        this.prisma.employeeGroup.upsert({
          where: { employeeId_groupId: { employeeId, groupId } },
          create: { employeeId, groupId },
          update: {},
        }),
      ),
    );
    return { assigned: employeeIds.length };
  }

  async history(employeeId: string) {
    return this.prisma.employeeHistory.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
