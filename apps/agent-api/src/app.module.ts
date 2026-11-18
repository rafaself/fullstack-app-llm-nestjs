import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '@nestjs/ai';
import { buildAiOptions } from '@cat-supplies-store/ai';
import { appConfigOptions, aiConfig } from './app.config';
import { DatabaseModule } from './database/database.module';
import { AssistantModule } from './apps/assistant/assistant.module';
import { HealthController } from './health.controller';
import { buildRateLimitOptions } from '@cat-supplies-store/http';

@Module({
  imports: [
    ConfigModule.forRoot(appConfigOptions),
    AiModule.forRootAsync({
      isGlobal: true,
      inject: [aiConfig.KEY],
      useFactory: buildAiOptions,
    }),
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      imports: [DatabaseModule],
      inject: [DataSource],
      useFactory: buildRateLimitOptions,
    }),
    AssistantModule,
  ],
  providers: [{ provide: APP_PIPE, useClass: StandardSchemaValidationPipe }],
  controllers: [HealthController],
})
export class AppModule {}
