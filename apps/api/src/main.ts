import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiConfig, LoggerConfig } from '@cat-supplies-store/config';
import { requestLogger } from '@cat-supplies-store/http';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.set(
    'trust proxy',
    app.get(ConfigService).getOrThrow<ApiConfig>('api').trustProxyHops,
  );
  app.use(requestLogger);

  const port = app.get(ConfigService).getOrThrow<ApiConfig>('api').port;

  app.useLogger(
    new ConsoleLogger(
      app.get(ConfigService).getOrThrow<LoggerConfig>('logger'),
    ),
  );
  app.enableShutdownHooks();

  await app.listen(port);
}

void bootstrap();
