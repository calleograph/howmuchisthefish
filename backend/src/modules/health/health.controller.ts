import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- package.json не ESM-импортируемый JSON без resolveJsonModule; версия берётся отсюда, а не хардкодится здесь, чтобы не рассинхронизироваться при релизах.
const { version } = require('../../../package.json');

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
    return { status: healthy ? 'ok' : 'degraded', checks, version };
  }
}
