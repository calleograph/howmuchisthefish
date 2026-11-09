import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.use(helmet());
  // Дефолт Express (100kb) слишком мал для htmlSource учебной страницы —
  // клонированные граббером реальные сайты (не синтетические тестовые
  // страницы) легко превышают его, запрос падает с 413 без объяснения в
  // интерфейсе. 10 МБ с запасом покрывает даже крупные одностраничные
  // сайты; дальнейший рост (видео/десятки МБ разметки) уже не является
  // учебной фишинговой страницей, упирать лимит в них незачем.
  app.use(express.json({ limit: '10mb' }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // отбрасывает поля, не описанные в DTO — защита от лишних полей в теле запроса
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // По умолчанию CORS открыт для любого origin — сервис должен пускать сразу
  // после установки, с какого бы адреса к нему ни обращались (IP в локальной
  // сети, домен, несколько адресов одновременно), без ошибок на первом
  // входе из-за несовпадения origin. CORS_ALLOWED_ORIGINS — осознанный шаг
  // ужесточения (список через запятую), который администратор включает
  // позже, когда адреса доступа уже известны и стабильны (см. CONFIGURATION.md).
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  });

  // Префикс api/ для всего REST API администратора — отделяет его от публичных
  // встраиваемых в письма роутов (/lp/{slug}, /t/*) и от /health, которым префикс
  // только мешал бы (короткие URL в письмах, Docker healthcheck без него).
  app.setGlobalPrefix('api', {
    exclude: ['health', 'lp/(.*)', 't/(.*)'],
  });

  const config = new DocumentBuilder()
    .setTitle('HowMuchIsTheFish API')
    .setDescription('REST API для управления учебными фишинговыми кампаниями')
    .setVersion('0.3.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
