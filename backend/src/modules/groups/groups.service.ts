import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.group.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
  }

  async get(id: string) {
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Группа не найдена');
    return group;
  }

  async create(dto: CreateGroupDto) {
    const existing = await this.prisma.group.findUnique({
      where: { name: dto.name },
    });
    if (existing)
      throw new ConflictException('Группа с таким именем уже существует');
    return this.prisma.group.create({ data: dto });
  }

  async update(id: string, dto: UpdateGroupDto) {
    await this.get(id);
    return this.prisma.group.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.group.delete({ where: { id } });
  }

  async members(id: string) {
    await this.get(id);
    return this.prisma.employeeGroup.findMany({
      where: { groupId: id },
      include: { employee: true },
    });
  }
}
