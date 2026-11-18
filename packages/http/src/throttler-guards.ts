import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    this.throttlers = this.throttlers.filter(({ name }) => name === 'ip');
  }
}

@Injectable()
export class IdentityThrottlerGuard extends ThrottlerGuard {
  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    this.throttlers = this.throttlers.filter(({ name }) => name === 'identity');
  }

  protected override async getTracker(
    request: Record<string, unknown>,
  ): Promise<string> {
    const authenticated = request as {
      customerId?: unknown;
      user?: {
        id?: unknown;
        rateLimitScope?: unknown;
      };
    };
    const id = authenticated.user?.id ?? authenticated.customerId;
    if (typeof id === 'string' && id.length > 0) {
      const scope =
        authenticated.user?.rateLimitScope === 'support'
          ? 'support'
          : authenticated.user?.rateLimitScope === 'service'
            ? 'service'
            : 'customer';
      return `${scope}:${id}`;
    }
    return super.getTracker(request);
  }
}
