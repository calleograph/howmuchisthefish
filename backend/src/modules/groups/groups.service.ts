import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const groups = await this.prisma.group.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    const directCounts = new Map(groups.map((g) => [g.id, g._count.members]));
    const childrenByParent = new Map<string, string[]>();
    for (const g of groups) {
      if (!g.parentGroupId) continue;
      const list = childrenByParent.get(g.parentGroupId) ?? [];
      list.push(g.id);
      childrenByParent.set(g.parentGroupId, list);
    }
    // Рекурсивный подсчёт участников включая все вложенные группы — для
    // отображения "весь ИТ-департамент" без ручного суммирования подгрупп.
    const recursiveCount = (id: string, seen = new Set<string>()): number => {
      if (seen.has(id)) return 0; // защита от цикла, не должен возникать благодаря validateNoCycle
      seen.add(id);
      const own = directCounts.get(id) ?? 0;
      const children = childrenByParent.get(id) ?? [];
      return own + children.reduce((sum, childId) => sum + recursiveCount(childId, seen), 0);
    };
    return groups.map((g) => ({
      ...g,
      totalMemberCount: recursiveCount(g.id),
    }));
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
    if (dto.parentGroupId) await this.get(dto.parentGroupId);
    return this.prisma.group.create({ data: dto });
  }

  async update(id: string, dto: UpdateGroupDto) {
    await this.get(id);
    if (dto.parentGroupId) {
      await this.get(dto.parentGroupId);
      await this.validateNoCycle(id, dto.parentGroupId);
    }
    return this.prisma.group.update({ where: { id }, data: dto });
  }

  // Группа не может стать потомком самой себя — ни напрямую, ни через цепочку
  // вложенности (A→B→C→A). Поднимаемся по parentGroupId от предполагаемого
  // родителя вверх, пока не дойдём до корня или не встретим саму группу id.
  private async validateNoCycle(id: string, newParentId: string) {
    let current: string | null = newParentId;
    const visited = new Set<string>();
    while (current) {
      if (current === id) {
        throw new BadRequestException(
          'Группа не может быть вложена сама в себя (прямо или через цепочку родителей)',
        );
      }
      if (visited.has(current)) break; // уже существующий цикл в данных — не наше дело здесь, не зацикливаемся
      visited.add(current);
      const parent: { parentGroupId: string | null } | null =
        await this.prisma.group.findUnique({
          where: { id: current },
          select: { parentGroupId: true },
        });
      current = parent?.parentGroupId ?? null;
    }
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
