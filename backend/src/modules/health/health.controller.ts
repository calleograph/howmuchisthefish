import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Публичный роут: используется Docker healthcheck без токена, и шагом
  // "проверка готовности" установщика/обновления.
  @Public()
  @Get()
  async check() {
    const checks: Record<string, 'ok' | 'error'> = { app: 'ok' };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }
    const healthy = Object.values(checks).every((v) => v === 'ok');
    return { status: healthy ? 'ok' : 'degraded', checks, version: '0.1.0' };
  }
}
