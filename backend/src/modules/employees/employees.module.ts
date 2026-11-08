import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { CsvImportService } from './csv-import.service';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, CsvImportService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
