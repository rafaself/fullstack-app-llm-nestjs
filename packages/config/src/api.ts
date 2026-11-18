import { z } from 'zod';
import { parseEnv } from './validation.js';

const apiEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  })
  .transform(({ NODE_ENV: environment, PORT: port, TRUST_PROXY_HOPS }) => ({
    environment,
    port,
    trustProxyHops: TRUST_PROXY_HOPS,
  }));

export type ApiConfig = z.infer<typeof apiEnvSchema>;

export function loadApiConfig(env: Record<string, unknown>): ApiConfig {
  return parseEnv(apiEnvSchema, env);
}
