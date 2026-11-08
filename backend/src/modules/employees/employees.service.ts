import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

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

    const employee = await this.prisma.employee.create({ data: dto });
    await this.prisma.employeeHistory.create({
      data: {
        employeeId: employee.id,
        changedBy: actorUserId,
        changeType: 'created',
        diff: { ...dto },
      },
    });
    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto, actorUserId: string | null) {
    await this.get(id);
    const employee = await this.prisma.employee.update({
      where: { id },
      data: dto,
    });
    await this.prisma.employeeHistory.create({
      data: {
        employeeId: id,
        changedBy: actorUserId,
        changeType: 'updated',
        diff: { ...dto },
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
