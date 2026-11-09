import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { CsvImportService } from './csv-import.service';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';

@Module({
  imports: [CustomFieldsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, CsvImportService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
