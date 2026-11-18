import { getConfigToken, registerAs } from '@nestjs/config';
import {
  loadDatabaseConfig,
  loadMailpitConfig,
  loadQueueConfig,
  type AuthConfig,
} from '@cat-supplies-store/config';
import { databaseOptions } from '@cat-supplies-store/database';
import * as pg from 'pg';

export const workerConfigKey = getConfigToken('worker');
export interface WorkerConfig {
  database: ReturnType<typeof loadDatabaseConfig>;
  queue: ReturnType<typeof loadQueueConfig>;
  mailpit: ReturnType<typeof loadMailpitConfig>;
  businessApiUrl: string;
  auth: Pick<AuthConfig, 'workerApiToken'>;
}
export const createWorkerConfig = (config: WorkerConfig) =>
  registerAs('worker', () => config);
export function buildWorkerDatabaseOptions(config: WorkerConfig) {
  return { ...databaseOptions(config.database), driver: pg };
}
export function buildWorkerQueueOptions(config: WorkerConfig) {
  return { connection: { ...config.queue, maxRetriesPerRequest: null } };
}
