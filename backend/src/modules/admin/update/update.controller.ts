import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/roles.decorator';
import { UpdateService } from './update.service';
import { RequestUpdateActionDto } from './dto/request-update-action.dto';

@ApiTags('admin/update')
@ApiBearerAuth()
@Controller('admin/update')
export class UpdateController {
  constructor(private readonly update: UpdateService) {}

  // Опрашивается UI с интервалом (см. frontend) — отдаёт последнее
  // известное состояние из файлов обмена, не блокирует на ожидание
  // root-helper (который сам опрашивает раз в ~10с по таймеру).
  @Roles('ADMIN')
  @Get('overview')
  overview() {
    return this.update.overview();
  }

  // Построчный хвост update.log начиная с байта offset — polling-friendly
  // (не весь лог целиком на каждый опрос), архитектура из «Переговорки».
  @Roles('ADMIN')
  @Get('log')
  log(@Query('offset') offset?: string) {
    return this.update.log(offset ? Number(offset) : 0);
  }

  @Roles('ADMIN')
  @Post('action')
  requestAction(@Body() dto: RequestUpdateActionDto) {
    return this.update.requestAction(dto.action);
  }
}
