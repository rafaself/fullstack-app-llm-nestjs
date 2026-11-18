import type { QueryRunner } from 'typeorm';

export const migrationName = '008-throttler-rate-limits';

export async function up(client: QueryRunner): Promise<void> {
  await client.query(`
    CREATE TABLE throttler_rate_limits (
      key text NOT NULL,
      throttler_name text NOT NULL,
      hit_expirations jsonb NOT NULL DEFAULT '[]'::jsonb,
      expires_at_ms bigint NOT NULL,
      is_blocked boolean NOT NULL DEFAULT false,
      block_expires_at_ms bigint,
      PRIMARY KEY (key, throttler_name),
      CHECK (jsonb_typeof(hit_expirations) = 'array')
    );

    CREATE INDEX throttler_rate_limits_expiry_idx
      ON throttler_rate_limits (expires_at_ms);
  `);
}
