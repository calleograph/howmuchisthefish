import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { PrismaService } from '../../prisma/prisma.service';

// Регрессия: группа не должна иметь возможность стать потомком самой себя,
// ни напрямую (parentGroupId === id), ни через цепочку (A родитель B, B
// родитель A) — иначе recursiveCount() в list() зациклился бы бесконечно.
describe('GroupsService — защита от циклов в иерархии групп', () => {
  let service: GroupsService;
  let prisma: {
    group: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      group: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [GroupsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(GroupsService);
  });

  it('отклоняет группу как родителя самой себя', async () => {
    prisma.group.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, parentGroupId: null }),
    );

    await expect(service.update('group-a', { parentGroupId: 'group-a' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('отклоняет цепочку из трёх групп, замкнутую в цикл (A → B → C → A)', async () => {
    // Попытка: сделать A родителем, которого B уже назначил себе родителем
    // через C — т.е. B.parentGroupId = C, C.parentGroupId = A, и теперь
    // A пытается указать parentGroupId = B.
    const parents: Record<string, string | null> = {
      'group-b': 'group-c',
      'group-c': 'group-a',
    };
    prisma.group.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, parentGroupId: parents[where.id] ?? null }),
    );

    await expect(service.update('group-a', { parentGroupId: 'group-b' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('разрешает назначение родителя без цикла', async () => {
    prisma.group.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, parentGroupId: null }),
    );
    prisma.group.update.mockResolvedValue({ id: 'group-a', parentGroupId: 'group-b' });

    await expect(
      service.update('group-a', { parentGroupId: 'group-b' }),
    ).resolves.toEqual({ id: 'group-a', parentGroupId: 'group-b' });
  });
});
