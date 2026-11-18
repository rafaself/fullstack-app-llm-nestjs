import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

interface PostgresQueryExecutor {
  query<T>(query: string, parameters?: unknown[]): Promise<T>;
}

export interface PostgresThrottlerDatabase {
  transaction<T>(
    work: (manager: PostgresQueryExecutor) => Promise<T>,
  ): Promise<T>;
}

interface CounterRow {
  hit_expirations: unknown;
  expires_at_ms: string | number;
  is_blocked: boolean;
  block_expires_at_ms: string | number | null;
}

const cleanupExpiredCounters = `
  WITH now_ms AS MATERIALIZED (
    SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS value
  ),
  expired AS MATERIALIZED (
    SELECT counters.key, counters.throttler_name
    FROM throttler_rate_limits AS counters
    CROSS JOIN now_ms
    WHERE counters.expires_at_ms <= now_ms.value
      AND (counters.block_expires_at_ms IS NULL
        OR counters.block_expires_at_ms <= now_ms.value)
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(counters.hit_expirations) AS hit(expiration)
        WHERE hit.expiration::bigint > now_ms.value
      )
    ORDER BY counters.expires_at_ms
    LIMIT 100
    FOR UPDATE OF counters SKIP LOCKED
  )
  DELETE FROM throttler_rate_limits AS counters
  USING expired
  WHERE counters.key = expired.key
    AND counters.throttler_name = expired.throttler_name
`;

export class PostgresThrottlerStorage implements ThrottlerStorage {
  private increments = 0;

  constructor(private readonly database: PostgresThrottlerDatabase) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    return this.database.transaction(async (manager) => {
      // Delete only expired buckets in small batches to bound table growth across replicas.
      this.increments += 1;
      if (this.increments % 100 === 0) {
        await manager.query(cleanupExpiredCounters);
      }

      await manager.query(
        `INSERT INTO throttler_rate_limits
           (key, throttler_name, hit_expirations, expires_at_ms)
         VALUES (
           $1, $2, '[]'::jsonb,
           floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint + $3
         )
         ON CONFLICT (key, throttler_name) DO NOTHING`,
        [key, throttlerName, ttl],
      );

      // The row lock makes increments for one identity and route atomic across API replicas.
      const rows = await manager.query<CounterRow[]>(
        `SELECT hit_expirations, expires_at_ms, is_blocked,
                block_expires_at_ms
         FROM throttler_rate_limits
         WHERE key = $1 AND throttler_name = $2
         FOR UPDATE`,
        [key, throttlerName],
      );
      const row = rows[0];
      if (!row) throw new Error('Rate limit counter was not created.');
      const clock = await manager.query<{ now_ms: string | number }[]>(
        `SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_ms`,
      );

      const now = Number(clock[0]?.now_ms);
      if (!Number.isFinite(now)) {
        throw new Error('Database did not return the rate limit clock.');
      }
      let hitExpirations = parseHitExpirations(row.hit_expirations).filter(
        (expiration) => expiration > now,
      );
      let expiresAt = Number(row.expires_at_ms);
      if (expiresAt <= now) expiresAt = now + ttl;

      let isBlocked = row.is_blocked;
      let blockExpiresAt = row.block_expires_at_ms
        ? Number(row.block_expires_at_ms)
        : null;
      let result: ThrottlerStorageRecord;

      if (isBlocked && blockExpiresAt !== null && blockExpiresAt > now) {
        result = {
          totalHits: hitExpirations.length,
          timeToExpire: secondsUntil(expiresAt, now),
          isBlocked: true,
          timeToBlockExpire: secondsUntil(blockExpiresAt, now),
        };
      } else {
        if (isBlocked) {
          hitExpirations = [];
          isBlocked = false;
          blockExpiresAt = null;
        }

        if (blockDuration <= 0) {
          const exceeded = hitExpirations.length >= limit;
          if (!exceeded) hitExpirations.push(now + ttl);
          const firstHitExpiresAt = hitExpirations[0];
          result = {
            totalHits: hitExpirations.length + (exceeded ? 1 : 0),
            timeToExpire: secondsUntil(expiresAt, now),
            isBlocked: exceeded,
            timeToBlockExpire:
              exceeded && firstHitExpiresAt
                ? secondsUntil(firstHitExpiresAt, now)
                : 0,
          };
        } else {
          hitExpirations.push(now + ttl);
          if (hitExpirations.length > limit) {
            isBlocked = true;
            blockExpiresAt = now + blockDuration;
          }
          result = {
            totalHits: hitExpirations.length,
            timeToExpire: secondsUntil(expiresAt, now),
            isBlocked,
            timeToBlockExpire:
              isBlocked && blockExpiresAt !== null
                ? secondsUntil(blockExpiresAt, now)
                : 0,
          };
        }
      }

      await manager.query(
        `UPDATE throttler_rate_limits
         SET hit_expirations = $3::jsonb,
             expires_at_ms = $4,
             is_blocked = $5,
             block_expires_at_ms = $6
         WHERE key = $1 AND throttler_name = $2`,
        [
          key,
          throttlerName,
          JSON.stringify(hitExpirations),
          expiresAt,
          isBlocked,
          blockExpiresAt,
        ],
      );
      return result;
    });
  }
}

export function buildRateLimitOptions(
  database: PostgresThrottlerDatabase,
): ThrottlerModuleOptions {
  return {
    throttlers: [
      { name: 'ip', limit: 120, ttl: 60_000 },
      { name: 'identity', limit: 60, ttl: 60_000 },
    ],
    storage: new PostgresThrottlerStorage(database),
  };
}

function parseHitExpirations(value: unknown): number[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error('Rate limit counter contains invalid hit expirations.', {
        cause: error,
      });
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Rate limit counter contains invalid hit expirations.');
  }
  const expirations = parsed.map(Number);
  if (!expirations.every(Number.isFinite)) {
    throw new Error('Rate limit counter contains invalid hit expirations.');
  }
  return expirations;
}

function secondsUntil(expiration: number, now: number): number {
  return Math.max(0, Math.ceil((expiration - now) / 1000));
}
