import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global — PrismaService нужен почти всем модулям, регистрировать его в каждом
// отдельно было бы чистым бойлерплейтом без выгоды.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
