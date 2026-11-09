import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // отбрасывает поля, не описанные в DTO — защита от лишних полей в теле запроса
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({ origin: process.env.PUBLIC_BASE_URL, credentials: true });

  // Префикс api/ для всего REST API администратора — отделяет его от публичных
  // встраиваемых в письма роутов (/lp/{slug}, /t/*) и от /health, которым префикс
  // только мешал бы (короткие URL в письмах, Docker healthcheck без него).
  app.setGlobalPrefix('api', {
    exclude: ['health', 'lp/(.*)', 't/(.*)'],
  });

  const config = new DocumentBuilder()
    .setTitle('HowMuchIsTheFish API')
    .setDescription('REST API для управления учебными фишинговыми кампаниями')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
