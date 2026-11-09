import { Module } from '@nestjs/common';
import { DomainsController } from './domains.controller';
import { PublicDomainsController } from './public-domains.controller';
import { DomainsService } from './domains.service';

@Module({
  controllers: [DomainsController, PublicDomainsController],
  providers: [DomainsService],
  exports: [DomainsService],
})
export class DomainsModule {}
