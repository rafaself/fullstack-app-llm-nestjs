import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IdentityThrottlerGuard,
  IpThrottlerGuard,
} from '@cat-supplies-store/http';
import {
  internalRefundRequestSchema,
  internalRefundResponseSchema,
  type InternalRefundRequest,
} from '@cat-supplies-store/contracts';
import { WorkerAuthGuard } from '../../auth/worker-auth.guard.js';
import { PaymentsService } from '@cat-supplies-store/refunds';

@Controller('internal/refunds')
export class InternalRefundsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @UseGuards(IpThrottlerGuard, WorkerAuthGuard, IdentityThrottlerGuard)
  @Throttle({
    ip: { limit: 30, ttl: 60_000 },
    identity: { limit: 20, ttl: 60_000 },
  })
  async issue(
    @Body({ schema: internalRefundRequestSchema }) input: InternalRefundRequest,
  ) {
    return internalRefundResponseSchema.parse(
      await this.payments.refundOrder(
        input.customerId,
        input.orderId,
        input.idempotencyKey,
        input.refundRequestId,
      ),
    );
  }
}
