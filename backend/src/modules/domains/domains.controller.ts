import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { DomainsService } from './domains.service';
import { CreateDomainDto } from './dto/domain.dto';

@ApiTags('domains')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('domains')
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  list() {
    return this.domains.list();
  }

  @Get('tls-managed')
  tlsManaged() {
    return { tlsManaged: this.domains.isTlsManaged() };
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.domains.get(id);
  }

  @Post()
  create(@Body() dto: CreateDomainDto) {
    return this.domains.create(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.domains.remove(id);
  }

  @Get(':id/verification-instructions')
  verificationInstructions(@Param('id') id: string) {
    return this.domains.getVerificationInstructions(id);
  }

  @Post(':id/verify')
  verify(@Param('id') id: string) {
    return this.domains.verify(id);
  }
}
