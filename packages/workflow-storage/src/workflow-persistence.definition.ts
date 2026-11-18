import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { PoolConfig } from 'pg';

export interface WorkflowPersistenceOptions extends PoolConfig {
  migrationsOnStart?: boolean;
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<WorkflowPersistenceOptions>().build();
