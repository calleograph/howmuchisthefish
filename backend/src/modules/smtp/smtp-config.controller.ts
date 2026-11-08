import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { SmtpConfigService } from './smtp-config.service';
import {
  CreateSmtpConfigDto,
  TestSmtpConfigDto,
  UpdateSmtpConfigDto,
} from './dto/smtp-config.dto';

@ApiTags('smtp')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('smtps')
export class SmtpConfigController {
  constructor(private readonly smtp: SmtpConfigService) {}

  @Get()
  list() {
    return this.smtp.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.smtp.getSafe(id);
  }

  @Post()
  create(@Body() dto: CreateSmtpConfigDto) {
    return this.smtp.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSmtpConfigDto) {
    return this.smtp.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.smtp.remove(id);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @Body() dto: TestSmtpConfigDto) {
    return this.smtp.test(id, dto.toAddress);
  }
}
