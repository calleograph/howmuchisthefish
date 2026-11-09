import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { EmployeesService } from './employees.service';
import { CsvImportService } from './csv-import.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { BulkAssignGroupDto } from './dto/bulk-assign-group.dto';
import { BulkEmployeeIdsDto } from './dto/bulk-employee-ids.dto';
import { BulkUpdateFieldsDto } from './dto/bulk-update-fields.dto';

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly csvImport: CsvImportService,
  ) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('groupId') groupId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize = 25,
  ) {
    return this.employees.list({
      search,
      groupId,
      page,
      pageSize: Math.min(pageSize, 200),
    });
  }

  // Перед :id — иначе Nest принял бы "export.csv" за id сотрудника.
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="employees.csv"')
  async exportCsv(@Res() res: Response) {
    res.send(await this.employees.exportCsv());
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.employees.get(id);
  }

  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.employees.history(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post()
  create(@Body() dto: CreateEmployeeDto, @Request() req: any) {
    return this.employees.create(dto, req.user?.id ?? null);
  }

  @Roles('ADMIN', 'EDITOR')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @Request() req: any,
  ) {
    return this.employees.update(id, dto, req.user?.id ?? null);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post('bulk/assign-group')
  bulkAssignGroup(@Body() dto: BulkAssignGroupDto) {
    return this.employees.bulkAssignGroup(dto.employeeIds, dto.groupId);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post('bulk/deactivate')
  bulkDeactivate(@Body() dto: BulkEmployeeIdsDto, @Request() req: any) {
    return this.employees.bulkDeactivate(dto.employeeIds, req.user?.id ?? null);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post('bulk/update-fields')
  bulkUpdateFields(@Body() dto: BulkUpdateFieldsDto, @Request() req: any) {
    const { employeeIds, ...fields } = dto;
    return this.employees.bulkUpdateFields(employeeIds, fields, req.user?.id ?? null);
  }

  // Объявлен ПОСЛЕ bulk/* — иначе POST /employees/bulk/deactivate матчится как :id=bulk.
  @Roles('ADMIN', 'EDITOR')
  @Post(':id/deactivate')
  deactivate(@Param('id') id: string, @Request() req: any) {
    return this.employees.deactivate(id, req.user?.id ?? null);
  }

  @Roles('ADMIN', 'EDITOR')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — защита от чрезмерной загрузки
    }),
  )
  @Post('import-csv')
  importCsv(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) {
      return {
        totalRows: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [{ row: 0, reason: 'Файл не передан' }],
      };
    }
    return this.csvImport.importFromBuffer(file.buffer, req.user?.id ?? null);
  }
}
