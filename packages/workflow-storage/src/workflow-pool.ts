import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { MODULE_OPTIONS_TOKEN } from './workflow-persistence.definition.js';
import type { WorkflowPersistenceOptions } from './workflow-persistence.definition.js';
import { Pool } from 'pg';

@Injectable()
export class WorkflowPool extends Pool implements OnApplicationShutdown {
  readonly migrationsOnStart: boolean;

  constructor(
    @Inject(MODULE_OPTIONS_TOKEN) options: WorkflowPersistenceOptions,
  ) {
    const { migrationsOnStart = true, ...poolOptions } = options;
    super(poolOptions);
    this.migrationsOnStart = migrationsOnStart;
  }
  async onApplicationShutdown(): Promise<void> {
    await this.end();
  }
}
