import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { AuthConfig } from '@cat-supplies-store/config';
import type { DemoAuthenticatedRequest } from './demo-auth.types.js';

@Injectable()
export class WorkerAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<DemoAuthenticatedRequest>();
    const expectedToken =
      this.config.getOrThrow<AuthConfig>('auth').workerApiToken;
    if (!expectedToken) {
      throw new ServiceUnavailableException(
        'Worker authentication is not configured.',
      );
    }

    const authorization = request.headers.authorization;
    const match = Array.isArray(authorization)
      ? undefined
      : authorization?.match(/^Bearer\s+(.+)$/i);
    const actual = match ? Buffer.from(match[1]) : undefined;
    const expected = Buffer.from(expectedToken);
    if (
      !actual ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new UnauthorizedException('A valid worker token is required.');
    }

    request.user = { id: 'agent-worker', rateLimitScope: 'service' };
    return true;
  }
}
