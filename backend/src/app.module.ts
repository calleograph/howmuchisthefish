import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './modules/crypto/crypto.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { RolesGuard } from './modules/auth/roles.guard';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { EmployeesModule } from './modules/employees/employees.module';
import { GroupsModule } from './modules/groups/groups.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { PagesModule } from './modules/pages/pages.module';
import { EventsModule } from './modules/events/events.module';
import { SmtpModule } from './modules/smtp/smtp.module';
import { MailerModule } from './modules/mailer/mailer.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // structured JSON logs — задание §4/§8: никогда не логировать пароли/токены/поля форм.
        redact: ['req.headers.authorization', 'req.body.password'],
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('RATE_LIMIT_TTL_SECONDS', 60) * 1000,
            limit: config.get<number>('RATE_LIMIT_MAX', 100),
          },
        ],
      }),
    }),
    PrismaModule,
    CryptoModule,
    HealthModule,
    AuthModule,
    EmployeesModule,
    GroupsModule,
    TemplatesModule,
    PagesModule,
    EventsModule,
    SmtpModule,
    MailerModule,
    CampaignsModule,
    ReportsModule,
  ],
  providers: [
    // Порядок важен: Throttler → JwtAuthGuard (заполняет req.user) → RolesGuard (читает req.user).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
