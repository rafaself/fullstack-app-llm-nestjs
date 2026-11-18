import {
  CanActivate,
  Controller,
  ExecutionContext,
  UnauthorizedException,
  Get,
  UseGuards,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import {
  IdentityThrottlerGuard,
  IpThrottlerGuard,
  PostgresThrottlerStorage,
} from '@cat-supplies-store/http';
import { createMigratedDataSource } from '@cat-supplies-store/database';
import { randomUUID } from 'node:crypto';
import * as pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { buildAgentDatabaseOptions } from '../src/database/database.module';

interface RateLimitRequest {
  headers: { authorization?: string };
  customerId?: string;
  ip: string;
  user?: { id: string; rateLimitScope: 'customer' | 'support' };
}

class TestCustomerAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): true {
    const request = context.switchToHttp().getRequest<RateLimitRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException();
    if (token.startsWith('support:')) {
      request.user = {
        id: token.slice('support:'.length),
        rateLimitScope: 'support',
      };
    } else {
      request.customerId = token;
    }
    return true;
  }
}

class RateLimitProbeController {
  identity() {
    return { ok: true };
  }

  ip() {
    return { ok: true };
  }
}

Controller('rate-limit-probe')(RateLimitProbeController);
const identityDescriptor = Object.getOwnPropertyDescriptor(
  RateLimitProbeController.prototype,
  'identity',
)!;
Get('identity')(
  RateLimitProbeController.prototype,
  'identity',
  identityDescriptor,
);
UseGuards(IpThrottlerGuard, TestCustomerAuthGuard, IdentityThrottlerGuard)(
  RateLimitProbeController.prototype,
  'identity',
  identityDescriptor,
);
const ipDescriptor = Object.getOwnPropertyDescriptor(
  RateLimitProbeController.prototype,
  'ip',
)!;
Get('ip')(RateLimitProbeController.prototype, 'ip', ipDescriptor);
UseGuards(IpThrottlerGuard)(
  RateLimitProbeController.prototype,
  'ip',
  ipDescriptor,
);
Throttle({ ip: { limit: 2, ttl: 60_000 } })(
  RateLimitProbeController.prototype,
  'ip',
  ipDescriptor,
);

describe('distributed HTTP rate limits', () => {
  let database: DataSource;
  const apps: NestExpressApplication[] = [];
  const urls: string[] = [];

  beforeAll(async () => {
    database = await createMigratedDataSource({
      ...buildAgentDatabaseOptions({
        connectionString: process.env.DATABASE_URL!,
        max: 10,
        connectionTimeoutMillis: 3_000,
      }),
      driver: pg,
    });

    for (let i = 0; i < 2; i += 1) {
      const module = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot({
            throttlers: [
              { name: 'ip', limit: 100, ttl: 60_000 },
              { name: 'identity', limit: 2, ttl: 60_000 },
            ],
            storage: new PostgresThrottlerStorage(database),
          }),
        ],
        controllers: [RateLimitProbeController],
        providers: [
          TestCustomerAuthGuard,
          IpThrottlerGuard,
          IdentityThrottlerGuard,
        ],
      }).compile();
      const app = module.createNestApplication<NestExpressApplication>({
        logger: false,
      });
      // This simulates one known ingress proxy. Production defaults to zero.
      app.set('trust proxy', 1);
      await app.listen(0, '127.0.0.1');
      apps.push(app);
      urls.push(`${await app.getUrl()}/rate-limit-probe`);
    }
  }, 20_000);

  afterAll(async () => {
    for (const app of apps) await app.close();
    if (database?.isInitialized) await database.destroy();
  });

  it('shares identity counters across instances and isolates customers', async () => {
    const identity = randomUUID();
    const forwardedIp = uniqueTestIp();
    const send = (instance: number, token = identity) =>
      fetch(`${urls[instance]}/identity`, {
        headers: {
          authorization: `Bearer ${token}`,
          'x-forwarded-for': forwardedIp,
        },
      });

    const responses = await Promise.all([send(0), send(1), send(0)]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 200, 429]);
    expect(
      responses
        .find((response) => response.status === 429)
        ?.headers.get('retry-after-identity'),
    ).toBeTruthy();

    const otherCustomer = await send(1, randomUUID());
    expect(otherCustomer.status).toBe(200);
    await otherCustomer.text();

    const supportIdentity = await send(1, `support:${identity}`);
    expect(supportIdentity.status).toBe(200);
    await supportIdentity.text();

    const unauthenticated = await fetch(`${urls[0]}/identity`, {
      headers: { 'x-forwarded-for': uniqueTestIp() },
    });
    expect(unauthenticated.status).toBe(401);
    await unauthenticated.text();
    for (const response of responses) await response.text();
  });

  it('returns 429 when an IP-only public route exceeds its limit', async () => {
    const forwardedIp = uniqueTestIp();
    const send = () =>
      fetch(`${urls[0]}/ip`, {
        headers: { 'x-forwarded-for': forwardedIp },
      });
    const responses = await Promise.all([send(), send(), send()]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 200, 429]);
    expect(
      responses
        .find((response) => response.status === 429)
        ?.headers.get('retry-after-ip'),
    ).toBeTruthy();
    for (const response of responses) await response.text();
  });
});

function uniqueTestIp(): string {
  const value = randomUUID().replaceAll('-', '');
  const third = Number.parseInt(value.slice(0, 2), 16);
  const fourth = Number.parseInt(value.slice(2, 4), 16);
  return `198.51.${third}.${fourth}`;
}
