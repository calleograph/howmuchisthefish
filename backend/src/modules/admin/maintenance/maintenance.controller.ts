import { Body, Controller, Delete, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/roles.decorator';
import { MaintenanceService } from './maintenance.service';
import { PurgeOldRecordsDto } from './dto/purge-old-records.dto';
import { PurgePreviewQueryDto } from './dto/purge-preview-query.dto';

@ApiTags('admin/maintenance')
@ApiBearerAuth()
@Controller('admin/maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  // Предпросмотр количества записей под удаление — показывается в UI перед
  // тем, как администратор подтвердит необратимую операцию.
  @Roles('ADMIN')
  @Get('purge-preview')
  async preview(@Query() query: PurgePreviewQueryDto) {
    return { count: await this.maintenance.countOldRecords(query.target, query.olderThanDays) };
  }

  @Roles('ADMIN')
  @Delete('purge')
  purge(@Body() dto: PurgeOldRecordsDto) {
    return this.maintenance.purgeOldRecords(dto.target, dto.olderThanDays);
  }
}
