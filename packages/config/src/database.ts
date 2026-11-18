import { z } from 'zod';
import { parseEnv } from './validation.js';

const databaseEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: z.string().url().optional(),
  BUSINESS_DATABASE_URL: z.string().url().optional(),
  AGENT_DATABASE_URL: z.string().url().optional(),
  WORKER_DATABASE_URL: z.string().url().optional(),
});

export type DatabaseApplication = 'business' | 'agent' | 'worker';

export interface DatabaseConfig {
  connectionString: string;
  max: number;
  connectionTimeoutMillis: number;
  migrationsOnStart?: boolean;
}

export function loadDatabaseConfig(
  env: Record<string, unknown>,
  application: DatabaseApplication = 'business',
): DatabaseConfig {
  const config = parseEnv(databaseEnvSchema, env);
  const appUrl = {
    business: config.BUSINESS_DATABASE_URL,
    agent: config.AGENT_DATABASE_URL,
    worker: config.WORKER_DATABASE_URL,
  }[application];
  const appVariable = {
    business: 'BUSINESS_DATABASE_URL',
    agent: 'AGENT_DATABASE_URL',
    worker: 'WORKER_DATABASE_URL',
  }[application];

  if (config.NODE_ENV === 'production' && !appUrl) {
    throw new Error(
      `Invalid environment configuration: ${appVariable}: required in production`,
    );
  }

  const connectionString =
    appUrl ??
    config.DATABASE_URL ??
    (config.NODE_ENV === 'production'
      ? undefined
      : 'postgresql://chatbot:chatbot@127.0.0.1:15432/chatbot');
  if (!connectionString) {
    throw new Error(
      `Invalid environment configuration: ${appVariable}: required in production`,
    );
  }

  return {
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    migrationsOnStart: config.NODE_ENV !== 'production',
  };
}
