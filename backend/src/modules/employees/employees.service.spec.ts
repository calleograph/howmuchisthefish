import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';

// Регрессия: массовые операции с сотрудниками отсутствовали и в UI, и в API
// (docs/FUNCTIONAL_GAP_MATRIX.md §13, кроме уже существовавшего
// bulkAssignGroup) — эти методы повторяют его $transaction-паттерн.
describe('EmployeesService — массовые операции и экспорт', () => {
  let service: EmployeesService;
  let prisma: any;
  let customFields: any;

  beforeEach(async () => {
    prisma = {
      employee: { updateMany: jest.fn().mockResolvedValue({ count: 2 }), findMany: jest.fn() },
      employeeHistory: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    customFields = { list: jest.fn().mockResolvedValue([]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CustomFieldsService, useValue: customFields },
      ],
    }).compile();
    service = moduleRef.get(EmployeesService);
  });

  describe('bulkDeactivate()', () => {
    it('деактивирует всех переданных сотрудников и пишет историю на каждого', async () => {
      const result = await service.bulkDeactivate(['e1', 'e2'], 'admin-1');

      expect(prisma.employee.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['e1', 'e2'] } },
        data: { isActive: false },
      });
      expect(prisma.employeeHistory.createMany).toHaveBeenCalledWith({
        data: [
          { employeeId: 'e1', changedBy: 'admin-1', changeType: 'deactivated', diff: {} },
          { employeeId: 'e2', changedBy: 'admin-1', changeType: 'deactivated', diff: {} },
        ],
      });
      expect(result).toEqual({ deactivated: 2 });
    });
  });

  describe('bulkUpdateFields()', () => {
    it('обновляет department/position у всех переданных сотрудников', async () => {
      await service.bulkUpdateFields(['e1', 'e2'], { department: 'IT' }, 'admin-1');

      expect(prisma.employee.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['e1', 'e2'] } },
        data: { department: 'IT' },
      });
    });

    it('валидирует customFields перед массовым обновлением', async () => {
      customFields.list.mockResolvedValue([{ key: 'office', type: 'STRING' }]);

      await expect(
        service.bulkUpdateFields(['e1'], { customFields: { office: 123 } }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.employee.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('exportCsv()', () => {
    it('формирует CSV с заголовком и экранированием запятых', async () => {
      prisma.employee.findMany.mockResolvedValue([
        {
          email: 'ivan@example.com',
          firstName: 'Иван',
          lastName: 'Петров',
          department: 'IT, Support', // запятая — проверяем экранирование
          position: 'Инженер',
          isActive: true,
        },
      ]);

      const csv = await service.exportCsv();

      expect(csv).toContain('email,firstName,lastName,department,position,isActive');
      expect(csv).toContain('"IT, Support"');
      expect(csv).toContain('ivan@example.com');
    });
  });
});
